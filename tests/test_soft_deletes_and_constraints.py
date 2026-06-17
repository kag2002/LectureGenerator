import pytest
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from src.database.models import Course, Chapter, Question, CLO, User

def test_bloom_level_constraint_clo(db: Session):
    # 1. Create a test user and course
    user = User(email="constraint_test_user@vinuni.edu.vn", password_hash="hash")
    db.add(user)
    db.commit()

    course = Course(user_id=user.id, course_code="TEST1", course_name="Test Course")
    db.add(course)
    db.commit()

    # 2. Add CLO with invalid bloom level (e.g. 7)
    invalid_clo = CLO(course_id=course.id, clo_code="CLO1", description="Invalid bloom", bloom_level=7)
    db.add(invalid_clo)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # 3. Add CLO with valid bloom level (e.g. 3)
    valid_clo = CLO(course_id=course.id, clo_code="CLO1", description="Valid bloom", bloom_level=3)
    db.add(valid_clo)
    db.commit()
    assert valid_clo.id is not None

def test_bloom_level_constraint_question(db: Session):
    user = User(email="constraint_q_user@vinuni.edu.vn", password_hash="hash")
    db.add(user)
    db.commit()

    course = Course(user_id=user.id, course_code="TEST2", course_name="Test Course")
    db.add(course)
    db.commit()

    # Question with invalid bloom level (e.g. 0)
    invalid_q = Question(
        course_id=course.id,
        question_text="What?",
        correct_answer="Yes",
        bloom_level=0
    )
    db.add(invalid_q)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # Question with valid bloom level (e.g. 5)
    valid_q = Question(
        course_id=course.id,
        question_text="What?",
        correct_answer="Yes",
        bloom_level=5
    )
    db.add(valid_q)
    db.commit()
    assert valid_q.id is not None

def test_soft_delete_lifecycle(db: Session):
    user = User(email="soft_delete_user@vinuni.edu.vn", password_hash="hash")
    db.add(user)
    db.commit()

    course = Course(user_id=user.id, course_code="TEST3", course_name="Test Course")
    db.add(course)
    db.commit()

    chapter = Chapter(course_id=course.id, sort_order=1, title="Chapter 1")
    db.add(chapter)
    db.commit()

    # 1. Verify initial state
    assert not course.is_deleted
    assert course.deleted_at is None
    assert not chapter.is_deleted
    assert chapter.deleted_at is None

    # 2. Delete course (calls session.delete)
    db.delete(course)
    db.commit()

    # 3. Verify it is marked deleted in DB, but not hard-deleted
    # Using execution option skip_filter=True to read soft-deleted records
    deleted_course = db.query(Course).execution_options(skip_filter=True).filter(Course.id == course.id).first()
    assert deleted_course is not None
    assert deleted_course.is_deleted
    assert isinstance(deleted_course.deleted_at, datetime)

    # 4. Verify that default queries do not return it
    active_course = db.query(Course).filter(Course.id == course.id).first()
    assert active_course is None

    # 5. Verify bulk-delete is also soft-deleted
    # Re-fetch active chapters (none because course was soft-deleted, but let's query with skip_filter)
    all_chapters = db.query(Chapter).execution_options(skip_filter=True).all()
    assert len(all_chapters) > 0

    # Let's perform a bulk delete on Chapter
    db.query(Chapter).delete()
    db.commit()

    # Verify chapters are soft-deleted
    deleted_chapters = db.query(Chapter).execution_options(skip_filter=True).all()
    for ch in deleted_chapters:
        assert ch.is_deleted
        assert ch.deleted_at is not None
