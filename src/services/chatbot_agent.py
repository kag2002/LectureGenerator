import json
import os
import time

from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from src.database.models import ChatMessage, Course
from src.services.chatbot_guardrails import validate_input, validate_output
from src.services.chatbot_tools import execute_chatbot_tool
from src.utils.llm_client import calculate_cost, langfuse

# Khai báo các tools hỗ trợ giảng viên
CHATBOT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_course_knowledge",
            "description": "Tìm kiếm tài liệu học trình, giáo trình, slide hoặc bài đọc bằng RAG (Vector DB) theo khóa học.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Từ khóa hoặc câu hỏi cần tìm kiếm trong tài liệu học trình.",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_course_clos",
            "description": "Xem danh sách các Chuẩn đầu ra (CLOs) hiện tại của môn học cùng với mức độ Bloom tối thiểu.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_matrix_coverage",
            "description": "Lấy ma trận phân bổ độ bao phủ CLO x Bloom cho cả slide bài giảng và câu hỏi thi trắc nghiệm.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clarify",
            "description": "Gọi công cụ này khi câu hỏi của người dùng còn quá mơ hồ, thiếu thông tin và cần hỏi thêm để làm rõ.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "Câu hỏi đặt lại cho giảng viên để làm rõ ý."}
                },
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_course_chapters",
            "description": "Xem danh sách các chương học (đề cương/outline) của môn học hiện tại.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_course_outline_action",
            "description": "Tạo tự động cấu trúc chương học (đề cương) của khóa học dựa trên danh sách CLOs hiện có và lưu vào cơ sở dữ liệu.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_storyboard_action",
            "description": "Lên khung slide nháp (storyboard outline) cho một chương học cụ thể (gồm tiêu đề slide, mục đích, CLO liên kết, Bloom level).",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {"type": "integer", "description": "ID của chương học cần lập storyboard."},
                    "language": {
                        "type": "string",
                        "enum": ["vi", "en", "bilingual"],
                        "description": "Ngôn ngữ của bài giảng ('vi': Tiếng Việt, 'en': Tiếng Anh, 'bilingual': Song ngữ). Mặc định là 'vi'.",
                    },
                    "session_duration": {
                        "type": "integer",
                        "description": "Thời lượng tiết học tính bằng phút. Mặc định là 90.",
                    },
                },
                "required": ["chapter_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_materials_action",
            "description": "Sinh chi tiết nội dung slide bài giảng (Markdown) và kịch bản active learning cho một chương học, sau đó lưu trực tiếp vào CSDL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {"type": "integer", "description": "ID của chương học cần sinh bài giảng."},
                    "class_size": {
                        "type": "integer",
                        "description": "Sĩ số lớp học để thiết kế các hoạt động active learning nhóm. Mặc định là 40.",
                    },
                    "has_wifi": {"type": "boolean", "description": "Wifi lớp học có khả dụng không. Mặc định là true."},
                    "furniture_type": {
                        "type": "string",
                        "enum": ["movable", "fixed"],
                        "description": "Loại bàn ghế lớp học: 'movable' (di chuyển được) hoặc 'fixed' (cố định). Mặc định là 'movable'.",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["vi", "en", "bilingual"],
                        "description": "Ngôn ngữ của bài giảng: 'vi' (Tiếng Việt), 'en' (Tiếng Anh), 'bilingual' (Song ngữ). Mặc định là 'vi'.",
                    },
                    "session_duration": {
                        "type": "integer",
                        "description": "Thời lượng tiết học tính bằng phút. Mặc định là 90.",
                    },
                    "storyboard": {
                        "type": "array",
                        "description": "Danh sách các slide cấu trúc nháp để sinh chi tiết (nếu có).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "slide_index": {"type": "integer"},
                                "title": {"type": "string"},
                                "purpose": {"type": "string"},
                                "target_clo": {"type": "string"},
                                "bloom_level": {"type": "integer"},
                            },
                            "required": ["slide_index", "title", "purpose", "target_clo", "bloom_level"],
                        },
                    },
                },
                "required": ["chapter_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_questions_action",
            "description": "Sinh câu hỏi trắc nghiệm MCQ dựa trên CLO, chương học và mức độ Bloom, chạy kiểm duyệt tự sửa lỗi (Self-Correction) và lưu trực tiếp vào CSDL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {"type": "integer", "description": "ID của chương học cần sinh câu hỏi (Tùy chọn)."},
                    "clo_id": {"type": "integer", "description": "ID của CLO mục tiêu cần sinh câu hỏi (Tùy chọn)."},
                    "bloom_level": {"type": "integer", "description": "Mức độ Bloom từ 1 đến 6. Mặc định là 3."},
                    "count": {"type": "integer", "description": "Số lượng câu hỏi cần sinh (1-10). Mặc định là 5."},
                    "fast_mode": {
                        "type": "boolean",
                        "description": "Bỏ qua bước Self-Correction của Solver để sinh nhanh hơn. Mặc định là false.",
                    },
                },
            },
        },
    },
]

