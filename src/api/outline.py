from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import CLO, Chapter, Course, User
from src.database.session import get_db
from src.utils.llm_client import call_llm_json, langfuse

router = APIRouter(prefix="/api/courses", tags=["outline"])


# Pydantic schemas
class ChapterCreate(BaseModel):
    title: str = Field(..., example="Chương 1: Tổng quan về Cây BST")
    description: str = Field(..., example="Giới thiệu cấu trúc cây, định nghĩa và tính chất của cây nhị phân tìm kiếm.")
    sort_order: int = Field(..., example=1)


class ChapterResponse(BaseModel):
    id: int
    course_id: int
    sort_order: int
    title: str
    description: str | None

    class Config:
        from_attributes = True


# --- API CHAPTERS (OUTLINE) ---


@router.get("/{course_id}/chapters", response_model=list[ChapterResponse])
def get_course_chapters(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    chapters = (
        db.query(Chapter)
        .filter(Chapter.course_id == course_id, Chapter.is_active)
        .order_by(Chapter.sort_order)
        .all()
    )
    return chapters


@router.post("/{course_id}/chapters", response_model=ChapterResponse)
def create_chapter(
    course_id: int,
    chapter_data: ChapterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    new_chapter = Chapter(
        course_id=course_id,
        sort_order=chapter_data.sort_order,
        title=chapter_data.title,
        description=chapter_data.description,
    )
    db.add(new_chapter)
    db.commit()
    db.refresh(new_chapter)
    return new_chapter


@router.put("/chapters/{chapter_id}", response_model=ChapterResponse)
def update_chapter(
    chapter_id: int,
    chapter_data: ChapterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền chỉnh sửa."
        )

    chapter.title = chapter_data.title
    chapter.description = chapter_data.description
    chapter.sort_order = chapter_data.sort_order

    db.commit()
    db.refresh(chapter)
    return chapter


@router.delete("/chapters/{chapter_id}")
def delete_chapter(chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền chỉnh sửa."
        )
    db.delete(chapter)
    db.commit()
    return {"message": "Đã xóa chương học thành công."}


# --- API AI GENERATE SKELETAL OUTLINE ---


@router.post("/{course_id}/generate-outline")
def generate_skeletal_outline(
    course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # 1. Kiểm tra quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy danh sách các CLO hiện có của môn học
    clos = db.query(CLO).filter(CLO.course_id == course_id).all()
    if not clos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Môn học chưa cấu hình CLO. Vui lòng nạp Syllabus trước."
        )

    # 3. Định dạng danh sách CLO gửi cho LLM
    clos_text = "\n".join([f"- [{c.clo_code}] {c.description} (Thang Bloom: {c.bloom_level})" for c in clos])

    # 4. Gọi LLM sinh Outline dạng JSON
    system_prompt = """Bạn là chuyên gia sư phạm đại học. Thiết kế đề cương học tập (Lesson Outline).
Nhiệm vụ: Dựa vào các Chuẩn đầu ra (CLOs) môn học được cung cấp, hãy thiết kế một cấu trúc chương học logic (từ 5 đến 7 chương).
Đảm bảo:
- Nội dung đi từ cơ bản đến nâng cao.
- Phân bổ đều để phủ toàn bộ các CLOs đã cho.
- Mỗi chương gồm Tên chương (title) và Mô tả ngắn gọn (description) các chủ đề giảng dạy chính.

Đầu ra định dạng JSON:
{
  "chapters": [
    {
      "title": "Chương 1: Tên chương",
      "description": "Mô tả ngắn gọn nội dung chương..."
    }
  ]
}
"""
    prompt = f"Môn học: {course.course_name}\nChuẩn đầu ra môn học (CLOs):\n{clos_text}\n\nHãy sinh cấu trúc chương học phù hợp."

    # --- Langfuse: Parent Trace ---
    outline_trace = None
    if langfuse:
        outline_trace = langfuse.trace(
            name="lesson_outline_generation",
            metadata={"course_id": course_id, "course_name": course.course_name, "clo_count": len(clos)},
        )

    try:
        outline_json = call_llm_json(
            prompt,
            system_instruction=system_prompt,
            trace_or_span=outline_trace,
            prompt_name="lesson_outline",
            prompt_version="v1",
            metadata={"course_id": course_id},
        )

        # 5. Xóa outline cũ để ghi đè mới
        db.query(Chapter).filter(Chapter.course_id == course_id).delete()

        # 6. Lưu các chương học mới vào database
        created_chapters = []
        for idx, ch in enumerate(outline_json.get("chapters", [])):
            new_chapter = Chapter(
                course_id=course_id,
                sort_order=idx + 1,
                title=ch.get("title", f"Chương {idx + 1}"),
                description=ch.get("description", ""),
            )
            db.add(new_chapter)
            created_chapters.append(new_chapter)

        db.commit()

        return {
            "message": "Sinh cấu trúc chương học thành công.",
            "chapters": [
                {"id": c.id, "sort_order": c.sort_order, "title": c.title, "description": c.description}
                for c in created_chapters
            ],
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi AI sinh dàn ý: {str(e)}"
        )


# --- API GỢI Ý QUERY TÌM KIẾM HỌC THUẬT (AI SEARCH SUGGESTIONS) ---


@router.get("/chapters/{chapter_id}/suggest-queries")
def suggest_search_queries(
    chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Dùng AI để gợi ý 5 query tìm kiếm học thuật phù hợp với chương học đang chọn."""
    # 1. Lấy thông tin chương và môn học, kiểm tra quyền
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    course = db.query(Course).filter(Course.id == chapter.course_id).first()

    # 2. Gọi LLM sinh gợi ý query với input tối giản để tăng tốc độ phản hồi
    system_prompt = """Bạn là chuyên gia gợi ý tìm kiếm học thuật. Hãy gợi ý 5 cụm từ tìm kiếm (search queries) bằng tiếng Anh (mỗi query từ 3-8 từ) phù hợp nhất để tìm tài liệu tham khảo trên Google Scholar/Wikipedia cho chương học này.
Trả về JSON đúng định dạng:
{
  "suggestions": [
    "query 1",
    "query 2",
    "query 3",
    "query 4",
    "query 5"
  ]
}"""

    prompt = f"Môn học: {course.course_name}\nChương học: {chapter.title}"
    if chapter.description:
        prompt += f"\nMô tả chương: {chapter.description[:150]}"

    try:
        result = call_llm_json(
            prompt,
            system_instruction=system_prompt,
            prompt_name="search_query_suggestion",
            prompt_version="v1",
            metadata={"chapter_id": chapter_id},
        )
        suggestions = result.get("suggestions", [])
        if not suggestions or not isinstance(suggestions, list):
            raise ValueError("Kết quả AI không hợp lệ.")
        return {"suggestions": suggestions[:5]}
    except Exception:
        # Fallback thủ công nhanh nếu AI lỗi/timeout
        fallback = [
            f"{chapter.title} lecture notes",
            f"{chapter.title} tutorial examples",
            f"{course.course_name} {chapter.title} academic paper",
            f"{chapter.title} algorithm implementation",
            f"{chapter.title} Wikipedia",
        ]
        return {"suggestions": fallback[:5]}
