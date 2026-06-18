from unittest.mock import patch

import pytest

from src.auth import get_current_user
from src.database.models import User
from src.main import app
from src.utils.alerting import check_system_thresholds

mock_admin = User(email="admin@test.com", full_name="Admin User", role="admin")

@pytest.mark.asyncio
async def test_metrics_endpoint(client):
    # Endpoint /metrics phải truy cập công khai và trả về text/plain
    response = await client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")

    # Kiểm tra xem có chứa các dòng định dạng Prometheus thông thường không
    text_content = response.text
    assert "app_cpu_usage_percent" in text_content
    assert "app_memory_usage_percent" in text_content
    assert "app_database_size_mb" in text_content

@pytest.mark.asyncio
async def test_simulate_alert_security(client):
    # Endpoint mô phỏng cảnh báo phải bảo mật
    response = await client.post("/api/admin/alert/simulate")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_simulate_alert_success(client):
    # Admin có quyền trigger cảnh báo mô phỏng
    def override_get_current_user():
        return mock_admin

    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        # Giả lập requests gửi đi webhook thành công
        with patch("requests.post") as mock_post:
            # Giả lập trả về response 200 cho Slack và Telegram
            mock_post.return_value.status_code = 200

            response = await client.post("/api/admin/alert/simulate")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "success"
            assert "slack_sent" in data
            assert "telegram_sent" in data
    finally:
        app.dependency_overrides.clear()

def test_check_system_thresholds_disabled():
    # Khi tắt chế độ cảnh báo, không gửi tin nhắn đi
    with patch("src.utils.alerting.get_settings") as mock_settings:
        mock_settings.return_value.enable_alerting = False
        res = check_system_thresholds()
        assert res["status"] == "disabled"
        assert len(res["alerts_sent"]) == 0

def test_check_system_thresholds_triggered():
    # Giả lập khi các chỉ số tài nguyên phần cứng vượt ngưỡng
    with patch("src.utils.alerting.get_settings") as mock_settings, \
         patch("src.utils.alerting.get_system_metrics") as mock_metrics, \
         patch("src.utils.alerting.send_slack_alert") as mock_slack, \
         patch("src.utils.alerting.send_telegram_alert") as mock_tg:

        mock_settings.return_value.enable_alerting = True
        mock_settings.return_value.alert_cpu_threshold = 80.0
        mock_settings.return_value.alert_ram_threshold = 85.0

        # Giả lập máy chủ quá tải CPU và RAM
        mock_metrics.return_value = {
            "cpu": {"percent": 95.0, "status": "danger"},
            "ram": {"percent": 98.0, "used_gb": 15.6, "total_gb": 16.0, "status": "danger"},
            "disk": {"percent": 50.0, "used_gb": 50, "total_gb": 100, "status": "normal"},
            "db": {"size_mb": 550.0, "type": "SQLite"} # Database quá 500MB
        }

        mock_slack.return_value = True
        mock_tg.return_value = True

        # Reset throttling cache trước khi test
        import src.utils.alerting
        src.utils.alerting.last_alert_time.clear()

        res = check_system_thresholds()
        assert res["status"] == "success"

        # Cả 3 cảnh báo CPU, RAM và Database đều được trigger
        assert "cpu" in res["alerts_sent"]
        assert "ram" in res["alerts_sent"]
        assert "database" in res["alerts_sent"]

        # Kiểm tra xem các hàm gửi đi được gọi đúng không
        assert mock_slack.call_count == 3
        assert mock_tg.call_count == 3