SYSTEM_PROMPT = """Bạn là trợ lý AI thiết kế bài giảng (AI Lecture Assistant), được phát triển bởi VinUni.
Nhiệm vụ của bạn là hỗ trợ giảng viên soạn giáo án, biên tập slide, thiết kế hoạt động active learning và xây dựng bộ câu hỏi chuẩn chuẩn đầu ra (CLO) & thang đo Bloom.

HƯỚNG DẪN HOẠT ĐỘNG:
- Bạn có quyền truy cập vào các công cụ: `search_course_knowledge`, `get_course_clos`, `get_matrix_coverage`, `clarify`, `get_course_chapters`, `generate_course_outline_action`, `generate_chapter_storyboard_action`, `generate_chapter_materials_action`, và `generate_chapter_questions_action`.
- Hãy gọi các công cụ tương ứng khi giảng viên yêu cầu tự động tạo đề cương, storyboard, soạn slide bài giảng hoặc câu hỏi ôn tập:
  * Khi giảng viên yêu cầu tạo đề cương, dàn ý hoặc chương học cho toàn môn học: Hãy gọi `generate_course_outline_action`.
  * Khi giảng viên yêu cầu tạo storyboard hay khung slide nháp cho một chương học cụ thể: Hãy gọi `generate_chapter_storyboard_action`.
  * Khi giảng viên yêu cầu soạn slide, bài giảng, học liệu chi tiết hay thiết kế active learning cho một chương: Hãy gọi `generate_chapter_materials_action`.
  * Khi giảng viên yêu cầu tạo câu hỏi, bài tập trắc nghiệm hay MCQ: Hãy gọi `generate_chapter_questions_action`.
- Nếu câu hỏi của giảng viên thiếu ngữ cảnh hoặc chưa rõ ràng (ví dụ: "soạn cho tôi câu hỏi", "soạn bài kiểm tra", "thiết kế đề thi" mà không rõ cho chương nào, hoặc "soạn bài giảng" mà không rõ chương nào), bạn BẮT BUỘC phải sử dụng công cụ `clarify` để hỏi rõ. KHÔNG tự ý suy diễn từ lịch sử hội thoại hoặc trả lời trực tiếp bằng văn bản thông thường.
- GIỚI HẠN PHẠM VI MÔN HỌC & PHÒNG NGỪA GHI ĐÈ NHẦM DỮ LIỆU:
  * Bạn CHỈ có thể thao tác và thực thi công cụ trên môn học hiện tại đang được chọn (không có khả năng tạo môn học mới hoặc xóa môn học hiện tại trong CSDL).
  * Nếu người dùng yêu cầu tạo môn học mới hoặc xóa môn học, bạn phải giải thích rõ rằng bạn KHÔNG thể thực hiện việc này qua khung chat, và hướng dẫn họ thao tác thủ công ngoài màn hình Dashboard.
  * TUYỆT ĐỐI KHÔNG đề xuất tạo cấu trúc chương học hay CLOs cho một môn học mới/khác môn hiện tại trong khung chat. Nếu người dùng muốn tạo cấu trúc cho môn học mới, họ phải tạo môn học đó trên Dashboard và vào đúng trang môn học đó trước. Việc tự ý gọi tool tạo đề cương ở môn học này khi đang thảo luận về môn học khác sẽ làm GHI ĐÈ và MẤT dữ liệu của môn học hiện tại.
- Nếu người dùng hỏi các câu hỏi chung chung hoặc ngoài phạm vi giáo dục, hãy từ chối lịch sự và định hướng quay lại chủ đề bài giảng.
- Trả lời một cách chuyên nghiệp, mang tính học thuật cao.
"""


