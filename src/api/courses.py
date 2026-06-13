import json
import os
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import CLO, Course, User
from src.database.session import SessionLocal, get_db

router = APIRouter(prefix="/api/courses", tags=["courses"])


# Pydantic schemas
class CourseCreate(BaseModel):
    course_code: str = Field(..., example="COMP2010")
    course_name: str = Field(..., example="Cấu trúc dữ liệu và Giải thuật")


class CourseUpdate(BaseModel):
    course_code: str = Field(..., example="COMP2010")
    course_name: str = Field(..., example="Cấu trúc dữ liệu và Giải thuật")
    required_textbooks: str | None = None
    recommended_readings: str | None = None


class CourseResponse(BaseModel):
    id: int
    course_code: str
    course_name: str
    required_textbooks: str | None = None
    recommended_readings: str | None = None

    class Config:
        from_attributes = True


class CLOCreate(BaseModel):
    clo_code: str = Field(..., example="CLO1")
    description: str = Field(..., example="Giải thích được cơ chế hoạt động của cây BST.")
    bloom_level: int = Field(..., ge=1, le=6, example=2)


class CLOResponse(BaseModel):
    id: int
    course_id: int
    clo_code: str
    description: str
    bloom_level: int

    class Config:
        from_attributes = True


# --- API MÔN HỌC (COURSES) ---


@router.get("", response_model=list[CourseResponse])
def get_courses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Lấy các môn học thuộc về duy nhất giảng viên hiện tại (Isolation)
    courses = db.query(Course).filter(Course.user_id == current_user.id).all()
    return courses


