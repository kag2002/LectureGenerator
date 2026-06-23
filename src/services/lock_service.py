import asyncio
from datetime import datetime, timedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from src.database.models import OdinLock

# --- IN-MEMORY SSE BROADCASTER ---
class NotificationManager:
    def __init__(self):
        self._listeners: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self._listeners.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._listeners:
            self._listeners.remove(q)

    async def broadcast(self, event_data: dict):
        for q in self._listeners:
            await q.put(event_data)

notification_manager = NotificationManager()

async def publish_autopilot_event(course_id: int, event_data: dict):
    event_data["course_id"] = course_id
    await notification_manager.broadcast(event_data)


def check_context_lock(db: Session, course_id: int, context_key: str, current_user_email: str):
    """Kiểm tra xem context_key có đang bị khóa bởi người khác hoặc odin_autopilot không (hỗ trợ kiểm tra phân cấp/tiền tố)."""
    now = datetime.now()
    active_locks = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.expires_at > now
    ).all()

    for lock in active_locks:
        is_blocked = (
            lock.context_key == context_key
            or lock.context_key.startswith(context_key + "_")
            or context_key.startswith(lock.context_key + "_")
        )

        if is_blocked:
            if lock.locked_by == "odin_autopilot":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Đối tượng này đang được chỉnh sửa tự động bởi Trợ lý Mascot (Autopilot). Giao diện tạm thời bị khóa."
                )
            elif lock.locked_by != current_user_email:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Đối tượng này đang được chỉnh sửa bởi {lock.locked_by}. Vui lòng thử lại sau."
                )


def clean_expired_locks(db: Session, course_id: int, context_key: str = None):
    """Xóa các khóa đã hết hạn của môn học (hoặc cụ thể cho một ngữ cảnh)."""
    now = datetime.now()
    query = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.expires_at < now
    )
    if context_key:
        query = query.filter(OdinLock.context_key == context_key)
    query.delete()
    db.commit()


def get_active_locks_list(db: Session, course_id: int) -> list[OdinLock]:
    """Lấy danh sách các khóa đang hoạt động của khóa học (tự động xóa khóa đã hết hạn)."""
    clean_expired_locks(db, course_id)
    return db.query(OdinLock).filter(OdinLock.course_id == course_id).all()


async def acquire_lock(
    db: Session,
    course_id: int,
    context_key: str,
    locked_by: str,
    duration_seconds: int
) -> dict:
    """Đăng ký khóa giao diện cho một ngữ cảnh. Trả về status 'acquired' hoặc 'renewed'."""
    now = datetime.now()
    clean_expired_locks(db, course_id, context_key)

    existing_lock = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.context_key == context_key
    ).first()

    expires_at = now + timedelta(seconds=duration_seconds)

    if existing_lock:
        if existing_lock.locked_by != locked_by:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ngữ cảnh đang bị chỉnh sửa tự động bởi {existing_lock.locked_by}."
            )
        else:
            existing_lock.expires_at = expires_at
            db.commit()
            db.refresh(existing_lock)

            await publish_autopilot_event(course_id, {
                "event": "lock_renewed",
                "context_key": context_key,
                "locked_by": locked_by,
                "expires_at": expires_at.isoformat()
            })
            return {"status": "renewed", "lock_id": existing_lock.id}

    new_lock = OdinLock(
        course_id=course_id,
        context_key=context_key,
        locked_by=locked_by,
        expires_at=expires_at
    )
    db.add(new_lock)
    db.commit()
    db.refresh(new_lock)

    await publish_autopilot_event(course_id, {
        "event": "lock_acquired",
        "context_key": context_key,
        "locked_by": locked_by,
        "expires_at": expires_at.isoformat()
    })
    return {"status": "acquired", "lock_id": new_lock.id}


async def release_lock(db: Session, course_id: int, context_key: str, released_by: str) -> bool:
    """Giải phóng khóa giao diện và phát sự kiện SSE."""
    lock = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.context_key == context_key
    ).first()

    if lock:
        db.delete(lock)
        db.commit()

        await publish_autopilot_event(course_id, {
            "event": "lock_released",
            "context_key": context_key,
            "released_by": released_by
        })
        return True
    return False


async def renew_lock_safe(course_id: int, context_key: str, locked_by: str, duration_seconds: int):
    """Gia hạn khóa an toàn bằng cách tạo Session mới (dành cho background heartbeat)."""
    from src.database.session import SessionLocal
    db_session = SessionLocal()
    try:
        lock = db_session.query(OdinLock).filter(
            OdinLock.course_id == course_id,
            OdinLock.context_key == context_key
        ).first()
        if lock and lock.locked_by == locked_by:
            expires_at = datetime.now() + timedelta(seconds=duration_seconds)
            lock.expires_at = expires_at
            db_session.commit()
            await publish_autopilot_event(course_id, {
                "event": "lock_renewed",
                "context_key": context_key,
                "locked_by": locked_by,
                "expires_at": expires_at.isoformat()
            })
    except Exception:
        db_session.rollback()
    finally:
        db_session.close()


class LockHeartbeat:
    """Quản lý tiến trình heartbeat để gia hạn khóa tự động trong background."""
    def __init__(self, course_id: int, context_key: str, locked_by: str, interval: int = 10, duration: int = 30):
        self.course_id = course_id
        self.context_key = context_key
        self.locked_by = locked_by
        self.interval = interval
        self.duration = duration
        self.task = None

    async def start(self):
        async def loop():
            try:
                while True:
                    await asyncio.sleep(self.interval)
                    await renew_lock_safe(self.course_id, self.context_key, self.locked_by, self.duration)
            except asyncio.CancelledError:
                pass
            except Exception:
                pass
        self.task = asyncio.create_task(loop())

    async def stop(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except Exception:
                pass
            self.task = None
