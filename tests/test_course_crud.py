"""
Tests for /api/courses CRUD endpoints.
Includes verification of ownership isolation (access controls).
"""

import pytest


@pytest.mark.asyncio
async def test_get_courses_empty(client, auth_headers):
    """Happy path: get list of courses (empty initially)."""
    resp = await client.get("/api/courses", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_course(client, auth_headers):
    """Happy path: create a new course."""
    resp = await client.post(
        "/api/courses",
        json={
            "course_code": "CS-101",
            "course_name": "Introduction to Computer Science",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["course_code"] == "CS-101"
    assert data["course_name"] == "Introduction to Computer Science"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_course_detail(client, auth_headers, test_course):
    """Happy path: retrieve detail of an owned course."""
    resp = await client.get(f"/api/courses/{test_course.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == test_course.id
    assert resp.json()["course_code"] == test_course.course_code


@pytest.mark.asyncio
async def test_update_course(client, auth_headers, test_course):
    """Happy path: update an owned course."""
    resp = await client.put(
        f"/api/courses/{test_course.id}",
        json={
            "course_code": "COMP2010-NEW",
            "course_name": "Updated DSA",
            "required_textbooks": "New Textbook",
            "recommended_readings": "New Readings",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["course_code"] == "COMP2010-NEW"
    assert data["required_textbooks"] == "New Textbook"


@pytest.mark.asyncio
async def test_delete_course(client, auth_headers, test_course):
    """Happy path: delete an owned course."""
    resp = await client.delete(f"/api/courses/{test_course.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert "thành công" in resp.json()["message"] or "success" in resp.json()["message"].lower()

    # Verify deleted course returns 404
    resp_get = await client.get(f"/api/courses/{test_course.id}", headers=auth_headers)
    assert resp_get.status_code == 404


@pytest.mark.asyncio
async def test_course_access_unauthorized(client):
    """Failure path: accessing courses without being logged in returns 401."""
    resp = await client.get("/api/courses")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_course_ownership_isolation(client, db, test_course):
    """
    Security check: A user cannot access or modify another user's course.
    Since the API utilizes a strict single-user filter for resource retrieval,
    attempting to access another user's course returns 404 Not Found.
    """
    from src.auth import create_access_token, get_password_hash
    from src.database.models import User

    # Create User B (the attacker)
    user_b = User(
        email="attacker@vinuni.edu.vn",
        password_hash=get_password_hash("AttackerPass1!"),
        full_name="Attacker",
    )
    db.add(user_b)
    db.commit()
    db.refresh(user_b)

    token_b = create_access_token(data={"sub": user_b.email})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B tries to view User A's course -> should be isolated (returns 404)
    resp_get = await client.get(f"/api/courses/{test_course.id}", headers=headers_b)
    assert resp_get.status_code == 404

    # User B tries to update User A's course -> should return 404
    resp_put = await client.put(
        f"/api/courses/{test_course.id}",
        json={
            "course_code": "ATTACKED",
            "course_name": "Hacked Course",
        },
        headers=headers_b,
    )
    assert resp_put.status_code == 404

    # User B tries to delete User A's course -> should return 404
    resp_delete = await client.delete(f"/api/courses/{test_course.id}", headers=headers_b)
    assert resp_delete.status_code == 404
