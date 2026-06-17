"""
Tests for /api/courses/chapters/{id}/materials endpoints.
Covers GET, PUT (save), DELETE, and AI material generation (mocked).
"""

import pytest
from unittest.mock import patch, MagicMock


# ═══════════════════════════════════════════════════════════════════════════
# MATERIAL CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_get_materials_empty(client, auth_headers, test_chapter):
    """No materials yet — returns empty placeholder."""
    resp = await client.get(
        f"/api/courses/chapters/{test_chapter.id}/materials", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["slide_content"] == ""
    assert data["active_learning_script"] == ""


@pytest.mark.asyncio
async def test_get_materials_with_data(client, auth_headers, test_chapter, test_material):
    resp = await client.get(
        f"/api/courses/chapters/{test_chapter.id}/materials", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "BST" in data["slide_content"]
    assert "Activity" in data["active_learning_script"]


@pytest.mark.asyncio
async def test_get_materials_chapter_not_found(client, auth_headers):
    resp = await client.get(
        "/api/courses/chapters/99999/materials", headers=auth_headers
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_save_materials_create(client, auth_headers, test_chapter):
    """Save materials to a chapter that has no materials yet (creates new)."""
    with patch("src.api.materials.process_markdown_images", side_effect=lambda x: x):
        resp = await client.put(
            f"/api/courses/chapters/{test_chapter.id}/materials",
            json={
                "slide_content": "# New slide\n* Point 1",
                "active_learning_script": "## New Activity",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "New slide" in data["slide_content"]


@pytest.mark.asyncio
async def test_save_materials_update(client, auth_headers, test_chapter, test_material):
    """Save materials to a chapter that already has materials (updates)."""
    with patch("src.api.materials.process_markdown_images", side_effect=lambda x: x):
        resp = await client.put(
            f"/api/courses/chapters/{test_chapter.id}/materials",
            json={
                "slide_content": "# Updated slide",
                "active_learning_script": "## Updated activity",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert "Updated slide" in resp.json()["slide_content"]


@pytest.mark.asyncio
async def test_save_materials_chapter_not_found(client, auth_headers):
    resp = await client.put(
        "/api/courses/chapters/99999/materials",
        json={"slide_content": "X", "active_learning_script": "Y"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_materials(client, auth_headers, test_chapter, test_material):
    resp = await client.delete(
        f"/api/courses/chapters/{test_chapter.id}/materials", headers=auth_headers
    )
    assert resp.status_code == 200

    # Verify it's now empty
    resp2 = await client.get(
        f"/api/courses/chapters/{test_chapter.id}/materials", headers=auth_headers
    )
    assert resp2.json()["slide_content"] == ""


@pytest.mark.asyncio
async def test_delete_materials_chapter_not_found(client, auth_headers):
    resp = await client.delete(
        "/api/courses/chapters/99999/materials", headers=auth_headers
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# AI MATERIAL GENERATION (mocked orchestrator)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_generate_materials_success(client, auth_headers, test_chapter, test_clo):
    """Full material generation pipeline with mocked orchestrator."""

    class MockOrchestrator:
        def __init__(self, **kwargs):
            self.state = {
                "generated_slides": ["# Slide 1\n* Mock content"],
                "active_learning_script": "## Mock Activity",
                "warnings": [],
            }

        def run_storyboard_architect(self, **kwargs):
            return {}

        def run_content_allocator(self, **kwargs):
            return {}

        def run_slide_writer(self, **kwargs):
            return {}

        def run_active_learning_planner(self, **kwargs):
            return {}

        def run_logic_auditor(self, **kwargs):
            return {}

    with patch("src.api.materials.MaterialOrchestrator", MockOrchestrator):
        with patch("src.api.materials.search_rag_isolated", return_value=[]):
            with patch("src.api.materials.deduplicate_rag_hits", return_value=[]):
                with patch("src.api.materials.langfuse", None):
                    with patch("src.api.materials.process_markdown_images", side_effect=lambda x: x):
                        resp = await client.post(
                            f"/api/courses/chapters/{test_chapter.id}/generate-materials",
                            json={
                                "language": "vi",
                                "session_duration": 90,
                                "class_size": 30,
                                "has_wifi": True,
                                "furniture_type": "fixed",
                            },
                            headers=auth_headers,
                        )

    assert resp.status_code == 200
    data = resp.json()
    assert "slide_content" in data
    assert "active_learning_script" in data


@pytest.mark.asyncio
async def test_generate_materials_chapter_not_found(client, auth_headers):
    resp = await client.post(
        "/api/courses/chapters/99999/generate-materials",
        json={"language": "vi", "session_duration": 90},
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# AUTH REQUIRED
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_materials_requires_auth(client, test_chapter):
    resp = await client.get(
        f"/api/courses/chapters/{test_chapter.id}/materials"
    )
    assert resp.status_code == 401
