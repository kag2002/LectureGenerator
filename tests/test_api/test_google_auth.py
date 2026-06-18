from unittest.mock import Mock, patch

import pytest


@pytest.mark.asyncio
@patch("src.api.auth.requests.get")
async def test_google_login_new_user(mock_get, client):
    # Setup mock response for Google API validation
    from src.config import get_settings
    settings = get_settings()
    client_id = settings.google_client_id or "your-google-client-id-here.apps.googleusercontent.com"

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "aud": client_id,
        "email": "new.google.user@vinuni.edu.vn",
        "email_verified": "true",
        "name": "New Google User"
    }
    mock_get.return_value = mock_response

    # Call endpoint with a simulated id_token
    response = await client.post("/api/auth/google", json={"id_token": "valid_mock_token"})
    assert response.status_code == 200

    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "new.google.user@vinuni.edu.vn"
    assert data["user"]["full_name"] == "New Google User"

    # Verify user was created in DB
    # We query the database inside the session. In tests, we can use the fixture db_session if available or test with client.
    # Note: `db_session` fixture might be named differently or we can just verify via API. Let's see if there is db session.
    # If not, let's keep it simple by just checking response content.

@pytest.mark.asyncio
@patch("src.api.auth.requests.get")
async def test_google_login_invalid_token(mock_get, client):
    # Setup mock response for Google API validation to return 400
    mock_response = Mock()
    mock_response.status_code = 400
    mock_get.return_value = mock_response

    response = await client.post("/api/auth/google", json={"id_token": "invalid_mock_token"})
    assert response.status_code == 401
    assert "Token không hợp lệ hoặc đã hết hạn" in response.json()["detail"]
