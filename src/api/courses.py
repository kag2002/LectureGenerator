import asyncio
import os
import shutil

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import CLO, Course, RAGDocument, User
from src.database.session import get_db
from src.models.schemas import (
    CLOCreate,
    CLOResponse,
    CourseCreate,
    CourseResponse,
    CourseUpdate,
    DocumentMetadataUpdate,
    SearchTestRequest,
)
from src.services.document_service import process_document_background
from src.services.syllabus_service import generate_syllabus_parse_events
from src.utils.parser import safe_parse_bloom_level

router = APIRouter(prefix="/api/courses", tags=["courses"])


# --- API MÔN HỌC (COURSES) ---


@router.get("", response_model=list[CourseResponse])
def get_courses(
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Lấy các môn học thuộc về duy nhất giảng viên hiện tại (Isolation)
    courses = db.query(Course).filter(Course.user_id == current_user.id).offset((page - 1) * limit).limit(limit).all()
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
def get_course_clos(
    course_id: int,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kiểm tra quyền sở hữu môn học trước
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    clos = db.query(CLO).filter(CLO.course_id == course_id).offset((page - 1) * limit).limit(limit).all()
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

    # 1b. Validate định dạng file đề cương
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp '{ext}' không được hỗ trợ. Chỉ chấp nhận file đề cương .pdf, .docx hoặc .txt.",
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
                bloom_level=safe_parse_bloom_level(clo_item.get("bloom_level", 2), 2),
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

    # 1b. Validate định dạng file đề cương
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp '{ext}' không được hỗ trợ. Chỉ chấp nhận file đề cương .pdf, .docx hoặc .txt.",
        )

    # 2. Tạo thư mục tạm lưu file
    temp_dir = "./temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, file.filename)

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return StreamingResponse(
        generate_syllabus_parse_events(temp_file_path=temp_file_path, course_id=course_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- API QUẢN LÝ TÀI LIỆU THAM CHIẾU (RAG DOCUMENTS) ---


@router.post("/{course_id}/documents")
def upload_course_document(
    course_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str | None = None,
    tags: str | None = None,
    chapter_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Kiểm tra quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # Validate file type extension (first line of defense)
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Định dạng tệp không hỗ trợ. Chỉ hỗ trợ .pdf, .docx, .txt."
        )

    # Check file size limit (20MB)
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 20 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Dung lượng tệp vượt quá giới hạn cho phép (Tối đa 20MB)."
        )

    # Validate file content magic bytes (signatures)
    header = file.file.read(4)
    file.file.seek(0)
    if ext == ".pdf" and not header.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp PDF không hợp lệ (Chữ ký định dạng không đúng)."
        )
    elif ext == ".docx" and not header.startswith(b"PK\x03\x04"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp Word (.docx) không hợp lệ (Chữ ký định dạng không đúng).",
        )
    elif ext == ".txt":
        # Check for binary null byte in the first 1KB of content
        sample = file.file.read(1024)
        file.file.seek(0)
        if b"\x00" in sample:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tệp văn bản (.txt) không hợp lệ (Phát hiện dữ liệu nhị phân).",
            )

    # Sanitize file name to prevent path traversal, keeping Unicode/Vietnamese letters
    import re

    filename_clean = os.path.basename(file.filename)
    safe_name = re.sub(r"[^\w\s.-]", "_", filename_clean)
    safe_name = re.sub(r"\s+", " ", safe_name).strip()
    if not safe_name:
        safe_name = "unnamed_file" + ext

    # 2. Tạo thư mục tạm lưu file
    temp_dir = "./temp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{current_user.id}_{course_id}_{safe_name}")

    # Check if the document with same name is currently processing
    existing_doc = (
        db.query(RAGDocument)
        .filter(
            RAGDocument.course_id == course_id,
            RAGDocument.user_id == current_user.id,
            RAGDocument.file_name == safe_name,
        )
        .first()
    )
    if existing_doc and existing_doc.status == "processing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài liệu cùng tên đang được xử lý trong nền. Vui lòng đợi hoàn tất trước khi tải lên lại.",
        )

    try:
        # Lưu file tạm xuống đĩa
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Tạo/Cập nhật bản ghi RAGDocument trong SQLite với status='processing'
        # Xóa bản ghi cũ nếu trùng tên để đồng bộ
        db.query(RAGDocument).filter(
            RAGDocument.course_id == course_id,
            RAGDocument.user_id == current_user.id,
            RAGDocument.file_name == safe_name,
        ).delete()
        db.commit()

        new_doc = RAGDocument(
            user_id=current_user.id,
            course_id=course_id,
            file_name=safe_name,
            category=category or "Textbook",
            tags=tags,
            chapter_id=chapter_id,
            status="processing",
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)

        # 4. Đăng ký background task để xử lý nặng
        background_tasks.add_task(
            process_document_background,
            temp_file_path=temp_file_path,
            file_name=safe_name,
            user_id=current_user.id,
            course_id=course_id,
            category=category,
            tags=tags,
            chapter_id=chapter_id,
            document_id=new_doc.id,
        )

        return {
            "message": f"Tài liệu '{safe_name}' đang được nạp vào Vector DB...",
            "file_name": safe_name,
            "status": "processing",
        }

    except HTTPException:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        raise
    except Exception as e:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi tải tài liệu lên RAG: {str(e)}"
        )


