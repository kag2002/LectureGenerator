import io

# Set TESTING to 1 to bypass actual sentence-transformers loading in vector_db if imported
import os
from unittest.mock import patch

import pytest

os.environ["TESTING"] = "1"


@pytest.mark.asyncio
async def test_syllabus_parser_route(client, auth_headers, test_course, db):
    """
    Test the syllabus parser route by uploading a mock file using BytesIO.
    Mocks the parsing function and syllabus analyser to return fake text and structured data.
    """
    course_id = test_course.id

    # Mock file content using BytesIO
    file_content = b"%PDF-1.4 mock pdf syllabus content"
    file_stream = io.BytesIO(file_content)
    files = {"file": ("syllabus.pdf", file_stream, "application/pdf")}

    mock_parsed_text = "Môn học: COMP2010 - Cấu trúc dữ liệu và giải thuật. CLO1: Giải thích cây BST."
    mock_analysis_result = {
        "course_code": "COMP2010",
        "course_name": "Cấu trúc dữ liệu và giải thuật",
        "clos": [
            {
                "clo_code": "CLO1",
                "description": "Giải thích cây BST.",
                "bloom_level": 2
            }
        ],
        "required_textbooks": ["Giáo trình Cấu trúc dữ liệu và giải thuật"],
        "recommended_readings": ["Tài liệu tham khảo thêm"]
    }

    # Patch parse_document (the extraction engine) and analyse_syllabus
    with patch("src.utils.parser.parse_document", return_value=mock_parsed_text) as mock_parser, \
         patch("src.services.syllabus_analyser.analyse_syllabus", return_value=mock_analysis_result) as mock_analyser:

        response = await client.post(
            f"/api/courses/{course_id}/parse-syllabus",
            files=files,
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "Phân tích Syllabus thành công" in data["message"]
        assert data["course"]["course_code"] == "COMP2010"
        assert data["course"]["course_name"] == "Cấu trúc dữ liệu và giải thuật"
        assert len(data["clos"]) == 1
        assert data["clos"][0]["clo_code"] == "CLO1"

        # Verify patches were called
        mock_parser.assert_called_once()
        mock_analyser.assert_called_once_with(mock_parsed_text)


@pytest.mark.asyncio
async def test_web_search_ingest_route(client, auth_headers, test_course, db):
    """
    Test the web search tool router by stubbing the search component to return a fixed list of mock URLs
    and completely mocking ChromaDB operations.
    """
    course_id = test_course.id
    payload = {
        "query": "avl trees",
        "max_results": 1,
        "threshold": 0.5,
        "chapter_id": 1
    }

    mock_search_results = [
        {
            "title": "Cây nhị phân AVL tự cân bằng",
            "url": "https://vinuni.edu.vn/courses/avl-tree.pdf",
            "content": "Bài giảng về cây AVL. ieee.org doi:10.1109/avl-tree lecture notes."
        }
    ]

    # Patch web_search_tavily, add_document_vector, and ChromaDB collection methods to prevent real operations
    with patch("src.services.web_search_agent.web_search_tavily", return_value=mock_search_results) as mock_search, \
         patch("src.services.web_search_agent.add_document_vector") as mock_add_vector, \
         patch("src.database.vector_db.collection"):

        response = await client.post(
            f"/api/courses/{course_id}/web-search-ingest",
            json=payload,
            headers=auth_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "Khao sat hoan tat" in data["message"]
        assert len(data["ingested"]) == 1
        assert data["ingested"][0]["url"] == "https://vinuni.edu.vn/courses/avl-tree.pdf"
        assert len(data["rejected"]) == 0

        # Verify patches were called
        mock_search.assert_called_once_with("avl-trees" if "avl-trees" in mock_search.call_args[0][0] else "avl trees", max_results=1)
        mock_add_vector.assert_called_once()


@pytest.mark.asyncio
async def test_generate_syllabus_stream(client, auth_headers, test_course, db):
    """
    Test the generate syllabus stream route by verifying the streaming response.
    Mocks the async LLM stream generator function.
    """
    course_id = test_course.id
    payload = {
        "course_name": "Nhập môn Lập trình Web",
        "course_code": "COMP2040",
        "course_description": "Học về HTML, CSS, JS",
        "audience": "Undergraduate",
        "duration_weeks": 15,
        "learning_outcomes_focus": "Lập trình frontend và backend",
        "language": "vi"
    }

    async def mock_async_generator(*args, **kwargs):
        yield "Dòng 1: Đề cương môn học"
        yield "\n"
        yield "Dòng 2: Nội dung chi tiết"

    # Patch async_call_llm_stream in src.api.courses
    with patch("src.api.courses.async_call_llm_stream", side_effect=mock_async_generator) as mock_stream:
        response = await client.post(
            f"/api/courses/{course_id}/generate-syllabus-stream",
            json=payload,
            headers=auth_headers
        )

        assert response.status_code == 200
        # Read the streamed body
        text = response.text
        assert "Dòng 1: Đề cương môn học" in text
        assert "Dòng 2: Nội dung chi tiết" in text
        mock_stream.assert_called_once()

