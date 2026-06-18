from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import Chapter, Course, Question, User
from src.database.session import get_db

router = APIRouter(prefix="/api/trash", tags=["trash"])


@router.get("")
def get_trash_items(
    course_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lấy danh sách tất cả các mục đã bị xóa mềm (Courses, Chapters, Questions)
    thuộc sở hữu của giảng viên hiện tại.
    """
    # Để truy vấn các thực thể đã bị xóa mềm, chúng ta sử dụng skip_filter=True
    query_courses = db.query(Course).execution_options(skip_filter=True).filter(
        Course.user_id == current_user.id,
        Course.is_deleted
    )

    query_chapters = db.query(Chapter).execution_options(skip_filter=True).join(
        Course, Chapter.course_id == Course.id
    ).filter(
        Course.user_id == current_user.id,
        Chapter.is_deleted
    )

    query_questions = db.query(Question).execution_options(skip_filter=True).join(
        Course, Question.course_id == Course.id
    ).filter(
        Course.user_id == current_user.id,
        Question.is_deleted
    )

    # Nếu được lọc theo course_id cụ thể (khi đang ở giao diện môn học)
    if course_id is not None:
        query_courses = query_courses.filter(Course.id == course_id)
        query_chapters = query_chapters.filter(Chapter.course_id == course_id)
        query_questions = query_questions.filter(Question.course_id == course_id)

    courses_list = query_courses.all()
    chapters_list = query_chapters.all()
    questions_list = query_questions.all()

    # Nhúng thông tin bổ sung về các thực thể cha để hiển thị đẹp trên giao diện
    courses_data = [
        {
            "id": c.id,
            "type": "course",
            "course_code": c.course_code,
            "course_name": c.course_name,
            "deleted_at": c.deleted_at.isoformat() if c.deleted_at else None,
        }
        for c in courses_list
    ]

    chapters_data = []
    for ch in chapters_list:
        # Lấy thông tin môn học cha (sử dụng skip_filter=True để lấy kể cả khi môn đó bị xóa)
        parent_course = db.query(Course).execution_options(skip_filter=True).filter(Course.id == ch.course_id).first()
        chapters_data.append({
            "id": ch.id,
            "type": "chapter",
            "title": ch.title,
            "course_id": ch.course_id,
            "course_name": parent_course.course_name if parent_course else "N/A",
            "course_code": parent_course.course_code if parent_course else "N/A",
            "course_is_deleted": parent_course.is_deleted if parent_course else False,
            "deleted_at": ch.deleted_at.isoformat() if ch.deleted_at else None,
        })

    questions_data = []
    for q in questions_list:
        parent_course = db.query(Course).execution_options(skip_filter=True).filter(Course.id == q.course_id).first()
        parent_chapter = None
        if q.chapter_id:
            parent_chapter = db.query(Chapter).execution_options(skip_filter=True).filter(Chapter.id == q.chapter_id).first()

        questions_data.append({
            "id": q.id,
            "type": "question",
            "question_text": q.question_text,
            "question_type": q.question_type,
            "course_id": q.course_id,
            "course_name": parent_course.course_name if parent_course else "N/A",
            "course_code": parent_course.course_code if parent_course else "N/A",
            "course_is_deleted": parent_course.is_deleted if parent_course else False,
            "chapter_id": q.chapter_id,
            "chapter_title": parent_chapter.title if parent_chapter else None,
            "chapter_is_deleted": parent_chapter.is_deleted if parent_chapter else False,
            "deleted_at": q.deleted_at.isoformat() if q.deleted_at else None,
        })

    return {
        "courses": courses_data,
        "chapters": chapters_data,
        "questions": questions_data,
    }


@router.post("/restore/{item_type}/{item_id}")
def restore_item(
    item_type: str,
    item_id: int,
    restore_children: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Khôi phục một mục đã bị xóa mềm. Thực hiện kiểm tra ràng buộc để đảm bảo dữ liệu cha đang hoạt động.
    """
    if item_type == "course":
        course = db.query(Course).execution_options(skip_filter=True).filter(
            Course.id == item_id,
            Course.user_id == current_user.id
        ).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Môn học không tồn tại trong Thùng rác."
            )

        course.is_deleted = False
        course.deleted_at = None

        # Nếu khôi phục các mục con đi kèm
        if restore_children:
            # Khôi phục các chapter thuộc môn học này
            chapters = db.query(Chapter).execution_options(skip_filter=True).filter(
                Chapter.course_id == course.id,
                Chapter.is_deleted
            ).all()
            for ch in chapters:
                ch.is_deleted = False
                ch.deleted_at = None

            # Khôi phục các question thuộc môn học này
            questions = db.query(Question).execution_options(skip_filter=True).filter(
                Question.course_id == course.id,
                Question.is_deleted
            ).all()
            for q in questions:
                q.is_deleted = False
                q.deleted_at = None

        db.commit()
        return {"message": "Khôi phục môn học thành công."}

    elif item_type == "chapter":
        chapter = db.query(Chapter).execution_options(skip_filter=True).join(
            Course, Chapter.course_id == Course.id
        ).filter(
            Chapter.id == item_id,
            Course.user_id == current_user.id
        ).first()
        if not chapter:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chương học không tồn tại trong Thùng rác."
            )

        # Kiểm tra xem Course cha có đang bị xóa không
        parent_course = db.query(Course).execution_options(skip_filter=True).filter(
            Course.id == chapter.course_id
        ).first()
        if parent_course and parent_course.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể khôi phục chương này vì Môn học '{parent_course.course_name}' chứa nó đang bị xóa. Vui lòng khôi phục Môn học trước."
            )

        chapter.is_deleted = False
        chapter.deleted_at = None
        db.commit()
        return {"message": "Khôi phục chương học thành công."}

    elif item_type == "question":
        question = db.query(Question).execution_options(skip_filter=True).join(
            Course, Question.course_id == Course.id
        ).filter(
            Question.id == item_id,
            Course.user_id == current_user.id
        ).first()
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Câu hỏi không tồn tại trong Thùng rác."
            )

        # Kiểm tra Course cha
        parent_course = db.query(Course).execution_options(skip_filter=True).filter(
            Course.id == question.course_id
        ).first()
        if parent_course and parent_course.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể khôi phục câu hỏi này vì Môn học '{parent_course.course_name}' chứa nó đang bị xóa."
            )

        # Kiểm tra Chapter cha (nếu có liên kết)
        if question.chapter_id:
            parent_chapter = db.query(Chapter).execution_options(skip_filter=True).filter(
                Chapter.id == question.chapter_id
            ).first()
            if parent_chapter and parent_chapter.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Không thể khôi phục câu hỏi này vì Chương học '{parent_chapter.title}' chứa nó đang bị xóa. Vui lòng khôi phục Chương học trước."
                )

        question.is_deleted = False
        question.deleted_at = None
        db.commit()
        return {"message": "Khôi phục câu hỏi thành công."}

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Loại mục cần khôi phục không hợp lệ."
        )