@router.get("/{course_id}/documents/{file_name}/progress")
async def get_document_progress(
    course_id: int, file_name: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Theo dõi và stream tiến độ nạp tài liệu vào RAG bằng Server-Sent Events (SSE).
    """
    # Kiểm tra quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    async def progress_generator():
        yield 'event: stage\ndata: {"message": "Đang bắt đầu đọc tài liệu...", "status": "processing"}\n\n'

        for i in range(120):  # Timeout sau 2 phút
            await asyncio.sleep(1.0)

            # Sử dụng session mới để tránh caching đối tượng ORM của SQLAlchemy
            from src.database.session import SessionLocal

            session = SessionLocal()
            try:
                doc = (
                    session.query(RAGDocument)
                    .filter(
                        RAGDocument.course_id == course_id,
                        RAGDocument.user_id == current_user.id,
                        RAGDocument.file_name == file_name,
                    )
                    .first()
                )

                if not doc:
                    yield 'event: error\ndata: {"message": "Tài liệu không tồn tại."}\n\n'
                    break

                if doc.status == "ready":
                    yield 'event: stage\ndata: {"message": "Đã phân tích cấu trúc và băm vector thành công!", "status": "ready"}\n\n'
                    yield 'event: done\ndata: {"status": "ready"}\n\n'
                    break
                elif doc.status == "failed":
                    err_msg = doc.error_message or "Lỗi không xác định khi bóc tách văn bản."
                    yield f'event: error\ndata: {{"message": "{err_msg}"}}\n\n'
                    break
                else:
                    # Stream các micro-copy khác nhau dựa trên thời gian trôi qua để làm UI sinh động
                    if i < 4:
                        msg = "Đang trích xuất nội dung văn bản từ các trang..."
                    elif i < 9:
                        msg = "Đang thực hiện làm sạch dữ liệu nhiễu và loại bỏ References..."
                    else:
                        msg = "Đang băm nhỏ văn bản (sliding window) và lập chỉ mục ChromaDB..."
                    yield f'event: stage\ndata: {{"message": "{msg}", "status": "processing"}}\n\n'
            except Exception as e:
                yield f'event: error\ndata: {{"message": "Lỗi truy xuất trạng thái: {str(e)}"}}\n\n'
                break
            finally:
                session.close()
        else:
            yield 'event: error\ndata: {"message": "Quá thời gian xử lý tài liệu."}\n\n'

    return StreamingResponse(
        progress_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{course_id}/documents")
def get_course_documents(
    course_id: int,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Kiểm tra quyền môn học trước
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    try:
        docs = (
            db.query(RAGDocument)
            .filter(RAGDocument.course_id == course_id, RAGDocument.user_id == current_user.id)
            .offset((page - 1) * limit)
            .limit(limit)
            .all()
        )

        file_names = [d.file_name for d in docs]
        detailed = [
            {
                "file_name": d.file_name,
                "category": d.category or "Textbook",
                "tags": d.tags or "",
                "chapter_id": d.chapter_id,
                "status": d.status,
                "error_message": d.error_message,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in docs
        ]

        return {"documents": file_names, "documents_detailed": detailed}
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

        # Xóa khỏi SQLite
        db.query(RAGDocument).filter(
            RAGDocument.course_id == course_id,
            RAGDocument.user_id == current_user.id,
            RAGDocument.file_name == file_name,
        ).delete()
        db.commit()

        return {"message": f"Đã xóa thành công tài liệu '{file_name}' khỏi RAG."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi xóa tài liệu RAG: {str(e)}"
        )


@router.put("/{course_id}/documents/{file_name}/metadata")
def update_document_metadata(
    course_id: int,
    file_name: str,
    req: DocumentMetadataUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 1. Cập nhật trong SQLite
    doc = (
        db.query(RAGDocument)
        .filter(
            RAGDocument.course_id == course_id,
            RAGDocument.user_id == current_user.id,
            RAGDocument.file_name == file_name,
        )
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài liệu không tồn tại.")

    if req.category is not None:
        doc.category = req.category
    if req.tags is not None:
        doc.tags = req.tags
    if req.chapter_id is not None:
        doc.chapter_id = req.chapter_id if req.chapter_id != 0 else None

    db.commit()

    # 2. Cập nhật metadata của các chunks trong ChromaDB
    from src.database.vector_db import collection

    try:
        data = collection.get(
            where={
                "$and": [
                    {"user_id": {"$eq": current_user.id}},
                    {"course_id": {"$eq": course_id}},
                    {"file_name": {"$eq": file_name}},
                ]
            },
            include=["metadatas"],
        )

        if data and data["ids"]:
            new_metadatas = []
            for meta in data["metadatas"]:
                if req.category is not None:
                    meta["category"] = req.category
                if req.tags is not None:
                    meta["tags"] = req.tags
                if req.chapter_id is not None:
                    if req.chapter_id != 0:
                        meta["chapter_id"] = req.chapter_id
                    else:
                        meta.pop("chapter_id", None)
                new_metadatas.append(meta)

            collection.update(ids=data["ids"], metadatas=new_metadatas)
    except Exception as e:
        print(f"[WARNING] Loi khi dong bo metadata sang ChromaDB: {e}")

    return {"message": "Đã cập nhật metadata tài liệu thành công.", "file_name": file_name}


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


@router.get("/{course_id}/documents/{file_name}/pages/{page_number}/chunk")
def get_chunk_by_page(
    course_id: int,
    file_name: str,
    page_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lấy đoạn văn bản trích dẫn của một trang tài liệu cụ thể trong RAG.
    """
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.database.vector_db import collection

    try:
        data = collection.get(
            where={
                "$and": [
                    {"user_id": {"$eq": current_user.id}},
                    {"course_id": {"$eq": course_id}},
                    {"file_name": {"$eq": file_name}},
                    {"page_number": {"$eq": page_number}},
                ]
            },
            include=["documents", "metadatas"],
        )

        if not data or not data["documents"]:
            return {"text": None}

        # Sort chunks by id or chunk_index if present
        chunks = []
        for i in range(len(data["documents"])):
            chunks.append({"id": data["ids"][i], "text": data["documents"][i]})
        chunks.sort(key=lambda x: x["id"])

        combined_text = "\n\n".join([c["text"] for c in chunks])
        return {"text": combined_text}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi tìm đoạn trích: {str(e)}"
        )


