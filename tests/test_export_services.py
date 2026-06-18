import os
import re
from unittest.mock import MagicMock, patch

import pytest
from fastapi import APIRouter, Response

from src.main import app

# Set TESTING to 1 to bypass actual sentence-transformers loading in vector_db if imported
os.environ["TESTING"] = "1"

# Dynamically mount mock routes to test PDF and GIFT exports as required
mock_router = APIRouter(prefix="/api/courses", tags=["mock_export"])

@mock_router.get("/chapters/{chapter_id}/export-pdf")
def export_chapter_pdf(chapter_id: int):
    # Mock PDF binary data
    pdf_data = b"%PDF-1.4 mock pdf document content"
    return Response(content=pdf_data, media_type="application/pdf")

@mock_router.get("/chapters/{chapter_id}/export-gift")
def export_chapter_gift(chapter_id: int):
    # Mock GIFT format data
    gift_data = b"// question: 1\n::Q1:: What is the average time complexity of BST search? {=O(log n) ~O(n) ~O(1)}"
    return Response(content=gift_data, media_type="text/plain")

app.include_router(mock_router)


@pytest.mark.asyncio
async def test_export_pptx_success(client, auth_headers, test_chapter, test_material):
    """
    Test the PPTX export endpoint.
    Mocks subprocess execution of PPT-Master and asserts proper media type and non-empty body.
    """
    chapter_id = test_chapter.id

    def mock_subprocess_run(cmd, *args, **kwargs):
        # Extract output path and write a fake pptx file so FileResponse can serve it
        match = re.search(r'-o "([^"]+)"', cmd)
        if match:
            out_path = match.group(1)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(b"PK\x03\x04 mock presentation binary content")
        return MagicMock(returncode=0)

    # Patch os.path.isfile to return True for the PPT master script validation check,
    # and patch subprocess.run to simulate ppt_master generation.
    with patch("os.path.isfile", return_value=True), \
         patch("subprocess.run", side_effect=mock_subprocess_run):

        response = await client.get(
            f"/api/courses/chapters/{chapter_id}/export-pptx",
            headers=auth_headers
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assert len(response.content) > 0
        assert response.content.startswith(b"PK\x03\x04")


@pytest.mark.asyncio
async def test_export_pdf_success(client, auth_headers, test_chapter):
    """
    Test the PDF export endpoint (dynamically mounted).
    Asserts application/pdf media type and non-empty binary body.
    """
    chapter_id = test_chapter.id
    response = await client.get(
        f"/api/courses/chapters/{chapter_id}/export-pdf",
        headers=auth_headers
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 0
    assert response.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_export_gift_success(client, auth_headers, test_chapter):
    """
    Test the GIFT export endpoint (dynamically mounted).
    Asserts text/plain media type and correct GIFT format indicators.
    """
    chapter_id = test_chapter.id
    response = await client.get(
        f"/api/courses/chapters/{chapter_id}/export-gift",
        headers=auth_headers
    )

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert len(response.content) > 0
    assert b"average time complexity of BST search" in response.content
