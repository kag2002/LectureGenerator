import time
import requests
from typing import Dict
from src.config import get_settings
from src.utils.telemetry import get_system_metrics

# In-memory throttle cache: key -> timestamp of last sent alert
# Threshold alerts will throttle to once per 30 minutes per category
THROTTLE_INTERVAL_SEC = 1800
last_alert_time: Dict[str, float] = {}

def send_slack_alert(message: str) -> bool:
    """Gửi cảnh báo tới kênh Slack qua Webhook URL."""
    settings = get_settings()
    if not settings.slack_webhook_url:
        return False
    try:
        payload = {"text": f"🚨 *[SYSTEM ALERT - VinUni AI Assistant]*\n{message}"}
        response = requests.post(settings.slack_webhook_url, json=payload, timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"[ALERTING ERROR] Failed to send Slack alert: {e}")
        return False

def send_telegram_alert(message: str) -> bool:
    """Gửi cảnh báo tới kênh Telegram qua Telegram Bot API."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False
    try:
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        payload = {
            "chat_id": settings.telegram_chat_id,
            "text": f"🚨 <b>[SYSTEM ALERT]</b>\n{message}",
            "parse_mode": "HTML"
        }
        response = requests.post(url, json=payload, timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"[ALERTING ERROR] Failed to send Telegram alert: {e}")
        return False

def check_system_thresholds() -> dict:
    """Đọc cấu hình ngưỡng từ settings, kiểm tra tài nguyên và gửi cảnh báo nếu vượt ngưỡng."""
    settings = get_settings()
    if not settings.enable_alerting:
        return {"status": "disabled", "alerts_sent": []}

    try:
        metrics = get_system_metrics(settings.database_url)
    except Exception as e:
        print(f"[ALERTING ERROR] Failed to gather hardware metrics: {e}")
        return {"status": "error", "detail": str(e)}

    alerts_sent = []
    current_time = time.time()

    # 1. Kiểm tra CPU
    cpu_percent = metrics["cpu"]["percent"]
    cpu_threshold = getattr(settings, "alert_cpu_threshold", 85.0)
    if cpu_percent > cpu_threshold:
        throttle_key = "cpu_alert"
        if current_time - last_alert_time.get(throttle_key, 0) > THROTTLE_INTERVAL_SEC:
            msg = f"⚠️ <b>Cảnh báo Tải CPU quá cao!</b>\n- Sử dụng CPU hiện tại: <b>{cpu_percent}%</b>\n- Ngưỡng giới hạn: <b>{cpu_threshold}%</b>"
            send_slack_alert(msg.replace("<b>", "").replace("</b>", "").replace("🚨 ", ""))
            send_telegram_alert(msg)
            last_alert_time[throttle_key] = current_time
            alerts_sent.append("cpu")

    # 2. Kiểm tra RAM
    ram_percent = metrics["ram"]["percent"]
    ram_threshold = getattr(settings, "alert_ram_threshold", 90.0)
    if ram_percent > ram_threshold:
        throttle_key = "ram_alert"
        if current_time - last_alert_time.get(throttle_key, 0) > THROTTLE_INTERVAL_SEC:
            msg = f"⚠️ <b>Cảnh báo Bộ nhớ RAM sắp hết!</b>\n- Sử dụng RAM hiện tại: <b>{ram_percent}%</b> ({metrics['ram']['used_gb']} GB / {metrics['ram']['total_gb']} GB)\n- Ngưỡng giới hạn: <b>{ram_threshold}%</b>"
            send_slack_alert(msg.replace("<b>", "").replace("</b>", "").replace("🚨 ", ""))
            send_telegram_alert(msg)
            last_alert_time[throttle_key] = current_time
            alerts_sent.append("ram")

    # 3. Kiểm tra kích thước database SQLite (Ngưỡng cảnh báo ví dụ: 500MB)
    db_size = metrics["db"]["size_mb"]
    if db_size > 500.0:
        throttle_key = "db_alert"
        if current_time - last_alert_time.get(throttle_key, 0) > THROTTLE_INTERVAL_SEC:
            msg = f"⚠️ <b>Cảnh báo Cơ sở dữ liệu quá lớn!</b>\n- Dung lượng database hiện tại: <b>{db_size} MB</b>\n- Khuyến nghị: Cần thực hiện lệnh <i>VACUUM</i> tối ưu hóa database để giải phóng dung lượng đĩa ảo."
            send_slack_alert(msg.replace("<b>", "").replace("</b>", "").replace("🚨 ", ""))
            send_telegram_alert(msg)
            last_alert_time[throttle_key] = current_time
            alerts_sent.append("database")

    return {
        "status": "success",
        "metrics": metrics,
        "alerts_sent": alerts_sent
    }
