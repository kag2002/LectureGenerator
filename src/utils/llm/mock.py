"""
Mock data fallback module for LLM client.
Provides mock responses when all API providers fail (non-crashing strategy).
Extracted from llm_client.py to reduce file size and improve maintainability.
"""

import json
import time


def get_mock_json_response(prompt, system_instruction: str = None) -> dict:
    """Trả về mock JSON response dựa trên nội dung prompt.

    Sử dụng khi tất cả LLM providers đều thất bại (Local, Gemini, OpenAI, OpenRouter).
    """
    prompt_lower = (json.dumps(prompt) if isinstance(prompt, list) else str(prompt)).lower()
    system_lower = (system_instruction or "").lower()
    combined = prompt_lower + " " + system_lower

    # CASE 0: Sinh Storyboard Outline (Slides)
    if "storyboard" in combined or "storyboard_architect" in combined:
        return {
            "slides": [
                {
                    "slide_index": 1,
                    "title": "Tổng quan cấu trúc Cây Tìm Kiếm Nhị Phân (BST)",
                    "purpose": "Hook & Introduction: Thu hút người học bằng cách so sánh tìm kiếm tuần tự và tìm kiếm nhị phân.",
                    "target_clo": "CLO1",
                    "bloom_level": 2,
                    "suggested_layout": "visual_highlight",
                },
                {
                    "slide_index": 2,
                    "title": "Định nghĩa & Tính chất của Cây BST",
                    "purpose": "Core Concept Definition: Định nghĩa nút gốc, cây con trái, cây con phải và quy tắc sắp xếp.",
                    "target_clo": "CLO1",
                    "bloom_level": 2,
                    "suggested_layout": "standard_list",
                },
                {
                    "slide_index": 3,
                    "title": "Thao tác Tìm kiếm trên Cây BST",
                    "purpose": "Deep Dive / Analysis: Phân tích đệ quy và độ phức tạp O(log n) trong trường hợp trung bình.",
                    "target_clo": "CLO3",
                    "bloom_level": 3,
                    "suggested_layout": "two_column_comparison",
                },
                {
                    "slide_index": 4,
                    "title": "Ứng dụng thực tế và Cây suy biến",
                    "purpose": "Application / Real-world Example: Phân tích trường hợp xấu nhất O(n) khi dữ liệu vào sắp xếp tăng dần.",
                    "target_clo": "CLO3",
                    "bloom_level": 4,
                    "suggested_layout": "card_grid",
                },
                {
                    "slide_index": 5,
                    "title": "Tổng kết & Giới thiệu Cây tự cân bằng AVL",
                    "purpose": "Summary / Transition: Khái quát bài học và gợi mở sự cần thiết của cấu trúc AVL tự cân bằng.",
                    "target_clo": "N/A",
                    "bloom_level": 2,
                    "suggested_layout": "visual_highlight",
                },
            ]
        }

    # CASE 1: Sinh Outline Chương học
    if "outline" in combined or "chapters" in combined:
        return {
            "chapters": [
                {
                    "title": "Chuong 1: Tong quan ve Cay BST",
                    "description": "Gioi thieu cau truc cay, dinh nghia va tinh chat cua cay nhi phan tim kiem.",
                },
                {
                    "title": "Chuong 2: Cac thuat toan tren Cay BST",
                    "description": "Cai dat cac thuat toan chen, xoa, tim kiem va duyet cay BST theo thu tu.",
                },
                {
                    "title": "Chuong 3: Cay tu can bang AVL",
                    "description": "Nguyen ly cay tu can bang AVL, cac phep quay cay va so sanh hieu nang.",
                },
                {
                    "title": "Chuong 4: Ung dung cua Cay BST trong thuc te",
                    "description": "Cac bai toan thuc te su dung cay BST va phan tich do phuc tap.",
                },
            ]
        }

    # CASE 2: Sinh Slide & Active Learning
    if "slide" in combined or "materials" in combined:
        return {
            "slide_content": "# Chuong 1: Tong quan ve Cay BST\n* Cay nhi phan tim kiem la cau truc cay co nhanh trai luon nho hon va nhanh phai luon lon hon nut goc.\n* Thoi gian tim kiem trung binh la O(log n).\n[Nguồn: test_dsa.pdf - Trang: 1]\n\n# Slide 2: Hieu nang cua BST\n* Truong hop xau nhat, cay co the suy bien thanh danh sach lien ket voi do phuc tap O(n).\n[Nguồn: test_dsa.pdf - Trang: 2]",
            "active_learning_script": "### Hoat dong: Think-Pair-Share (5 phut)\n- **Buoc 1:** Giang vien dua ra mot day so va bat hoc vien ve cay BST cua ho (2 phut).\n- **Buoc 2:** Trao doi cheo voi ban ben canh de so sanh ket qua (2 phut).\n- **Buoc 3:** Goi 1 cap len bang ve cay BST dung nhat (1 phut).",
        }

    # CASE 3: Sinh Câu hỏi trắc nghiệm (MCQ) với Self-Correction
    if "selected_answer" in combined or "solver" in combined:
        selected = "O(log n)"
        if (
            "tang dan" in prompt_lower
            or "suy bien" in prompt_lower
            or "worst" in prompt_lower
            or "xau nhat" in prompt_lower
        ):
            selected = "O(n)"
        return {
            "reasoning_path": "Solver Mock Reasoning: Cay BST can bang co thoi gian O(log n), lech thi O(n).",
            "selected_answer": selected,
        }

    if "question" in combined or "quiz" in combined or "options_json" in combined or "correct_answer" in combined:
        if "isomorphic" in combined or "dong cau" in combined or "tuong tu" in combined:
            return {
                "question_text": "Do phuc tap thoi gian tim kiem trong truong hop xau nhat tren cay BST co n phan tu la gi? (Isomorphic Mock)",
                "options_json": json.dumps(["O(n)", "O(log n)", "O(n log n)", "O(1)"]),
                "correct_answer": "O(n)",
            }
        else:
            return {
                "questions": [
                    {
                        "question_text": "Do phuc tap thoi gian tim kiem trong truong hop trung binh tren cay BST co n phan tu la gi?",
                        "question_type": "MCQ",
                        "options_json": json.dumps(["O(n)", "O(log n)", "O(n log n)", "O(1)"]),
                        "correct_answer": "O(log n)",
                        "bloom_level": 2,
                        "reasoning_path": "Tren cay BST ly tuong va can bang, moi phep so sanh se loai bo mot nua so luong nut con lai. Do do chieu cao cua cay la log2(n). Thoi gian tim kiem trung binh bieu dien qua O(log n).",
                    },
                    {
                        "question_text": "Khi chen mot day so da sap xep tang dan vao mot cay BST rong, cay thu duoc se co hieu nang tim kiem o muc nao?",
                        "question_type": "MCQ",
                        "options_json": json.dumps(["O(log n)", "O(n)", "O(1)", "O(n log n)"]),
                        "correct_answer": "O(n)",
                        "bloom_level": 3,
                        "reasoning_path": "Neu chen mot day so da sap xep tang dan, moi phan tu moi luon luon duoc chen vao ben phai cung cua nut hien tai. BST se suy biến thanh mot danh sach lien ket lech phai. Vi the thao tac tim kiem mat thoi gian tuyen tinh O(n).",
                    },
                ]
            }

    # CASE 4: Danh gia nguon Web Search Credibility
    if "credibility" in combined or "score" in combined:
        return {
            "score": 0.85,
            "justification": "Nguon tu ten mien .edu uy tin cua Harvard University va bai viet co trich dan khoa hoc ro rang.",
        }

    # CASE 5: Tom tat tai lieu hoc thuat
    if "summary" in combined or "summarize" in combined or "tóm tắt" in combined:
        return {
            "summary": "Tài liệu học thuật thảo luận về nguyên lý hoạt động, cấu trúc và thời gian tính toán của giải thuật tự cân bằng đang tìm kiếm. Cung cấp các chứng minh độ phức tạp O(log n) trong trường hợp trung bình và cách xoay cây để bảo toàn chiều cao tối ưu."
        }

    # DEFAULT: Mock Syllabus
    return {
        "course_code": "COMP2010",
        "course_name": "Cau truc du lieu va Giai thuat (VinUni Mock)",
        "clos": [
            {
                "clo_code": "CLO1",
                "description": "Giai thich duoc nguyen ly hoat dong va tinh chat sap xep cua cay tim kiem nhi phan (BST).",
                "bloom_level": 2,
            },
            {
                "clo_code": "CLO2",
                "description": "Van dung va cai dat duoc cac giai thuat them, xoa va duyet cay nhi phan bang ngon ngu lap trinh Python.",
                "bloom_level": 3,
            },
            {
                "clo_code": "CLO3",
                "description": "Phan tich va so sanh duoc hieu nang thoi gian (Time Complexity) cua cay BST thong thuong so voi cay tu can bang (AVL) trong truong hop xau nhat.",
                "bloom_level": 4,
            },
        ],
    }


