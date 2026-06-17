"""
Tests for Course Learning Outcomes (CLO) management endpoints.
Covers creating, retrieving, updating, and deleting CLOs.
"""

import pytest


@pytest.mark.asyncio
async def test_get_course_clos_empty(client, auth_headers, test_course):
    """Happy path: get CLOs for a course (should be empty initially)."""
    resp = await client.get(f"/api/courses/{test_course.id}/clos", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_clo(client, auth_headers, test_course):
    """Happy path: create and link a CLO to a course."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/clos",
        json={
            "clo_code": "CLO-1",
            "description": "Demonstrate understanding of memory layouts.",
            "bloom_level": 2,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["clo_code"] == "CLO-1"
    assert data["bloom_level"] == 2
    assert data["course_id"] == test_course.id


@pytest.mark.asyncio
async def test_get_course_clos_with_data(client, auth_headers, test_course, test_clo):
    """Happy path: get CLOs when data is pre-seeded."""
    resp = await client.get(f"/api/courses/{test_course.id}/clos", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["clo_code"] == test_clo.clo_code


@pytest.mark.asyncio
async def test_update_clo(client, auth_headers, test_clo):
    """Happy path: update an existing CLO."""
    resp = await client.put(
        f"/api/courses/clos/{test_clo.id}",
        json={
            "clo_code": "CLO-1-UPDATED",
            "description": "Master memory layouts.",
            "bloom_level": 4,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["clo_code"] == "CLO-1-UPDATED"
    assert data["bloom_level"] == 4


@pytest.mark.asyncio
async def test_delete_clo(client, auth_headers, test_clo):
    """Happy path: delete a CLO."""
    resp = await client.delete(f"/api/courses/clos/{test_clo.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert "thành công" in resp.json()["message"] or "success" in resp.json()["message"].lower()

    # Verify deleted CLO is not returned in course CLO list
    resp_list = await client.get(f"/api/courses/{test_clo.course_id}/clos", headers=auth_headers)
    assert len(resp_list.json()) == 0


@pytest.mark.asyncio
async def test_create_clo_invalid_bloom_level(client, auth_headers, test_course):
    """Failure path: validation error when bloom level is out of bounds (1-6)."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/clos",
        json={
            "clo_code": "CLO-BAD",
            "description": "Invalid bloom level.",
            "bloom_level": 7,  # Invalid level (must be between 1 and 6)
        },
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_clo_course_not_found(client, auth_headers):
    """Failure path: create CLO for a non-existent course ID (404)."""
    resp = await client.post(
        "/api/courses/99999/clos",
        json={
            "clo_code": "CLO-GHOST",
            "description": "Ghost course",
            "bloom_level": 1,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 404
