import json
import os
import time
from typing import Any

from langgraph.graph import END, StateGraph
from openai import AsyncOpenAI

from src.agents.state import AgentState
from src.services.chatbot_guardrails import validate_input, validate_output
from src.services.chatbot_tools import execute_chatbot_tool
from src.utils.llm_client import FREE_MODELS, calculate_cost, langfuse

# --- CONFIGURATION & TOOLS FOR CHATBOT ---

# User-friendly Vietnamese names for each tool, shown in stage events
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
            "description": "Lên khung slide nháp (storyboard outline) cho một chương học cụ thể (gồm tiêu đề slide, mục đích, CLO liên kết, Bloom level). Nếu người dùng không chỉ rõ chương, hãy dùng get_course_chapters trước rồi hỏi người dùng chọn theo TÊN chương, KHÔNG hỏi ID số.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học (lấy từ kết quả get_course_chapters). Nếu không truyền, hệ thống sẽ tự chọn chương đầu tiên.",
                    },
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
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_materials_action",
            "description": "Sinh chi tiết nội dung slide bài giảng (Markdown) và kịch bản active learning cho một chương học, sau đó lưu trực tiếp vào CSDL. Nếu người dùng không chỉ rõ chương, hãy dùng get_course_chapters trước rồi hỏi người dùng chọn theo TÊN chương, KHÔNG hỏi ID số.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học (lấy từ kết quả get_course_chapters). Nếu không truyền, hệ thống sẽ tự chọn chương đầu tiên.",
                    },
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
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học (lấy từ kết quả get_course_chapters). Nếu không truyền, hệ thống sẽ tự chọn chương đầu tiên.",
                    },
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
    {
        "type": "function",
        "function": {
            "name": "get_course_info",
            "description": "Xem thông tin chung của môn học bao gồm giáo trình bắt buộc (required_textbooks) và tài liệu đọc thêm (recommended_readings).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chapter_materials",
            "description": "Xem nội dung slide bài giảng chi tiết (Markdown) và kịch bản active learning của một chương học đã được soạn thảo trong hệ thống.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học cần xem học liệu. Nếu không truyền, hệ thống tự động lấy chương đầu tiên.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chapter_questions",
            "description": "Xem danh sách các câu hỏi trắc nghiệm MCQ chi tiết (nội dung câu hỏi, các lựa chọn, đáp án đúng, CLO, Bloom) đã sinh cho một chương học cụ thể hoặc toàn khóa học.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học cần xem câu hỏi. Nếu không truyền, hệ thống sẽ lấy tất cả câu hỏi của môn học.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_uploaded_documents",
            "description": "Xem danh sách các tài liệu RAG nguồn (giáo án, slide PDF, tài liệu tham khảo) đã được giảng viên tải lên cho môn học này.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_rules",
            "description": "Xem danh sách các quy tắc phản tư sư phạm tự học (System Rules) đã được giảng viên phê duyệt để áp dụng cho môn học này.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

SYSTEM_PROMPT = """Bạn là trợ lý AI thiết kế bài giảng toàn năng (Full-cycle AI Lecture Assistant & Orchestrator), được phát triển bởi VinUni.
Nhiệm vụ của bạn là đồng hành và hỗ trợ toàn diện giảng viên trong suốt chu kỳ thiết kế bài giảng, từ khâu phân tích đề cương chi tiết (syllabus), bóc tách CLOs, nạp và tìm kiếm dữ liệu học liệu (RAG), tự động sinh đề cương chương học, lên khung slide nháp (storyboard), soạn thảo nội dung slide chi tiết và kịch bản học tập chủ động (active learning), thiết kế ngân hàng câu hỏi trắc nghiệm MCQ tự sửa lỗi, cho đến khâu hướng dẫn xuất bản/tải xuống giáo án PPTX.

HƯỚNG DẪN HOẠT ĐỘNG:
- Bạn có quyền truy cập vào các công cụ:
  * Công cụ tác vụ: `search_course_knowledge`, `get_course_clos`, `get_matrix_coverage`, `clarify`, `get_course_chapters`, `generate_course_outline_action`, `generate_chapter_storyboard_action`, `generate_chapter_materials_action`, và `generate_chapter_questions_action`.
  * Công cụ đọc dữ liệu thật từ CSDL: `get_course_info`, `get_chapter_materials`, `get_chapter_questions`, `get_uploaded_documents`, `get_system_rules`.
- Bạn BẮT BUỘC phải sử dụng các công cụ đọc dữ liệu thật từ CSDL để kiểm tra nội dung hiện có trước khi trả lời, tránh đề xuất các nội dung bịa đặt hoặc hardcode:
  * Khi giảng viên hỏi về thông tin môn học, giáo trình, bài đọc tham khảo: Hãy gọi `get_course_info` hoặc `get_uploaded_documents`.
  * Khi giảng viên hỏi về slide bài giảng hoặc kịch bản active learning đã được soạn: Hãy gọi `get_chapter_materials`.
  * Khi giảng viên hỏi về các câu hỏi trắc nghiệm hiện có của chương hoặc môn học: Hãy gọi `get_chapter_questions`.
  * Khi giảng viên hỏi về các quy chuẩn, quy tắc tự sinh/reflection của môn học: Hãy gọi `get_system_rules`.
- Hãy gọi các công cụ tương ứng khi giảng viên yêu cầu tự động tạo đề cương, storyboard, soạn slide bài giảng hoặc câu hỏi ôn tập:
  * Khi giảng viên yêu cầu tạo đề cương, dàn ý hoặc chương học cho toàn môn học: Hãy gọi `generate_course_outline_action`.
  * Khi giảng viên yêu cầu tạo storyboard hay khung slide nháp cho một chương học cụ thể: Hãy gọi `generate_chapter_storyboard_action`.
  * Khi giảng viên yêu cầu soạn slide, bài giảng, học liệu chi tiết hay thiết kế active learning cho một chương: Hãy gọi `generate_chapter_materials_action`.
  * Khi giảng viên yêu cầu tạo câu hỏi, bài tập trắc nghiệm hay MCQ: Hãy gọi `generate_chapter_questions_action`.
- Nếu câu hỏi của giảng viên thiếu ngữ cảnh hoặc chưa rõ ràng (ví dụ: "soạn cho tôi câu hỏi", "soạn bài kiểm tra", "thiết kế đề thi" mà không rõ cho chương nào, hoặc "soạn bài giảng" mà không rõ chương nào), bạn BẮT BUỘC phải sử dụng công cụ `clarify` để hỏi rõ. KHÔNG tự ý suy diễn từ lịch sử hội thoại hoặc trả lời trực tiếp bằng văn bản thông thường.

- HƯỚNG DẪN LUỒNG HOẠT ĐỘNG & CÁC MÀN HÌNH GIAO DIỆN THỰC TẾ CỦA HỆ THỐNG:
  * Màn hình Dashboard (Bảng điều khiển chính): Chứa danh sách các môn học. Thầy/Cô chọn môn học ở đây để bắt đầu.
  * Màn hình Sơ đồ môn học (Course Roadmap): Xuất hiện sau khi chọn môn học. Hiển thị danh sách các tuần/chương học, tình trạng phủ CLO và các nút liên kết nhanh sang các công cụ khác.
  * Màn hình Bóc tách Syllabus (Cấu hình môn học / Course Config): Nơi nạp/tải lên file Syllabus (PDF/DOCX/TXT) hoặc dán văn bản thô để AI tự động trích xuất danh sách Chuẩn đầu ra (CLOs) và giáo trình môn học. Giảng viên cũng có thể thêm/sửa/xóa CLOs thủ công tại đây.
  * Màn hình Soạn bài giảng (Lesson Planner): Chọn chương học cụ thể, thiết lập "Bối cảnh sư phạm" (Sĩ số, Wifi, loại Bàn ghế), lên "Storyboard" nháp (khung slide) và "Bắt đầu soạn bài (AI Planner)" để sinh chi tiết slide kèm hoạt động active learning.
  * Màn hình Ngân hàng câu hỏi (Question Bank): Quản lý danh sách câu hỏi trắc nghiệm (MCQ). Giảng viên chọn chương học, CLO, Bloom Level và số lượng để AI tự động sinh câu hỏi bằng công cụ tự sửa lỗi (Self-Correction) của Solver.
  * Màn hình Ma trận bao phủ (Matrix Dashboard): Bản đồ nhiệt (Heatmap) trực quan hóa độ bao phủ của slide bài giảng và câu hỏi thi đối với ma trận CLO x Bloom. Giảng viên có thể chạy "Hàng đợi tự động khắc phục điểm mù" để sinh bù đắp slide/câu hỏi cho các ô còn thiếu.
  * Màn hình Kho tư liệu học liệu (Knowledge Base): Nơi tải lên tài liệu học liệu bổ sung riêng để AI tra cứu qua RAG.
  * Màn hình Giám sát AI (AI Monitor): Theo dõi số lượng request, độ trễ trung bình, chi phí (cost) và tokens đã tiêu thụ.

- QUY TẮC PHẢN HỒI KHI GIẢNG VIÊN HỎI VỀ LUỒNG HỆ THỐNG / HƯỚNG DẪN SỬ DỤNG:
  * Khi giảng viên hỏi cách trích xuất nội dung từ đề cương môn học (Syllabus) hoặc khai báo CLOs: Hướng dẫn họ dán trực tiếp nội dung văn bản đề cương vào khung chat, hoặc kéo thả trực tiếp tệp Syllabus (.pdf, .docx, .txt) vào bất cứ đâu trong khung chat (hoặc bấm biểu tượng kẹp giấy đính kèm file) để hệ thống tự động phân tích và trích xuất CLOs tại chỗ. Ngoài ra, họ cũng có thể làm điều này ở màn hình "Bóc tách Syllabus (Cấu hình môn học / Course Config)".
  * Khi giảng viên hỏi cách soạn bài giảng hoặc thiết kế active learning: Hướng dẫn họ chọn chương học ở trang "Sơ đồ môn học", nhấn "Soạn bài giảng" để đi tới trang "Lesson Planner", điền bối cảnh sư phạm, lập Storyboard và nhấn "Bắt đầu soạn bài".
  * Khi giảng viên hỏi cách soạn câu hỏi/đề thi MCQ: Hướng dẫn họ đi tới "Ngân hàng câu hỏi (Question Bank)", chọn chương học, CLO mục tiêu, Bloom level và số lượng câu hỏi rồi nhấn "Tạo câu hỏi (AI)".
  * Khi giảng viên hỏi cách xem ma trận bao phủ hoặc bù đắp điểm mù chất lượng: Hướng dẫn họ vào trang "Ma trận bao phủ (Matrix Dashboard)" để xem Heatmap. Để sinh bù đắp tự động, chọn "Hàng đợi Điểm Mù" và nhấn "Bắt đầu" để hệ thống tự động sinh bù đắp hàng loạt câu hỏi/slide cho những phần bị thiếu hụt.

- KHUYẾN KHÍCH CHỦ ĐỘNG GỢI Ý WORKFLOW & TƯƠNG TÁC TÍNH NĂNG:
  * Hãy chủ động định hướng giảng viên đi theo từng bước chuẩn hóa sư phạm: (1) Nạp Syllabus để lấy CLOs -> (2) Sinh đề cương/chương học -> (3) Thiết lập bối cảnh sư phạm lớp học & Lên storyboard nháp -> (4) Soạn chi tiết slide & active learning -> (5) Thiết kế MCQ tương ứng -> (6) Xuất bản PowerPoint/In giáo án.
  * Hỗ trợ và giải thích/hướng dẫn giảng viên tương tác với các nút bấm/tính năng trong từng tab (như "Bắt đầu sinh học liệu", "In giáo án", "Tải slide PPTX", "Tạo đề kiểm tra", "Xem ma trận CLO x Bloom"...) dựa trên nhu cầu hiện tại.

- GIỚI HẠN PHẠM VI MÔN HỌC & PHÒNG NGỪA GHI ĐÈ NHẦM DỮ LIỆU:
  * Bạn CHỈ có thể thao tác và thực thi công cụ trên môn học hiện tại đang được chọn (không có khả năng tạo môn học mới hoặc xóa môn học hiện tại trong CSDL).
  * Nếu người dùng yêu cầu tạo môn học mới hoặc xóa môn học, bạn phải giải thích rõ rằng bạn KHÔNG thể thực hiện việc này qua khung chat, và hướng dẫn họ thao tác thủ công ngoài màn hình Dashboard.
  * TUYỆT ĐỐI KHÔNG đề xuất tạo cấu trúc chương học hay CLOs cho một môn học mới/khác môn hiện tại trong khung chat. Nếu người dùng muốn tạo cấu trúc cho môn học mới, họ phải tạo môn học đó trên Dashboard và vào đúng trang môn học đó trước. Việc tự ý gọi tool tạo đề cương ở môn học này khi đang thảo luận về môn học khác sẽ làm GHI ĐÈ và MẤT dữ liệu của môn học hiện tại.
- TRÍCH DẪN NGUỒN (CITATIONS):
  * Khi sử dụng thông tin thu được từ công cụ `search_course_knowledge` (RAG) để trả lời, bạn BẮT BUỘC phải trích dẫn nguồn ở cuối câu hoặc cuối đoạn tương ứng bằng cú pháp: `[Nguồn: tên_file - Trang: số_trang]`.
  * Tuyệt đối không tự bịa ra thông tin nguồn hoặc trích dẫn nếu không có trong kết quả trả về của công cụ `search_course_knowledge`.
- Nếu người dùng hỏi các câu hỏi chung chung hoặc ngoài phạm vi giáo dục, hãy từ chối lịch sự và định hướng quay lại chủ đề bài giảng.
- Trả lời một cách chuyên nghiệp, mang tính học thuật cao.
- TUYỆT ĐỐI KHÔNG đề cập đến tên các công cụ/hàm kỹ thuật (như `generate_chapter_materials_action`, `generate_chapter_storyboard_action`, v.v.) trong câu trả lời trực tiếp cho người dùng. Hãy sử dụng các cụm từ tiếng Việt tự nhiên và thân thiện (như "sinh bài giảng/học liệu", "lên khung slide nháp", "thiết kế câu hỏi").
- TUYỆT ĐỐI KHÔNG hỏi người dùng về ID số (chapter_id, clo_id, v.v.). Người dùng KHÔNG biết ID. Thay vào đó, hãy gọi `get_course_chapters` hoặc `get_course_clos` trước để lấy danh sách, rồi hiển thị TÊN CHƯƠNG hoặc MÃ CLO bằng tiếng Việt tự nhiên để người dùng chọn. Sau khi người dùng chọn theo tên, bạn tự tra cứu ID tương ứng từ kết quả trước đó.
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
        await on_event("stage", {"stage": 1, "message": "🛡️ Bước 1: Đang xác thực độ an toàn của yêu cầu..."})

    input_violations = validate_input(state["user_message"])
    if input_violations:
        block_msg = f"Xin lỗi Thầy/Cô, yêu cầu nằm ngoài phạm vi học thuật/sư phạm hoặc vi phạm chính sách của nhà trường: {input_violations[0]}"
        if on_event:
            await on_event(
                "stage",
                {"stage": 5, "message": "⚠️ Cảnh báo: Câu hỏi không phù hợp với quy chuẩn an toàn của hệ thống."},
            )
        return {
            "status": "blocked",
            "final_text": block_msg,
        }
    return {}


async def llm_router_node(state: AgentState) -> dict[str, Any]:
    # Kiểm duyệt thành công hoặc đang ở vòng tiếp theo
    if state.get("status") == "blocked":
        return {}

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
        tc_friendly = [TOOL_FRIENDLY_NAMES.get(n, n) for n in tc_names]
        await on_event(
            "stage", {"stage": 2, "message": f"🛠️ Đang truy xuất thông tin từ hệ thống: {', '.join(tc_friendly)}"}
        )
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


async def summarize_history_node(state: AgentState) -> dict[str, Any]:
    messages = state.get("messages", [])
    if not messages:
        return {}

    # Ước lượng số lượng tokens: 1 từ ~ 1.3 tokens hoặc len(str(messages)) // 4
    estimated_tokens = len(str(messages)) // 4

    # Chỉ tóm tắt hội thoại khi tổng tokens vượt quá 8.000
    if estimated_tokens <= 8000:
        return {}

    system_messages = [m for m in messages if m["role"] == "system"]
    non_system_messages = [m for m in messages if m["role"] != "system"]

    if len(non_system_messages) <= 2:
        return {}

    to_summarize = non_system_messages[:-2]
    to_keep = non_system_messages[-2:]

    # Lấy ứng cử viên model
    candidate_models = get_candidate_models()
    if not candidate_models:
        return {}

    model_info = candidate_models[0]
    client = model_info["client"]
    model_name = model_info["model"]
    headers = model_info.get("extra_headers", {})

    summary_prompt = [
        {
            "role": "system",
            "content": "Bạn là trợ lý ảo lưu trữ bộ nhớ sư phạm. Hãy tóm tắt ngắn gọn các tin nhắn hội thoại cũ sau đây thành các ý chính quan trọng (ngôn ngữ giảng dạy, chương học đang làm việc, các chuẩn đầu ra cần tập trung, thói quen thiết kế). Tóm tắt phải cực kỳ ngắn gọn, súc tích và dưới 250 từ.",
        },
        {"role": "user", "content": json.dumps(to_summarize, ensure_ascii=False)},
    ]

    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=summary_prompt,
            temperature=0.0,
            extra_headers=headers if headers else None,
        )
        summary_text = response.choices[0].message.content or ""

        # Dựng lại lịch sử hội thoại mới:
        new_messages = []
        if system_messages:
            new_messages.extend(system_messages)

        new_messages.append({"role": "system", "content": f"[TÓM TẮT LỊCH SỬ HỘI THOẠI TRƯỚC ĐÓ]:\n{summary_text}"})
        new_messages.extend(to_keep)

        return {"messages": new_messages, "summary_history": summary_text}
    except Exception as e:
        print(f"[SUMMARIZE HISTORY NODE ERROR] Failed to summarize: {e}")
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
    graph.add_node("summarize_history", summarize_history_node)
    graph.add_node("llm_router", llm_router_node)
    graph.add_node("execute_tools", execute_tools_node)
    graph.add_node("guardrail_output", guardrail_output_node)

    # Đặt entry point
    graph.set_entry_point("guardrail_input")

    # Đặt các edges chuyển đổi trạng thái
    graph.add_edge("guardrail_input", "summarize_history")
    graph.add_edge("summarize_history", "llm_router")

    # Rẽ nhánh có điều kiện từ llm_router
    graph.add_conditional_edges(
        "llm_router",
        chatbot_routing_condition,
        {"execute_tools": "execute_tools", "guardrail_output": "guardrail_output", "end": END},
    )

    # Edge chuyển tiếp từ execute_tools quay lại summarize_history để kiểm tra tóm tắt
    graph.add_conditional_edges(
        "execute_tools",
        lambda state: "end" if state.get("status") == "waiting_for_user" else "summarize_history",
        {"end": END, "summarize_history": "summarize_history"},
    )

    graph.add_edge("guardrail_output", END)

    return graph.compile()


agent = build_graph()
