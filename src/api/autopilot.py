import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import ChapterMaterial, Course, OdinActionLog, Question, User
from src.database.session import get_db
from src.services.lock_service import (
    acquire_lock as service_acquire_lock,
)
from src.services.lock_service import (
    get_active_locks_list,
    notification_manager,
    publish_autopilot_event,
)
from src.services.lock_service import (
    release_lock as service_release_lock,
)

router = APIRouter(prefix="/api/autopilot", tags=["autopilot"])


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

    locks = get_active_locks_list(db, course_id)
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

    return await service_acquire_lock(
        db=db,
        course_id=course_id,
        context_key=req.context_key,
        locked_by=req.locked_by,
        duration_seconds=req.duration_seconds
    )


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

    released = await service_release_lock(db, course_id, req.context_key, current_user.email)
    if released:
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
