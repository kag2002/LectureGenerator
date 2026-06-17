import pytest
from src.main import app
from src.auth import get_current_user
from src.database.models import User

mock_admin = User(email="admin@test.com", full_name="Admin User", role="admin")
mock_user = User(email="user@test.com", full_name="Regular User", role="user")

@pytest.mark.asyncio
async def test_admin_endpoints_unauthorized(client):
    # Không có token sẽ trả về 401
    response = await client.get("/api/admin/system/metrics")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_admin_endpoints_forbidden(client):
    # Đăng nhập nhưng không có quyền admin sẽ trả về 403
    def override_get_current_user():
        return mock_user
        
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        response = await client.get("/api/admin/system/metrics")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_admin_endpoints_success(client):
    # Đăng nhập bằng tài khoản admin sẽ thành công (200)
    def override_get_current_user():
        return mock_admin
        
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        # 1. System metrics
        response = await client.get("/api/admin/system/metrics")
        assert response.status_code == 200
        data = response.json()
        assert "cpu" in data
        assert "ram" in data
        assert "disk" in data
        assert "db" in data
        assert "system_history" in data
        
        # 2. Traffic summary
        response = await client.get("/api/admin/traffic/summary")
        assert response.status_code == 200
        data = response.json()
        assert "total_requests" in data
        assert "average_latency_ms" in data
        assert "p50_latency_ms" in data
        assert "p90_latency_ms" in data
        assert "p99_latency_ms" in data
        
        # 3. AI costs
        response = await client.get("/api/admin/ai/costs")
        assert response.status_code == 200
        data = response.json()
        assert "total_messages" in data
        assert "estimated_cost_usd" in data
        
        # 4. DB optimize
        response = await client.post("/api/admin/db/optimize")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["success", "skipped"]

        # 5. Agent memory list
        response = await client.get("/api/admin/agent/memory")
        assert response.status_code == 200
        memories = response.json()
        assert isinstance(memories, list)

        # 6. Agent memory delete (with dummy ID since it won't crash on delete of non-existent in Chroma)
        response = await client.delete("/api/admin/agent/memory/dummy_id_123")
        assert response.status_code == 200
        assert response.json()["status"] == "success"
    finally:
        app.dependency_overrides.clear()

