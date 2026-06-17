from typing import Any
from src.agents.state import AgentState
from src.services.chatbot_guardrails import validate_output

async def guardrail_output_node(state: AgentState) -> dict[str, Any]:
    final_text = state.get("final_text", "")
    status = state.get("status", "answered")

    if status == "blocked" or status == "waiting_for_user":
        return {}

    output_violations = validate_output(final_text)
    if output_violations:
        block_msg = f"Rất tiếc, câu trả lời của trợ lý ảo không đáp ứng tiêu chuẩn chất lượng đầu ra: {output_violations[0]}. Phản hồi đã được rút lại để đảm bảo tính chính xác."
        return {
            "status": "blocked",
            "final_text": block_msg,
        }
    return {}
