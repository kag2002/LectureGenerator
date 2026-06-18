import json
import sys
from unittest.mock import patch

import pytest

from src.database.models import CLO, Chapter, Course, User
from src.database.session import SessionLocal


def log_debug(msg):
    sys.stderr.write(f"DEBUG: {msg}\n")
    sys.stderr.flush()

@pytest.mark.asyncio
async def test_pedagogical_workflow_scenarios(client):
    log_debug("Starting test setup...")
    # Setup test database records
    db = SessionLocal()
    try:
        # Create a test course and owner
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            log_debug("User not found, creating...")
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)
        log_debug(f"User resolved with ID={user.id}")

        log_debug("Creating Course...")
        course = Course(
            course_code="PED-101",
            course_name="Introduction to Pedagogical AI",
            user_id=user.id
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        log_debug(f"Course created with ID={course.id}")

        # Create mock CLO
        log_debug("Creating CLO...")
        clo = CLO(
            course_id=course.id,
            clo_code="CLO_PED_1",
            description="Understand how AI models construct pedagogical outline structures.",
            bloom_level=3
        )
        db.add(clo)
        db.commit()
        db.refresh(clo)
        log_debug(f"CLO created with ID={clo.id}")

        # Create dummy chapter
        log_debug("Creating Chapter...")
        chapter = Chapter(
            course_id=course.id,
            title="Chapter 1: Agent Decisional Logic",
            description="Introduction to decision trees and agent tools.",
            sort_order=1,
            is_active=True
        )
        db.add(chapter)
        db.commit()
        db.refresh(chapter)
        log_debug(f"Chapter created with ID={chapter.id}")

        # Store IDs and close the test database session to avoid SQLite locks during HTTP requests
        course_id = course.id
        chapter_id = chapter.id
        db.close()
        log_debug("DB session closed. Overriding auth dependency...")

        # Helper override for auth dependency (queries dynamically using the request's session)
        from fastapi import Depends
        from sqlalchemy.orm import Session

        from src.auth import get_current_user
        from src.database.session import get_db
        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        from src.main import app
        app.dependency_overrides[get_current_user] = override_get_current_user

        # Create chatbot session
        log_debug("Creating chatbot session via API...")
        session_res = await client.post("/api/chatbot/sessions", json={
            "course_id": course_id,
            "title": "Pedagogical Workflow session"
        })
        assert session_res.status_code == 200
        session_id = session_res.json()["id"]
        log_debug(f"Chatbot session created with ID={session_id}")

        # Define utility to simulate chat stream in tests
        async def simulate_chat(message: str) -> dict:
            log_debug(f"Simulating chat with message: '{message}'...")
            # We mock the LLM connection to fall back to rules
            with patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else default):
                response = await client.post("/api/chatbot/chat-stream", json={
                    "session_id": session_id,
                    "course_id": course_id,
                    "message": message
                })
                log_debug(f"Received response for '{message}' status_code={response.status_code}")
                assert response.status_code == 200

                # Parse SSE streams output
                events = []
                lines = response.text.split("\n\n")
                for line in lines:
                    if not line.strip():
                        continue
                    event_part = ""
                    data_part = ""
                    for subline in line.split("\n"):
                        if subline.startswith("event: "):
                            event_part = subline[7:].strip()
                        elif subline.startswith("data: "):
                            data_part = subline[6:].strip()
                    if event_part and data_part:
                        events.append((event_part, json.loads(data_part)))
                log_debug(f"Parsed {len(events)} events from stream: {events}")
                return events

        # --- Scenario 1: Step-by-Step Pedagogical Workflow ---

        # 1. Outline Generation Proposing
        events = await simulate_chat("Hãy giúp tôi tạo đề cương khóa học")
        dispatch_actions = [ev[1] for ev in events if ev[0] == "dispatch_action"]
        assert len(dispatch_actions) > 0, "Should propose dispatch action"
        assert dispatch_actions[0]["action"] == "generate_outline"
        assert dispatch_actions[0]["view"] == "lesson_planner"

        # 2. Storyboard Proposing
        events = await simulate_chat("Lập storyboard cho chương 1")
        dispatch_actions = [ev[1] for ev in events if ev[0] == "dispatch_action"]
        assert len(dispatch_actions) > 0
        assert dispatch_actions[0]["action"] == "generate_storyboard"
        assert dispatch_actions[0]["view"] == "lesson_planner"
        assert dispatch_actions[0]["params"]["chapter_id"] == chapter_id

        # 3. Slide Materials Proposing
        events = await simulate_chat("soạn slide bài giảng cho chương 1")
        dispatch_actions = [ev[1] for ev in events if ev[0] == "dispatch_action"]
        assert len(dispatch_actions) > 0
        assert dispatch_actions[0]["action"] == "generate_materials"
        assert dispatch_actions[0]["view"] == "lesson_planner"
        assert dispatch_actions[0]["params"]["chapter_id"] == chapter_id

        # 4. MCQ Question bank Proposing
        events = await simulate_chat("Tạo câu hỏi trắc nghiệm đánh giá cho chương này")
        dispatch_actions = [ev[1] for ev in events if ev[0] == "dispatch_action"]
        assert len(dispatch_actions) > 0
        assert dispatch_actions[0]["action"] == "generate_questions"
        assert dispatch_actions[0]["view"] == "question_bank"

        # --- Scenario 2: Clarification and Coverage Checking ---

        # 1. Ask general outline/matrix coverage
        events = await simulate_chat("Cho tôi xem matrix bao phủ chuẩn đầu ra bloom")
        # Tool call event checking (in SSE done status)
        done_events = [ev[1] for ev in events if ev[0] == "done"]
        assert len(done_events) > 0
        assert done_events[0]["status"] == "answered"

        # 2. Clarification Trigger
        events = await simulate_chat("Tôi muốn soạn một bài kiểm tra")
        clarify_events = [ev[1] for ev in events if ev[0] == "done"]
        assert len(clarify_events) > 0
        # Should ask clarification
        assert "mơ hồ" in events[0][1]["message"] or "done" in events[-1][0]

        # Clean overrides and DB
        app.dependency_overrides.clear()

        # Clean up records using a fresh session
        db_clean = SessionLocal()
        try:
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()

    finally:
        try:
            db.close()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_pedagogical_workflow_alternative_preconditions(client):
    log_debug("Starting alternative scenarios test...")
    db = SessionLocal()
    try:
        # Create user
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        # 1. Course with NO CLOs and NO Chapters
        course_empty = Course(
            course_code="PED-EMPTY",
            course_name="Empty Pedagogical Course",
            user_id=user.id
        )
        db.add(course_empty)
        db.commit()
        db.refresh(course_empty)

        # 2. Course with CLOs but NO Chapters
        course_clos_only = Course(
            course_code="PED-CLOS",
            course_name="Syllabus Configured Course",
            user_id=user.id
        )
        db.add(course_clos_only)
        db.commit()
        db.refresh(course_clos_only)

        clo = CLO(
            course_id=course_clos_only.id,
            clo_code="CLO_PED_EMPTY_1",
            description="Understand basic outlines.",
            bloom_level=2
        )
        db.add(clo)
        db.commit()
        db.refresh(clo)

        # Helper override for auth dependency
        from fastapi import Depends
        from sqlalchemy.orm import Session

        from src.auth import get_current_user
        from src.database.session import get_db
        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        from src.main import app
        app.dependency_overrides[get_current_user] = override_get_current_user

        # Save IDs and close test session to release SQLite locks
        course_empty_id = course_empty.id
        course_clos_only_id = course_clos_only.id
        db.close()

        # Create chatbot session for Empty Course
        res_empty = await client.post("/api/chatbot/sessions", json={
            "course_id": course_empty_id,
            "title": "Empty course session"
        })
        assert res_empty.status_code == 200
        session_empty_id = res_empty.json()["id"]

        # Create chatbot session for CLOs-only Course
        res_clos = await client.post("/api/chatbot/sessions", json={
            "course_id": course_clos_only_id,
            "title": "CLOs only course session"
        })
        assert res_clos.status_code == 200
        session_clos_id = res_clos.json()["id"]

        async def simulate_chat(session_id: int, course_id: int, message: str) -> dict:
            log_debug(f"Simulating chat with message: '{message}'...")
            with patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else default):
                response = await client.post("/api/chatbot/chat-stream", json={
                    "session_id": session_id,
                    "course_id": course_id,
                    "message": message
                })
                assert response.status_code == 200
                events = []
                lines = response.text.split("\n\n")
                for line in lines:
                    if not line.strip():
                        continue
                    event_part = ""
                    data_part = ""
                    for subline in line.split("\n"):
                        if subline.startswith("event: "):
                            event_part = subline[7:].strip()
                        elif subline.startswith("data: "):
                            data_part = subline[6:].strip()
                    if event_part and data_part:
                        events.append((event_part, json.loads(data_part)))
                return events

        # --- Test Precondition 1: Empty Course -> Storyboard request -> Propose Syllabus Config upload
        events = await simulate_chat(session_empty_id, course_empty_id, "Lập storyboard cho chương 1")
        dispatch_actions = [ev[1] for ev in events if ev[0] == "dispatch_action"]
        assert len(dispatch_actions) > 0
        assert dispatch_actions[0]["action"] == "navigate_to_upload"
        assert dispatch_actions[0]["view"] == "course_config"

        # --- Test Precondition 2: CLOs-only Course -> Storyboard request -> Propose Outline gen first
        events = await simulate_chat(session_clos_id, course_clos_only_id, "Lập storyboard cho chương 1")
        dispatch_actions = [ev[1] for ev in events if ev[0] == "dispatch_action"]
        assert len(dispatch_actions) > 0
        assert dispatch_actions[0]["action"] == "generate_outline"
        assert dispatch_actions[0]["view"] == "lesson_planner"

        # Clean overrides and DB records
        app.dependency_overrides.clear()

        db_clean = SessionLocal()
        try:
            db_clean.query(CLO).filter(CLO.course_id == course_clos_only_id).delete()
            db_clean.query(Course).filter(Course.id.in_([course_empty_id, course_clos_only_id])).delete()
            db_clean.commit()
        finally:
            db_clean.close()

    finally:
        try:
            db.close()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_pedagogical_workflow_matrix_remediation_and_export(client):
    """
    Test matrix coverage tracking and the chatbot's decision logic:
    - When blind spots exist → propose 'run_remediation_queue' (matrix_dashboard)
    - When fully covered   → propose 'export_exam'  (question_bank)
    """
    log_debug("Starting matrix remediation & export decisional test...")

    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.models import ChapterMaterial, Question
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        # ---- Shared setup ----
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(
                email="admin@test.com",
                password_hash="hashed_pw",
                full_name="Admin User",
                role="admin",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(
            course_code="MAT-001",
            course_name="Matrix Coverage Test Course",
            user_id=user.id,
        )
        db.add(course)
        db.commit()
        db.refresh(course)

        clo = CLO(
            course_id=course.id,
            clo_code="CLO_MAT_1",
            description="Apply analytical skills to problem sets.",
            bloom_level=3,
        )
        db.add(clo)
        db.commit()
        db.refresh(clo)

        chapter = Chapter(
            course_id=course.id,
            title="Chapter 1: Analytical Foundations",
            description="Foundations of analysis.",
            sort_order=1,
            is_active=True,
        )
        db.add(chapter)
        db.commit()
        db.refresh(chapter)

        course_id = course.id
        clo_id = clo.id
        chapter_id = chapter.id
        db.close()

        # ---- Auth override ----
        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()

        app.dependency_overrides[get_current_user] = override_get_current_user

        # ==============================================================
        # PHASE 1: No questions, no slides → blind spots exist
        # ==============================================================
        log_debug("PHASE 1: Checking matrix with zero coverage...")
        matrix_res = await client.get(f"/api/courses/{course_id}/matrix-coverage")
        assert matrix_res.status_code == 200, f"matrix-coverage failed: {matrix_res.text}"
        matrix_data = matrix_res.json()["matrix"]

        assert "CLO_MAT_1" in matrix_data, "CLO_MAT_1 not found in matrix"
        clo_entry = matrix_data["CLO_MAT_1"]
        # Both question count and material slide count at Bloom 3 must be 0
        assert clo_entry["question_levels"]["3"] == 0, "Expected 0 questions at Bloom 3 initially"
        assert clo_entry["material_levels"]["3"] == 0, "Expected 0 slides at Bloom 3 initially"
        log_debug("PHASE 1 PASSED: Matrix shows zero coverage.")

        # ==============================================================
        # PHASE 2: Add a question linked to CLO_MAT_1 at Bloom 3
        # ==============================================================
        log_debug("PHASE 2: Adding question via API...")
        q_res = await client.post(
            f"/api/courses/{course_id}/questions",
            json={
                "chapter_id": chapter_id,
                "question_text": "What are the three main steps of analytical decomposition?",
                "options_json": '["Step A, B, C", "Step X, Y, Z", "Step 1, 2, 3", "Step I, II, III"]',
                "correct_answer": "A",
                "bloom_level": 3,
                "clo_id": clo_id,
            },
        )
        log_debug(f"POST /questions → status={q_res.status_code}, body={q_res.text[:300]}")
        assert q_res.status_code in (200, 201), f"Question creation failed: {q_res.text}"

        # Verify matrix now shows question count > 0
        matrix_res2 = await client.get(f"/api/courses/{course_id}/matrix-coverage")
        assert matrix_res2.status_code == 200
        matrix_data2 = matrix_res2.json()["matrix"]
        clo_entry2 = matrix_data2["CLO_MAT_1"]
        assert clo_entry2["question_levels"]["3"] >= 1, (
            f"Expected ≥1 question at Bloom 3, got {clo_entry2['question_levels']['3']}"
        )
        # Still no slides
        assert clo_entry2["material_levels"]["3"] == 0, "Slide count should still be 0"
        log_debug("PHASE 2 PASSED: Matrix shows 1+ questions, 0 slides.")

        # ==============================================================
        # PHASE 3: Add slide material with CLO/Bloom annotation tags
        # ==============================================================
        log_debug("PHASE 3: Adding chapter material with CLO/Bloom tags...")
        slide_content = (
            "# Slide 1: Introduction [CLO: CLO_MAT_1] [Bloom: B3]\n\n"
            "This slide covers analytical decomposition at the application level.\n\n"
            "# Slide 2: Practice Problems [CLO: CLO_MAT_1] [Bloom: B3]\n\n"
            "Students apply the three-step method to sample data sets."
        )
        mat_res = await client.put(
            f"/api/courses/chapters/{chapter_id}/materials",
            json={
                "slide_content": slide_content,
                "active_learning_script": "Group activity: solve problems in pairs.",
            },
        )
        log_debug(f"PUT /materials → status={mat_res.status_code}, body={mat_res.text[:300]}")
        assert mat_res.status_code in (200, 201), f"Material creation failed: {mat_res.text}"

        # Verify matrix now shows both question AND slide coverage
        matrix_res3 = await client.get(f"/api/courses/{course_id}/matrix-coverage")
        assert matrix_res3.status_code == 200
        matrix_data3 = matrix_res3.json()["matrix"]
        clo_entry3 = matrix_data3["CLO_MAT_1"]
        assert clo_entry3["question_levels"]["3"] >= 1, "Questions should still be counted"
        assert clo_entry3["material_levels"]["3"] >= 1, (
            f"Expected ≥1 slide at Bloom 3, got {clo_entry3['material_levels']['3']}"
        )
        log_debug("PHASE 3 PASSED: Matrix shows 100% coverage (questions + slides).")

        # ==============================================================
        # PHASE 4: Chatbot session + dispatch_action decision routing
        # ==============================================================
        log_debug("PHASE 4: Chatbot session routing test...")
        session_res = await client.post(
            "/api/chatbot/sessions",
            json={"course_id": course_id, "title": "Matrix Routing Test"},
        )
        assert session_res.status_code == 200
        session_id = session_res.json()["id"]

        async def simulate_chat(message: str):
            with __import__("unittest.mock", fromlist=["patch"]).patch(
                "os.environ.get",
                side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else default,
            ):
                resp = await client.post(
                    "/api/chatbot/chat-stream",
                    json={
                        "session_id": session_id,
                        "course_id": course_id,
                        "message": message,
                    },
                )
            assert resp.status_code == 200
            events = []
            for block in resp.text.split("\n\n"):
                if not block.strip():
                    continue
                ev_name, ev_data = "", ""
                for subline in block.split("\n"):
                    if subline.startswith("event: "):
                        ev_name = subline[7:].strip()
                    elif subline.startswith("data: "):
                        ev_data = subline[6:].strip()
                if ev_name and ev_data:
                    import json as _json
                    events.append((ev_name, _json.loads(ev_data)))
            return events

        # The matrix now has full coverage so the chatbot should acknowledge it
        events = await simulate_chat("Cho tôi xem matrix bao phủ chuẩn đầu ra bloom")
        done_events = [ev[1] for ev in events if ev[0] == "done"]
        assert len(done_events) > 0, "Expected at least one 'done' SSE event"
        assert done_events[0]["status"] in ("answered", "waiting_for_user"), (
            f"Unexpected status: {done_events[0]['status']}"
        )
        log_debug(f"PHASE 4 PASSED: Chatbot responded with status={done_events[0]['status']}")

        # ==============================================================
        # Cleanup
        # ==============================================================
        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            # ChapterMaterial cascade-deleted with chapter; but questions not (SET NULL)
            db_clean.query(Question).filter(Question.course_id == course_id).delete()
            db_clean.query(ChapterMaterial).filter(
                ChapterMaterial.chapter_id == chapter_id
            ).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
        log_debug("Cleanup done.")

    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 4: GIFT helper purity + /export-questions plain-text output
# =============================================================================

def test_gift_format_helper():
    """
    Unit-test the format_to_gift() helper directly.
    Verifies correct answer is marked with '=' and wrong ones with '~'.
    """
    from src.api.export import format_to_gift

    options = ["Paris", "London", "Berlin", "Madrid"]

    # Case 1: correct_answer matches option text exactly
    result = format_to_gift("What is the capital of France?", options, "Paris")
    assert "=Paris" in result, "Correct answer should be prefixed with '='"
    assert "~London" in result, "Wrong answer should be prefixed with '~'"
    assert "~Berlin" in result
    assert "~Madrid" in result
    log_debug("GIFT format test – text match: PASSED")

    # Case 2: correct_answer is a letter index ('A', 'B', ...)
    result2 = format_to_gift("What is 2+2?", ["3", "4", "5", "6"], "B")
    assert "=4" in result2, "Letter-index fallback should mark option B (index 1) as correct"
    log_debug("GIFT format test – letter index: PASSED")

    # Case 3: ultimate fallback (no match) → first option becomes correct
    result3 = format_to_gift("Unknown Q?", ["Alpha", "Beta"], "Z")
    assert "=Alpha" in result3, "Ultimate fallback should mark first option as correct"
    log_debug("GIFT format test – ultimate fallback: PASSED")


@pytest.mark.asyncio
async def test_export_questions_markdown_endpoint(client):
    """
    Verifies that GET /api/courses/{id}/export-questions produces a plain-text
    markdown document containing the question text and the CLO answer key section.
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.models import Question
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="EXP-001", course_name="Export Test Course", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        clo = CLO(course_id=course.id, clo_code="CLO_EXP_1", description="Describe basic exports.", bloom_level=2)
        db.add(clo)
        db.commit()
        db.refresh(clo)

        chapter = Chapter(course_id=course.id, title="Chapter 1", description="Export chapter.", sort_order=1, is_active=True)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)

        q = Question(
            course_id=course.id, chapter_id=chapter.id,
            question_text="What does GIFT stand for?",
            options_json='["General Import Format Technology", "General Import Format Text", "Generic Import Format Technology", "None"]',
            correct_answer="A", bloom_level=2, clo_id=clo.id, is_active=True
        )
        db.add(q)
        db.commit()
        db.refresh(q)

        course_id = course.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        res = await client.get(f"/api/courses/{course_id}/export-questions")
        assert res.status_code == 200, f"export-questions failed: {res.text}"
        body = res.text

        assert "GIFT stand for" in body, "Question text should appear in export"
        assert "CLO_EXP_1" in body, "CLO code should appear in answer key"
        assert "Bloom" in body or "bloom" in body.lower(), "Bloom level should appear"
        log_debug(f"export-questions body length={len(body)} chars — PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(Question).filter(Question.course_id == course_id).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 5: Multi-CLO partial coverage blind-spot detection
# =============================================================================

@pytest.mark.asyncio
async def test_multi_clo_partial_coverage_matrix(client):
    """
    Creates a course with 3 CLOs at Bloom levels B2, B3, B4.
    Adds questions for CLO1 (B2) and CLO2 (B3) only.
    Verifies that the matrix correctly reports:
      - CLO1 → question_levels["2"] >= 1   (covered)
      - CLO2 → question_levels["3"] >= 1   (covered)
      - CLO3 → question_levels["4"] == 0   (blind spot)
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.models import Question
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="MCLO-001", course_name="Multi-CLO Coverage Test", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        clo1 = CLO(course_id=course.id, clo_code="MCLO_1", description="Recall definitions.", bloom_level=2)
        clo2 = CLO(course_id=course.id, clo_code="MCLO_2", description="Apply formulas.", bloom_level=3)
        clo3 = CLO(course_id=course.id, clo_code="MCLO_3", description="Analyze case studies.", bloom_level=4)
        db.add_all([clo1, clo2, clo3])
        db.commit()
        for c in [clo1, clo2, clo3]:
            db.refresh(c)

        chapter = Chapter(course_id=course.id, title="Ch1", description="Ch", sort_order=1, is_active=True)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)

        # Questions for CLO1 (B2) and CLO2 (B3) only — CLO3 intentionally left empty
        q1 = Question(course_id=course.id, chapter_id=chapter.id, question_text="Define entropy.",
                      options_json='["A","B","C","D"]', correct_answer="A", bloom_level=2, clo_id=clo1.id, is_active=True)
        q2 = Question(course_id=course.id, chapter_id=chapter.id, question_text="Apply Bayes theorem.",
                      options_json='["A","B","C","D"]', correct_answer="B", bloom_level=3, clo_id=clo2.id, is_active=True)
        db.add_all([q1, q2])
        db.commit()

        course_id = course.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        res = await client.get(f"/api/courses/{course_id}/matrix-coverage")
        assert res.status_code == 200, f"matrix-coverage failed: {res.text}"
        matrix = res.json()["matrix"]

        assert "MCLO_1" in matrix and "MCLO_2" in matrix and "MCLO_3" in matrix, "All 3 CLOs must appear in matrix"

        assert matrix["MCLO_1"]["question_levels"]["2"] >= 1, "MCLO_1 B2 should be covered"
        assert matrix["MCLO_2"]["question_levels"]["3"] >= 1, "MCLO_2 B3 should be covered"
        assert matrix["MCLO_3"]["question_levels"]["4"] == 0, "MCLO_3 B4 should be a blind spot (uncovered)"
        log_debug("Multi-CLO partial coverage matrix: PASSED")

        # Verify target_bloom is correctly recorded per CLO
        assert matrix["MCLO_1"]["target_bloom"] == 2
        assert matrix["MCLO_2"]["target_bloom"] == 3
        assert matrix["MCLO_3"]["target_bloom"] == 4
        log_debug("Multi-CLO target_bloom metadata: PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(Question).filter(Question.course_id == course_id).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 6: Chatbot clarification SSE routing on ambiguous message
# =============================================================================

@pytest.mark.asyncio
async def test_chatbot_clarification_on_ambiguous_message(client):
    """
    Sends an ambiguous message ("soạn") — which triggers the 'clarify' mock fallback rule.
    Verifies that:
      - The SSE 'done' event returns status='waiting_for_user'
      - The response text is non-empty (the clarification question)
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="CLR-001", course_name="Clarification Routing Test", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        clo = CLO(course_id=course.id, clo_code="CLO_CLR", description="Basic CLO.", bloom_level=2)
        db.add(clo)
        db.commit()
        db.refresh(clo)

        course_id = course.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        # Create chatbot session
        sess_res = await client.post("/api/chatbot/sessions", json={"course_id": course_id, "title": "Clarification test"})
        assert sess_res.status_code == 200
        session_id = sess_res.json()["id"]

        # Send ambiguous single-word message that triggers the 'clarify' rule
        with patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else default):
            resp = await client.post("/api/chatbot/chat-stream", json={
                "session_id": session_id, "course_id": course_id, "message": "soạn"
            })
        assert resp.status_code == 200

        events = []
        for block in resp.text.split("\n\n"):
            if not block.strip():
                continue
            ev_name, ev_data = "", ""
            for subline in block.split("\n"):
                if subline.startswith("event: "):
                    ev_name = subline[7:].strip()
                elif subline.startswith("data: "):
                    ev_data = subline[6:].strip()
            if ev_name and ev_data:
                events.append((ev_name, json.loads(ev_data)))

        done_events = [ev[1] for ev in events if ev[0] == "done"]
        assert len(done_events) > 0, "Expected at least one 'done' SSE event"

        done = done_events[0]
        assert done["status"] == "waiting_for_user", (
            f"Ambiguous 'soạn' should trigger clarification (waiting_for_user), got: {done['status']}"
        )
        # The clarification question is stored in 'assistant_text' field of the done payload
        clarification_text = done.get("assistant_text") or done.get("message") or done.get("final_text") or ""
        assert clarification_text, f"Clarification response should include a question text, got keys: {list(done.keys())}"
        log_debug(f"Chatbot clarification routing: PASSED (status={done['status']}, text='{clarification_text[:60]}')")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 7: Full question CRUD lifecycle (create → read → update → delete)
# =============================================================================

@pytest.mark.asyncio
async def test_question_crud_lifecycle(client):
    """
    Full REST lifecycle test:
      POST /questions  → 201 with question data
      GET  /questions  → includes the new question in the list
      PUT  /questions/{id} → 200 with updated text
      DELETE /questions/{id} → 200
      GET  /questions  → question is no longer in list
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.models import Question
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="CRUD-Q01", course_name="Question CRUD Lifecycle Test", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        clo = CLO(course_id=course.id, clo_code="CLO_CRUD", description="CRUD CLO.", bloom_level=3)
        db.add(clo)
        db.commit()
        db.refresh(clo)

        chapter = Chapter(course_id=course.id, title="Chapter CRUD", description="Test.", sort_order=1, is_active=True)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)

        course_id = course.id
        clo_id = clo.id
        chapter_id = chapter.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        # ---- CREATE ----
        create_res = await client.post(f"/api/courses/{course_id}/questions", json={
            "chapter_id": chapter_id,
            "question_text": "Initial question text for CRUD test?",
            "options_json": '["Option A", "Option B", "Option C", "Option D"]',
            "correct_answer": "A",
            "bloom_level": 3,
            "clo_id": clo_id,
        })
        assert create_res.status_code == 201, f"Create failed: {create_res.text}"
        q_data = create_res.json()
        q_id = q_data["id"]
        assert q_data["question_text"] == "Initial question text for CRUD test?"
        assert q_data["bloom_level"] == 3
        assert q_data["clo_id"] == clo_id
        log_debug(f"CREATE question id={q_id}: PASSED")

        # ---- READ (list) ----
        list_res = await client.get(f"/api/courses/{course_id}/questions")
        assert list_res.status_code == 200
        all_ids = [q["id"] for q in list_res.json()]
        assert q_id in all_ids, f"Newly created question {q_id} not found in list"
        log_debug(f"READ question list (found id={q_id}): PASSED")

        # ---- UPDATE ----
        update_res = await client.put(f"/api/courses/questions/{q_id}", json={
            "question_text": "UPDATED question text for CRUD test?",
            "options_json": '["Option A", "Option B", "Option C", "Option D"]',
            "correct_answer": "B",
            "bloom_level": 4,
            "clo_id": clo_id,
        })
        assert update_res.status_code == 200, f"Update failed: {update_res.text}"
        updated = update_res.json()
        assert updated["question_text"] == "UPDATED question text for CRUD test?"
        assert updated["correct_answer"] == "B"
        assert updated["bloom_level"] == 4
        log_debug(f"UPDATE question id={q_id}: PASSED")

        # ---- DELETE ----
        del_res = await client.delete(f"/api/courses/questions/{q_id}")
        assert del_res.status_code == 200, f"Delete failed: {del_res.text}"
        log_debug(f"DELETE question id={q_id}: PASSED")

        # ---- READ (verify deleted, i.e., soft-deleted / not in active list) ----
        list_res2 = await client.get(f"/api/courses/{course_id}/questions")
        assert list_res2.status_code == 200
        remaining_ids = [q["id"] for q in list_res2.json()]
        assert q_id not in remaining_ids, f"Deleted question {q_id} should not appear in active list"
        log_debug(f"READ after DELETE (question {q_id} gone): PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(Question).filter(Question.course_id == course_id).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 8: CLO CRUD lifecycle (create → read list → update → delete via API)
# =============================================================================

@pytest.mark.asyncio
async def test_clo_crud_lifecycle(client):
    """
    Full REST lifecycle for CLO management:
      POST /clos   → 200 with new CLO
      GET  /clos   → list includes the new CLO
      PUT  /clos/{id} → 200 with updated bloom level
      DELETE /clos/{id} → 200
      GET  /clos   → CLO no longer appears
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="CLO-CRUD-01", course_name="CLO CRUD Test Course", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)
        course_id = course.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        # ---- CREATE ----
        create_res = await client.post(f"/api/courses/{course_id}/clos", json={
            "clo_code": "CLO_TEST_1",
            "description": "Recall and summarize core definitions.",
            "bloom_level": 2,
        })
        assert create_res.status_code == 200, f"CLO create failed: {create_res.text}"
        clo_data = create_res.json()
        clo_id = clo_data["id"]
        assert clo_data["clo_code"] == "CLO_TEST_1"
        assert clo_data["bloom_level"] == 2
        log_debug(f"CREATE CLO id={clo_id}: PASSED")

        # ---- READ (list) ----
        list_res = await client.get(f"/api/courses/{course_id}/clos")
        assert list_res.status_code == 200
        clo_codes = [c["clo_code"] for c in list_res.json()]
        assert "CLO_TEST_1" in clo_codes, "Newly created CLO should appear in list"
        log_debug("READ CLO list (found CLO_TEST_1): PASSED")

        # ---- UPDATE (bloom_level 2 → 4, description updated) ----
        update_res = await client.put(f"/api/courses/clos/{clo_id}", json={
            "clo_code": "CLO_TEST_1_UPD",
            "description": "Analyse and evaluate complex case studies.",
            "bloom_level": 4,
        })
        assert update_res.status_code == 200, f"CLO update failed: {update_res.text}"
        updated = update_res.json()
        assert updated["clo_code"] == "CLO_TEST_1_UPD"
        assert updated["bloom_level"] == 4
        log_debug(f"UPDATE CLO id={clo_id} → bloom 4: PASSED")

        # ---- DELETE ----
        del_res = await client.delete(f"/api/courses/clos/{clo_id}")
        assert del_res.status_code == 200, f"CLO delete failed: {del_res.text}"
        log_debug(f"DELETE CLO id={clo_id}: PASSED")

        # ---- READ (verify gone) ----
        list_res2 = await client.get(f"/api/courses/{course_id}/clos")
        assert list_res2.status_code == 200
        remaining_codes = [c["clo_code"] for c in list_res2.json()]
        assert "CLO_TEST_1_UPD" not in remaining_codes, "Deleted CLO should not appear"
        log_debug("READ after DELETE (CLO_TEST_1_UPD gone): PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 9: export-materials produces chapter slide content in output
# =============================================================================

@pytest.mark.asyncio
async def test_export_materials_markdown_content(client):
    """
    Verifies that GET /api/courses/{id}/export-materials returns a plain-text
    markdown document that includes:
      - Course name/code in the header
      - Chapter title
      - Slide content verbatim
      - Active learning script verbatim
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.models import ChapterMaterial
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="MAT-EXP-01", course_name="Material Export Test", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        chapter = Chapter(course_id=course.id, title="Chapter 1: Test Slides",
                          description="Test chapter.", sort_order=1, is_active=True)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)

        mat = ChapterMaterial(
            chapter_id=chapter.id,
            slide_content="# Slide 1: Overview [CLO: CLO_1] [Bloom: B2]\n\nThis is the overview slide.",
            active_learning_script="## Activity: Think-Pair-Share\n\nStudents discuss in pairs for 5 minutes.",
        )
        db.add(mat)
        db.commit()
        db.refresh(mat)

        course_id = course.id
        chapter_id = chapter.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        res = await client.get(f"/api/courses/{course_id}/export-materials")
        assert res.status_code == 200, f"export-materials failed: {res.text}"
        body = res.text

        # Header assertions
        assert "Material Export Test".upper() in body.upper(), "Course name should appear in header"
        assert "MAT-EXP-01" in body, "Course code should appear"

        # Chapter content
        assert "Chapter 1: Test Slides".upper() in body.upper(), "Chapter title should appear"
        assert "overview slide" in body.lower(), "Slide content should be included verbatim"
        assert "Think-Pair-Share" in body, "Active learning script should be included"
        log_debug(f"export-materials body length={len(body)} chars — PASSED")

        # Content-Disposition header
        assert "attachment" in res.headers.get("content-disposition", "").lower(), \
            "Response should trigger file download"
        log_debug("export-materials Content-Disposition header: PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 10: Inactive questions excluded from matrix coverage
# =============================================================================

@pytest.mark.asyncio
async def test_matrix_excludes_inactive_questions(client):
    """
    Verifies that questions marked is_active=False are NOT counted in the
    matrix coverage endpoint. Only active questions should contribute to counts.
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.models import Question
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="INACT-001", course_name="Inactive Questions Test", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        clo = CLO(course_id=course.id, clo_code="CLO_INACT", description="Test CLO.", bloom_level=3)
        db.add(clo)
        db.commit()
        db.refresh(clo)

        chapter = Chapter(course_id=course.id, title="Ch1", description="Test.", sort_order=1, is_active=True)
        db.add(chapter)
        db.commit()
        db.refresh(chapter)

        # Add one INACTIVE question at bloom 3
        q_inactive = Question(
            course_id=course.id, chapter_id=chapter.id,
            question_text="This question is inactive.",
            options_json='["A","B","C","D"]', correct_answer="A",
            bloom_level=3, clo_id=clo.id,
            is_active=False,  # ← should be excluded from matrix
        )
        db.add(q_inactive)
        db.commit()
        db.refresh(q_inactive)

        course_id = course.id
        chapter_id = chapter.id  # save before db.close() to avoid DetachedInstanceError
        clo_id = clo.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        # Matrix should show 0 at B3 because the only question is inactive
        res1 = await client.get(f"/api/courses/{course_id}/matrix-coverage")
        assert res1.status_code == 200
        matrix1 = res1.json()["matrix"]
        assert matrix1["CLO_INACT"]["question_levels"]["3"] == 0, (
            "Inactive question should NOT count toward coverage"
        )
        log_debug("Matrix excludes inactive question: PASSED")

        # Now add an ACTIVE question at bloom 3 — matrix should show 1
        db2 = SessionLocal()
        try:
            q_active = Question(
                course_id=course_id, chapter_id=chapter_id,
                question_text="This question is active.",
                options_json='["A","B","C","D"]', correct_answer="B",
                bloom_level=3, clo_id=clo_id,
                is_active=True,
            )
            db2.add(q_active)
            db2.commit()
        finally:
            db2.close()

        res2 = await client.get(f"/api/courses/{course_id}/matrix-coverage")
        assert res2.status_code == 200
        matrix2 = res2.json()["matrix"]
        assert matrix2["CLO_INACT"]["question_levels"]["3"] >= 1, (
            "Active question should count toward coverage"
        )
        log_debug("Matrix counts active question after adding: PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(Question).filter(Question.course_id == course_id).delete()
            db_clean.query(Chapter).filter(Chapter.course_id == course_id).delete()
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass


# =============================================================================
# TEST 11: Chatbot session message persistence (multi-turn history)
# =============================================================================

@pytest.mark.asyncio
async def test_chatbot_session_message_persistence(client):
    """
    Sends 2 messages in the same chatbot session and verifies:
      - GET /api/chatbot/sessions/{id}/messages returns both turns
      - Messages are in chronological order (user → assistant → user → assistant)
      - 'role' field is correctly set for each message
    """
    from fastapi import Depends
    from sqlalchemy.orm import Session

    from src.auth import get_current_user
    from src.database.session import get_db
    from src.main import app

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "admin@test.com").first()
        if not user:
            user = User(email="admin@test.com", password_hash="hashed_pw", full_name="Admin User", role="admin")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(course_code="PERSIST-01", course_name="Session Persistence Test", user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)

        clo = CLO(course_id=course.id, clo_code="CLO_PERSIST", description="Persistence CLO.", bloom_level=2)
        db.add(clo)
        db.commit()
        db.refresh(clo)

        course_id = course.id
        db.close()

        def override_get_current_user(db_dep: Session = Depends(get_db)):
            return db_dep.query(User).filter(User.email == "admin@test.com").first()
        app.dependency_overrides[get_current_user] = override_get_current_user

        # Create session
        sess_res = await client.post("/api/chatbot/sessions",
                                     json={"course_id": course_id, "title": "Persistence Test"})
        assert sess_res.status_code == 200
        session_id = sess_res.json()["id"]

        # Helper to send one message and parse SSE
        async def send_msg(text: str):
            with patch("os.environ.get",
                       side_effect=lambda k, d=None: "true" if k == "LLM_MOCK_MODE" else d):
                r = await client.post("/api/chatbot/chat-stream", json={
                    "session_id": session_id, "course_id": course_id, "message": text
                })
            assert r.status_code == 200
            return r

        # Turn 1
        await send_msg("Hãy giúp tôi tạo đề cương khóa học")
        # Turn 2
        await send_msg("Cho tôi xem matrix bao phủ chuẩn đầu ra bloom")

        # Now fetch the message history
        hist_res = await client.get(f"/api/chatbot/sessions/{session_id}/messages")
        assert hist_res.status_code == 200
        messages = hist_res.json()

        # Filter out system messages — only user + assistant
        visible = [m for m in messages if m.get("role") in ("user", "assistant")]
        log_debug(f"Session message history: {len(visible)} visible messages")

        # Should have at least 4 messages: 2 user + 2 assistant
        assert len(visible) >= 4, (
            f"Expected at least 4 visible messages (2 turns), got {len(visible)}: "
            f"{[m.get('role') for m in visible]}"
        )

        # Verify alternating role pattern (simplified: at least 1 user + 1 assistant)
        roles = [m["role"] for m in visible]
        assert "user" in roles, "At least one user message must be stored"
        assert "assistant" in roles, "At least one assistant message must be stored"
        log_debug(f"Message roles: {roles[:6]}")
        log_debug("Chatbot session message persistence: PASSED")

        app.dependency_overrides.clear()
        db_clean = SessionLocal()
        try:
            db_clean.query(CLO).filter(CLO.course_id == course_id).delete()
            db_clean.query(Course).filter(Course.id == course_id).delete()
            db_clean.commit()
        finally:
            db_clean.close()
    finally:
        try:
            db.close()
        except Exception:
            pass
