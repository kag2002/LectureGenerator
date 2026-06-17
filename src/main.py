import os
import sys
import time
from contextlib import asynccontextmanager
import logging

# Set console encoding to UTF-8 to prevent crashes with Vietnamese logs on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import asyncio
import logging
import json
import re
from fastapi import FastAPI, Request, status
from fastapi import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import inspect, text
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.api import auth, chatbot, courses, export, materials, outline, questions, routes, admin, telemetry, autopilot
from src.config import get_settings
from src.database.session import Base, engine
from src.services import web_search_agent

# Initialize SQLite database tables if they do not exist
Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "filename": record.filename,
            "line_number": record.lineno
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record, ensure_ascii=False)

def setup_production_logging():
    """Đổi log format sang JSON ở môi trường production."""
    settings = get_settings()
    if settings.app_env == "production":
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)
        
        # Remove old handlers
        for handler in list(root_logger.handlers):
            root_logger.removeHandler(handler)
            
        # Add new console handler with JsonFormatter
        ch = logging.StreamHandler()
        ch.setFormatter(JsonFormatter())
        root_logger.addHandler(ch)
        print("[LOGGING] Custom structured JSON logs enabled for production.")

async def system_alert_monitoring_loop():
    """Vòng lặp ngầm chạy mỗi 5 phút để kiểm tra tài nguyên và gửi cảnh báo Slack/Telegram."""
    print("[OBSERVABILITY] System Alert Monitoring Loop started.")
    # Chờ 30s sau khi startup để hệ thống ổn định trước khi scan tài nguyên lần đầu
    await asyncio.sleep(30)
    from src.utils.alerting import check_system_thresholds
    while True:
        try:
            check_system_thresholds()
        except Exception as e:
            print(f"[OBSERVABILITY ERROR] Alert check failed: {e}")
        await asyncio.sleep(300) # 5 phút

async def system_snapshot_loop():
    """Vòng lặp ngầm chạy mỗi 60 giây để ghi nhận snapshot tài nguyên hệ thống (timeline)."""
    print("[OBSERVABILITY] System Resource Snapshot Loop started.")
    from src.utils.telemetry import record_system_snapshot
    settings = get_settings()
    while True:
        try:
            record_system_snapshot(settings.database_url)
        except Exception as e:
            print(f"[OBSERVABILITY ERROR] Snapshot capture failed: {e}")
        await asyncio.sleep(60) # 1 phút

