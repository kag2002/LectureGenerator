"""
Unit tests for AI Generation pipelines.
Covers Outline, Search Query Suggestions, Single Chapter, Lecture Materials,
Question Generation, and Isomorphic Question Generation.
Mocks service layer and LLM output to return deterministic responses immediately.
Tests error handling and fallback mechanisms when the LLM raises exceptions or returns invalid JSON.
"""

from unittest.mock import patch

import pytest

# ═══════════════════════════════════════════════════════════════════════════
# AI OUTLINE GENERATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_outline_success(client, auth_headers, test_course, test_clo):
    """Happy path: AI outline generation succeeds and saves chapters to DB."""
    mock_chapters = {
        "chapters": [
            {"title": "Chapter 1: Foundations", "description": "Core concepts of BST"},
            {"title": "Chapter 2: Balancing BST", "description": "AVL and Red-Black Trees"}
        ]
    }
    with patch("src.api.outline.call_llm_json", return_value=mock_chapters):
        with patch("src.api.outline.langfuse", None):
            resp = await client.post(
                f"/api/courses/{test_course.id}/generate-outline",
                headers=auth_headers
            )
    assert resp.status_code == 200
    data = resp.json()
    assert "chapters" in data
    assert len(data["chapters"]) == 2
    assert data["chapters"][0]["title"] == "Chapter 1: Foundations"
    assert data["chapters"][1]["title"] == "Chapter 2: Balancing BST"


@pytest.mark.asyncio
async def test_generate_outline_invalid_json_error(client, auth_headers, test_course, test_clo):
    """Error path: LLM returns invalid JSON or raises exception during outline generation."""
    with patch("src.api.outline.call_llm_json", side_effect=ValueError("Invalid JSON returned")):
        with patch("src.api.outline.langfuse", None):
            resp = await client.post(
                f"/api/courses/{test_course.id}/generate-outline",
                headers=auth_headers
            )
    assert resp.status_code == 500
    assert "Lỗi khi AI sinh dàn ý" in resp.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════
# AI SUGGEST SEARCH QUERIES TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_suggest_search_queries_success(client, auth_headers, test_chapter):
    """Happy path: AI returns a list of suggested search queries for a chapter."""
    mock_suggestions = {
        "suggestions": [
            "binary search tree basics",
            "bst operations examples",
            "avl tree rotation",
            "red black tree insertion",
            "bst traversal algorithms"
        ]
    }
    with patch("src.api.outline.call_llm_json", return_value=mock_suggestions):
        resp = await client.get(
            f"/api/courses/chapters/{test_chapter.id}/suggest-queries",
            headers=auth_headers
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) == 5
    assert data["suggestions"][0] == "binary search tree basics"


@pytest.mark.asyncio
async def test_suggest_search_queries_fallback_on_error(client, auth_headers, test_chapter):
    """Fallback path: LLM raises exception, and endpoint returns manual fallback queries."""
    with patch("src.api.outline.call_llm_json", side_effect=Exception("Timeout / Invalid JSON")):
        resp = await client.get(
            f"/api/courses/chapters/{test_chapter.id}/suggest-queries",
            headers=auth_headers
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) == 5
    assert "Wikipedia" in data["suggestions"][-1] or "lecture notes" in data["suggestions"][0]


