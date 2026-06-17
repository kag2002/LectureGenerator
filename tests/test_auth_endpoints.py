"""
Tests for /api/auth endpoints: registration, login, and validation.
"""

import pytest
from src.auth import get_password_hash, verify_password


def test_password_hashing():
    """Test utility password hashing and verification."""
    password = "SuperSecurePassword123!"
    hashed = get_password_hash(password)
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


@pytest.mark.asyncio
async def test_register_success(client):
    """Happy path: register a new user successfully."""
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": "test_register@vinuni.edu.vn",
            "password": "SecurePassword123!",
            "full_name": "Test Lecturer",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test_register@vinuni.edu.vn"
    assert data["user"]["full_name"] == "Test Lecturer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client, test_user):
    """Failure path: register an email that already exists (400)."""
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": test_user.email,
            "password": "AnotherPassword123!",
            "full_name": "Another Name",
        },
    )
    assert resp.status_code == 400
    assert "Email" in resp.json()["detail"] or "tồn tại" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_register_validation_error(client):
    """Failure path: missing required fields (422)."""
    # Missing password
    resp = await client.post(
        "/api/auth/register",
        json={
            "email": "invalid_val@vinuni.edu.vn",
            "full_name": "No Password",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client, test_user):
    """Happy path: login with correct credentials."""
    from tests.conftest import TEST_USER_EMAIL, TEST_USER_PASSWORD

    resp = await client.post(
        "/api/auth/login",
        json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == TEST_USER_EMAIL


@pytest.mark.asyncio
async def test_login_wrong_credentials(client, test_user):
    """Failure path: login with incorrect password (401)."""
    from tests.conftest import TEST_USER_EMAIL

    resp = await client.post(
        "/api/auth/login",
        json={
            "email": TEST_USER_EMAIL,
            "password": "WrongPassword123!",
        },
    )
    assert resp.status_code == 401
    assert "chính xác" in resp.json()["detail"] or "incorrect" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_validation_error(client):
    """Failure path: invalid/missing fields for login (422)."""
    resp = await client.post(
        "/api/auth/login",
        json={
            "email": "not-an-email",
        },
    )
    assert resp.status_code == 422
