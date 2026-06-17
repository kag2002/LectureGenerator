import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import Chapter, ChapterMaterial, ChatEvalRun, ChatMessage, ChatSession, Course, Question, User
from src.database.session import SessionLocal, get_db
from src.services.chatbot_agent import run_chatbot_agent_loop
from src.services.chatbot_eval import run_chatbot_evaluation
from src.utils.task_manager import task_manager

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


# Pydantic Schemas
class SessionCreateRequest(BaseModel):
    course_id: int | None = Field(None, description="ID của môn học liên kết (tùy chọn)")
    title: str | None = Field("Cuộc trò chuyện mới", description="Tiêu đề cuộc trò chuyện")


class ChatRequest(BaseModel):
    session_id: int = Field(..., description="ID của phiên trò chuyện")
    message: str = Field(..., description="Nội dung tin nhắn từ giảng viên")
    course_id: int = Field(..., description="ID của môn học để làm ngữ cảnh")
    parent_message_id: int | None = Field(None, description="ID của tin nhắn cha để rẽ nhánh (nếu có)")
    edit_message_id: int | None = Field(None, description="ID của tin nhắn gốc đang bị sửa đổi (nếu có)")
    reconciliation_action: str | None = Field(None, description="Hành động hòa giải: 'archive' | 'keep' | 'overwrite'")
    page_context: str | None = Field(None, description="Ngữ cảnh trang hiện tại của người dùng")


class SwitchBranchRequest(BaseModel):
    message_id: int = Field(..., description="ID của tin nhắn muốn chuyển nhánh hoạt động tới")


class MessageCreateRequest(BaseModel):
    role: str = Field(..., description="Vai trò của người gửi: 'user' hoặc 'assistant'")
    content: str = Field(..., description="Nội dung tin nhắn")
    parent_id: int | None = Field(None, description="ID tin nhắn cha (nếu có)")


# --- API QUẢN LÝ PHIÊN CHAT ---


