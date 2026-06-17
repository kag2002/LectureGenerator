import os
import sys
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

import re
from fastapi import FastAPI, Request, status
from fastapi import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from src.api import auth, chatbot, courses, export, materials, outline, questions, routes
from src.config import get_settings
from src.database.session import Base, engine
from src.services import web_search_agent

# Initialize SQLite database tables if they do not exist
Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)

# Auto-migration for Course fields
try:
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("courses")]
    if "required_textbooks" not in columns:
        logger.info("[MIGRATION] Adding column 'required_textbooks' to table 'courses'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE courses ADD COLUMN required_textbooks TEXT"))
    if "recommended_readings" not in columns:
        logger.info("[MIGRATION] Adding column 'recommended_readings' to table 'courses'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE courses ADD COLUMN recommended_readings TEXT"))

    # Auto-migration for RAGDocument fields
    rag_doc_columns = [col["name"] for col in inspector.get_columns("rag_documents")]
    if "error_message" not in rag_doc_columns:
        logger.info("[MIGRATION] Adding column 'error_message' to table 'rag_documents'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE rag_documents ADD COLUMN error_message TEXT"))

    # Auto-migration for ChatMessage fields
    chat_msg_columns = [col["name"] for col in inspector.get_columns("chat_messages")]
    if "is_archived" not in chat_msg_columns:
        logger.info("[MIGRATION] Adding column 'is_archived' to table 'chat_messages'...")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE chat_messages ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
except Exception as e:
    logger.warning(f"[MIGRATION WARNING] Failed to migrate SQLite columns: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} in {settings.app_env} mode")
    try:
        from src.database.vector_db import migrate_vector_db_metadata

        migrate_vector_db_metadata()
    except Exception as e:
        logger.warning(f"[WARNING] Startup migration failed: {e}")
    yield
    logger.info("Shutting down...")


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

# Register all Routers
app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(outline.router)
app.include_router(materials.router)
app.include_router(questions.router)
app.include_router(chatbot.router)
app.include_router(web_search_agent.router)
app.include_router(export.router)

# Register C2-App-023 default router at v1 for compatibility
app.include_router(routes.router, prefix="/api/v1")


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
