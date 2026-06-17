"""
Tests for /api/courses endpoints: CRUD operations for courses and CLOs.
Covers happy-path, authorization isolation, and 404 error handling.
"""

import pytest


# ═══════════════════════════════════════════════════════════════════════════
# COURSE CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_course(client, auth_headers):
    resp = await client.post(
        "/api/courses",
        json={"course_code": "CS101", "course_name": "Intro to CS"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["course_code"] == "CS101"
    assert data["course_name"] == "Intro to CS"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_courses_empty(client, auth_headers):
    """No courses yet — should return empty list."""
    # test_user exists but has no courses created via API yet
    resp = await client.get("/api/courses", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_get_courses_with_data(client, auth_headers, test_course):
    resp = await client.get("/api/courses", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(c["course_code"] == "COMP2010" for c in data)


@pytest.mark.asyncio
async def test_get_course_detail(client, auth_headers, test_course):
    resp = await client.get(f"/api/courses/{test_course.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == test_course.id


@pytest.mark.asyncio
async def test_get_course_not_found(client, auth_headers):
    resp = await client.get("/api/courses/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_course(client, auth_headers, test_course):
    resp = await client.put(
        f"/api/courses/{test_course.id}",
        json={
            "course_code": "COMP2010-V2",
            "course_name": "DSA v2",
            "required_textbooks": "Cormen et al.",
            "recommended_readings": "Sedgewick",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["course_code"] == "COMP2010-V2"
    assert data["required_textbooks"] == "Cormen et al."


@pytest.mark.asyncio
async def test_update_course_not_found(client, auth_headers):
    resp = await client.put(
        "/api/courses/99999",
        json={"course_code": "X", "course_name": "Y"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_course(client, auth_headers, test_course):
    resp = await client.delete(f"/api/courses/{test_course.id}", headers=auth_headers)
    assert resp.status_code == 200

    # Verify it's gone
    resp2 = await client.get(f"/api/courses/{test_course.id}", headers=auth_headers)
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_delete_course_not_found(client, auth_headers):
    resp = await client.delete("/api/courses/99999", headers=auth_headers)
    assert resp.status_code == 404


# ── Authorization isolation ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_course_requires_auth(client):
    """Accessing courses without token returns 401."""
    resp = await client.get("/api/courses")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_course_isolation_between_users(client, db, test_course):
    """User B cannot see or modify User A's courses."""
    from src.auth import create_access_token, get_password_hash
    from src.database.models import User

    user_b = User(
        email="other@vinuni.edu.vn",
        password_hash=get_password_hash("OtherPass!"),
        full_name="Dr. Other",
    )
    db.add(user_b)
    db.commit()
    db.refresh(user_b)

    token_b = create_access_token(data={"sub": user_b.email})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B can't see User A's course
    resp = await client.get(f"/api/courses/{test_course.id}", headers=headers_b)
    assert resp.status_code == 404

    # User B's course list is empty
    resp2 = await client.get("/api/courses", headers=headers_b)
    assert resp2.json() == []


# ═══════════════════════════════════════════════════════════════════════════
# CLO CRUD
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_create_clo(client, auth_headers, test_course):
    resp = await client.post(
        f"/api/courses/{test_course.id}/clos",
        json={
            "clo_code": "CLO2",
            "description": "Implement balanced BST operations",
            "bloom_level": 3,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["clo_code"] == "CLO2"
    assert data["bloom_level"] == 3


@pytest.mark.asyncio
async def test_get_course_clos(client, auth_headers, test_course, test_clo):
    resp = await client.get(
        f"/api/courses/{test_course.id}/clos", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["clo_code"] == "CLO1"


@pytest.mark.asyncio
async def test_get_clos_course_not_found(client, auth_headers):
    resp = await client.get("/api/courses/99999/clos", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_clo(client, auth_headers, test_clo):
    resp = await client.put(
        f"/api/courses/clos/{test_clo.id}",
        json={
            "clo_code": "CLO1-v2",
            "description": "Updated description",
            "bloom_level": 4,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["clo_code"] == "CLO1-v2"
    assert resp.json()["bloom_level"] == 4


@pytest.mark.asyncio
async def test_update_clo_not_found(client, auth_headers):
    resp = await client.put(
        "/api/courses/clos/99999",
        json={"clo_code": "X", "description": "Y", "bloom_level": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_clo(client, auth_headers, test_clo):
    resp = await client.delete(
        f"/api/courses/clos/{test_clo.id}", headers=auth_headers
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_clo_not_found(client, auth_headers):
    resp = await client.delete("/api/courses/clos/99999", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_clo_invalid_bloom(client, auth_headers, test_course):
    """Bloom level must be 1-6."""
    resp = await client.post(
        f"/api/courses/{test_course.id}/clos",
        json={"clo_code": "CLO_BAD", "description": "Test", "bloom_level": 9},
        headers=auth_headers,
    )
    assert resp.status_code == 422