def get_mock_stream_content() -> str:
    """Trả về nội dung mock cho streaming fallback."""
    mock_slide = "# Chương 1: Tổng quan về Cây BST\n* Cây nhị phân tìm kiếm là cấu trúc cây có nhánh trái luôn nhỏ hơn và nhánh phải luôn lớn hơn nút gốc.\n* Thời gian tìm kiếm trung bình là O(log n).\n[Nguồn: slide_dsa.pdf - Trang: 1]\n\n# Slide 2: Hiệu năng của BST\n* Trường hợp xấu nhất, cây có thể suy biến thành danh sách kết với độ phức tạp O(n).\n[Nguồn: slide_dsa.pdf - Trang: 2]"
    mock_act = "### Hoạt động: Think-Pair-Share (5 phút)\n- **Bước 1:** Giảng viên đưa ra một dãy số và bắt học viên vẽ cây BST của họ (2 phút).\n- **Bước 2:** Trao đổi chéo với bạn bên cạnh để so sánh kết quả (2 phút).\n- **Bước 3:** Gọi 1 cặp lên bảng vẽ cây BST đúng nhất (1 phút)."
    return f"---SLIDES---\n{mock_slide}\n---ACTIVE_LEARNING---\n{mock_act}"


def stream_mock_chunks(content: str = None, chunk_size: int = 20, delay: float = 0.05):
    """Generator that yields mock content in chunks with simulated delay.

    Used as a sync streaming fallback.
    """
    if content is None:
        content = get_mock_stream_content()
    for i in range(0, len(content), chunk_size):
        yield content[i : i + chunk_size]
        time.sleep(delay)