@router.post("/sessions")
def create_chat_session(
    req: SessionCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Tạo phiên trò chuyện mới cho giảng viên."""
    if req.course_id:
        course = db.query(Course).filter(Course.id == req.course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền sở hữu."
            )

    session = ChatSession(course_id=req.course_id, title=req.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "course_id": session.course_id,
        "title": session.title,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


@router.get("/sessions")
def get_chat_sessions(
    course_id: int | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Lấy danh sách các phiên chat của giảng viên (lọc theo course_id nếu có)."""
    query = db.query(ChatSession)
    if course_id:
        course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Môn học không tồn tại.")
        query = query.filter(ChatSession.course_id == course_id)
    else:
        user_course_ids = [c.id for c in current_user.courses]
        query = query.filter(ChatSession.course_id.in_(user_course_ids))

    sessions = query.order_by(ChatSession.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "course_id": s.course_id,
            "title": s.title,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.put("/sessions/{session_id}")
def update_chat_session(
    session_id: int,
    req: SessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cập nhật tiêu đề phiên trò chuyện."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên trò chuyện không tồn tại.")
    if session.course_id:
        course = db.query(Course).filter(Course.id == session.course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập.")
    if req.title:
        session.title = req.title
        db.commit()
        db.refresh(session)
    return {"id": session.id, "title": session.title}


@router.delete("/sessions/{session_id}")
def delete_chat_session(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Xóa phiên trò chuyện và toàn bộ tin nhắn liên quan."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên trò chuyện không tồn tại.")
    if session.course_id:
        course = db.query(Course).filter(Course.id == session.course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập.")

    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"success": True, "message": "Đã xóa phiên trò chuyện thành công."}


@router.get("/sessions/{session_id}/messages")
def get_session_messages(
    session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Lấy danh sách các tin nhắn dọc theo đường đi hoạt động (active path) của phiên chat."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên trò chuyện không tồn tại.")

    if session.course_id:
        course = db.query(Course).filter(Course.id == session.course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập phiên chat này.")

    # 1. Truy vết ngược từ active_leaf_id lên gốc
    active_path_messages = []
    curr_id = session.active_leaf_id

    # Nếu chưa có active_leaf_id, lấy tin nhắn cuối cùng làm mặc định (hỗ trợ dữ liệu cũ)
    if not curr_id:
        last_msg = (
            db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.id.desc()).first()
        )
        if last_msg:
            curr_id = last_msg.id
            session.active_leaf_id = curr_id
            db.commit()

    while curr_id is not None:
        msg = db.query(ChatMessage).filter(ChatMessage.id == curr_id).first()
        if not msg:
            break
        active_path_messages.insert(0, msg)
        curr_id = msg.parent_id

    formatted_messages = []
    for msg in active_path_messages:
        if msg.role == "system":
            continue
        t_calls = None
        t_results = None
        if msg.tool_calls:
            try:
                t_calls = json.loads(msg.tool_calls)
            except Exception:
                t_calls = msg.tool_calls
        if msg.tool_results:
            try:
                t_results = json.loads(msg.tool_results)
            except Exception:
                t_results = msg.tool_results

        # Lấy danh sách anh chị em (phiên bản khác)
        siblings = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id, ChatMessage.parent_id == msg.parent_id)
            .order_by(ChatMessage.id.asc())
            .all()
        )
        versions = [s.id for s in siblings]

        from src.services.consolidation_worker import decompress_message_content

        formatted_messages.append(
            {
                "id": msg.id,
                "role": msg.role,
                "content": decompress_message_content(msg.content),
                "parent_id": msg.parent_id,
                "versions": versions,  # Thêm thông tin phiên bản
                "tool_calls": t_calls,
                "tool_results": t_results,
                "prompt_tokens": msg.prompt_tokens,
                "completion_tokens": msg.completion_tokens,
                "total_tokens": msg.total_tokens,
                "latency_ms": msg.latency_ms,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }
        )
    return formatted_messages


@router.post("/sessions/{session_id}/messages")
def append_message(
    session_id: int,
    req: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lưu tin nhắn trực tiếp vào phiên chat (thủ công/xác nhận hành động) mà không chạy LLM."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên trò chuyện không tồn tại.")

    if session.course_id:
        course = db.query(Course).filter(Course.id == session.course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập phiên chat này.")

    parent_id = req.parent_id
    if parent_id is None:
        parent_id = session.active_leaf_id

    db_msg = ChatMessage(
        session_id=session_id,
        role=req.role,
        content=req.content,
        parent_id=parent_id,
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0,
        latency_ms=0.0,
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)

    # Cập nhật active_leaf_id mới cho Session
    session.active_leaf_id = db_msg.id
    db.commit()

    return {"success": True, "message_id": db_msg.id}


# --- API STREAM CHATBOT EVENT (SSE) ---


@router.post("/chat-stream")
def chat_stream(req: ChatRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Gửi tin nhắn và stream quá trình suy luận, kết quả gọi tool và phản hồi qua SSE.
    """
    course = db.query(Course).filter(Course.id == req.course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại.")

    session = db.query(ChatSession).filter(ChatSession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên chat không tồn tại.")

    session_id = req.session_id
    user_message = req.message
    course_id = req.course_id
    user_id = current_user.id

    # 1. Xác định parent_id cho rẽ nhánh
    parent_id = req.parent_message_id
    if parent_id is None:
        parent_id = session.active_leaf_id

    # 2. Xử lý hòa giải dữ liệu nếu có chỉnh sửa tin nhắn gốc cũ
    if req.edit_message_id and req.reconciliation_action:
        from src.services.reconciliation import reconcile_state

        reconcile_state(db, req.edit_message_id, req.reconciliation_action)

    # 3. Tạo trước tin nhắn User để lấy ID gán vào học liệu tạo bởi tool calls
    db_user = ChatMessage(
        session_id=session_id,
        role="user",
        content=user_message,
        parent_id=parent_id,
        prompt_tokens=0,
        completion_tokens=0,
        total_tokens=0,
        latency_ms=0.0,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    user_message_id = db_user.id

    async def event_stream():
        def send(event: str, data: dict):
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        current_task = asyncio.current_task()
        if current_task:
            task_manager.register_task(f"chat_{session_id}", current_task)

        queue = asyncio.Queue()

        async def on_event(event: str, data: dict):
            await queue.put((event, data))

        async_db = SessionLocal()

        async def run_agent():
            try:
                result = await run_chatbot_agent_loop(
                    session_id=session_id,
                    user_message=user_message,
                    course_id=course_id,
                    user_id=user_id,
                    db=async_db,
                    on_event=on_event,
                    user_message_id=user_message_id,
                    page_context=req.page_context,
                )
                await queue.put(("agent_result", result))
            except asyncio.CancelledError:
                pass
            except Exception as e:
                await queue.put(("agent_error", e))

        agent_task = asyncio.create_task(run_agent())

        try:
            while True:
                event, data = await queue.get()
                if event == "agent_result":
                    result = data
                    status = result.get("status", "answered")
                    assistant_text = result.get("assistant_text", "")

                    if status == "blocked":
                        yield send(
                            "stage", {"stage": 5, "message": "⚠️ Cảnh báo: Phản hồi bị chặn do vi phạm Guardrails."}
                        )

                    # Check for proposed action in the agent rounds
                    rounds = result.get("rounds", [])
                    proposed_action = None
                    for rnd in rounds:
                        for tr in rnd.get("tool_results", []):
                            res = tr.get("result", {})
                            if isinstance(res, dict) and res.get("status") == "proposed":
                                proposed_action = {
                                    "view": res.get("view"),
                                    "action": res.get("action"),
                                    "params": res.get("params"),
                                    "message": res.get("message"),
                                }
                                break
                        if proposed_action:
                            break

                    if proposed_action:
                        yield send("dispatch_action", proposed_action)

                    yield send(
                        "done",
                        {
                            "status": status,
                            "assistant_text": assistant_text,
                            "prompt_tokens": result.get("prompt_tokens", 0),
                            "completion_tokens": result.get("completion_tokens", 0),
                            "total_tokens": result.get("total_tokens", 0),
                            "latency_ms": result.get("latency_ms", 0.0),
                            "trace_id": result.get("trace_id"),
                        },
                    )
                    break
                elif event == "agent_error":
                    raise data
                else:
                    yield send(event, data)

        except asyncio.CancelledError:
            print(f"[CHAT STREAM] Task cancelled for session {session_id}")
            yield send("stage", {"stage": 5, "message": "⚠️ Đã dừng phản hồi bởi người dùng."})
            yield send(
                "done",
                {
                    "status": "cancelled",
                    "assistant_text": "⚠️ Đã dừng phản hồi bởi người dùng.",
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                    "latency_ms": 0.0,
                },
            )
        except Exception as e:
            yield send("error", {"message": f"Lỗi hệ thống chatbot: {str(e)}"})
        finally:
            if not agent_task.done():
                agent_task.cancel()
                try:
                    await agent_task
                except asyncio.CancelledError:
                    pass
            task_manager.unregister_task(f"chat_{session_id}")
            async_db.close()

    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@router.post("/sessions/{session_id}/switch-branch")
def switch_branch(
    session_id: int,
    req: SwitchBranchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chuyển đổi active branch hoạt động và khôi phục trạng thái dữ liệu tương ứng."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên chat không tồn tại.")

    target_msg = (
        db.query(ChatMessage).filter(ChatMessage.id == req.message_id, ChatMessage.session_id == session_id).first()
    )
    if not target_msg:
        raise HTTPException(status_code=404, detail="Tin nhắn không tồn tại trong phiên chat này.")

    # 1. Tìm tin nhắn lá (leaf node) của nhánh mới
    new_leaf_id = find_leaf_node(db, req.message_id)

    # 2. Thu thập các Node thuộc nhánh cũ sắp bị ngắt hoạt động
    old_leaf_id = session.active_leaf_id

    # 3. Thực hiện chuyển đổi trạng thái active của các tài nguyên SQLite
    # 3a. Các tài nguyên thuộc nhánh cũ -> Tắt hoạt động (is_active = False)
    if old_leaf_id:
        old_path_ids = []
        curr = old_leaf_id
        while curr is not None:
            old_path_ids.append(curr)
            m = db.query(ChatMessage).filter(ChatMessage.id == curr).first()
            curr = m.parent_id if m else None

        db.query(Chapter).filter(Chapter.chat_message_id.in_(old_path_ids)).update(
            {"is_active": False}, synchronize_session=False
        )
        db.query(ChapterMaterial).filter(
            ChapterMaterial.chapter_id.in_(db.query(Chapter.id).filter(Chapter.chat_message_id.in_(old_path_ids)))
        ).update({"is_active": False}, synchronize_session=False)
        db.query(Question).filter(Question.chat_message_id.in_(old_path_ids)).update(
            {"is_active": False}, synchronize_session=False
        )

    # 3b. Các tài nguyên thuộc nhánh mới -> Bật hoạt động (is_active = True)
    new_path_ids = []
    curr = new_leaf_id
    while curr is not None:
        new_path_ids.append(curr)
        m = db.query(ChatMessage).filter(ChatMessage.id == curr).first()
        curr = m.parent_id if m else None

    db.query(Chapter).filter(Chapter.chat_message_id.in_(new_path_ids)).update(
        {"is_active": True}, synchronize_session=False
    )
    db.query(ChapterMaterial).filter(
        ChapterMaterial.chapter_id.in_(db.query(Chapter.id).filter(Chapter.chat_message_id.in_(new_path_ids)))
    ).update({"is_active": True}, synchronize_session=False)
    db.query(Question).filter(Question.chat_message_id.in_(new_path_ids)).update(
        {"is_active": True}, synchronize_session=False
    )

    # 4. Cập nhật active_leaf_id mới cho Session
    session.active_leaf_id = new_leaf_id
    db.commit()

    return {"success": True, "active_leaf_id": new_leaf_id}


def find_leaf_node(db: Session, message_id: int) -> int:
    """Đệ quy đi xuống để tìm tin nhắn lá của nhánh con."""
    child = db.query(ChatMessage).filter(ChatMessage.parent_id == message_id).order_by(ChatMessage.id.desc()).first()
    if not child:
        return message_id
    return find_leaf_node(db, child.id)


@router.post("/sessions/{session_id}/cancel")
def cancel_chat(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Hủy tiến trình phản hồi của chatbot."""
    success = task_manager.cancel_task(f"chat_{session_id}")
    return {"success": success, "message": "Đã gửi lệnh hủy" if success else "Không có tác vụ nào đang chạy"}


# --- API CHẠY EVALUATION ĐÁNH GIÁ CHẤT LƯỢNG CHATBOT ---


@router.post("/eval/run")
async def trigger_chatbot_eval(
    provider: str = "openrouter", current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Kích hoạt chạy đánh giá tự động trên các ca kiểm thử và trả về kết quả."""
    try:
        res = await run_chatbot_evaluation(provider, db)
        return res
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi chạy đánh giá chatbot: {str(e)}"
        )


@router.get("/eval/history")
def get_chatbot_eval_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lấy danh sách các lượt đánh giá đã thực hiện trong quá khứ."""
    runs = db.query(ChatEvalRun).order_by(ChatEvalRun.run_at.desc()).all()

    formatted_runs = []
    for r in runs:
        res_list = None
        if r.results_json:
            try:
                res_list = json.loads(r.results_json)
            except Exception:
                res_list = r.results_json

        formatted_runs.append(
            {
                "id": r.id,
                "eval_run_id": r.eval_run_id,
                "provider": r.provider,
                "model": r.model,
                "total_cases": r.total_cases,
                "passed_cases": r.passed_cases,
                "accuracy": r.accuracy,
                "guardrail_violations_count": r.guardrail_violations_count,
                "results": res_list,
                "run_at": r.run_at.isoformat() if r.run_at else None,
            }
        )
    return formatted_runs


# --- API QUẢN LÝ QUY TẮC PHẢN TƯ (SYSTEM RULES) ---


@router.get("/courses/{course_id}/rules")
def get_course_rules(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Lấy danh sách các quy tắc tự học (approved & pending) của khóa học."""
    # Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại hoặc bạn không sở hữu.")

    from src.database.models import SystemRule

    rules = db.query(SystemRule).filter(SystemRule.course_id == course_id).order_by(SystemRule.created_at.desc()).all()

    return [
        {
            "id": r.id,
            "rule_text": r.rule_text,
            "rule_category": r.rule_category,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rules
    ]


@router.post("/rules/{rule_id}/approve")
def approve_rule(rule_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Phê duyệt quy tắc tự sinh để chính thức áp dụng vào prompt."""
    from src.database.models import SystemRule

    rule = db.query(SystemRule).filter(SystemRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Quy tắc không tồn tại.")

    # Xác thực quyền sở hữu khóa học của quy tắc đó
    course = db.query(Course).filter(Course.id == rule.course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý quy tắc của khóa học này.")

    rule.status = "approved"
    db.commit()
    return {"success": True, "message": "Đã phê duyệt quy tắc thành công."}


@router.post("/rules/{rule_id}/reject")
def reject_rule(rule_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Từ chối và loại bỏ quy tắc tự sinh."""
    from src.database.models import SystemRule

    rule = db.query(SystemRule).filter(SystemRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Quy tắc không tồn tại.")

    course = db.query(Course).filter(Course.id == rule.course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý quy tắc của khóa học này.")

    db.delete(rule)
    db.commit()
    return {"success": True, "message": "Đã từ chối và xóa quy tắc thành công."}


@router.post("/courses/{course_id}/reflect")
async def trigger_reflection(
    course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Chạy thủ công chu kỳ phản tư tự rút kinh nghiệm (Reflection) cho môn học."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại hoặc bạn không sở hữu.")

    from src.services.reflection_agent import run_reflection_cycle

    res = await run_reflection_cycle(course_id=course_id, db=db)
    return res


@router.post("/sessions/{session_id}/consolidate")
async def trigger_session_consolidation(
    session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Chạy thủ công tiến trình hợp nhất và dọn dẹp (Consolidation) cho phiên chat."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Phiên trò chuyện không tồn tại.")

    if session.course_id:
        course = db.query(Course).filter(Course.id == session.course_id, Course.user_id == current_user.id).first()
        if not course:
            raise HTTPException(status_code=403, detail="Không có quyền truy cập phiên chat này.")

    from src.services.consolidation_worker import consolidate_session

    res = await consolidate_session(session_id=session_id, db=db)
    return res