# ═══════════════════════════════════════════════════════════════════════════
# AI SINGLE CHAPTER GENERATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_single_chapter_success(client, auth_headers, test_course):
    """Happy path: AI generates a single chapter description successfully."""
    mock_desc = {"description": "Custom generated chapter description connecting topics."}
    with patch("src.api.outline.call_llm_json", return_value=mock_desc):
        resp = await client.post(
            f"/api/courses/{test_course.id}/chapters/generate-single",
            json={
                "title": "Chapter 2: Balancing BST",
                "sort_order": 2,
                "context_desc": "Instructor ideas about AVL trees"
            },
            headers=auth_headers
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Chapter 2: Balancing BST"
    assert data["description"] == "Custom generated chapter description connecting topics."
    assert data["sort_order"] == 2


@pytest.mark.asyncio
async def test_generate_single_chapter_fallback_on_error(client, auth_headers, test_course):
    """Fallback path: LLM fails, endpoint falls back to instructor context or default desc."""
    with patch("src.api.outline.call_llm_json", side_effect=Exception("LLM Fail")):
        resp = await client.post(
            f"/api/courses/{test_course.id}/chapters/generate-single",
            json={
                "title": "Chapter 2: Balancing BST",
                "sort_order": 2,
                "context_desc": "Instructor fallback text"
            },
            headers=auth_headers
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Chapter 2: Balancing BST"
    assert data["description"] == "Instructor fallback text"


# ═══════════════════════════════════════════════════════════════════════════
# AI LECTURE MATERIALS TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_materials_success(client, auth_headers, test_chapter):
    """Happy path: Multi-agent material generation finishes successfully."""
    class MockOrchestrator:
        def __init__(self, **kwargs):
            self.state = {
                "generated_slides": ["# Slide 1\n* Mock BST slide"],
                "active_learning_script": "## Active learning scenario description",
                "warnings": ["Warning text"]
            }

        def run_storyboard_architect(self, **kwargs): pass
        def run_content_allocator(self, **kwargs): pass
        def run_slide_writer(self, **kwargs): pass
        def run_active_learning_planner(self, **kwargs): pass
        def run_logic_auditor(self, **kwargs): pass

    with patch("src.api.materials.MaterialOrchestrator", MockOrchestrator):
        with patch("src.api.materials.search_rag_isolated", return_value=[]):
            with patch("src.api.materials.deduplicate_rag_hits", return_value=[]):
                with patch("src.api.materials.langfuse", None):
                    with patch("src.api.materials.process_markdown_images", side_effect=lambda x: x):
                        resp = await client.post(
                            f"/api/courses/chapters/{test_chapter.id}/generate-materials",
                            json={
                                "language": "vi",
                                "session_duration": 90,
                                "class_size": 40,
                                "has_wifi": True,
                                "furniture_type": "movable",
                                "pedagogical_style": "active",
                                "learner_level": "beginner",
                                "selected_clos": []
                            },
                            headers=auth_headers
                        )
    assert resp.status_code == 200
    data = resp.json()
    assert "slide_content" in data
    assert "active_learning_script" in data
    assert "Warning text" in data["warnings"]


@pytest.mark.asyncio
async def test_generate_materials_error(client, auth_headers, test_chapter):
    """Error path: Orchestrator fails during execution, rollback DB and return 500."""
    class MockOrchestratorError:
        def __init__(self, **kwargs):
            self.state = {}

        def run_storyboard_architect(self, **kwargs):
            raise ValueError("Failed to architecturalize storyboard")

    with patch("src.api.materials.MaterialOrchestrator", MockOrchestratorError):
        with patch("src.api.materials.search_rag_isolated", return_value=[]):
            with patch("src.api.materials.deduplicate_rag_hits", return_value=[]):
                with patch("src.api.materials.langfuse", None):
                    resp = await client.post(
                        f"/api/courses/chapters/{test_chapter.id}/generate-materials",
                        json={
                            "language": "vi",
                            "session_duration": 90,
                            "class_size": 40,
                            "has_wifi": True,
                            "furniture_type": "movable"
                        },
                        headers=auth_headers
                    )
    assert resp.status_code == 500
    assert "Lỗi khi AI sinh bài giảng" in resp.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════
# AI QUESTION GENERATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_questions_success(client, auth_headers, test_course, test_chapter, test_clo):
    """Happy path: Generate MCQ questions with solver/self-correction step succeeding."""
    mock_gen_result = {
        "questions": [
            {
                "question_text": "What is the worst-case time complexity of BST search?",
                "options_json": ["O(log n)", "O(n)", "O(1)", "O(n log n)"],
                "correct_answer": "O(n)",
                "bloom_level": 3,
                "reasoning_path": "Unbalanced BST behaves like a linked list."
            }
        ]
    }
    mock_solver_result = {
        "selected_answer": "O(n)",
        "reasoning_path": "Agreed. Worst-case is O(n)."
    }

    with patch("src.api.questions.call_llm_json", side_effect=[mock_gen_result, mock_solver_result]):
        with patch("src.api.questions.search_rag_isolated", return_value=[]):
            with patch("src.api.questions.langfuse", None):
                with patch("src.api.questions.init_token_tracker"):
                    with patch("src.api.questions.get_token_usage", return_value={}):
                        resp = await client.post(
                            f"/api/courses/{test_course.id}/questions/generate",
                            json={
                                "bloom_level": 3,
                                "count": 1,
                                "clo_id": test_clo.id,
                                "chapter_id": test_chapter.id,
                                "fast_mode": False
                            },
                            headers=auth_headers
                        )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["questions"]) == 1
    assert data["questions"][0]["question_text"] == "What is the worst-case time complexity of BST search?"


@pytest.mark.asyncio
async def test_generate_questions_error(client, auth_headers, test_course, test_chapter, test_clo):
    """Error path: LLM returns invalid JSON or crashes in first phase."""
    with patch("src.api.questions.call_llm_json", side_effect=ValueError("LLM raw JSON syntax error")):
        with patch("src.api.questions.search_rag_isolated", return_value=[]):
            with patch("src.api.questions.langfuse", None):
                with patch("src.api.questions.init_token_tracker"):
                    resp = await client.post(
                        f"/api/courses/{test_course.id}/questions/generate",
                        json={
                            "bloom_level": 3,
                            "count": 1,
                            "clo_id": test_clo.id,
                            "chapter_id": test_chapter.id,
                            "fast_mode": False
                        },
                        headers=auth_headers
                    )
    assert resp.status_code == 500
    assert "Lỗi khi sinh câu hỏi nháp" in resp.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════
# AI ISOMORPHIC QUESTION TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_generate_isomorphic_question_success(client, auth_headers, test_question):
    """Happy path: Successfully generate a similar isomorphic question."""
    mock_isomorphic = {
        "question_text": "What is the height of a balanced binary tree with n nodes?",
        "options_json": ["O(n)", "O(log n)", "O(1)", "O(n log n)"],
        "correct_answer": "O(log n)"
    }
    with patch("src.api.questions.call_llm_json", return_value=mock_isomorphic):
        with patch("src.api.questions.langfuse", None):
            with patch("src.api.questions.init_token_tracker"):
                with patch("src.api.questions.get_token_usage", return_value={}):
                    resp = await client.post(
                        f"/api/courses/questions/{test_question.id}/generate-isomorphic",
                        headers=auth_headers
                    )
    assert resp.status_code == 200
    data = resp.json()
    assert "question" in data
    assert data["question"]["question_text"] == "What is the height of a balanced binary tree with n nodes?"
    assert data["question"]["correct_answer"] == "O(log n)"


@pytest.mark.asyncio
async def test_generate_isomorphic_question_error(client, auth_headers, test_question):
    """Error path: LLM crashes or returns invalid JSON on isomorphic request."""
    with patch("src.api.questions.call_llm_json", side_effect=Exception("API limit hit")):
        with patch("src.api.questions.langfuse", None):
            with patch("src.api.questions.init_token_tracker"):
                resp = await client.post(
                    f"/api/courses/questions/{test_question.id}/generate-isomorphic",
                    headers=auth_headers
                )
    assert resp.status_code == 500
    assert "Lỗi khi sinh câu hỏi đồng cấu" in resp.json()["detail"]
