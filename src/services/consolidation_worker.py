import gzip
import base64
from sqlalchemy.orm import Session
from src.database.models import ChatMessage, ChatSession
from src.utils.llm_client import async_call_llm_json

CONSOLIDATION_SYSTEM_PROMPT = """Bạn là trợ lý AI tóm tắt phiên làm việc (Session Consolidation Agent).
Nhiệm vụ: Hãy phân tích toàn bộ lịch sử trò chuyện của phiên làm việc dưới đây, tự động trích xuất các thông tin chính quan trọng:
1. Chủ đề môn học đang thảo luận chính.
2. Các chương học, chuẩn đầu ra (CLOs) và Bloom level đã thiết kế/thao tác.
3. Thói quen giảng dạy, phong cách ngôn ngữ (tiếng Việt, tiếng Anh, song ngữ), sĩ số lớp học được giảng viên chỉ định.

Hãy trả về một đối tượng JSON có định dạng sau:
{
  "summary": "Đoạn tóm tắt ngắn gọn và súc tích (dưới 200 từ) bằng tiếng Việt mô tả đầy đủ các thông tin trên."
}
Chỉ trả về JSON hợp lệ."""

async def consolidate_session(session_id: int, db: Session) -> dict:
    """
    Hợp nhất phiên chat: Tóm tắt nội dung phiên chat, nén gzip các tin nhắn cũ,
    giải phóng dung lượng bằng cách dọn dẹp các trường JSON kết quả tool lớn.
    """
    # 1. Lấy tất cả tin nhắn chưa được archived của phiên
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id, ChatMessage.is_archived == False)
        .order_by(ChatMessage.id.asc())
        .all()
    )

    if not messages or len(messages) < 4:
        return {"status": "skipped", "message": "Phiên trò chuyện quá ngắn, chưa cần hợp nhất."}

    # 2. Xây dựng lịch sử gửi cho LLM để tóm tắt
    chat_history = []
    for msg in messages:
        if msg.role != "system":
            chat_history.append({"role": msg.role, "content": msg.content})

    prompt = f"Hãy tóm tắt lịch sử hội thoại sau:\n{chat_history}"

    try:
        summary_res = await async_call_llm_json(
            prompt,
            system_instruction=CONSOLIDATION_SYSTEM_PROMPT,
            temperature=0.0,
            prompt_name="session_consolidator",
            prompt_version="v1"
        )
        summary_text = summary_res.get("summary", "")
    except Exception as e:
        print(f"[CONSOLIDATION ERROR] Lỗi khi tóm tắt phiên chat: {e}")
        return {"status": "error", "message": f"Lỗi tóm tắt: {str(e)}"}

    if not summary_text:
        return {"status": "skipped", "message": "Không tạo được tóm tắt."}

    # 3. Nén nội dung tin nhắn cũ và dọn dẹp dung lượng
    for msg in messages:
        # Nén gzip content
        if msg.content:
            try:
                compressed = gzip.compress(msg.content.encode("utf-8"))
                msg.content = f"[GZIP_COMPRESSED]:{base64.b64encode(compressed).decode('utf-8')}"
            except Exception as e:
                print(f"[WARNING] Gzip compress failed: {e}")

        # Giải phóng các kết quả tool cực kỳ lớn
        if msg.tool_results:
            msg.tool_results = "[Archived tool result to save space]"
        
        # Đánh dấu archived
        msg.is_archived = True

    # 4. Lưu lại tin nhắn tóm tắt hệ thống làm mốc lịch sử mới
    last_msg = messages[-1]
    
    db_summary = ChatMessage(
        session_id=session_id,
        role="system",
        content=f"[TÓM TẮT PHIÊN LÀM VIỆC LỊCH SỬ]:\n{summary_text}",
        parent_id=last_msg.id,
        is_archived=False
    )
    db.add(db_summary)
    
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.active_leaf_id = db_summary.id

    db.commit()
    print(f"[CONSOLIDATION SUCCESS] Đã hợp nhất phiên chat {session_id} thành công.")
    return {"status": "success", "summary": summary_text}


def decompress_message_content(compressed_content: str) -> str:
    """Giải nén tin nhắn cũ nếu cần thiết hiển thị trên UI."""
    if compressed_content and compressed_content.startswith("[GZIP_COMPRESSED]:"):
        try:
            b64_data = compressed_content.split(":", 1)[1]
            compressed_bytes = base64.b64decode(b64_data.encode("utf-8"))
            decompressed = gzip.decompress(compressed_bytes).decode("utf-8")
            return decompressed
        except Exception as e:
            print(f"[WARNING] Decompress failed: {e}")
            return "[Error: Lỗi giải nén nội dung tin nhắn]"
    return compressed_content
