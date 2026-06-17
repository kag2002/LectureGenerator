"""
Tests for the auth utility module (src/auth.py).
Covers password hashing, JWT token creation, and token verification.
"""

import pytest
from src.auth import (
    create_access_token,
    get_password_hash,
    verify_password,
)


class TestPasswordHashing:
    """Tests for bcrypt password hashing and verification."""

    def test_hash_and_verify_correct(self):
        password = "MySecurePass123!"
        hashed = get_password_hash(password)
        assert hashed != password
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        hashed = get_password_hash("CorrectPassword!")
        assert verify_password("WrongPassword!", hashed) is False

    def test_hash_is_unique_per_call(self):
        """bcrypt generates a new salt each time."""
        h1 = get_password_hash("same")
        h2 = get_password_hash("same")
        assert h1 != h2

    def test_verify_invalid_hash_returns_false(self):
        """Should not crash on malformed hash."""
        assert verify_password("test", "not-a-bcrypt-hash") is False

    def test_empty_password(self):
        hashed = get_password_hash("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False


class TestJWTToken:
    """Tests for JWT token creation and decoding."""

    def test_create_and_decode_token(self):
        import jwt
        from src.config import get_settings

        settings = get_settings()
        token = create_access_token(data={"sub": "user@test.com"})

        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"]
        )
        assert payload["sub"] == "user@test.com"
        assert "exp" in payload

    def test_token_contains_expiration(self):
        import jwt
        from src.config import get_settings

        settings = get_settings()
        token = create_access_token(data={"sub": "test"})
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"]
        )
        assert "exp" in payload

    def test_token_with_custom_expiry(self):
        from datetime import timedelta

        import jwt
        from src.config import get_settings

        settings = get_settings()
        token = create_access_token(
            data={"sub": "test"}, expires_delta=timedelta(minutes=5)
        )
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"]
        )
        assert payload["sub"] == "test"

    def test_expired_token_raises(self):
        from datetime import timedelta

        import jwt
        from src.config import get_settings

        settings = get_settings()
        token = create_access_token(
            data={"sub": "test"}, expires_delta=timedelta(seconds=-10)
        )
        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
