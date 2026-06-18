"""
Tests for the chatbot guardrails service.
Covers input validation (cheating detection, academic boundary)
and output validation (grade promises, unprofessional terms).
"""

from src.services.chatbot_guardrails import validate_input, validate_output

# ═══════════════════════════════════════════════════════════════════════════
# INPUT GUARDRAILS
# ═══════════════════════════════════════════════════════════════════════════


class TestInputGuardrails:
    """Tests for validate_input() — input screening."""

    def test_normal_academic_question_passes(self):
        """Legitimate academic question should produce no violations."""
        violations = validate_input(
            "Giải thích cách hoạt động của thuật toán Dijkstra"
        )
        assert violations == []

    def test_cheating_regex_pattern_detected(self):
        """Regex pattern: 'giải hộ bài tập để nộp'."""
        violations = validate_input("giải hộ bài tập này để nộp cho thầy")
        assert len(violations) >= 1
        assert any("gian lận" in v for v in violations)

    def test_cheating_homework_pattern(self):
        """Regex pattern: 'làm hộ bài tập về nhà'."""
        violations = validate_input("làm hộ bài tập về nhà cho em")
        assert len(violations) >= 1

    def test_cheating_exam_pattern(self):
        """Keyword: 'thi hộ'."""
        violations = validate_input("thi hộ em bài kiểm tra giữa kỳ")
        assert len(violations) >= 1

    def test_cheating_fraud_pattern(self):
        """Keyword: 'gian lận thi'."""
        violations = validate_input("cách gian lận thi cuối kỳ")
        assert len(violations) >= 1

    def test_academic_boundary_violation(self):
        """Out-of-scope: 'xem tử vi'."""
        violations = validate_input("xem tử vi cho em hôm nay")
        assert len(violations) >= 1
        assert any("ngoài phạm vi" in v for v in violations)

    def test_academic_boundary_weather(self):
        """Out-of-scope: 'dự báo thời tiết ngày mai'."""
        violations = validate_input("dự báo thời tiết ngày mai ở Hà Nội")
        assert len(violations) >= 1

    def test_academic_boundary_food(self):
        """Out-of-scope: 'mua đồ ăn'."""
        violations = validate_input("mua đồ ăn giao hàng")
        assert len(violations) >= 1

    def test_educational_question_about_solving_passes(self):
        """Asking to 'giải bài tập' for learning (NOT to cheat) should pass."""
        violations = validate_input(
            "Giải bài tập về linked list cho em hiểu cách làm"
        )
        assert violations == []

    def test_empty_input(self):
        violations = validate_input("")
        assert violations == []


# ═══════════════════════════════════════════════════════════════════════════
# OUTPUT GUARDRAILS
# ═══════════════════════════════════════════════════════════════════════════


class TestOutputGuardrails:
    """Tests for validate_output() — output screening."""

    def test_normal_output_passes(self):
        violations = validate_output(
            "Thuật toán Dijkstra tìm đường đi ngắn nhất trong đồ thị có trọng số."
        )
        assert violations == []

    def test_grade_promise_detected(self):
        """Unrealistic grade promise: 'chắc chắn được điểm a+'."""
        violations = validate_output(
            "Nếu học theo phương pháp này, bạn chắc chắn được điểm A+ môn này."
        )
        assert len(violations) >= 1
        assert any("cam kết" in v.lower() or "điểm" in v.lower() for v in violations)

    def test_guarantee_pass_detected(self):
        """Unrealistic guarantee: 'bao đỗ'."""
        violations = validate_output("Với đề cương này, bao đỗ luôn!")
        assert len(violations) >= 1

    def test_unprofessional_term_detected(self):
        """Profanity in output."""
        violations = validate_output("Sinh viên ngu ngốc quá, không hiểu bài")
        assert len(violations) >= 1
        assert any("chuyên nghiệp" in v.lower() or "thiếu" in v.lower() for v in violations)

    def test_empty_output(self):
        violations = validate_output("")
        assert violations == []