# Auto-migration for Course fields
try:
    inspector = inspect(engine)
    
    # Courses
    columns = [col["name"] for col in inspector.get_columns("courses")]
    if "required_textbooks" not in columns:
        logger.info("[MIGRATION] Adding column 'required_textbooks' to table 'courses'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE courses ADD COLUMN required_textbooks TEXT"))
    if "recommended_readings" not in columns:
        logger.info("[MIGRATION] Adding column 'recommended_readings' to table 'courses'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE courses ADD COLUMN recommended_readings TEXT"))

    # RAGDocument fields
    rag_doc_columns = [col["name"] for col in inspector.get_columns("rag_documents")]
    if "error_message" not in rag_doc_columns:
        logger.info("[MIGRATION] Adding column 'error_message' to table 'rag_documents'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE rag_documents ADD COLUMN error_message TEXT"))

    # ChatMessage fields
    chat_msg_columns = [col["name"] for col in inspector.get_columns("chat_messages")]
    if "is_archived" not in chat_msg_columns:
        logger.info("[MIGRATION] Adding column 'is_archived' to table 'chat_messages'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
            
    # Users
    user_columns = [col["name"] for col in inspector.get_columns("users")]
    if "role" not in user_columns:
        print("[MIGRATION] Adding column 'role' to table 'users'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"))

    # Questions status & created_by & updated_at
    q_columns = [col["name"] for col in inspector.get_columns("questions")]
    if "status" not in q_columns:
        print("[MIGRATION] Adding column 'status' to table 'questions'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN status TEXT DEFAULT 'approved'"))
    if "created_by" not in q_columns:
        print("[MIGRATION] Adding column 'created_by' to table 'questions'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN created_by TEXT DEFAULT 'user'"))
    if "updated_at" not in q_columns:
        print("[MIGRATION] Adding column 'updated_at' to table 'questions'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE questions ADD COLUMN updated_at DATETIME"))
            conn.execute(text("UPDATE questions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))

    # ChapterMaterials status & created_by & updated_at
    cm_columns = [col["name"] for col in inspector.get_columns("chapter_materials")]
    if "status" not in cm_columns:
        print("[MIGRATION] Adding column 'status' to table 'chapter_materials'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chapter_materials ADD COLUMN status TEXT DEFAULT 'approved'"))
    if "created_by" not in cm_columns:
        print("[MIGRATION] Adding column 'created_by' to table 'chapter_materials'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chapter_materials ADD COLUMN created_by TEXT DEFAULT 'user'"))
    if "updated_at" not in cm_columns:
        print("[MIGRATION] Adding column 'updated_at' to table 'chapter_materials'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chapter_materials ADD COLUMN updated_at DATETIME"))
            conn.execute(text("UPDATE chapter_materials SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
except Exception as e:
    logger.warning(f"[MIGRATION WARNING] Failed to migrate SQLite/PostgreSQL columns: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động logger JSON nếu ở production
    setup_production_logging()
    
    # Khởi động loop cảnh báo ngầm và loop ghi nhận snapshot tài nguyên
    monitor_task = asyncio.create_task(system_alert_monitoring_loop())
    snapshot_task = asyncio.create_task(system_snapshot_loop())

    settings = get_settings()
    logger.info(f"Starting {settings.app_name} in {settings.app_env} mode")
    try:
        from src.database.vector_db import migrate_vector_db_metadata

        migrate_vector_db_metadata()
    except Exception as e:
        logger.warning(f"[WARNING] Startup migration failed: {e}")

    # Auto-seed default admin account
    try:
        from src.database.session import SessionLocal
        from src.database.models import User
        from src.auth import get_password_hash
        import os
        
        admin_email = os.environ.get("DEFAULT_ADMIN_EMAIL", "admin@vinuni.edu.vn")
        admin_password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "123")
        
        db = SessionLocal()
        try:
            admin_user = db.query(User).filter(User.email == admin_email).first()
            if not admin_user:
                print(f"[SEED] Seeding default admin user: {admin_email}...")
                hashed_pwd = get_password_hash(admin_password)
                new_admin = User(
                    email=admin_email,
                    password_hash=hashed_pwd,
                    full_name="System Administrator",
                    role="admin"
                )
                db.add(new_admin)
                db.commit()
                print("[SEED] Admin user successfully seeded.")
        finally:
            db.close()
    except Exception as se:
        print(f"[SEED WARNING] Failed to seed default admin: {se}")

    yield
    logger.info("Shutting down...")
    monitor_task.cancel()
    snapshot_task.cancel()
    try:
        await asyncio.gather(monitor_task, snapshot_task, return_exceptions=True)
    except Exception:
        pass


app = FastAPI(
    title="AI Lecture Assistant API",
    description="Backend API hỗ trợ sinh bài giảng, câu hỏi thi chuẩn CLO & Bloom (VinUni x Vingroup)",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()

# Initialize slowapi Rate Limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
cors_origins_list = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
if not cors_origins_list:
    cors_origins_list = ["*"] if settings.app_env != "production" else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SlowAPIMiddleware)

# Define high-risk paths for rate limiting
high_risk_paths = {
    "/api/chatbot/chat-stream",
    "/api/courses/{course_id}/questions/generate",
    "/api/courses/{course_id}/questions/generate-stream",
    "/api/courses/chapters/{chapter_id}/generate-storyboard",
    "/api/courses/chapters/{chapter_id}/generate-materials-from-storyboard-stream",
    "/api/courses/chapters/{chapter_id}/generate-materials",
    "/api/courses/chapters/{chapter_id}/generate-materials-stream",
    "/api/courses/chapters/{chapter_id}/append-slide-for-clo",
    "/api/courses/chapters/{chapter_id}/append-slide-for-clo-stream",
    "/api/courses/chapters/{chapter_id}/generate-slides-stream",
    "/api/courses/chapters/{chapter_id}/generate-active-learning-stream",
    "/api/courses/{course_id}/parse-syllabus",
    "/api/courses/{course_id}/parse-syllabus-stream",
    "/api/chatbot/courses/{course_id}/reflect",
}

# Pre-compile regexes for high-risk paths matching
compiled_patterns = []
for p in high_risk_paths:
    regex_str = re.sub(r"\{[^}]+\}", r"[^/]+", p)
    compiled_patterns.append(re.compile(f"^{regex_str}$"))

@limiter.limit("5/minute")
def dummy_limit_func(request: Request):
    pass

# HTTP middleware to intercept and rate limit high-risk endpoints
@app.middleware("http")
async def dynamic_rate_limit_middleware(request: Request, call_next):
    if request.method == "POST":
        request_path = request.url.path
        is_high_risk = any(pattern.match(request_path) for pattern in compiled_patterns)
        if is_high_risk:
            try:
                limiter._check_request_limit(request, dummy_limit_func, in_middleware=False)
            except RateLimitExceeded:
                response = JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Rate limit exceeded. Maximum 5 requests per minute allowed."}
                )
                # Ensure CORS headers are appended to rate limited responses
                origin = request.headers.get("origin")
                if origin:
                    response.headers["Access-Control-Allow-Origin"] = origin
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                return response
    return await call_next(request)

@app.middleware("http")
async def log_traffic_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    if request.url.path.startswith("/api"):
        process_time_ms = round((time.time() - start_time) * 1000, 2)
        client_ip = request.client.host if request.client else "unknown"
        try:
            from src.utils.telemetry import record_request
            record_request(
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                latency_ms=process_time_ms,
                client_ip=client_ip
            )
        except Exception:
            pass
    return response

# Register all Routers
app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(outline.router)
app.include_router(materials.router)
app.include_router(questions.router)
app.include_router(chatbot.router)
app.include_router(web_search_agent.router)
app.include_router(export.router)
app.include_router(admin.router)
app.include_router(telemetry.router)
app.include_router(autopilot.router)

# Register C2-App-023 default router at v1 for compatibility
app.include_router(routes.router, prefix="/api/v1")


@app.get("/metrics")
async def get_metrics():
    """Prometheus registry endpoint returning request stats & system hardware metrics."""
    metrics_lines = []
    
    # 1. Hardware metrics
    try:
        from src.utils.telemetry import get_system_metrics
        settings = get_settings()
        sys_metrics = get_system_metrics(settings.database_url)
        cpu_p = sys_metrics["cpu"]["percent"]
        ram_p = sys_metrics["ram"]["percent"]
        db_s = sys_metrics["db"]["size_mb"]
        
        metrics_lines.append("# HELP app_cpu_usage_percent System CPU usage percent")
        metrics_lines.append("# TYPE app_cpu_usage_percent gauge")
        metrics_lines.append(f"app_cpu_usage_percent {cpu_p}")
        
        metrics_lines.append("# HELP app_memory_usage_percent System memory usage percent")
        metrics_lines.append("# TYPE app_memory_usage_percent gauge")
        metrics_lines.append(f"app_memory_usage_percent {ram_p}")

        metrics_lines.append("# HELP app_database_size_mb SQLite database file size in MB")
        metrics_lines.append("# TYPE app_database_size_mb gauge")
        metrics_lines.append(f"app_database_size_mb {db_s}")
    except Exception as e:
        metrics_lines.append(f"# ERROR gathering system metrics: {str(e)}")
        
    # 2. HTTP Request metrics from traffic_registry
    try:
        from src.utils.telemetry import traffic_registry
        # Group request count by method, path, status_code
        request_counts = {}
        total_latency = 0.0
        total_requests = len(traffic_registry)
        
        for req in list(traffic_registry):
            method = req["method"]
            path = req["path"]
            status_code = str(req["status_code"])
            latency = req["latency_ms"]
            total_latency += latency
            
            key = (method, path, status_code)
            request_counts[key] = request_counts.get(key, 0) + 1
            
        metrics_lines.append("# HELP app_http_requests_total Total number of HTTP requests processed")
        metrics_lines.append("# TYPE app_http_requests_total counter")
        for (m, p, s), count in request_counts.items():
            metrics_lines.append(f'app_http_requests_total{{method="{m}",path="{p}",status="{s}"}} {count}')
            
        if total_requests > 0:
            avg_latency_sec = (total_latency / total_requests) / 1000.0
            metrics_lines.append("# HELP app_http_request_latency_seconds_average Average HTTP request latency in seconds")
            metrics_lines.append("# TYPE app_http_request_latency_seconds_average gauge")
            metrics_lines.append(f"app_http_request_latency_seconds_average {avg_latency_sec:.6f}")
    except Exception as e:
        metrics_lines.append(f"# ERROR gathering traffic metrics: {str(e)}")
        
    return PlainTextResponse("\n".join(metrics_lines) + "\n", media_type="text/plain")


@app.get("/")
def read_root() -> dict[str, str]:
    """Trả về trạng thái hoạt động của hệ thống và cơ sở dữ liệu."""
    return {"status": "active", "service": "AI Lecture Assistant API", "database": "SQLite (WAL Mode Enabled)"}


@app.get("/health")
async def health() -> dict[str, str]:
    """Kiểm tra sức khỏe hệ thống và trả về môi trường chạy hiện tại."""
    return {"status": "ok", "env": settings.app_env}


# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Xử lý lỗi hệ thống toàn cục và định dạng kết quả trả về dưới dạng JSONResponse."""
    if isinstance(exc, (FastAPIHTTPException, StarletteHTTPException)):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    exc_str = str(exc)
    try:
        logger.error(f"🔥 LỖI HỆ THỐNG TOÀN CỤC: {exc_str}")
    except Exception:
        pass

    # Ẩn chi tiết lỗi chi tiết ở môi trường production để bảo mật hệ thống
    details_val = (
        exc_str
        if settings.app_env != "production"
        else "Chi tiết lỗi được ẩn ở môi trường production vì lý do bảo mật."
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "Có lỗi hệ thống xảy ra. Hệ thống RAG/API đang tự khôi phục, vui lòng thử lại sau.",
            "details": details_val,
        },
    )