@router.post("", response_model=CourseResponse)
def create_course(
    course_data: CourseCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    new_course = Course(
        user_id=current_user.id, course_code=course_data.course_code, course_name=course_data.course_name
    )
    db.add(new_course)
    db.commit()
    db.refresh(new_course)
    return new_course


@router.get("/{course_id}", response_model=CourseResponse)
def get_course_detail(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    return course


@router.put("/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: int,
    course_data: CourseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền chỉnh sửa."
        )
    course.course_code = course_data.course_code
    course.course_name = course_data.course_name
    course.required_textbooks = course_data.required_textbooks
    course.recommended_readings = course_data.recommended_readings
    db.commit()
    db.refresh(course)
    return course


@router.delete("/{course_id}")
def delete_course(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    db.delete(course)
    db.commit()
    return {"message": "Đã xóa môn học thành công."}


# --- API CHUẨN ĐẦU RA (CLOs) ---


@router.get("/{course_id}/clos", response_model=list[CLOResponse])
def get_course_clos(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Kiểm tra quyền sở hữu môn học trước
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    clos = db.query(CLO).filter(CLO.course_id == course_id).all()
    return clos


@router.post("/{course_id}/clos", response_model=CLOResponse)
def create_course_clo(
    course_id: int, clo_data: CLOCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # Kiểm tra quyền sở hữu môn học trước
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    new_clo = CLO(
        course_id=course_id,
        clo_code=clo_data.clo_code,
        description=clo_data.description,
        bloom_level=clo_data.bloom_level,
    )
    db.add(new_clo)
    db.commit()
    db.refresh(new_clo)
    return new_clo


@router.put("/clos/{clo_id}", response_model=CLOResponse)
def update_clo(
    clo_id: int, clo_data: CLOCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # Kiểm tra xem CLO có tồn tại và thuộc môn học của User hiện tại không
    clo = db.query(CLO).join(Course).filter(CLO.id == clo_id, Course.user_id == current_user.id).first()
    if not clo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chuẩn đầu ra không tồn tại hoặc bạn không có quyền chỉnh sửa.",
        )

    clo.clo_code = clo_data.clo_code
    clo.description = clo_data.description
    clo.bloom_level = clo_data.bloom_level

    db.commit()
    db.refresh(clo)
    return clo


@router.delete("/clos/{clo_id}")
def delete_clo(clo_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Kiểm tra xem CLO có tồn tại và thuộc môn học của User hiện tại không
    clo = db.query(CLO).join(Course).filter(CLO.id == clo_id, Course.user_id == current_user.id).first()
    if not clo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chuẩn đầu ra không tồn tại hoặc bạn không có quyền chỉnh sửa.",
        )

    db.delete(clo)
    db.commit()
    return {"message": "Đã xóa chuẩn đầu ra thành công."}


@router.post("/{course_id}/parse-syllabus")
def upload_and_parse_syllabus(
    course_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Kiểm tra quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Tạo thư mục tạm lưu file
    temp_dir = "./temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, file.filename)

    try:
        # Lưu file tạm xuống đĩa
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Trích xuất text từ file đề cương
        from src.services.syllabus_analyser import analyse_syllabus
        from src.utils.parser import parse_document

        text_content = parse_document(temp_file_path)
        if not text_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể đọc nội dung từ file đề cương tải lên."
            )

        # 4. LLM bóc tách thông tin cấu trúc & CLOs
        analysis_result = analyse_syllabus(text_content)

        # 5. Cập nhật thông tin mã/tên môn học nếu được trả về
        if "course_code" in analysis_result and analysis_result["course_code"]:
            course.course_code = analysis_result["course_code"]
        if "course_name" in analysis_result and analysis_result["course_name"]:
            course.course_name = analysis_result["course_name"]
        if "required_textbooks" in analysis_result:
            books = analysis_result["required_textbooks"]
            course.required_textbooks = "\n".join(books) if isinstance(books, list) else str(books)
        if "recommended_readings" in analysis_result:
            readings = analysis_result["recommended_readings"]
            course.recommended_readings = "\n".join(readings) if isinstance(readings, list) else str(readings)

        # Xóa các CLOs cũ của môn này để tránh trùng lặp ghi đè
        db.query(CLO).filter(CLO.course_id == course_id).delete()

        # Thêm các CLOs mới đã bóc tách
        created_clos = []
        for clo_item in analysis_result.get("clos", []):
            new_clo = CLO(
                course_id=course_id,
                clo_code=clo_item.get("clo_code", "CLO"),
                description=clo_item.get("description", ""),
                bloom_level=clo_item.get("bloom_level", 2),
            )
            db.add(new_clo)
            created_clos.append(new_clo)

        db.commit()

        # Trả về kết quả JSON đã nạp
        return {
            "message": "Phân tích Syllabus thành công.",
            "course": {
                "id": course.id,
                "course_code": course.course_code,
                "course_name": course.course_name,
                "required_textbooks": course.required_textbooks,
                "recommended_readings": course.recommended_readings,
            },
            "clos": [
                {"id": c.id, "clo_code": c.clo_code, "description": c.description, "bloom_level": c.bloom_level}
                for c in created_clos
            ],
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi hệ thống khi phân tích Syllabus: {str(e)}"
        )
    finally:
        # Xóa file tạm sau khi hoàn tất
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


@router.post("/{course_id}/parse-syllabus-stream")
def upload_and_parse_syllabus_stream(
    course_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Phân tích Syllabus bằng AI và stream tiến độ thời gian thực (SSE) kèm kết quả CLO.
    """
    # 1. Kiểm tra quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Tạo thư mục tạm lưu file
    temp_dir = "./temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, file.filename)

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    def event_stream():
        def send(event: str, data: dict):
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        new_db = SessionLocal()
        try:
            # Stage 1: Đọc tài liệu
            yield send("stage", {"stage": 1, "message": "📄 Đang trích xuất văn bản từ tài liệu đề cương..."})

            from src.services.syllabus_analyser import analyse_syllabus
            from src.utils.parser import parse_document

            text_content = parse_document(temp_file_path)
            if not text_content:
                yield send("error", {"message": "Không thể đọc nội dung văn bản từ tài liệu tải lên."})
                return

            # Stage 2: AI phân tích
            yield send(
                "stage", {"stage": 2, "message": "🤖 AI đang bóc tách cấu trúc và chuẩn hóa các chuẩn đầu ra CLO..."}
            )
            analysis_result = analyse_syllabus(text_content)

            # Stage 3: Phân cấp mức Bloom
            yield send("stage", {"stage": 3, "message": "📊 Đang chuẩn hóa động từ hành động và phân cấp mức Bloom..."})

            # Khôi phục môn học trong session mới
            new_course = new_db.query(Course).filter(Course.id == course_id).first()
            if "course_code" in analysis_result and analysis_result["course_code"]:
                new_course.course_code = analysis_result["course_code"]
            if "course_name" in analysis_result and analysis_result["course_name"]:
                new_course.course_name = analysis_result["course_name"]
            if "required_textbooks" in analysis_result:
                books = analysis_result["required_textbooks"]
                new_course.required_textbooks = "\n".join(books) if isinstance(books, list) else str(books)
            if "recommended_readings" in analysis_result:
                readings = analysis_result["recommended_readings"]
                new_course.recommended_readings = "\n".join(readings) if isinstance(readings, list) else str(readings)

            # Stage 4: Lưu trữ vào DB
            yield send("stage", {"stage": 4, "message": "💾 Đang lưu trữ và đồng bộ hóa danh sách CLOs..."})

            # Xóa các CLOs cũ của môn này
            new_db.query(CLO).filter(CLO.course_id == course_id).delete()
            new_db.commit()

            raw_clos = analysis_result.get("clos", [])
            created_clos = []

            for idx, clo_item in enumerate(raw_clos):
                new_clo = CLO(
                    course_id=course_id,
                    clo_code=clo_item.get("clo_code", f"CLO{idx + 1}"),
                    description=clo_item.get("description", ""),
                    bloom_level=clo_item.get("bloom_level", 2),
                )
                new_db.add(new_clo)
                new_db.commit()
                new_db.refresh(new_clo)
                created_clos.append(new_clo)

                # Gửi từng CLO vừa lưu xong về client
                yield send(
                    "clo",
                    {
                        "index": idx + 1,
                        "total": len(raw_clos),
                        "clo": {
                            "id": new_clo.id,
                            "course_id": new_clo.course_id,
                            "clo_code": new_clo.clo_code,
                            "description": new_clo.description,
                            "bloom_level": new_clo.bloom_level,
                        },
                    },
                )

            yield send(
                "done",
                {
                    "message": "✅ Đã phân tích và chuẩn hóa CLOs thành công!",
                    "course": {
                        "id": new_course.id,
                        "course_code": new_course.course_code,
                        "course_name": new_course.course_name,
                        "required_textbooks": new_course.required_textbooks,
                        "recommended_readings": new_course.recommended_readings,
                    },
                    "clos": [
                        {
                            "id": c.id,
                            "course_id": c.course_id,
                            "clo_code": c.clo_code,
                            "description": c.description,
                            "bloom_level": c.bloom_level,
                        }
                        for c in created_clos
                    ],
                },
            )

        except Exception as e:
            new_db.rollback()
            yield send("error", {"message": f"Lỗi hệ thống khi phân tích Syllabus: {str(e)}"})
        finally:
            new_db.close()
            # Xóa file tạm
            if os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass

    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# --- API QUẢN LÝ TÀI LIỆU THAM CHIẾU (RAG DOCUMENTS) ---


@router.post("/{course_id}/documents")
def upload_course_document(
    course_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Kiểm tra quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Tạo thư mục tạm lưu file
    temp_dir = "./temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, file.filename)

    try:
        # Lưu file tạm xuống đĩa
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Trích xuất văn bản theo trang
        from src.utils.parser import parse_document

        text_by_pages = []

        _, ext = os.path.splitext(file.filename.lower())
        if ext == ".pdf":
            import pdfplumber

            with pdfplumber.open(temp_file_path) as pdf:
                for page in pdf.pages:
                    text_by_pages.append(page.extract_text() or "")
        else:
            # Với Word hoặc Txt, parse toàn bộ và gán cho trang 1
            text_content = parse_document(temp_file_path)
            text_by_pages = [text_content]

        if not text_by_pages or all(not t.strip() for t in text_by_pages):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể đọc nội dung văn bản từ tài liệu tải lên."
            )

        # 4. Nạp các chunks vào ChromaDB
        from src.database.vector_db import add_document_vector

        add_document_vector(file.filename, text_by_pages, user_id=current_user.id, course_id=course_id)

        return {
            "message": f"Tải lên và nạp tài liệu RAG '{file.filename}' thành công.",
            "file_name": file.filename,
            "total_pages": len(text_by_pages),
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi tải tài liệu lên RAG: {str(e)}"
        )
    finally:
        # Xóa file tạm
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


@router.get("/{course_id}/documents")
def get_course_documents(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Kiểm tra quyền môn học trước
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.database.vector_db import collection

    try:
        # Lấy metadatas của các vector thuộc môn học và user này để lọc ra file_name độc nhất
        data = collection.get(
            where={"$and": [{"user_id": {"$eq": current_user.id}}, {"course_id": {"$eq": course_id}}]},
            include=["metadatas"],
        )

        file_names = set()
        if data and data["metadatas"]:
            for meta in data["metadatas"]:
                if "file_name" in meta:
                    file_names.add(meta["file_name"])

        return {"documents": list(file_names)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi lấy danh sách tài liệu: {str(e)}"
        )


@router.delete("/{course_id}/documents/{file_name}")
def delete_course_document(
    course_id: int, file_name: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.database.vector_db import collection

    try:
        # Xóa các vector của file này khỏi ChromaDB
        collection.delete(
            where={
                "$and": [
                    {"user_id": {"$eq": current_user.id}},
                    {"course_id": {"$eq": course_id}},
                    {"file_name": {"$eq": file_name}},
                ]
            }
        )
        return {"message": f"Đã xóa thành công tài liệu '{file_name}' khỏi RAG."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi xóa tài liệu RAG: {str(e)}"
        )


@router.get("/{course_id}/documents/{file_name}")
def get_course_document_content(
    course_id: int, file_name: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.database.vector_db import collection

    try:
        # Lấy tất cả các vector của file_name thuộc môn học này
        data = collection.get(
            where={
                "$and": [
                    {"user_id": {"$eq": current_user.id}},
                    {"course_id": {"$eq": course_id}},
                    {"file_name": {"$eq": file_name}},
                ]
            },
            include=["documents", "metadatas"],
        )

        if not data or not data["documents"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại hoặc không chứa nội dung."
            )

        chunks_with_meta = []
        for i in range(len(data["documents"])):
            chunks_with_meta.append({"text": data["documents"][i], "page": data["metadatas"][i].get("page_number", 1)})

        chunks_with_meta.sort(key=lambda x: x["page"])
        full_text = "\n\n".join([f"--- [Trang {c['page']}] ---\n{c['text']}" for c in chunks_with_meta])

        return {"file_name": file_name, "content": full_text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi tải nội dung tài liệu: {str(e)}"
        )
