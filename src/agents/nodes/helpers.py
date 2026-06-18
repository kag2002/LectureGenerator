import logging
import os

from openai import AsyncOpenAI

from src.utils.llm_client import FREE_MODELS

logger = logging.getLogger(__name__)

TOOL_FRIENDLY_NAMES = {
    "search_course_knowledge": "Tìm kiếm tài liệu học trình",
    "get_course_clos": "Xem danh sách chuẩn đầu ra (CLOs)",
    "get_course_chapters": "Xem danh sách chương học",
    "get_matrix_coverage": "Lấy ma trận bao phủ CLO x Bloom",
    "clarify": "Hỏi thêm thông tin",
    "generate_course_outline_action": "Thiết kế cấu trúc đề cương môn học",
    "generate_chapter_storyboard_action": "Lên khung slide nháp (Storyboard)",
    "generate_chapter_materials_action": "Soạn bài giảng chi tiết",
    "generate_chapter_questions_action": "Thiết kế câu hỏi trắc nghiệm",
    "get_course_info": "Xem thông tin môn học (Giáo trình/Tài liệu tham khảo)",
    "get_chapter_materials": "Xem slide bài giảng và kịch bản hoạt động của chương",
    "get_chapter_questions": "Xem danh sách câu hỏi trắc nghiệm của chương",
    "get_uploaded_documents": "Xem danh sách tài liệu RAG đã nạp",
    "get_system_rules": "Xem danh sách quy tắc phản tư môn học",
}

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
