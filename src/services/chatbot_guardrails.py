import json
import os
import re

GUARDRAILS_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/guardrails.json"))

# Tải cấu hình mặc định nếu không tồn tại file hoặc có lỗi
default_config = {
    "academic_boundary_keywords": [
        "hack game",
        "crack phần mềm",
        "dự báo thời tiết ngày mai",
        "xem tử vi",
        "bói toán",
        "kết quả bóng đá",
        "mua đồ ăn",
        "đặt grab",
        "tìm người yêu",
    ],
    "cheating_keywords": [
        "giải hộ bài tập để nộp",
        "làm bài thi giúp",
        "thi hộ",
        "gian lận thi",
        "giải bài kiểm tra lấy điểm",
        "làm hộ bài tập về nhà",
        "giải bài thi hộ",
        "giải hộ",
        "giải giúp",
        "làm hộ",
        "thi hộ",
        "làm bài thi",
        "giải bài thi",
        "giải bài kiểm tra",
    ],
    "grade_promises": [
        "chắc chắn được điểm a+",
        "chắc chắn được điểm a",
        "cam kết 100% học viên đỗ",
        "bao đỗ",
        "bao đậu",
        "đảm bảo đỗ",
        "đảm bảo đậu",
        "chắc chắn đỗ",
        "chắc chắn đậu",
        "đảm bảo điểm a+",
        "cam kết điểm cao",
    ],
    "unprofessional_terms": ["đm", "vcl", "vl", "chó chết", "ngu ngốc"],
}

config = default_config
if os.path.exists(GUARDRAILS_FILE):
    try:
        with open(GUARDRAILS_FILE, encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        print(f"[WARNING] Failed to load guardrails config from JSON: {e}")

ACADEMIC_BOUNDARY_KEYWORDS = config.get("academic_boundary_keywords", default_config["academic_boundary_keywords"])
CHEATING_KEYWORDS = config.get("cheating_keywords", default_config["cheating_keywords"])
GRADE_PROMISES = config.get("grade_promises", default_config["grade_promises"])
UNPROFESSIONAL_TERMS = config.get("unprofessional_terms", default_config["unprofessional_terms"])


def validate_input(text: str) -> list[str]:
    """
    Kiểm duyệt đầu vào của giảng viên/người dùng.
    Trả về danh sách các vi phạm nếu có.
    """
    violations = []
    text_lower = text.lower()

    # 1. Kiểm tra hành vi gian lận (chống học sinh dùng chatbot làm bài hộ)
    # Định nghĩa các mẫu regex cho các ngữ cảnh gian lận rõ ràng
    cheating_patterns = [
        # giải/làm hộ/giúp ... để nộp / lấy điểm / nộp bài / lấy điểm số / học bạ
        re.compile(r"(giải|làm)\s+(hộ|giúp)\s+.*?(để\s+nộp|lấy\s+điểm|nộp\s+bài|điểm\s+số|học\s+bạ)", re.IGNORECASE),
        # làm hộ bài tập về nhà / giải hộ bài tập về nhà
        re.compile(r"(làm|giải)\s+hộ\s+bài\s+tập\s+về\s+nhà", re.IGNORECASE),
        # thi hộ, thi giúp, gian lận
        re.compile(r"thi\s+hộ|thi\s+giúp|gian\s+lận\s+thi", re.IGNORECASE),
        # giải bài thi hộ / làm bài thi hộ / giải bài kiểm tra hộ
        re.compile(r"(giải|làm)\s+bài\s+(thi|kiểm\s+tra)\s+hộ", re.IGNORECASE),
        # giải bài kiểm tra lấy điểm / giải bài thi lấy điểm
        re.compile(r"giải\s+bài\s+(thi|kiểm\s+tra)\s+.*?lấy\s+điểm", re.IGNORECASE),
    ]

    is_cheating = False
    matched_pattern = ""
    for pattern in cheating_patterns:
        match = pattern.search(text)
        if match:
            is_cheating = True
            matched_pattern = match.group(0)
            break

    # Giữ lại một số từ khóa đặc biệt nghiêm trọng (như thi hộ, gian lận) làm substring
    strict_cheating_keywords = ["thi hộ", "gian lận thi", "mua điểm", "chạy điểm"]
    if not is_cheating:
        for kw in strict_cheating_keywords:
            if kw in text_lower:
                is_cheating = True
                matched_pattern = kw
                break

    if is_cheating:
        violations.append(f"Yêu cầu trợ giúp gian lận học thuật: '{matched_pattern}'")

    # 2. Kiểm tra các chủ đề hoàn toàn nằm ngoài phạm vi thiết kế khóa học
    for kw in ACADEMIC_BOUNDARY_KEYWORDS:
        if kw in text_lower:
            violations.append(f"Yêu cầu ngoài phạm vi học thuật/sư phạm: '{kw}'")
            break

    return violations


def validate_output(text: str) -> list[str]:
    """
    Kiểm duyệt đầu ra của mô hình LLM.
    Trả về danh sách vi phạm chính sách an toàn.
    """
    violations = []
    text_lower = text.lower()

    # 1. Tránh cam kết điểm số hoặc đỗ môn phi lý
    for promise in GRADE_PROMISES:
        if promise in text_lower:
            violations.append(f"Cam kết điểm số/kết quả học tập phi lý: '{promise}'")
            break

    # 2. Kiểm tra từ ngữ thô tục/không chuẩn mực (nếu có)
    for term in UNPROFESSIONAL_TERMS:
        if term in text_lower:
            violations.append(f"Ngôn từ thiếu chuyên nghiệp: '{term}'")
            break

    return violations
