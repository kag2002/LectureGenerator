import pytest

from src.auth import get_current_user
from src.database.models import User
from src.main import app

mock_admin = User(email="admin@test.com", full_name="Admin User", role="admin")
mock_user = User(email="user@test.com", full_name="Regular User", role="user")

@pytest.mark.asyncio
async def test_receive_telemetry_events_anonymous(client):
    # Gửi telemetry ẩn danh thành công (202)
    payload = {
        "events": [
            {
                "course_id": 1,
                "event_type": "click",
                "element_id": "btn-test",
                "payload": {"browser": "pytest", "screen": "1024x768"}
            }
        ]
    }
    response = await client.post("/api/telemetry/events", json=payload)
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "accepted"
    assert data["count"] == 1

@pytest.mark.asyncio
async def test_submit_ai_feedback_anonymous(client):
    # Gửi feedback thành công (202)
    payload = {
        "course_id": 1,
        "chapter_id": 2,
        "prompt": "Hãy giải thích cây BST.",
        "proposed_content": "# Cây BST\n* Định nghĩa...",
        "edited_content": "# Cây BST\n* Định nghĩa chính xác...",
        "rating": 5,
        "feedback": "AI tạo rất tốt!"
    }
    response = await client.post("/api/telemetry/feedback", json=payload)
    assert response.status_code == 202
    assert response.json()["status"] == "accepted"

@pytest.mark.asyncio
async def test_export_finetune_dataset_security(client):
    # Không thể xuất dữ liệu nếu không có quyền admin
    def override_get_current_user():
        return mock_user

    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        response = await client.get("/api/telemetry/admin/analytics/finetune-dataset")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_export_finetune_dataset_success(client):
    # Xuất thành công khi đăng nhập là admin
    def override_get_current_user():
        return mock_admin

    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        response = await client.get("/api/telemetry/admin/analytics/finetune-dataset")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "total_records" in data
        assert "data" in data
    finally:
        app.dependency_overrides.clear()
