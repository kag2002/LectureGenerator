"""
Tests for /api/auth endpoints: register, login, login-form.
Covers happy-path, validation errors, duplicate-email, and wrong-password cases.
"""

import pytest

# ── Register ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_register_success(client):
    """Register a new user and receive a valid JWT token."""
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": "new_user@vinuni.edu.vn",
            "password": "StrongPass1!",
            "full_name": "Dr. Test",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "new_user@vinuni.edu.vn"
    assert data["user"]["full_name"] == "Dr. Test"


@pytest.mark.asyncio
async def test_register_duplicate_email(client, test_user):
    """Registering with an already-used email returns 400."""
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": test_user.email,
            "password": "AnotherPass1!",
            "full_name": "Duplicate",
        },
    )
    assert resp.status_code == 400
    assert "Email" in resp.json()["detail"] or "đã tồn tại" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_register_invalid_email(client):
    """Registering with an invalid email format returns 422."""
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": "not-an-email",
            "password": "Pass1!",
            "full_name": "Bad Email",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_missing_fields(client):
    """Registering with missing required fields returns 422."""
    resp = await client.post("/api/auth/register", json={"email": "a@b.com"})
    assert resp.status_code == 422


# ── Login (JSON) ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success(client, test_user):
    """Login with correct credentials returns a JWT token."""
    from tests.conftest import TEST_USER_EMAIL, TEST_USER_PASSWORD

    resp = await client.post(
        "/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == TEST_USER_EMAIL


@pytest.mark.asyncio
async def test_login_wrong_password(client, test_user):
    """Login with wrong password returns 401."""
    from tests.conftest import TEST_USER_EMAIL

    resp = await client.post(
        "/api/auth/login",
        json={"email": TEST_USER_EMAIL, "password": "WrongPassword!"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    """Login with a non-existent email returns 401."""
    resp = await client.post(
        "/api/auth/login",
        json={"email": "ghost@vinuni.edu.vn", "password": "Whatever1!"},
    )
    assert resp.status_code == 401


# ── Login (Form URL-encoded) ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_form_success(client, test_user):
    """Form-based login (for Swagger UI) works."""
    from tests.conftest import TEST_USER_EMAIL, TEST_USER_PASSWORD

    resp = await client.post(
        "/api/auth/login-form",
        data={"username": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_form_wrong_password(client, test_user):
    """Form-based login with wrong password returns 401."""
    from tests.conftest import TEST_USER_EMAIL

    resp = await client.post(
        "/api/auth/login-form",
        data={"username": TEST_USER_EMAIL, "password": "Wrong!"},
    )
    assert resp.status_code == 401
