"""
Tests for /api/courses/{id}/questions endpoints.
Covers CRUD, AI generation (mocked), isomorphic generation, and matrix coverage.
"""


from unittest.mock import patch

import pytest

# ═══════════════════════════════════════════════════════════════════════════
# QUESTION CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_questions_empty(client, auth_headers, test_course):
    resp = await client.get(
        f"/api/courses/{test_course.id}/questions", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_question(client, auth_headers, test_course, test_chapter, test_clo):
    resp = await client.post(
        f"/api/courses/{test_course.id}/questions",
        json={
            "chapter_id": test_chapter.id,
            "question_text": "What is O(1)?",
            "options_json": '["Constant", "Linear", "Quadratic", "Logarithmic"]',
            "correct_answer": "Constant",
            "bloom_level": 1,
            "clo_id": test_clo.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["question_text"] == "What is O(1)?"
    assert data["bloom_level"] == 1


@pytest.mark.asyncio
async def test_create_question_invalid_chapter(client, auth_headers, test_course):
    """Question with non-existent chapter_id returns 400."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/questions",
        json={
            "chapter_id": 99999,
            "question_text": "Bad chapter?",
            "options_json": "[]",
            "correct_answer": "X",
            "bloom_level": 1,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_question_invalid_clo(client, auth_headers, test_course):
    """Question with non-existent clo_id returns 400."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/questions",
        json={
            "question_text": "Bad CLO?",
            "options_json": "[]",
            "correct_answer": "X",
            "bloom_level": 1,
            "clo_id": 99999,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_question_detail(client, auth_headers, test_question):
    resp = await client.get(
        f"/api/courses/questions/{test_question.id}", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == test_question.id


@pytest.mark.asyncio
async def test_get_question_not_found(client, auth_headers):
    resp = await client.get("/api/courses/questions/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_question(client, auth_headers, test_question):
    resp = await client.put(
        f"/api/courses/questions/{test_question.id}",
        json={
            "question_text": "Updated question?",
            "options_json": '["A", "B", "C", "D"]',
            "correct_answer": "A",
            "bloom_level": 4,
            "clo_id": test_question.clo_id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["question_text"] == "Updated question?"


@pytest.mark.asyncio
async def test_update_question_not_found(client, auth_headers):
    resp = await client.put(
        "/api/courses/questions/99999",
        json={
            "question_text": "X",
            "options_json": "[]",
            "correct_answer": "Y",
            "bloom_level": 1,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_question(client, auth_headers, test_question):
    resp = await client.delete(
        f"/api/courses/questions/{test_question.id}", headers=auth_headers
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_question_not_found(client, auth_headers):
    resp = await client.delete("/api/courses/questions/99999", headers=auth_headers)
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# AI QUESTION GENERATION (mocked LLM + RAG)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_generate_questions_success(
    client, auth_headers, test_course, test_chapter, test_clo
):
    """AI MCQ generation with mocked LLM returns generated questions."""
    mock_gen_result = {
        "questions": [
            {
                "question_text": "What is a binary tree?",
                "options_json": ["A data structure", "An algorithm", "A protocol", "A language"],
                "correct_answer": "A data structure",
                "bloom_level": 1,
                "reasoning_path": "Definition-based recall.",
            }
        ]
    }
    mock_solver_result = {
        "selected_answer": "A data structure",
        "reasoning_path": "This is correct by definition.",
    }

    with patch("src.api.questions.call_llm_json", side_effect=[mock_gen_result, mock_solver_result]):
        with patch("src.api.questions.search_rag_isolated", return_value=[]):
            with patch("src.api.questions.langfuse", None):
                with patch("src.api.questions.init_token_tracker"):
                    with patch("src.api.questions.get_token_usage", return_value={}):
                        resp = await client.post(
                            f"/api/courses/{test_course.id}/questions/generate",
                            json={
                                "bloom_level": 1,
                                "count": 1,
                                "clo_id": test_clo.id,
                                "chapter_id": test_chapter.id,
                                "fast_mode": False,
                            },
                            headers=auth_headers,
                        )
    assert resp.status_code == 200
    data = resp.json()
    assert "questions" in data
    assert len(data["questions"]) >= 1


@pytest.mark.asyncio
async def test_generate_questions_fast_mode(
    client, auth_headers, test_course, test_chapter, test_clo
):
    """Fast mode skips solver/verifier phase."""
    mock_gen_result = {
        "questions": [
            {
                "question_text": "Fast mode question",
                "options_json": ["A", "B", "C", "D"],
                "correct_answer": "A",
                "bloom_level": 2,
            }
        ]
    }

    with patch("src.api.questions.call_llm_json", return_value=mock_gen_result):
        with patch("src.api.questions.search_rag_isolated", return_value=[]):
            with patch("src.api.questions.langfuse", None):
                with patch("src.api.questions.init_token_tracker"):
                    with patch("src.api.questions.get_token_usage", return_value={}):
                        resp = await client.post(
                            f"/api/courses/{test_course.id}/questions/generate",
                            json={
                                "bloom_level": 2,
                                "count": 1,
                                "fast_mode": True,
                            },
                            headers=auth_headers,
                        )
    assert resp.status_code == 200
    assert len(resp.json()["questions"]) == 1


@pytest.mark.asyncio
async def test_generate_questions_course_not_found(client, auth_headers):
    resp = await client.post(
        "/api/courses/99999/questions/generate",
        json={"bloom_level": 1, "count": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# MATRIX COVERAGE
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_matrix_coverage(client, auth_headers, test_course, test_clo, test_question):
    """Coverage matrix returns CLO-Bloom data."""
    resp = await client.get(
        f"/api/courses/{test_course.id}/matrix-coverage", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "matrix" in data
    assert "CLO1" in data["matrix"]


@pytest.mark.asyncio
async def test_matrix_coverage_course_not_found(client, auth_headers):
    resp = await client.get("/api/courses/99999/matrix-coverage", headers=auth_headers)
    assert resp.status_code == 404
