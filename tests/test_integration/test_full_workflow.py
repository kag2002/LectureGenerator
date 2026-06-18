"""
End-to-end integration test: full user workflow from registration to question generation.

Flow: Register → Login → Create Course → Add CLOs → Generate Outline → Save Material → Generate Questions

All external services (LLM, RAG, ChromaDB) are mocked.
"""


from unittest.mock import patch

import pytest


@pytest.mark.asyncio
async def test_full_workflow_register_to_questions(client):
    """
    Integration test covering the complete happy-path user journey:
    1. Register a new user
    2. Login to get JWT
    3. Create a course
    4. Create CLOs
    5. Generate AI outline (mocked)
    6. Save materials
    7. Generate questions (mocked)
    """

    # ── Step 1: Register ──────────────────────────────────────────────
    reg_resp = await client.post(
        "/api/auth/register",
        json={
            "email": "integration@vinuni.edu.vn",
            "password": "IntegrationTest1!",
            "full_name": "Dr. Integration",
        },
    )
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # ── Step 2: Login (verify token works) ────────────────────────────
    login_resp = await client.post(
        "/api/auth/login",
        json={
            "email": "integration@vinuni.edu.vn",
            "password": "IntegrationTest1!",
        },
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["access_token"]

    # ── Step 3: Create Course ─────────────────────────────────────────
    course_resp = await client.post(
        "/api/courses",
        json={
            "course_code": "INT101",
            "course_name": "Integration Testing 101",
        },
        headers=headers,
    )
    assert course_resp.status_code == 200
    course_id = course_resp.json()["id"]
    assert course_id > 0

    # Verify course appears in list
    list_resp = await client.get("/api/courses", headers=headers)
    assert len(list_resp.json()) == 1

    # ── Step 4: Create CLOs ───────────────────────────────────────────
    clo_resp = await client.post(
        f"/api/courses/{course_id}/clos",
        json={
            "clo_code": "CLO1",
            "description": "Understand integration testing fundamentals",
            "bloom_level": 2,
        },
        headers=headers,
    )
    assert clo_resp.status_code == 200
    clo_id = clo_resp.json()["id"]

    clo2_resp = await client.post(
        f"/api/courses/{course_id}/clos",
        json={
            "clo_code": "CLO2",
            "description": "Apply testing strategies to real projects",
            "bloom_level": 3,
        },
        headers=headers,
    )
    assert clo2_resp.status_code == 200

    # Verify CLOs
    clos_list = await client.get(
        f"/api/courses/{course_id}/clos", headers=headers
    )
    assert len(clos_list.json()) == 2

    # ── Step 5: Generate Outline (mocked LLM) ────────────────────────
    mock_outline = {
        "chapters": [
            {
                "title": "Chapter 1: Introduction to Testing",
                "description": "Covers basics of software testing.",
            },
            {
                "title": "Chapter 2: Advanced Strategies",
                "description": "Covers integration and E2E testing.",
            },
        ]
    }

    with patch("src.api.outline.call_llm_json", return_value=mock_outline):
        with patch("src.api.outline.langfuse", None):
            outline_resp = await client.post(
                f"/api/courses/{course_id}/generate-outline", headers=headers
            )
    assert outline_resp.status_code == 200
    chapters = outline_resp.json()["chapters"]
    assert len(chapters) == 2
    chapter_id = chapters[0]["id"]

    # Verify chapters
    ch_list = await client.get(
        f"/api/courses/{course_id}/chapters", headers=headers
    )
    assert len(ch_list.json()) == 2

    # ── Step 6: Save Materials ────────────────────────────────────────
    with patch("src.api.materials.process_markdown_images", side_effect=lambda x: x):
        mat_resp = await client.put(
            f"/api/courses/chapters/{chapter_id}/materials",
            json={
                "slide_content": "# Slide 1: Testing Basics\n* Unit tests\n* Integration tests\n[CLO: CLO1] [Bloom: B2]",
                "active_learning_script": "## Activity: Write your first unit test",
            },
            headers=headers,
        )
    assert mat_resp.status_code == 200
    assert "Testing Basics" in mat_resp.json()["slide_content"]

    # ── Step 7: Generate Questions (mocked LLM + RAG) ─────────────────
    mock_gen = {
        "questions": [
            {
                "question_text": "What is integration testing?",
                "options_json": [
                    "Testing individual units",
                    "Testing combined components",
                    "Testing UI",
                    "Testing database",
                ],
                "correct_answer": "Testing combined components",
                "bloom_level": 2,
                "reasoning_path": "By definition.",
            }
        ]
    }
    mock_solver = {
        "selected_answer": "Testing combined components",
        "reasoning_path": "Correct by definition of integration testing.",
    }

    with patch(
        "src.api.questions.call_llm_json",
        side_effect=[mock_gen, mock_solver],
    ):
        with patch("src.api.questions.search_rag_isolated", return_value=[]):
            with patch("src.api.questions.langfuse", None):
                with patch("src.api.questions.init_token_tracker"):
                    with patch("src.api.questions.get_token_usage", return_value={}):
                        q_resp = await client.post(
                            f"/api/courses/{course_id}/questions/generate",
                            json={
                                "bloom_level": 2,
                                "count": 1,
                                "clo_id": clo_id,
                                "chapter_id": chapter_id,
                                "fast_mode": False,
                            },
                            headers=headers,
                        )
    assert q_resp.status_code == 200
    questions = q_resp.json()["questions"]
    assert len(questions) == 1
    assert questions[0]["question_text"] == "What is integration testing?"

    # Verify questions are persisted
    q_list = await client.get(
        f"/api/courses/{course_id}/questions", headers=headers
    )
    assert len(q_list.json()) >= 1

    # ── Step 8: Export everything ─────────────────────────────────────
    export_mat = await client.get(
        f"/api/courses/{course_id}/export-materials", headers=headers
    )
    assert export_mat.status_code == 200

    export_q = await client.get(
        f"/api/courses/{course_id}/export-questions", headers=headers
    )
    assert export_q.status_code == 200

    # ── Step 9: Verify coverage matrix ────────────────────────────────
    matrix_resp = await client.get(
        f"/api/courses/{course_id}/matrix-coverage", headers=headers
    )
    assert matrix_resp.status_code == 200
    assert "matrix" in matrix_resp.json()


@pytest.mark.asyncio
async def test_unauthorized_user_cannot_access_others_data(client):
    """
    Verify that User B cannot access or modify User A's data.
    """
    # Register User A
    a_resp = await client.post(
        "/api/auth/register",
        json={
            "email": "user_a@vinuni.edu.vn",
            "password": "PasswordA1!",
            "full_name": "User A",
        },
    )
    token_a = a_resp.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # User A creates a course
    course_resp = await client.post(
        "/api/courses",
        json={"course_code": "A101", "course_name": "User A's Course"},
        headers=headers_a,
    )
    course_id = course_resp.json()["id"]

    # Register User B
    b_resp = await client.post(
        "/api/auth/register",
        json={
            "email": "user_b@vinuni.edu.vn",
            "password": "PasswordB1!",
            "full_name": "User B",
        },
    )
    token_b = b_resp.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B tries to access User A's course
    get_resp = await client.get(f"/api/courses/{course_id}", headers=headers_b)
    assert get_resp.status_code == 404

    # User B's course list should be empty
    list_resp = await client.get("/api/courses", headers=headers_b)
    assert list_resp.json() == []

    # User B cannot delete User A's course
    del_resp = await client.delete(f"/api/courses/{course_id}", headers=headers_b)
    assert del_resp.status_code == 404
