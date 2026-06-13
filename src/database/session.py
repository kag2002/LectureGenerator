import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Lấy DATABASE_URL từ môi trường (ưu tiên PostgreSQL cho production, mặc định SQLite)
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./lecture_generator.db")

# Nếu postgresql:// bắt đầu bằng postgres:// (Render/Heroku format), đổi thành postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

is_sqlite = DATABASE_URL.startswith("sqlite")

if is_sqlite:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

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
