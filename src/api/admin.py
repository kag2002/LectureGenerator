import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from src.auth import get_current_user
from src.database.models import User, ChatMessage
from src.database.session import get_db, engine
from src.config import get_settings
from src.utils.telemetry import get_system_metrics, get_traffic_summary

router = APIRouter(prefix="/api/admin", tags=["admin"])
settings = get_settings()

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency kiểm tra quyền admin."""
    # Mặc định, nếu chưa có user nào là admin, ta cho phép tài khoản đầu tiên hoặc kiểm tra email / trường role
    if not current_user.role or current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập chức năng quản trị hệ thống."
        )
    return current_user

@router.get("/system/metrics", dependencies=[Depends(require_admin)])
def read_system_metrics():
    """Trả về trạng thái tài nguyên phần cứng hiện tại và kích thước database."""
    try:
        metrics = get_system_metrics(settings.database_url)
        # Bổ sung dữ liệu lịch sử hệ thống 60 phút
        from src.utils.telemetry import system_history
        metrics["system_history"] = list(system_history)
        return metrics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi đọc thông số hệ thống: {str(e)}"
        )

@router.get("/traffic/summary", dependencies=[Depends(require_admin)])
def read_traffic_summary(window_minutes: int = 60):
    """Trả về thống kê lưu lượng truy cập (API requests) trong khoảng thời gian chỉ định."""
    try:
        summary = get_traffic_summary(time_window_minutes=window_minutes)
        return summary
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi tính toán lưu lượng truy cập: {str(e)}"
        )

@router.get("/ai/costs", dependencies=[Depends(require_admin)])
def read_ai_costs(db: Session = Depends(get_db)):
    """Tổng hợp lượng tokens tiêu thụ và chi phí LLM ước tính."""
    try:
        # Query database để lấy thống kê từ bảng chat_messages
        stats = db.query(
            func.count(ChatMessage.id).label("total_messages"),
            func.sum(ChatMessage.prompt_tokens).label("total_prompt_tokens"),
            func.sum(ChatMessage.completion_tokens).label("total_completion_tokens"),
            func.sum(ChatMessage.total_tokens).label("total_total_tokens"),
            func.avg(ChatMessage.latency_ms).label("avg_latency_ms")
        ).filter(ChatMessage.total_tokens > 0).first()
        
        total_messages = stats.total_messages or 0
        prompt_tokens = stats.total_prompt_tokens or 0
        completion_tokens = stats.total_completion_tokens or 0
        total_tokens = stats.total_total_tokens or 0
        avg_latency = round(stats.avg_latency_ms or 0.0, 2)
        
        # Ước tính chi phí (giả lập dựa trên đơn giá trung bình $0.00015/1K tokens của gpt-4o-mini / Gemini)
        estimated_cost_usd = round((total_tokens / 1000) * 0.00015, 6)
        
        # Lấy lịch sử token theo ngày
        daily_stats_query = db.query(
            func.strftime("%Y-%m-%d", ChatMessage.created_at).label("day"),
            func.sum(ChatMessage.total_tokens).label("tokens"),
            func.count(ChatMessage.id).label("msg_count")
        ).group_by("day").order_by("day").all()
        
        daily_usage = [
            {"date": row.day, "tokens": row.tokens or 0, "messages": row.msg_count or 0}
            for row in daily_stats_query
        ]
        
        return {
            "total_messages": total_messages,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "estimated_cost_usd": estimated_cost_usd,
            "avg_latency_ms": avg_latency,
            "daily_usage": daily_usage
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi tính toán chi phí AI: {str(e)}"
        )


@router.post("/alert/simulate", dependencies=[Depends(require_admin)])
def simulate_alert():
    """Gửi cảnh báo giả lập tới Slack và Telegram để kiểm tra tích hợp."""
    from src.utils.alerting import send_slack_alert, send_telegram_alert
    slack_status = send_slack_alert("⚠️ Cảnh báo mô phỏng: Hệ thống kết nối tốt. VinUni Lecture Assistant đang trực tuyến!")
    telegram_status = send_telegram_alert("⚠️ Cảnh báo mô phỏng: Hệ thống kết nối tốt. VinUni Lecture Assistant đang trực tuyến!")
    return {
        "status": "success",
        "slack_sent": slack_status,
        "telegram_sent": telegram_status,
        "message": f"Mô phỏng hoàn tất. Slack: {'Thành công' if slack_status else 'Bỏ qua/Thất bại'}, Telegram: {'Thành công' if telegram_status else 'Bỏ qua/Thất bại'}"
    }


@router.post("/db/optimize", dependencies=[Depends(require_admin)])
def optimize_database():
    """Tối ưu hóa file database SQLite (VACUUM)."""
    db_url = settings.database_url
    if not db_url.startswith("sqlite"):
        return {"status": "skipped", "message": "Chức năng VACUUM chỉ khả dụng với SQLite."}
        
    try:
        # Thực hiện optimize bằng cách chạy lệnh VACUUM
        with engine.begin() as conn:
            conn.execute(text("VACUUM"))
        return {"status": "success", "message": "Đã tối ưu hóa cơ sở dữ liệu SQLite thành công."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi tối ưu hóa cơ sở dữ liệu: {str(e)}"
        )
