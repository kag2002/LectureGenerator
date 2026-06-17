"""
Tests for /api/courses/{id}/chapters (Outline) endpoints.
Covers CRUD, AI outline generation (mocked LLM), and reorder.
"""

import pytest
from unittest.mock import patch


# ═══════════════════════════════════════════════════════════════════════════
# CHAPTER CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_chapters_empty(client, auth_headers, test_course):
    resp = await client.get(
        f"/api/courses/{test_course.id}/chapters", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_chapter(client, auth_headers, test_course):
    resp = await client.post(
        f"/api/courses/{test_course.id}/chapters",
        json={
            "title": "Chapter 1: Intro",
            "description": "Introduction to the course",
            "sort_order": 1,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Chapter 1: Intro"
    assert data["sort_order"] == 1


@pytest.mark.asyncio
async def test_get_chapters_with_data(client, auth_headers, test_chapter):
    resp = await client.get(
        f"/api/courses/{test_chapter.course_id}/chapters", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_create_chapter_course_not_found(client, auth_headers):
    resp = await client.post(
        "/api/courses/99999/chapters",
        json={"title": "X", "description": "Y", "sort_order": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_chapter(client, auth_headers, test_chapter):
    resp = await client.put(
        f"/api/courses/chapters/{test_chapter.id}",
        json={
            "title": "Updated Title",
            "description": "Updated desc",
            "sort_order": 2,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


@pytest.mark.asyncio
async def test_update_chapter_not_found(client, auth_headers):
    resp = await client.put(
        "/api/courses/chapters/99999",
        json={"title": "X", "description": "Y", "sort_order": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_chapter(client, auth_headers, test_chapter):
    resp = await client.delete(
        f"/api/courses/chapters/{test_chapter.id}", headers=auth_headers
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_chapter_not_found(client, auth_headers):
    resp = await client.delete(
        "/api/courses/chapters/99999", headers=auth_headers
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# AI GENERATE OUTLINE (mocked LLM)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_generate_outline_success(client, auth_headers, test_course, test_clo):
    """AI outline generation with mocked LLM returns chapters."""
    mock_chapters = {
        "chapters": [
            {"title": "Chapter 1: Basics", "description": "Fundamentals"},
            {"title": "Chapter 2: Advanced", "description": "Complex topics"},
        ]
    }
    with patch("src.api.outline.call_llm_json", return_value=mock_chapters):
        with patch("src.api.outline.langfuse", None):
            resp = await client.post(
                f"/api/courses/{test_course.id}/generate-outline",
                headers=auth_headers,
            )
    assert resp.status_code == 200
    data = resp.json()
    assert "chapters" in data
    assert len(data["chapters"]) == 2
    assert data["chapters"][0]["title"] == "Chapter 1: Basics"


@pytest.mark.asyncio
async def test_generate_outline_no_clos(client, auth_headers, test_course):
    """Outline generation without CLOs returns 400."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/generate-outline",
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "CLO" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_generate_outline_course_not_found(client, auth_headers):
    resp = await client.post(
        "/api/courses/99999/generate-outline", headers=auth_headers
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# CHAPTER REORDER
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_reorder_chapters(client, auth_headers, db, test_course):
    """Reordering chapters updates sort_order correctly."""
    from src.database.models import Chapter

    ch1 = Chapter(course_id=test_course.id, sort_order=1, title="Ch1")
    ch2 = Chapter(course_id=test_course.id, sort_order=2, title="Ch2")
    db.add_all([ch1, ch2])
    db.commit()
    db.refresh(ch1)
    db.refresh(ch2)

    resp = await client.patch(
        f"/api/courses/{test_course.id}/chapters/reorder",
        json={
            "chapters": [
                {"id": ch1.id, "sort_order": 2},
                {"id": ch2.id, "sort_order": 1},
            ]
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_reorder_chapters_course_not_found(client, auth_headers):
    resp = await client.patch(
        "/api/courses/99999/chapters/reorder",
        json={"chapters": []},
        headers=auth_headers,
    )
    assert resp.status_code == 404
