from typing import Any

from src.agents.state import AgentState
from src.services.chatbot_guardrails import validate_input


async def guardrail_input_node(state: AgentState) -> dict[str, Any]:
    on_event = state.get("on_event")
    if on_event:
        await on_event("stage", {"stage": 1, "message": "🛡️ Bước 1: Đang xác thực độ an toàn của yêu cầu..."})

    input_violations = validate_input(state["user_message"])
    if input_violations:
        block_msg = f"Xin lỗi Thầy/Cô, yêu cầu nằm ngoài phạm vi học thuật/sư phạm hoặc vi phạm chính sách của nhà trường: {input_violations[0]}"
        if on_event:
            await on_event(
                "stage",
                {"stage": 5, "message": "⚠️ Cảnh báo: Câu hỏi không phù hợp với quy chuẩn an toàn của hệ thống."},
            )
        return {
            "status": "blocked",
            "final_text": block_msg,
        }
    return {}
