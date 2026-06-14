import os

import pytest
from httpx import AsyncClient

from src.api.courses import process_document_background
from src.auth import create_access_token
from src.database.models import Course, RAGDocument, User
from src.database.session import SessionLocal

# Thiết lập môi trường testing để sử dụng mock embedding
os.environ["TESTING"] = "1"

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def test_user_token(db_session):
    # Lấy hoặc tạo user test
    user = db_session.query(User).filter(User.email == "test_rag_user@vinuni.edu.vn").first()
    if not user:
        user = User(
            email="test_rag_user@vinuni.edu.vn",
            password_hash="test_password_hash",
            full_name="RAG Tester"
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    # Lấy hoặc tạo môn học test
    course = db_session.query(Course).filter(Course.course_code == "TEST101", Course.user_id == user.id).first()
    if not course:
        course = Course(
            user_id=user.id,
            course_code="TEST101",
            course_name="Introduction to RAG Testing"
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    token = create_access_token({"sub": user.email})
    return {
        "token": token,
        "user_id": user.id,
        "course_id": course.id
    }

@pytest.mark.asyncio
async def test_upload_file_extension(client: AsyncClient, test_user_token):
    # 1. Thử tải lên đuôi file không hỗ trợ (.exe)
    headers = {"Authorization": f"Bearer {test_user_token['token']}"}
    files = {"file": ("malicious.exe", b"binary content", "application/octet-stream")}

    response = await client.post(
        f"/api/courses/{test_user_token['course_id']}/documents",
        files=files,
        headers=headers
    )
    assert response.status_code == 400
    assert "Định dạng tệp không hỗ trợ" in response.json()["detail"]

@pytest.mark.asyncio
async def test_upload_file_size_limit(client: AsyncClient, test_user_token):
    # 2. Thử tải lên file vượt quá giới hạn size (20MB)
    headers = {"Authorization": f"Bearer {test_user_token['token']}"}
    oversized_content = b"x" * (20 * 1024 * 1024 + 100) # > 20MB
    files = {"file": ("large_doc.pdf", oversized_content, "application/pdf")}

    response = await client.post(
        f"/api/courses/{test_user_token['course_id']}/documents",
        files=files,
        headers=headers
    )
    assert response.status_code == 400
    assert "vượt quá giới hạn cho phép" in response.json()["detail"]

@pytest.mark.asyncio
async def test_upload_magic_bytes(client: AsyncClient, test_user_token):
    # 3. Thử tải lên file PDF giả mạo (đuôi .pdf nhưng nội dung không bắt đầu bằng %PDF)
    headers = {"Authorization": f"Bearer {test_user_token['token']}"}
    files = {"file": ("fake.pdf", b"BAD_SIGNATURE_pdf_content", "application/pdf")}

    response = await client.post(
        f"/api/courses/{test_user_token['course_id']}/documents",
        files=files,
        headers=headers
    )
    assert response.status_code == 400
    assert "Chữ ký định dạng không đúng" in response.json()["detail"]

@pytest.mark.asyncio
async def test_upload_concurrency_lock(client: AsyncClient, db_session, test_user_token):
    # Tạo bản ghi RAGDocument mẫu ở trạng thái 'processing'
    doc = RAGDocument(
        user_id=test_user_token["user_id"],
        course_id=test_user_token["course_id"],
        file_name="processing_doc.pdf",
        category="Textbook",
        status="processing"
    )
    db_session.add(doc)
    db_session.commit()

    try:
        # Thử upload file trùng tên khi tệp đang ở trạng thái 'processing'
        headers = {"Authorization": f"Bearer {test_user_token['token']}"}
        files = {"file": ("processing_doc.pdf", b"%PDF-1.4 test upload content", "application/pdf")}

        response = await client.post(
            f"/api/courses/{test_user_token['course_id']}/documents",
            files=files,
            headers=headers
        )
        assert response.status_code == 400
        assert "đang được xử lý trong nền" in response.json()["detail"]

    finally:
        # Dọn dẹp bản ghi test
        db_session.delete(doc)
        db_session.commit()

@pytest.mark.asyncio
async def test_process_document_background_scanned_pdf(db_session, test_user_token):
    # 4. Giả lập tác vụ background xử lý scanned PDF (không trích xuất được text)
    # Tạo bản ghi RAGDocument mẫu ở trạng thái 'processing'
    doc = RAGDocument(
        user_id=test_user_token["user_id"],
        course_id=test_user_token["course_id"],
        file_name="scanned_page.pdf",
        category="Textbook",
        status="processing"
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)

    # Tạo file PDF tạm tối thiểu
    temp_file_path = "./temp_test_scanned.pdf"
    with open(temp_file_path, "wb") as f:
        f.write(b"%PDF-1.4 mock content")

    from unittest.mock import MagicMock, patch
    mock_pdf = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "   " # Empty text to simulate scanned PDF
    mock_pdf.pages = [mock_page]

    try:
        # Gọi trực tiếp hàm xử lý background với patch
        with patch("pdfplumber.open", return_value=mock_pdf):
            process_document_background(
                temp_file_path=temp_file_path,
                file_name="scanned_page.pdf",
                user_id=test_user_token["user_id"],
                course_id=test_user_token["course_id"],
                category="Textbook",
                tags=None,
                chapter_id=None,
                document_id=doc.id
            )

        # Đọc lại bản ghi từ database để kiểm tra trạng thái
        db_session.refresh(doc)
        assert doc.status == "failed"
        assert "Tài liệu không chứa nội dung văn bản hợp lệ" in doc.error_message

    finally:
        # Cleanup
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

        # Xóa bản ghi
        db_session.delete(doc)
        db_session.commit()

@pytest.mark.asyncio
async def test_process_document_background_success(db_session, test_user_token):
    # 5. Giả lập tác vụ background xử lý file thành công
    doc = RAGDocument(
        user_id=test_user_token["user_id"],
        course_id=test_user_token["course_id"],
        file_name="valid_doc.txt",
        category="Textbook",
        status="processing"
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)

    # Tạo file text tạm
    temp_file_path = "./temp_test_valid.txt"
    with open(temp_file_path, "w", encoding="utf-8") as f:
        f.write("Đây là văn bản tài liệu hợp lệ dành cho giảng viên môn Cấu trúc dữ liệu và giải thuật. Hệ thống sẽ băm vector thành công.")

    try:
        # Gọi trực tiếp hàm xử lý background
        process_document_background(
            temp_file_path=temp_file_path,
            file_name="valid_doc.txt",
            user_id=test_user_token["user_id"],
            course_id=test_user_token["course_id"],
            category="Textbook",
            tags="dsa,tree",
            chapter_id=None,
            document_id=doc.id
        )

        # Đọc lại bản ghi từ database để kiểm tra trạng thái
        db_session.refresh(doc)
        assert doc.status == "ready"
        assert doc.error_message is None

    finally:
        # Cleanup
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

        # Xóa bản ghi và các vector liên quan
        db_session.delete(doc)
        db_session.commit()

        # Xóa vector khỏi ChromaDB
        from src.database.vector_db import collection
        try:
            collection.delete(
                where={
                    "$and": [
                        {"user_id": {"$eq": test_user_token["user_id"]}},
                        {"course_id": {"$eq": test_user_token["course_id"]}},
                        {"file_name": {"$eq": "valid_doc.txt"}}
                    ]
                }
            )
        except Exception:
            pass


@pytest.mark.asyncio
async def test_force_ingest_and_web_search_creation(client: AsyncClient, db_session, test_user_token):
    headers = {"Authorization": f"Bearer {test_user_token['token']}"}
    course_id = test_user_token["course_id"]

    # Test force-ingest-url endpoint
    payload = {
        "url": "https://example.com/mock-doc",
        "title": "Mock Academic Document",
        "content": "This is sample academic content for RAG testing.",
        "chapter_id": None
    }

    response = await client.post(
        f"/api/courses/{course_id}/force-ingest-url",
        json=payload,
        headers=headers
    )

    assert response.status_code == 200
    res_data = response.json()
    assert "Manual_" in res_data["file_name"]

    file_name = res_data["file_name"]

    # Check SQLite entry is created and status is ready
    doc = db_session.query(RAGDocument).filter(
        RAGDocument.course_id == course_id,
        RAGDocument.file_name == file_name
    ).first()

    assert doc is not None
    assert doc.status == "ready"
    assert doc.category == "Forced Ingest"

    # Cleanup SQLite
    db_session.delete(doc)
    db_session.commit()

    # Cleanup ChromaDB
    from src.database.vector_db import collection
    try:
        collection.delete(
            where={
                "$and": [
                    {"user_id": {"$eq": test_user_token["user_id"]}},
                    {"course_id": {"$eq": course_id}},
                    {"file_name": {"$eq": file_name}}
                ]
            }
        )
    except Exception:
        pass


@pytest.mark.asyncio
async def test_advanced_rag_features(db_session, test_user_token):
    from src.database.vector_db import add_document_vector, collection, search_rag_isolated

    user_id = test_user_token["user_id"]
    course_id = test_user_token["course_id"]
    file_name = "test_advanced_rag.txt"

    # 3 distinct paragraphs of sufficient length
    text_chunks = [
        "Đây là nội dung của đoạn thứ nhất trong tài liệu cấu trúc dữ liệu giải thuật. AVL và BST là cây tự cân bằng và cây tìm kiếm nhị phân thông dụng.",
        "Đây là nội dung của đoạn thứ hai, nói chi tiết về cách cân bằng cây AVL bằng các phép xoay trái xoay phải để đảm bảo chiều cao.",
        "Đây là nội dung của đoạn thứ ba, mô tả các thao tác tìm kiếm phần tử và duyệt cây nhị phân theo thứ tự trước, thứ tự giữa, thứ tự sau."
    ]

    try:
        # Ingest the test document
        add_document_vector(
            file_name=file_name,
            text_by_pages=text_chunks,
            user_id=user_id,
            course_id=course_id,
            category="Test",
            tags="avl,bst",
            chapter_id=1
        )

        # Query utilizing acronym "avl" to trigger acronym expansion and retrieve sentence window context
        results = search_rag_isolated(
            query="Giải thích cách xoay của cây avl",
            user_id=user_id,
            course_id=course_id,
            top_k=1,
            chapter_id=1
        )

        assert len(results) > 0
        first_result = results[0]
        assert first_result["file_name"] == file_name

        # Verify sentence window contains surrounding chunk text (e.g. content of paragraph 1 or 3)
        # and has merged adjacent context successfully.
        assert "xoay trái xoay phải" in first_result["text"]
        assert "cấu trúc dữ liệu giải thuật" in first_result["text"] or "duyệt cây nhị phân" in first_result["text"]

    finally:
        # Cleanup ChromaDB
        try:
            collection.delete(
                where={
                    "$and": [
                        {"user_id": {"$eq": user_id}},
                        {"course_id": {"$eq": course_id}},
                        {"file_name": {"$eq": file_name}}
                    ]
                }
            )
        except Exception:
            pass