@router.delete("/hard-delete/{item_type}/{item_id}")
def hard_delete_item(
    item_type: str,
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Xóa vĩnh viễn (physically delete) một mục khỏi cơ sở dữ liệu.
    Bypass cơ chế soft delete bằng cách dùng cờ session.info["hard_delete"].
    """
    # Kích hoạt chế độ hard delete cho session này
    db.info["hard_delete"] = True

    try:
        if item_type == "course":
            course = db.query(Course).execution_options(skip_filter=True).filter(
                Course.id == item_id,
                Course.user_id == current_user.id
            ).first()
            if not course:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Môn học không tồn tại."
                )

            db.delete(course)
            db.commit()
            return {"message": "Đã xóa vĩnh viễn môn học và toàn bộ dữ liệu đi kèm."}

        elif item_type == "chapter":
            chapter = db.query(Chapter).execution_options(skip_filter=True).join(
                Course, Chapter.course_id == Course.id
            ).filter(
                Chapter.id == item_id,
                Course.user_id == current_user.id
            ).first()
            if not chapter:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Chương học không tồn tại."
                )

            db.delete(chapter)
            db.commit()
            return {"message": "Đã xóa vĩnh viễn chương học."}

        elif item_type == "question":
            question = db.query(Question).execution_options(skip_filter=True).join(
                Course, Question.course_id == Course.id
            ).filter(
                Question.id == item_id,
                Course.user_id == current_user.id
            ).first()
            if not question:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Câu hỏi không tồn tại."
                )

            db.delete(question)
            db.commit()
            return {"message": "Đã xóa vĩnh viễn câu hỏi."}

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Loại mục cần xóa không hợp lệ."
            )
    finally:
        # Dọn dẹp cờ sau khi hoàn tất truy vấn
        db.info.pop("hard_delete", None)
