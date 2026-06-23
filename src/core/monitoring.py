import asyncio

from src.config import get_settings


async def system_alert_monitoring_loop():
    """Vòng lặp ngầm chạy mỗi 5 phút để kiểm tra tài nguyên và gửi cảnh báo Slack/Telegram."""
    print("[OBSERVABILITY] System Alert Monitoring Loop started.")
    # Chờ 30s sau khi startup để hệ thống ổn định trước khi scan tài nguyên lần đầu
    await asyncio.sleep(30)
    from src.utils.alerting import check_system_thresholds
    while True:
        try:
            check_system_thresholds()
        except Exception as e:
            print(f"[OBSERVABILITY ERROR] Alert check failed: {e}")
        await asyncio.sleep(300) # 5 phút

async def system_snapshot_loop():
    """Vòng lặp ngầm chạy mỗi 60 giây để ghi nhận snapshot tài nguyên hệ thống (timeline)."""
    print("[OBSERVABILITY] System Resource Snapshot Loop started.")
    from src.utils.telemetry import record_system_snapshot
    settings = get_settings()
    while True:
        try:
            record_system_snapshot(settings.database_url)
        except Exception as e:
            print(f"[OBSERVABILITY ERROR] Snapshot capture failed: {e}")
        await asyncio.sleep(60) # 1 phút
