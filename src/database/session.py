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
        DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": db_timeout},
        poolclass=NullPool
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


# Dependency cung cấp session DB cho các routers FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
