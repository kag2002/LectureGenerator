import os
import time
import json
from typing import Any
from openai import AsyncOpenAI
from langgraph.graph import END, StateGraph

from src.agents.state import AgentState
from src.database.models import ChatMessage, Course
from src.services.chatbot_guardrails import validate_input, validate_output
from src.services.chatbot_tools import execute_chatbot_tool
from src.utils.llm_client import calculate_cost, langfuse, FREE_MODELS

# --- CONFIGURATION & TOOLS FOR CHATBOT ---

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
- TRÍCH DẪN NGUỒN (CITATIONS):
  * Khi sử dụng thông tin thu được từ công cụ `search_course_knowledge` (RAG) để trả lời, bạn BẮT BUỘC phải trích dẫn nguồn ở cuối câu hoặc cuối đoạn tương ứng bằng cú pháp: `[Nguồn: tên_file - Trang: số_trang]`.
  * Tuyệt đối không tự bịa ra thông tin nguồn hoặc trích dẫn nếu không có trong kết quả trả về của công cụ `search_course_knowledge`.
- Nếu người dùng hỏi các câu hỏi chung chung hoặc ngoài phạm vi giáo dục, hãy từ chối lịch sự và định hướng quay lại chủ đề bài giảng.
- Trả lời một cách chuyên nghiệp, mang tính học thuật cao.
"""

def get_candidate_models() -> list[dict]:
    candidate_models = []
    local_url = os.environ.get("LOCAL_LLM_URL")
    if local_url:
        local_key = os.environ.get("LOCAL_LLM_API_KEY", "AIVIAL-SECURE-KEY-2026")
        local_model = os.environ.get("LOCAL_LLM_MODEL", "Qwen2.5-14B-Instruct-Q4_K_M.gguf")
        candidate_models.append({"client": AsyncOpenAI(base_url=local_url, api_key=local_key), "model": local_model})

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

    if os.environ.get("OPENAI_API_KEY"):
        candidate_models.append(
            {"client": AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY")), "model": "gpt-4o-mini"}
        )

    if os.environ.get("OPENROUTER_API_KEY"):
        openrouter_client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1", api_key=os.environ.get("OPENROUTER_API_KEY")
        )
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

    default_text = "Em đã nhận được tin nhắn của Thầy/Cô. Rất tiếc hiện tại kết nối LLM gặp sự cố nên em tạm thời phản hồi tự động."
    return default_text, None


# --- LANGGRAPH NODE FUNCTIONS ---

async def guardrail_input_node(state: AgentState) -> dict[str, Any]:
    on_event = state.get("on_event")
    if on_event:
        await on_event(
            "stage", {"stage": 1, "message": "🛡️ Bước 1: Đang xác thực độ an toàn của yêu cầu..."}
        )

    input_violations = validate_input(state["user_message"])
    if input_violations:
        block_msg = f"Xin lỗi Thầy/Cô, yêu cầu nằm ngoài phạm vi học thuật/sư phạm hoặc vi phạm chính sách của nhà trường: {input_violations[0]}"
        if on_event:
            await on_event("stage", {"stage": 5, "message": "⚠️ Cảnh báo: Câu hỏi không phù hợp với quy chuẩn an toàn của hệ thống."})
        return {
            "status": "blocked",
            "final_text": block_msg,
        }
    return {}


async def llm_router_node(state: AgentState) -> dict[str, Any]:
    # Kiểm duyệt thành công hoặc đang ở vòng tiếp theo
    if state.get("status") == "blocked":
        return {}

    db = state["db"]
    on_event = state.get("on_event")
    r_idx = state.get("current_round", 1)
    
    # Chuẩn bị model list
    candidate_models = get_candidate_models()
    working_messages = state["messages"]

    round_start = time.time()
    response_text = ""
    tool_calls = None
    p_tokens = 0
    c_tokens = 0
    called_successfully = False

    # Trace telemetry
    trace_id = state.get("trace_id")
    trace = None
    if trace_id and langfuse:
        try:
            trace = langfuse.trace(id=trace_id)
        except Exception:
            pass

    for candidate in candidate_models:
        model_name = candidate["model"]
        client = candidate["client"]
        headers = candidate.get("extra_headers", {})

        generation = None
        if trace:
            try:
                generation = trace.generation(
                    name=f"round-{r_idx}-generation-{model_name.replace('/', '-')}",
                    model=model_name,
                    input=working_messages,
                )
            except Exception:
                pass

        try:
            is_local = "qwen" in model_name.lower() or "gguf" in model_name.lower()
            current_timeout = 600.0 if is_local else 20.0
            response = await client.chat.completions.create(
                model=model_name,
                messages=working_messages,
                tools=CHATBOT_TOOLS,
                tool_choice="auto",
                temperature=0.2,
                timeout=current_timeout,
                extra_headers=headers if headers else None,
            )
            response_msg = response.choices[0].message
            response_text = response_msg.content or ""
            tool_calls = response_msg.tool_calls

            p_tokens = response.usage.prompt_tokens if response.usage else len(str(working_messages)) // 4
            c_tokens = response.usage.completion_tokens if response.usage else len(response_text) // 4
            called_successfully = True

            if generation:
                try:
                    costs = calculate_cost(model_name, p_tokens, c_tokens)
                    generation.end(
                        output={
                            "text": response_text,
                            "tool_calls": [
                                {"name": tc.function.name, "args": tc.function.arguments} for tc in tool_calls
                            ]
                            if tool_calls
                            else [],
                        },
                        usage={
                            "input_tokens": p_tokens,
                            "output_tokens": c_tokens,
                            "total_tokens": p_tokens + c_tokens,
                            "input_cost": costs["input_cost"],
                            "output_cost": costs["output_cost"],
                            "total_cost": costs["total_cost"],
                        },
                    )
                except Exception:
                    pass
            break
        except Exception as e:
            print(f"[CHATBOT AGENT ROTATION] Model {model_name} failed: {e}")
            if generation:
                try:
                    generation.end(output={"error": str(e)})
                except Exception:
                    pass
            continue

    if not called_successfully:
        print("[CHATBOT AGENT WARNING] All candidate models failed. Fallback to mock template.")
        response_text, tool_calls = get_mock_fallback_response(state["user_message"], working_messages)
        p_tokens = len(str(working_messages)) // 4
        c_tokens = len(response_text) // 4

    round_latency = (time.time() - round_start) * 1000

    # Gom tool calls thô
    formatted_tool_calls = []
    if tool_calls:
        for tc in tool_calls:
            tc_name = tc.function.name
            try:
                tc_args = json.loads(tc.function.arguments)
            except Exception:
                tc_args = {}
            formatted_tool_calls.append({"name": tc_name, "args": tc_args})

    # Cập nhật round logs
    round_record = {
        "round": r_idx,
        "assistant_text": response_text,
        "tool_calls": formatted_tool_calls,
        "tool_results": [],
        "latency_ms": round_latency,
        "p_tokens": p_tokens,
        "c_tokens": c_tokens,
    }

    # Tích lũy telemetry
    new_rounds = list(state.get("rounds", [])) + [round_record]
    new_prompt_tokens = state.get("prompt_tokens", 0) + p_tokens
    new_completion_tokens = state.get("completion_tokens", 0) + c_tokens
    new_latency_ms = state.get("latency_ms", 0.0) + round_latency

    if not tool_calls:
        # Trả lời trực tiếp
        return {
            "status": "answered",
            "final_text": response_text,
            "tool_calls": [],
            "tool_results": [],
            "current_round": r_idx,
            "error": "",
            "rounds": new_rounds,
            "prompt_tokens": new_prompt_tokens,
            "completion_tokens": new_completion_tokens,
            "latency_ms": new_latency_ms,
        }
    
    return {
        "status": "calling_tools",
        "tool_calls": formatted_tool_calls,
        "current_round": r_idx,
        "error": "",
        "rounds": new_rounds,
        "prompt_tokens": new_prompt_tokens,
        "completion_tokens": new_completion_tokens,
        "latency_ms": new_latency_ms,
    }


async def execute_tools_node(state: AgentState) -> dict[str, Any]:
    db = state["db"]
    on_event = state.get("on_event")
    tool_calls = state.get("tool_calls", [])
    course_id = state["course_id"]
    user_id = state["user_id"]
    user_message_id = state.get("user_message_id")
    r_idx = state.get("current_round", 1)

    trace_id = state.get("trace_id")
    trace = None
    if trace_id and langfuse:
        try:
            trace = langfuse.trace(id=trace_id)
        except Exception:
            pass

    if on_event:
        tc_names = [item["name"] for item in tool_calls]
        await on_event("stage", {"stage": 2, "message": f"🛠️ Đang truy xuất thông tin từ hệ thống: {', '.join(tc_names)}"})
        await on_event("tool_call", {"round": r_idx, "tool_calls": tool_calls})

    tool_results = []
    assistant_msg_content = "Đang thực hiện truy vấn cơ sở dữ liệu để tìm câu trả lời chính xác nhất..."
    status = "calling_tools"
    final_text = ""

    for tc in tool_calls:
        tc_name = tc["name"]
        tc_args = tc["args"]

        tool_span = None
        if trace:
            try:
                tool_span = trace.span(name=f"tool-{tc_name}", input=tc_args)
            except Exception:
                pass

        try:
            tool_res = await execute_chatbot_tool(
                tc_name, tc_args, course_id, user_id, db, chat_message_id=user_message_id
            )
        except Exception as tool_err:
            print(f"[CHATBOT AGENT TOOL ERROR] Failed to execute tool {tc_name}: {tool_err}")
            tool_res = {
                "error": "failed",
                "message": f"Lỗi hệ thống khi thực thi công cụ {tc_name}: {str(tool_err)}",
            }

        if tool_span:
            try:
                tool_span.end(output=tool_res)
            except Exception:
                pass

        tool_results.append({"tool": tc_name, "args": tc_args, "result": tool_res})

        if tc_name == "clarify":
            status = "waiting_for_user"
            final_text = tc_args.get("question", "Thầy/Cô vui lòng làm rõ ý định soạn bài tập.")
            break

    if on_event:
        await on_event("stage", {"stage": 3, "message": "🔍 Nhận kết quả truy vấn và tiếp tục phân tích..."})
        await on_event("tool_result", {"round": r_idx, "tool_results": tool_results})

    # Lấy rounds hiện tại và cập nhật round_record cuối cùng với kết quả của công cụ
    current_rounds = list(state.get("rounds", []))
    if current_rounds:
        current_rounds[-1]["tool_results"] = tool_results

    # Cập nhật lịch sử làm việc cho vòng sau
    new_messages = []
    if status != "waiting_for_user":
        new_messages.append({"role": "assistant", "content": assistant_msg_content})
        tool_results_content = "KẾT QUẢ THỰC THI CÔNG CỤ:\n" + json.dumps(tool_results, ensure_ascii=False)
        new_messages.append({"role": "user", "content": tool_results_content})

    return {
        "status": status,
        "final_text": final_text,
        "tool_results": tool_results,
        "messages": new_messages,
        "rounds": current_rounds,
    }


async def guardrail_output_node(state: AgentState) -> dict[str, Any]:
    final_text = state.get("final_text", "")
    status = state.get("status", "answered")

    if status == "blocked" or status == "waiting_for_user":
        return {}

    output_violations = validate_output(final_text)
    if output_violations:
        block_msg = f"Rất tiếc, câu trả lời của trợ lý ảo không đáp ứng tiêu chuẩn chất lượng đầu ra: {output_violations[0]}. Phản hồi đã được rút lại để đảm bảo tính chính xác."
        return {
            "status": "blocked",
            "final_text": block_msg,
        }
    return {}


# --- ROUTING CONDITION ---

def chatbot_routing_condition(state: AgentState) -> str:
    status = state.get("status")
    
    if status in ["blocked", "waiting_for_user"]:
        return "end"
    
    if status == "calling_tools":
        return "execute_tools"
    
    if status == "answered":
        return "guardrail_output"

    # Hạn chế loop vô hạn
    r_idx = state.get("current_round", 1)
    max_rounds = state.get("max_rounds", 4)
    if r_idx >= max_rounds:
        return "guardrail_output"

    return "llm_router"


# --- BUILD STATE GRAPH ---

def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Đăng ký nodes
    graph.add_node("guardrail_input", guardrail_input_node)
    graph.add_node("llm_router", llm_router_node)
    graph.add_node("execute_tools", execute_tools_node)
    graph.add_node("guardrail_output", guardrail_output_node)

    # Đặt entry point
    graph.set_entry_point("guardrail_input")

    # Đặt các edges chuyển đổi trạng thái
    graph.add_edge("guardrail_input", "llm_router")
    
    # Rẽ nhánh có điều kiện từ llm_router
    graph.add_conditional_edges(
        "llm_router",
        chatbot_routing_condition,
        {
            "execute_tools": "execute_tools",
            "guardrail_output": "guardrail_output",
            "end": END
        }
    )

    # Edge chuyển tiếp từ execute_tools quay lại llm_router
    graph.add_conditional_edges(
        "execute_tools",
        lambda state: "end" if state.get("status") == "waiting_for_user" else "llm_router",
        {
            "end": END,
            "llm_router": "llm_router"
        }
    )

    graph.add_edge("guardrail_output", END)

    return graph.compile()


agent = build_graph()
