import os

import pdfplumber

from src.database.models import RAGDocument
from src.database.session import SessionLocal
from src.database.vector_db import add_document_vector
from src.utils.parser import parse_document


def process_document_background(
    temp_file_path: str,
    file_name: str,
    user_id: int,
    course_id: int,
    category: str | None,
    tags: str | None,
    chapter_id: int | None,
    document_id: int,
) -> None:
    """
    Background worker function that parses a document (PDF, DOCX, TXT)
    and loads its page chunks into ChromaDB and SQLite.
    """
    db = SessionLocal()
    try:
        text_by_pages = []
        _, ext = os.path.splitext(file_name.lower())
        if ext == ".pdf":
            with pdfplumber.open(temp_file_path) as pdf:
                for page in pdf.pages:
                    text_by_pages.append(page.extract_text() or "")
        else:
            text_content = parse_document(temp_file_path)
            text_by_pages = [text_content]

        if not text_by_pages or all(not t.strip() for t in text_by_pages):
            raise ValueError(
                "Tài liệu không chứa nội dung văn bản hợp lệ (Có thể là ảnh quét hoặc tài liệu rỗng). Vui lòng chuyển đổi OCR trước."
            )

        add_document_vector(
            file_name,
            text_by_pages,
            user_id=user_id,
            course_id=course_id,
            category=category,
            tags=tags,
            chapter_id=chapter_id,
        )

        # Update status to ready
        doc = db.query(RAGDocument).filter(RAGDocument.id == document_id).first()
        if doc:
            doc.status = "ready"
            db.commit()

    except Exception as e:
        print(f"[BACKGROUND ERROR] Loi khi xử lý file {file_name}: {e}")
        doc = db.query(RAGDocument).filter(RAGDocument.id == document_id).first()
        if doc:
            doc.status = "failed"
            doc.error_message = str(e)
            db.commit()
    finally:
        db.close()
        # Xóa file tạm
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
