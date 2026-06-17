"""
Tests for /api/courses/{id}/export-* endpoints.
Covers materials export (Markdown), questions export (Markdown),
and lesson plan export (HTML).
"""

import pytest
from unittest.mock import patch


# ═══════════════════════════════════════════════════════════════════════════
# EXPORT MATERIALS (Markdown)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_export_materials_success(
    client, auth_headers, test_course, test_chapter, test_material
):
    resp = await client.get(
        f"/api/courses/{test_course.id}/export-materials", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    assert "DATA STRUCTURES" in body.upper() or "ALGORITHMS" in body.upper()
    assert "CHƯƠNG 1" in body.upper() or "SLIDE" in body.upper()


@pytest.mark.asyncio
async def test_export_materials_empty_course(client, auth_headers, test_course):
    """Exporting a course with no chapters still returns valid content."""
    resp = await client.get(
        f"/api/courses/{test_course.id}/export-materials", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "chưa có" in resp.text.lower() or "chương" in resp.text.lower()


@pytest.mark.asyncio
async def test_export_materials_course_not_found(client, auth_headers):
    resp = await client.get("/api/courses/99999/export-materials", headers=auth_headers)
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# EXPORT QUESTIONS (Markdown)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_export_questions_success(
    client, auth_headers, test_course, test_question
):
    resp = await client.get(
        f"/api/courses/{test_course.id}/export-questions", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    # Should contain question text and answer section
    assert "BST" in body or "time complexity" in body
    assert "ĐÁP ÁN" in body.upper() or "ANSWER" in body.upper() or "Câu" in body


@pytest.mark.asyncio
async def test_export_questions_empty(client, auth_headers, test_course):
    """Exporting questions from a course with no questions."""
    resp = await client.get(
        f"/api/courses/{test_course.id}/export-questions", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "chưa" in resp.text.lower() or "0 câu" in resp.text.lower() or "0 câu" in resp.text


@pytest.mark.asyncio
async def test_export_questions_course_not_found(client, auth_headers):
    resp = await client.get("/api/courses/99999/export-questions", headers=auth_headers)
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# EXPORT LESSON PLAN (HTML)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_export_lesson_plan_success(
    client, auth_headers, test_chapter, test_material
):
    resp = await client.get(
        f"/api/courses/chapters/{test_chapter.id}/export-lesson-plan",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    body = resp.text
    assert "GIÁO ÁN" in body.upper() or "LESSON PLAN" in body.upper()


@pytest.mark.asyncio
async def test_export_lesson_plan_no_material(client, auth_headers, test_chapter):
    """Lesson plan export when no active learning script exists."""
    resp = await client.get(
        f"/api/courses/chapters/{test_chapter.id}/export-lesson-plan",
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_lesson_plan_chapter_not_found(client, auth_headers):
    resp = await client.get(
        "/api/courses/chapters/99999/export-lesson-plan", headers=auth_headers
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# AUTH REQUIRED
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_export_requires_auth(client, test_course):
    resp = await client.get(f"/api/courses/{test_course.id}/export-materials")
    assert resp.status_code == 401
