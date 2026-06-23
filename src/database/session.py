import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from ..config import get_settings

settings = get_settings()
DATABASE_URL = os.environ.get("DATABASE_URL") or settings.database_url

# Nếu postgresql:// bắt đầu bằng postgres:// (Render/Heroku format), đổi thành postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = DATABASE_URL.startswith("sqlite")

if is_sqlite:
    from sqlalchemy.pool import NullPool

    db_timeout = getattr(settings, "database_timeout", 15.0)
    engine = create_engine(
        DATABASE_URL, connect_args={"check_same_thread": False, "timeout": db_timeout}, poolclass=NullPool
    )

    # Kích hoạt chế độ WAL (Write-Ahead Logging) cho SQLite để tránh Write-Locks khi chạy đa luồng
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    # Cấu hình kết nối PostgreSQL
    engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_recycle=3600)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def run_db_migrations():
    """Chạy Alembic migrations tự động khi startup để giữ schema đồng bộ."""
    import logging

    from alembic.config import Config

    from alembic import command

    logger = logging.getLogger(__name__)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini_path = os.path.join(base_dir, "alembic.ini")

    if os.path.exists(ini_path):
        logger.info("[MIGRATION] Running Alembic migrations upgrade head...")
        alembic_cfg = Config(ini_path)
        alembic_cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))
        try:
            command.upgrade(alembic_cfg, "head")
            logger.info("[MIGRATION] Database migrations upgrade completed.")
        except Exception as e:
            logger.warning(f"[MIGRATION WARNING] Alembic migration failed: {e}")
    else:
        logger.warning(f"[MIGRATION WARNING] alembic.ini not found at {ini_path}. Fallback to create_all.")
        Base.metadata.create_all(bind=engine)


# Dependency cung cấp session DB cho các routers FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
