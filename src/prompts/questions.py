"""
System Prompts cho việc sinh và xác minh câu hỏi trắc nghiệm (MCQ Assessment).
Tách biệt khỏi logic HTTP API trong routers/questions.py để dễ dàng tinh chỉnh
và kiểm thử prompt mà không cần can thiệp vào logic backend.
"""


def build_generator_system_prompt(*, count: int, bloom_level: int) -> str:
    """
    System prompt cho Generator (pha sinh câu hỏi nháp).

    Args:
        count: Số lượng câu hỏi cần sinh
        bloom_level: Mức độ Bloom nhận thức (1-6)
    """
    return f"""Bạn là chuyên gia thiết kế câu hỏi trắc nghiệm kiểm tra đánh giá (Assessment Specialist).
Nhiệm vụ: Hãy sinh {count} câu hỏi trắc nghiệm (MCQ) có chất lượng học thuật cao.
Yêu cầu:
- Mức độ Bloom nhận thức: Mức {bloom_level}.
- Câu hỏi phải bám sát theo chuẩn đầu ra CLO và ngữ cảnh tài liệu RAG đã cho.
- Mỗi câu hỏi gồm câu hỏi (question_text), danh sách 4 lựa chọn (options_json: mảng JSON gồm 4 chuỗi), đáp án đúng (correct_answer: phải trùng khớp với chính xác một trong 4 lựa chọn), và đường dẫn tư duy giải thích (reasoning_path: giải thích chi tiết tại sao chọn đáp án này).

Đầu ra định dạng JSON:
{{
  "questions": [
    {{
      "question_text": "Nội dung câu hỏi...",
      "question_type": "MCQ",
      "options_json": "[\\"Lựa chọn A\\", \\"Lựa chọn B\\", \\"Lựa chọn C\\", \\"Lựa chọn D\\"]",
      "correct_answer": "Lựa chọn A",
      "bloom_level": {bloom_level},
      "reasoning_path": "Giải thích chi tiết các bước logic..."
    }}
  ]
}}"""


def build_generator_system_prompt_compact(*, count: int, bloom_level: int) -> str:
    """
    System prompt compact cho Generator trong streaming endpoint.
    Dùng cho generate-stream API.

    Args:
        count: Số lượng câu hỏi cần sinh
        bloom_level: Mức độ Bloom nhận thức (1-6)
    """
    return f"""Bạn là chuyên gia thiết kế câu hỏi trắc nghiệm (Assessment Specialist).
Nhiệm vụ: Sinh {count} câu hỏi MCQ chất lượng học thuật cao, mức Bloom {bloom_level}.
Mỗi câu gồm: question_text, options_json (mảng 4 chuỗi JSON), correct_answer (trùng chính xác 1 trong 4 lựa chọn), bloom_level, reasoning_path.
Trả về JSON: {{"questions": [...]}}"""


SOLVER_SYSTEM_PROMPT = """Bạn là một học sinh thông minh đang làm bài thi trắc nghiệm. Bạn tuyệt đối không biết đáp án trước.
Nhiệm vụ: Hãy giải câu hỏi trắc nghiệm sau đây một cách độc lập và khách quan nhất.
Quy tắc:
- Phân tích chi tiết từng lựa chọn dựa trên kiến thức logic và thông tin đề bài cung cấp.
- Đưa ra phân tích lập luận từng bước (reasoning_path).
- Cuối cùng, chọn ra đáp án đúng duy nhất (phải là một trong các lựa chọn được cho sẵn).

Đầu ra bắt buộc là định dạng JSON:
{
  "reasoning_path": "Phân tích logic từng bước...",
  "selected_answer": "Đáp án bạn chọn"
}"""


SOLVER_SYSTEM_PROMPT_COMPACT = """Bạn là học sinh thông minh đang làm bài thi. Không biết đáp án trước.
Phân tích từng lựa chọn, chọn đáp án, trả về JSON: {"reasoning_path": "...", "selected_answer": "..."}"""


def build_generator_user_prompt(*, course_name: str, clo_context: str, chapter_context: str, rag_context: str) -> str:
    """
    User prompt cho Generator.

    Args:
        course_name: Tên môn học
        clo_context: Chuỗi mô tả CLO mục tiêu
        chapter_context: Chuỗi mô tả chương học
        rag_context: Chuỗi ngữ cảnh RAG
    """
    return f"Thông tin môn học: {course_name}\n{clo_context}{chapter_context}\nNgữ cảnh tài liệu nguồn RAG:\n{rag_context}\n\nHãy sinh danh sách câu hỏi."


def build_generator_user_prompt_compact(
    *, course_name: str, clo_context: str, chapter_context: str, rag_context: str, count: int
) -> str:
    """
    User prompt compact cho streaming Generator.

    Args:
        course_name: Tên môn học
        clo_context: Chuỗi mô tả CLO mục tiêu
        chapter_context: Chuỗi mô tả chương học
        rag_context: Chuỗi ngữ cảnh RAG
        count: Số lượng câu hỏi cần sinh
    """
    return f"Môn: {course_name}\nCLO: {clo_context}\nChương: {chapter_context}\nRAG:\n{rag_context}\n\nSinh {count} câu hỏi."


def build_solver_prompt(*, question_text: str, options_json: str) -> str:
    """
    User prompt cho Solver (đóng vai giải câu hỏi).
    """
    return f"""Câu hỏi: {question_text}
Các lựa chọn: {options_json}

Hãy phân tích giải và đưa ra đáp án."""


def build_correction_prompt(
    *, question_text: str, options_json: str, target_answer: str, solver_answer: str, solver_reasoning: str = ""
) -> str:
    """
    Prompt cho Self-Correction (sửa câu hỏi khi Generator và Solver mâu thuẫn).
    """
    return f"""Câu hỏi bạn vừa sinh có mâu thuẫn logic:
- Đề bài: {question_text}
- Các lựa chọn: {options_json}
- Đáp án Generator chỉ định: {target_answer}
- Học sinh độc lập giải ra: {solver_answer} (Tư duy giải: {solver_reasoning})

Hãy sửa lại câu hỏi hoặc các phương án lựa chọn và chỉ định đáp án đúng chính xác nhất để không còn bất kỳ mâu thuẫn nào.
Đầu ra định dạng JSON giống như cấu trúc Generator ban đầu."""
