import io
import json

import pytest


@pytest.mark.asyncio
async def test_create_quiz_session(client, auth_headers, test_course):
    """Test creating a quiz session for a course."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/quiz-sessions",
        json={
            "session_name": "Test Session Ch3",
            "chapter_id": None
        },
        headers=auth_headers
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["session_name"] == "Test Session Ch3"
    assert data["status"] == "active"
    assert data["course_id"] == test_course.id


@pytest.mark.asyncio
async def test_get_quiz_sessions(client, auth_headers, test_course):
    """Test retrieving quiz sessions list."""
    # Create one session first
    await client.post(
        f"/api/courses/{test_course.id}/quiz-sessions",
        json={"session_name": "Session A", "chapter_id": None},
        headers=auth_headers
    )

    resp = await client.get(f"/api/courses/{test_course.id}/quiz-sessions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["session_name"] == "Session A"


@pytest.mark.asyncio
async def test_submit_quiz_response(client, auth_headers, test_course):
    """Test submitting response for H5P gộp stats."""
    # 1. Create session
    session_resp = await client.post(
        f"/api/courses/{test_course.id}/quiz-sessions",
        json={"session_name": "H5P Session", "chapter_id": None},
        headers=auth_headers
    )
    session_id = session_resp.json()["id"]

    # 2. Create mock question
    question_resp = await client.post(
        f"/api/courses/{test_course.id}/questions",
        json={
            "question_text": "What is the complexity of BST search in worst case?",
            "options_json": json.dumps(["O(log n)", "O(n)", "O(1)", "O(n log n)"]),
            "correct_answer": "O(n)",
            "bloom_level": 3,
            "chapter_id": None,
            "clo_id": None
        },
        headers=auth_headers
    )
    question_id = question_resp.json()["id"]

    # 3. Submit correct answer
    submit_resp = await client.post(
        f"/api/courses/quiz-sessions/{session_id}/submit",
        json={
            "question_id": question_id,
            "selected_option": "O(n)",
            "is_correct": True
        }
    )
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "success"

    # 4. Submit incorrect answer
    submit_resp2 = await client.post(
        f"/api/courses/quiz-sessions/{session_id}/submit",
        json={
            "question_id": question_id,
            "selected_option": "O(log n)",
            "is_correct": False
        }
    )
    assert submit_resp2.status_code == 200


@pytest.mark.asyncio
async def test_export_questions_to_kahoot(client, auth_headers, test_course):
    """Test exporting course questions into Kahoot template format."""
    resp = await client.get(
        f"/api/courses/{test_course.id}/questions/export-kahoot",
        headers=auth_headers
    )
    assert resp.status_code == 200
    # Should return either application/vnd.openxmlformats-officedocument.spreadsheetml.sheet or text/csv
    assert "attachment" in resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_import_kahoot_results_csv(client, auth_headers, test_course):
    """Test importing Kahoot results via CSV upload and fuzzy-matching questions."""
    # 1. Create a question
    q_text = "Which BST traversal returns values in sorted order?"
    await client.post(
        f"/api/courses/{test_course.id}/questions",
        json={
            "question_text": q_text,
            "options_json": json.dumps(["Pre-order", "In-order", "Post-order", "Level-order"]),
            "correct_answer": "In-order",
            "bloom_level": 2,
            "chapter_id": None,
            "clo_id": None
        },
        headers=auth_headers
    )

    # 2. Mock a CSV report containing this question (Fuzzy matched)
    # columns: Question text (Fuzzy), Correct count, Incorrect count
    csv_data = (
        "Question,Correct Answers,Incorrect Answers,Players\n"
        "\"Which BST traversal returns in sorted order?\",15,5,20\n"
    )

    file_payload = {"file": ("kahoot_report.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}

    import_resp = await client.post(
        f"/api/courses/{test_course.id}/quiz-sessions/import-kahoot",
        files=file_payload,
        headers=auth_headers
    )
    assert import_resp.status_code == 200
    data = import_resp.json()
    assert "Nạp thành công" in data["message"]


@pytest.mark.asyncio
async def test_get_assessment_analytics(client, auth_headers, test_course):
    """Test retrieving pedagogical CLO CAS scores and loops improvement registry."""
    # 1. Create a CLO
    clo_resp = await client.post(
        f"/api/courses/{test_course.id}/clos",
        json={
            "clo_code": "CLO-LOOP-1",
            "description": "Understand loops and scope.",
            "bloom_level": 3,
        },
        headers=auth_headers,
    )
    clo_id = clo_resp.json()["id"]

    # 2. Create question linked to CLO
    q_resp = await client.post(
        f"/api/courses/{test_course.id}/questions",
        json={
            "question_text": "Loop condition index checks.",
            "options_json": json.dumps(["A", "B", "C", "D"]),
            "correct_answer": "A",
            "bloom_level": 3,
            "chapter_id": None,
            "clo_id": clo_id
        },
        headers=auth_headers
    )
    q_id = q_resp.json()["id"]

    # 3. Create a session and aggregates
    session_resp = await client.post(
        f"/api/courses/{test_course.id}/quiz-sessions",
        json={"session_name": "Analytics session", "chapter_id": None},
        headers=auth_headers
    )
    session_id = session_resp.json()["id"]

    # Submit some answers to aggregate
    await client.post(
        f"/api/courses/quiz-sessions/{session_id}/submit",
        json={"question_id": q_id, "selected_option": "A", "is_correct": True}
    )
    await client.post(
        f"/api/courses/quiz-sessions/{session_id}/submit",
        json={"question_id": q_id, "selected_option": "B", "is_correct": False}
    )

    # 4. Fetch analytics
    resp = await client.get(
        f"/api/courses/{test_course.id}/assessment-analytics",
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "clos" in data
    assert "improvements" in data

    # Verify CLO score: 1 correct out of 2 total = 50% CAS
    target_clo = next(c for c in data["clos"] if c["clo_id"] == clo_id)
    assert target_clo["cas_score"] == 50.0
    assert target_clo["status"] == "critical" # < 60%