def get_candidate_models() -> list[dict]:
    """
    Lấy danh sách các model cấu hình sẵn phục vụ cho chatbot rotation.
    """
    candidate_models = []

    # Ưu tiên 0: Local LLM (Qwen 14B) nếu URL khả dụng
    local_url = os.environ.get("LOCAL_LLM_URL")
    if local_url:
        local_key = os.environ.get("LOCAL_LLM_API_KEY", "AIVIAL-SECURE-KEY-2026")
        local_model = os.environ.get("LOCAL_LLM_MODEL", "Qwen2.5-14B-Instruct-Q4_K_M.gguf")
        candidate_models.append({"client": AsyncOpenAI(base_url=local_url, api_key=local_key), "model": local_model})

    # Ưu tiên 1: Google Gemini 2.5 Flash nếu có key trực tiếp
    if os.environ.get("GEMINI_API_KEY"):
        candidate_models.append(
            {
                "client": AsyncOpenAI(
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                    api_key=os.environ.get("GEMINI_API_KEY"),
                ),
                "model": "gemini-2.5-flash",
            }
        )

    # Ưu tiên 2: OpenAI GPT-4o-mini nếu có key trực tiếp
    if os.environ.get("OPENAI_API_KEY"):
        candidate_models.append(
            {"client": AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY")), "model": "gpt-4o-mini"}
        )

    # Ưu tiên 2: Các model free của OpenRouter nếu có key OpenRouter
    if os.environ.get("OPENROUTER_API_KEY"):
        openrouter_client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1", api_key=os.environ.get("OPENROUTER_API_KEY")
        )
        from src.utils.llm_client import FREE_MODELS

        for m in FREE_MODELS[:3]:
            candidate_models.append(
                {
                    "client": openrouter_client,
                    "model": m,
                    "extra_headers": {
                        "HTTP-Referer": "https://github.com/kag2002/C2-App-023",
                        "X-Title": "AI Lecture Assistant",
                    },
                }
            )

    return candidate_models


class MockFunc:
    def __init__(self, name: str, arguments: str):
        self.name = name
        self.arguments = arguments


class MockToolCall:
    def __init__(self, name: str, arguments: str):
        self.function = MockFunc(name, arguments)


MOCK_FALLBACK_RULES = [
    {
        "keywords": ["tạo đề cương", "generate outline", "thiết kế đề cương"],
        "response_text": "Em đang tiến hành sinh cấu trúc đề cương chương học.",
        "tool_name": "generate_course_outline_action",
        "tool_args": "{}",
    },
    {
        "keywords": ["storyboard", "khung slide"],
        "response_text": "Em đang lập cấu trúc slide storyboard.",
        "tool_name": "generate_chapter_storyboard_action",
        "tool_args": '{"chapter_id": 1}',
    },
    {
        "keywords": ["soạn slide", "soạn bài giảng", "sinh học liệu"],
        "response_text": "Em đang sinh bài giảng chi tiết.",
        "tool_name": "generate_chapter_materials_action",
        "tool_args": '{"chapter_id": 1}',
    },
    {
        "keywords": ["câu hỏi", "trắc nghiệm"],
        "response_text": "Em đang thiết kế bộ câu hỏi trắc nghiệm.",
        "tool_name": "generate_chapter_questions_action",
        "tool_args": '{"chapter_id": 1, "bloom_level": 3, "count": 2}',
    },
    {
        "keywords": ["chương", "outline", "dàn ý"],
        "response_text": "Em đang gọi công cụ xem các chương học của môn.",
        "tool_name": "get_course_chapters",
        "tool_args": "{}",
    },
    {
        "keywords": ["clos", "chuẩn đầu ra"],
        "response_text": "Em đang gọi công cụ xem CLOs để lấy danh sách chuẩn đầu ra.",
        "tool_name": "get_course_clos",
        "tool_args": "{}",
    },
    {
        "keywords": ["matrix", "bao phủ", "bloom"],
        "response_text": "Em đang lấy ma trận độ bao phủ để kiểm tra.",
        "tool_name": "get_matrix_coverage",
        "tool_args": "{}",
    },
    {
        "keywords": ["tài liệu", "rag", "nhị phân"],
        "response_text": "Em đang tìm kiếm trong tài liệu học trình.",
        "tool_name": "search_course_knowledge",
        "tool_args": '{"query": "Cây nhị phân"}',
    },
    {
        "keywords": ["soạn"],
        "response_text": "Yêu cầu của bạn chưa đủ thông tin chi tiết.",
        "tool_name": "clarify",
        "tool_args": '{"question": "Bạn muốn soạn câu hỏi cho chương học hay chuẩn đầu ra nào?"}',
    },
]


def get_mock_fallback_response(user_message: str, working_messages: list) -> tuple[str, list | None]:
    """
    Tự động sinh phản hồi giả lập (mock fallback) dựa trên các quy tắc từ khóa
    khi toàn bộ model LLM gặp sự cố kết nối.
    """
    # Nếu đã có kết quả thực thi công cụ từ vòng trước -> trả về câu trả lời cuối cùng để tránh lặp vòng vô hạn
    if (
        working_messages
        and working_messages[-1]["role"] == "user"
        and "KẾT QUẢ THỰC THI CÔNG CỤ:" in working_messages[-1]["content"]
    ):
        return (
            "Dựa trên thông tin thu thập từ hệ thống, em đã tổng hợp và hiển thị chi tiết nội dung cần thiết cho Thầy/Cô.",
            None,
        )

    prompt_lower = user_message.lower()
    for rule in MOCK_FALLBACK_RULES:
        if any(kw in prompt_lower for kw in rule["keywords"]):
            tool_calls = [MockToolCall(rule["tool_name"], rule["tool_args"])]
            return rule["response_text"], tool_calls

    # Phản hồi mặc định nếu không khớp từ khóa nào
    default_text = "Em đã nhận được tin nhắn của Thầy/Cô. Rất tiếc hiện tại kết nối LLM gặp sự cố nên em tạm thời phản hồi tự động."
    return default_text, None


