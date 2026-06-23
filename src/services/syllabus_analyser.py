from src.utils.llm import call_llm_json, langfuse

SYSTEM_INSTRUCTION = """Bạn là chuyên gia sư phạm đại học quốc tế chuyên về kiểm định chất lượng giáo dục (AUN-QA, ABET).
Nhiệm vụ của bạn là đọc văn bản đề cương môn học (Syllabus) và bóc tách các thông tin khóa học sau:
1. Mã môn học (course_code).
2. Tên môn học (course_name).
3. Danh sách các Chuẩn đầu ra môn học (CLO - Course Learning Outcomes):
   - Mỗi CLO gồm mã CLO (ví dụ: CLO1, CLO2), mô tả (description) và Mức độ Bloom nhận thức (bloom_level: từ 1 đến 6).
4. Giáo trình bắt buộc (required_textbooks): danh sách tên các giáo trình bắt buộc phải đọc (chỉ bao gồm tên sách, tác giả, năm xuất bản nếu có).
5. Tài liệu tham khảo thêm (recommended_readings): danh sách tên các tài liệu đọc thêm, bài báo học thuật bổ trợ.

QUY TẮC PHÂN TÍCH SƯ PHẠM QUAN TRỌNG:
- Ánh xạ mức Bloom dựa trên Động từ hành động (Action Verbs):
  + Mức 1 (Nhớ - Remember): Liệt kê, định nghĩa, nhận biết.
  + Mức 2 (Hiểu - Understand): Giải thích, mô tả, phân biệt, minh họa.
  + Mức 3 (Vận dụng - Apply): Áp dụng, tính toán, cài đặt, giải quyết.
  + Mức 4 (Phân tích - Analyze): Phân tích, so sánh, đối chiếu, gán nhãn.
  + Mức 5 (Đánh giá - Evaluate): Đánh giá, phê bình, chứng minh, tối ưu hóa.
  + Mức 6 (Sáng tạo - Create): Thiết kế, xây dựng, phát triển, lập kế hoạch.
- Sửa lỗi sư phạm của Giảng viên: Nếu đề cương dùng các từ mơ hồ như "Hiểu về...", "Biết về...", bạn phải viết lại mô tả CLO bằng các động từ Bloom đo lường được (Ví dụ: "Hiểu cấu trúc BST" -> đổi thành "Giải thích được cấu trúc của BST" - Bloom mức 2).

Đầu ra bắt buộc là đối tượng JSON có dạng:
{
  "course_code": "Mã môn học",
  "course_name": "Tên môn học",
  "clos": [
    {
      "clo_code": "CLO1",
      "description": "Mô tả chuẩn đầu ra đã chuẩn hóa bằng động từ hành động cụ thể",
      "bloom_level": 2
    }
  ],
  "required_textbooks": [
    "Tên giáo trình bắt buộc 1 - Tác giả - Năm"
  ],
  "recommended_readings": [
    "Tên tài liệu tham khảo 1 - Tác giả - Năm"
  ]
}
"""


def analyse_syllabus(syllabus_text: str) -> dict:
    """Gọi LLM phân tích đề cương thô và trả về JSON cấu trúc môn học + CLO."""
    # --- Langfuse: Parent Trace ---
    trace = None
    if langfuse:
        trace = langfuse.trace(name="syllabus_analysis", metadata={"input_length": len(syllabus_text)})
    prompt = f"Hãy bóc tách chuẩn đầu ra CLO từ văn bản Syllabus sau đây:\n\n{syllabus_text}"
    return call_llm_json(
        prompt,
        system_instruction=SYSTEM_INSTRUCTION,
        trace_or_span=trace,
        prompt_name="syllabus_analyser",
        prompt_version="v1",
        metadata={"input_length": len(syllabus_text)},
    )