@router.get("/{course_id}/documents/{file_name}/chunks")
def get_course_document_chunks(
    course_id: int,
    file_name: str,
    page: int = 1,
    page_size: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Lấy danh sách các vector chunks phân trang của một tệp tài liệu trong RAG để kiểm tra trực quan.
    """
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.database.vector_db import collection

    try:
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
            return {"chunks": [], "total_chunks": 0, "page": page, "page_size": page_size}

        chunks = []
        for i in range(len(data["documents"])):
            meta = data["metadatas"][i]
            chunks.append(
                {
                    "id": data["ids"][i],
                    "text": data["documents"][i],
                    "page_number": meta.get("page_number", 1),
                    "category": meta.get("category", "Chưa phân loại"),
                    "tags": meta.get("tags", ""),
                    "chapter_id": meta.get("chapter_id", None),
                }
            )

        chunks.sort(key=lambda x: (x["page_number"], x["id"]))

        total = len(chunks)
        start = (page - 1) * page_size
        end = start + page_size
        paginated_chunks = chunks[start:end]

        return {"chunks": paginated_chunks, "total_chunks": total, "page": page, "page_size": page_size}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi tải chunks của tài liệu: {str(e)}"
        )


@router.post("/{course_id}/documents/search-test")
def search_test_rag(
    course_id: int,
    req: SearchTestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Thực hiện truy vấn thử nghiệm RAG trực tiếp trên Vector DB để kiểm tra điểm tương đồng.
    """
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.database.vector_db import search_rag_isolated

    try:
        hits = search_rag_isolated(req.query, user_id=current_user.id, course_id=course_id, top_k=req.top_k)
        return {"results": hits}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi truy vấn thử nghiệm RAG: {str(e)}"
        )