async def run_chatbot_agent_loop(
    session_id: int,
    user_message: str,
    course_id: int,
    user_id: int,
    db: Session,
    max_rounds: int = 4,
    on_event=None,
    user_message_id: int | None = None,
) -> dict:
    """
    Khởi chạy vòng lặp Agent cho Chatbot thông qua LangGraph.
    Hỗ trợ gọi tool đa vòng, tracking token và lưu trữ CSDL.
    """
    from src.agents.graph import agent

    # 1. Khởi tạo trace Langfuse
    trace = None
    if langfuse:
        try:
            trace = langfuse.trace(
                name="pedagogical_chatbot_agent",
                session_id=str(session_id),
                input=user_message,
                metadata={"course_id": course_id, "user_id": user_id},
            )
        except Exception as e:
            print(f"[LANGFUSE] Error initializing chatbot trace: {e}")

    # 2. Chuẩn bị lịch sử hội thoại từ CSDL làm context cửa sổ trượt
    course = db.query(Course).filter(Course.id == course_id).first()
    from src.agents.graph import SYSTEM_PROMPT
    system_prompt = SYSTEM_PROMPT
    if course:
        system_prompt += f"\n\nTHÔNG TIN MÔN HỌC HIỆN TẠI ĐANG ĐƯỢC CHỌN:\n- Tên môn học: {course.course_name}\n- Mã môn học: {course.course_code}\n- ID môn học: {course.id}"

    # Giới hạn lấy tối đa 10 tin nhắn gần nhất
    recent_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(10)
        .all()
    )
    recent_messages.reverse()

    messages = [{"role": "system", "content": system_prompt}]
    for msg in recent_messages:
        if msg.role in ["user", "assistant"]:
            messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": user_message})

    # 3. Chạy qua LangGraph
    initial_state = {
        "messages": messages,
        "session_id": session_id,
        "course_id": course_id,
        "user_id": user_id,
        "user_message": user_message,
        "current_round": 1,
        "max_rounds": max_rounds,
        "tool_calls": [],
        "tool_results": [],
        "final_text": "",
        "status": "answered",
        "error": "",
        "trace_id": trace.id if trace else None,
        "db": db,
        "on_event": on_event,
        "user_message_id": user_message_id,
        "rounds": [],
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "latency_ms": 0.0,
    }

    final_state = await agent.ainvoke(initial_state)

    status = final_state.get("status", "answered")
    final_text = final_state.get("final_text", "")
    rounds = final_state.get("rounds", [])
    total_prompt_tokens = final_state.get("prompt_tokens", 0)
    total_completion_tokens = final_state.get("completion_tokens", 0)
    total_latency_ms = final_state.get("latency_ms", 0.0)

    # 4. Lưu toàn bộ cuộc hội thoại và token tiêu thụ vào SQLite
    db_user = None
    if user_message_id:
        db_user = db.query(ChatMessage).filter(ChatMessage.id == user_message_id).first()

    if db_user:
        db_user.prompt_tokens = total_prompt_tokens
        db_user.total_tokens = total_prompt_tokens
        db_user.trace_id = trace.id if trace else None
    else:
        db_user = ChatMessage(
            session_id=session_id,
            role="user",
            content=user_message,
            prompt_tokens=total_prompt_tokens,
            completion_tokens=0,
            total_tokens=total_prompt_tokens,
            latency_ms=0.0,
            trace_id=trace.id if trace else None,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    db_ai = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=final_text,
        parent_id=db_user.id,
        tool_calls=json.dumps([r.get("tool_calls") for r in rounds if r.get("tool_calls")]),
        tool_results=json.dumps([r.get("tool_results") for r in rounds if r.get("tool_results")]),
        prompt_tokens=0,
        completion_tokens=total_completion_tokens,
        total_tokens=total_completion_tokens,
        latency_ms=total_latency_ms,
        trace_id=trace.id if trace else None,
    )
    db.add(db_ai)
    db.commit()
    db.refresh(db_ai)

    # Cập nhật active_leaf_id cho session trò chuyện
    from src.database.models import ChatSession

    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.active_leaf_id = db_ai.id
        db.commit()

    if trace:
        try:
            trace.update(output=final_text)
            langfuse.flush()
        except Exception:
            pass

    return {
        "status": status,
        "assistant_text": final_text,
        "rounds": rounds,
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "total_tokens": total_prompt_tokens + total_completion_tokens,
        "latency_ms": total_latency_ms,
        "trace_id": trace.id if trace else None,
    }
