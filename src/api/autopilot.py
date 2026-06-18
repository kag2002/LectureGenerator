import asyncio
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import ChapterMaterial, Course, OdinActionLog, OdinLock, Question, User
from src.database.session import get_db

router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])

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
    """Kiểm tra xem context_key có đang bị khóa bởi người khác hoặc odin_autopilot không."""
    now = datetime.now()
    active_lock = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.context_key == context_key,
        OdinLock.expires_at > now
    ).first()

    if active_lock:
        if active_lock.locked_by == "odin_autopilot":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Đối tượng này đang được chỉnh sửa tự động bởi Trợ lý Mascot (Autopilot). Giao diện tạm thời bị khóa."
            )
        elif active_lock.locked_by != current_user_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Đối tượng này đang được chỉnh sửa bởi {active_lock.locked_by}. Vui lòng thử lại sau."
            )


# --- SCHEMAS ---
class LockAcquireRequest(BaseModel):
    context_key: str
    locked_by: str
    duration_seconds: int

class LockReleaseRequest(BaseModel):
    context_key: str


# --- ENDPOINTS ---

@router.get("/notifications/stream")
async def sse_notifications(current_user: User = Depends(get_current_user)):
    """SSE Stream toàn cục lắng nghe các thay đổi khóa giao diện và tiến trình tác vụ nền."""
    async def event_generator():
        q = notification_manager.subscribe()
        try:
            # Gửi một event ping ban đầu để giữ kết nối
            yield f"data: {json.dumps({'event': 'ping', 'message': 'connected'}, ensure_ascii=False)}\n\n"
            while True:
                event = await q.get()
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            notification_manager.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@router.get("/courses/{course_id}/locks")
def get_active_locks(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lấy danh sách các khóa đang hoạt động của khóa học (tự động xóa khóa đã hết hạn)."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại hoặc bạn không sở hữu.")

    # Tự động dọn dẹp các khóa đã hết hạn
    db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.expires_at < datetime.now()
    ).delete()
    db.commit()

    locks = db.query(OdinLock).filter(OdinLock.course_id == course_id).all()
    return [
        {
            "id": lock.id,
            "course_id": lock.course_id,
            "context_key": lock.context_key,
            "locked_by": lock.locked_by,
            "expires_at": lock.expires_at.isoformat() if lock.expires_at else None,
            "created_at": lock.created_at.isoformat() if lock.created_at else None
        }
        for lock in locks
    ]


@router.post("/courses/{course_id}/locks/acquire")
async def acquire_lock(
    course_id: int,
    req: LockAcquireRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Đăng ký khóa giao diện cho một ngữ cảnh (chapter hoặc matrix)."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại hoặc bạn không sở hữu.")

    now = datetime.now()
    # 1. Dọn dẹp khóa cũ của ngữ cảnh này nếu đã hết hạn
    db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.context_key == req.context_key,
        OdinLock.expires_at < now
    ).delete()
    db.commit()

    # 2. Kiểm tra xem ngữ cảnh có đang bị khóa bởi ai khác không
    existing_lock = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.context_key == req.context_key
    ).first()

    expires_at = now + timedelta(seconds=req.duration_seconds)

    if existing_lock:
        # Nếu đã bị khóa bởi người khác -> Báo xung đột
        if existing_lock.locked_by != req.locked_by:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ngữ cảnh đang bị chỉnh sửa tự động bởi {existing_lock.locked_by}."
            )
        else:
            # Cập nhật thời gian hết hạn (Heartbeat gia hạn khóa)
            existing_lock.expires_at = expires_at
            db.commit()
            db.refresh(existing_lock)

            await publish_autopilot_event(course_id, {
                "event": "lock_renewed",
                "context_key": req.context_key,
                "locked_by": req.locked_by,
                "expires_at": expires_at.isoformat()
            })
            return {"status": "renewed", "lock_id": existing_lock.id}

    # 3. Tạo khóa mới
    new_lock = OdinLock(
        course_id=course_id,
        context_key=req.context_key,
        locked_by=req.locked_by,
        expires_at=expires_at
    )
    db.add(new_lock)
    db.commit()
    db.refresh(new_lock)

    # Phát sự kiện SSE thông báo khóa mới
    await publish_autopilot_event(course_id, {
        "event": "lock_acquired",
        "context_key": req.context_key,
        "locked_by": req.locked_by,
        "expires_at": expires_at.isoformat()
    })

    return {"status": "acquired", "lock_id": new_lock.id}


@router.post("/courses/{course_id}/locks/release")
async def release_lock(
    course_id: int,
    req: LockReleaseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Giải phóng khóa giao diện thủ công hoặc tự động."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại hoặc bạn không sở hữu.")

    lock = db.query(OdinLock).filter(
        OdinLock.course_id == course_id,
        OdinLock.context_key == req.context_key
    ).first()

    if lock:
        db.delete(lock)
        db.commit()

        # Phát sự kiện SSE giải phóng khóa
        await publish_autopilot_event(course_id, {
            "event": "lock_released",
            "context_key": req.context_key,
            "released_by": current_user.email
        })
        return {"status": "released", "context_key": req.context_key}

    return {"status": "not_found", "message": "Không tìm thấy khóa hoạt động cho ngữ cảnh này."}


@router.post("/courses/{course_id}/autopilot/undo")
async def autopilot_undo(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Hoàn tác (Rollback) phiên Autopilot gần đây nhất của môn học."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại hoặc bạn không sở hữu.")

    # Tìm log autopilot mới nhất
    last_log = db.query(OdinActionLog).filter(
        OdinActionLog.course_id == course_id
    ).order_by(OdinActionLog.created_at.desc()).first()

    if not last_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy lịch sử phiên Autopilot nào để hoàn tác."
        )

    try:
        affected = json.loads(last_log.affected_ids)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Lịch sử hành động Autopilot bị lỗi định dạng."
        )

    deleted_questions = 0
    deleted_materials = 0

    # 1. Rollback questions (chỉ xóa những câu hỏi chưa bị sửa tay: created_by == 'odin_autopilot')
    if "questions" in affected and affected["questions"]:
        q_ids = affected["questions"]
        questions_to_check = db.query(Question).filter(
            Question.id.in_(q_ids),
            Question.course_id == course_id
        ).all()
        for q in questions_to_check:
            is_unmodified = (q.created_by == "odin_autopilot")
            if is_unmodified:
                db.delete(q)
                deleted_questions += 1

    # 2. Rollback chapter materials (chỉ xóa những slide/kịch bản chưa bị sửa tay: created_by == 'odin_autopilot')
    if "materials" in affected and affected["materials"]:
        cm_ids = affected["materials"]
        materials_to_check = db.query(ChapterMaterial).filter(
            ChapterMaterial.id.in_(cm_ids)
        ).all()
        for cm in materials_to_check:
            is_unmodified = (cm.created_by == "odin_autopilot")
            if is_unmodified:
                db.delete(cm)
                deleted_materials += 1

    # Xóa dòng log hành động này
    db.delete(last_log)
    db.commit()

    # Phát sự kiện cập nhật giao diện
    await publish_autopilot_event(course_id, {
        "event": "autopilot_undone",
        "message": "Đã hoàn tác phiên soạn thảo tự động thành công."
    })

    return {
        "status": "success",
        "message": "Hoàn tác Autopilot thành công.",
        "reverted": {
            "questions_deleted": deleted_questions,
            "materials_deleted": deleted_materials
        }
    }
