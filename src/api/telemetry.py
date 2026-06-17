import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime

from src.auth import get_current_user, oauth2_scheme
from src.database.models import User, UserEvent, AIGenerationTrace
from src.database.session import get_db
from src.api.admin import require_admin

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# --- SCHEMAS ---
class TelemetryEventSchema(BaseModel):
    course_id: Optional[int] = None
    event_type: str
    element_id: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None

class TelemetryEventBatch(BaseModel):
    events: List[TelemetryEventSchema]

class AIFeedbackSubmit(BaseModel):
    course_id: Optional[int] = None
    chapter_id: Optional[int] = None
    clo_id: Optional[int] = None
    bloom_level: Optional[int] = None
    prompt: str
    proposed_content: str
    edited_content: Optional[str] = None
    rating: Optional[int] = None
    feedback: Optional[str] = None

# --- HELPERS FOR ASYNC DB WRITE ---
def write_events_to_db(events: List[dict], user_id: Optional[int], db_url: str):
    """Ghi nhận danh sách events vào database trong thread ngầm (Background Task)."""
    from src.database.session import SessionLocal
    db = SessionLocal()
    try:
        for ev in events:
            payload_str = json.dumps(ev.get("payload")) if ev.get("payload") else None
            db_ev = UserEvent(
                user_id=user_id,
                course_id=ev.get("course_id"),
                event_type=ev.get("event_type"),
                element_id=ev.get("element_id"),
                payload=payload_str
            )
            db.add(db_ev)
        db.commit()
    except Exception as e:
        print(f"[TELEMETRY ERROR] Failed to write events in background: {e}")
    finally:
        db.close()

def write_trace_to_db(trace_data: dict, user_id: Optional[int]):
    """Ghi nhận dữ liệu trace AI vào database trong thread ngầm."""
    from src.database.session import SessionLocal
    db = SessionLocal()
    try:
        db_trace = AIGenerationTrace(
            user_id=user_id,
            course_id=trace_data.get("course_id"),
            chapter_id=trace_data.get("chapter_id"),
            clo_id=trace_data.get("clo_id"),
            bloom_level=trace_data.get("bloom_level"),
            prompt=trace_data.get("prompt"),
            proposed_content=trace_data.get("proposed_content"),
            edited_content=trace_data.get("edited_content"),
            rating=trace_data.get("rating"),
            feedback=trace_data.get("feedback")
        )
        db.add(db_trace)
        db.commit()
    except Exception as e:
        print(f"[TELEMETRY ERROR] Failed to write AI trace in background: {e}")
    finally:
        db.close()

# --- ROUTERS ---
@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
async def receive_telemetry_events(
    batch: TelemetryEventBatch,
    background_tasks: BackgroundTasks,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Nhận sự kiện telemetry dạng hàng loạt (Batch) và lưu ngầm không chặn luồng chính."""
    # Lấy thông tin user nếu có gửi token (telemetry có thể ẩn danh hoặc định danh)
    user_id = None
    if token:
        try:
            current_user = get_current_user(None, token=token, db=db)
            user_id = current_user.id
        except Exception:
            pass

    # Chuyển đổi schemas thành dicts để truyền an toàn vào thread ngầm
    events_dict = [ev.model_dump() for ev in batch.events]
    from src.config import get_settings
    settings = get_settings()
    
    background_tasks.add_task(
        write_events_to_db, 
        events_dict, 
        user_id, 
        settings.database_url
    )
    
    return {"status": "accepted", "count": len(batch.events)}

@router.post("/feedback", status_code=status.HTTP_202_ACCEPTED)
async def submit_ai_feedback(
    feedback_data: AIFeedbackSubmit,
    background_tasks: BackgroundTasks,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Nhận phản hồi chất lượng AI (Prompt, Proposed, Edited, Rating) và ghi ngầm để làm dataset fine-tuning."""
    user_id = None
    if token:
        try:
            current_user = get_current_user(None, token=token, db=db)
            user_id = current_user.id
        except Exception:
            pass

    background_tasks.add_task(
        write_trace_to_db,
        feedback_data.model_dump(),
        user_id
    )
    return {"status": "accepted", "message": "Đã ghi nhận phản hồi để phân tích nâng cao chất lượng AI."}

@router.get("/admin/analytics/finetune-dataset", dependencies=[Depends(require_admin)])
def export_finetune_dataset(db: Session = Depends(get_db)):
    """Trích xuất cặp dữ liệu SFT (AI proposed -> User edited) dưới dạng JSONL phục vụ Fine-tuning."""
    try:
        traces = db.query(AIGenerationTrace).filter(
            AIGenerationTrace.proposed_content.isnot(None),
            AIGenerationTrace.edited_content.isnot(None)
        ).all()
        
        dataset = []
        for t in traces:
            # Tạo định dạng chuẩn tin nhắn OpenAI SFT format
            dataset.append({
                "prompt": t.prompt,
                "proposed": t.proposed_content,
                "accepted_edited": t.edited_content,
                "rating": t.rating,
                "metadata": {
                    "course_id": t.course_id,
                    "chapter_id": t.chapter_id,
                    "clo_id": t.clo_id,
                    "bloom_level": t.bloom_level,
                    "timestamp": t.created_at.isoformat() if t.created_at else None
                }
            })
            
        return {
            "status": "success",
            "total_records": len(dataset),
            "format": "JSONL SFT Format",
            "data": dataset
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi trích xuất bộ dữ liệu: {str(e)}"
        )
