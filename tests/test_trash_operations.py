import pytest
from sqlalchemy.orm import Session

from src.database.models import Chapter, Question


@pytest.mark.asyncio
async def test_trash_retrieval_and_lifecycle(client, auth_headers, db: Session, test_course):
    """
    Test retrieving trash items, restoring them, dependency validations, and hard deleting.
    """
    # 1. Initially, trash should be empty for courses
    resp = await client.get("/api/trash", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["courses"]) == 0
    assert len(data["chapters"]) == 0
    assert len(data["questions"]) == 0

    # 2. Add a chapter and a question to the test course
    chapter = Chapter(course_id=test_course.id, sort_order=1, title="Test Chapter")
    db.add(chapter)
    db.commit()
    db.refresh(chapter)

    question = Question(
        course_id=test_course.id,
        chapter_id=chapter.id,
        question_text="What is 2+2?",
        correct_answer="4",
        bloom_level=1,
    )
    db.add(question)
    db.commit()
    db.refresh(question)

    # 3. Soft-delete them
    db.delete(question)
    db.delete(chapter)
    db.commit()

    # 4. Check if they appear in Trash
    resp = await client.get("/api/trash", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["chapters"]) == 1
    assert data["chapters"][0]["title"] == "Test Chapter"
    assert data["chapters"][0]["course_is_deleted"] is False
    assert len(data["questions"]) == 1
    assert data["questions"][0]["question_text"] == "What is 2+2?"
    assert data["questions"][0]["chapter_is_deleted"] is True  # Because chapter is soft-deleted

    # 5. Restore validation: try to restore Question but Chapter is deleted
    resp_restore_q_failed = await client.post(
        f"/api/trash/restore/question/{question.id}",
        headers=auth_headers
    )
    assert resp_restore_q_failed.status_code == 400
    assert "chương học" in resp_restore_q_failed.json()["detail"].lower()

    # 6. Restore Chapter (succeeds since Course is active)
    resp_restore_ch = await client.post(
        f"/api/trash/restore/chapter/{chapter.id}",
        headers=auth_headers
    )
    assert resp_restore_ch.status_code == 200

    # 7. Now restore Question should succeed
    resp_restore_q = await client.post(
        f"/api/trash/restore/question/{question.id}",
        headers=auth_headers
    )
    assert resp_restore_q.status_code == 200

    # Verify they are no longer in trash
    resp_after = await client.get("/api/trash", headers=auth_headers)
    assert len(resp_after["questions"] if isinstance(resp_after, dict) else resp_after.json()["questions"]) == 0

    # 8. Test Course Delete and cascade restore
    db.delete(test_course)
    db.commit()

    # Verify Course, Chapter and Question are all in Trash
    resp_trash_all = await client.get("/api/trash", headers=auth_headers)
    data_all = resp_trash_all.json()
    assert len(data_all["courses"]) == 1
    assert len(data_all["chapters"]) == 1
    assert len(data_all["questions"]) == 1
    assert data_all["chapters"][0]["course_is_deleted"] is True
    assert data_all["questions"][0]["course_is_deleted"] is True

    # Try to restore Chapter while Course is deleted -> should fail
    resp_restore_ch_failed = await client.post(
        f"/api/trash/restore/chapter/{chapter.id}",
        headers=auth_headers
    )
    assert resp_restore_ch_failed.status_code == 400

    # Restore Course (will cascade restore chapters & questions by default)
    resp_restore_course = await client.post(
        f"/api/trash/restore/course/{test_course.id}",
        headers=auth_headers
    )
    assert resp_restore_course.status_code == 200

    # Verify trash is empty again
    resp_trash_empty = await client.get("/api/trash", headers=auth_headers)
    assert len(resp_trash_empty.json()["courses"]) == 0

    # 9. Test Hard Delete
    # Soft delete again
    db.delete(question)
    db.commit()

    # Verify it is in trash
    resp_trash_q = await client.get("/api/trash", headers=auth_headers)
    assert len(resp_trash_q.json()["questions"]) == 1

    # Hard delete it
    resp_hard_delete = await client.delete(
        f"/api/trash/hard-delete/question/{question.id}",
        headers=auth_headers
    )
    assert resp_hard_delete.status_code == 200

    # Verify it is physically deleted from the database
    db.info["hard_delete"] = True
    q_db = db.query(Question).execution_options(skip_filter=True).filter(Question.id == question.id).first()
    db.info.pop("hard_delete", None)
    assert q_db is None
