import json
import logging
from typing import Any

from src.agents.nodes.helpers import TOOL_FRIENDLY_NAMES
from src.agents.state import AgentState
from src.services.chatbot_tools import execute_chatbot_tool
from src.utils.llm_client import langfuse

logger = logging.getLogger(__name__)

async def execute_tools_node(state: AgentState) -> dict[str, Any]:
    db = state["db"]
    on_event = state.get("on_event")
    tool_calls = state.get("tool_calls", [])
    course_id = state["course_id"]
    user_id = state["user_id"]
    user_message_id = state.get("user_message_id")
    r_idx = state.get("current_round", 1)

    trace_id = state.get("trace_id")
    trace = None
    if trace_id and langfuse:
        try:
            trace = langfuse.trace(id=trace_id)
        except Exception:
            pass

    if on_event:
        tc_names = [item["name"] for item in tool_calls]
        tc_friendly = [TOOL_FRIENDLY_NAMES.get(n, n) for n in tc_names]
        await on_event(
            "stage", {"stage": 2, "message": f"🛠️ Đang truy xuất thông tin từ hệ thống: {', '.join(tc_friendly)}"}
        )
        await on_event("tool_call", {"round": r_idx, "tool_calls": tool_calls})

    tool_results = []
    assistant_msg_content = "Đang thực hiện truy vấn cơ sở dữ liệu để tìm câu trả lời chính xác nhất..."
    status = "calling_tools"
    final_text = ""

    for tc in tool_calls:
        tc_name = tc["name"]
        tc_args = tc["args"]

        tool_span = None
        if trace:
            try:
                tool_span = trace.span(name=f"tool-{tc_name}", input=tc_args)
            except Exception:
                pass

        try:
            tool_res = await execute_chatbot_tool(
                tc_name, tc_args, course_id, user_id, db, chat_message_id=user_message_id
            )
        except Exception as tool_err:
            logger.error(f"[CHATBOT AGENT TOOL ERROR] Failed to execute tool {tc_name}: {tool_err}")
            tool_res = {
                "error": "failed",
                "message": f"Lỗi hệ thống khi thực thi công cụ {tc_name}: {str(tool_err)}",
            }

        if tool_span:
            try:
                tool_span.end(output=tool_res)
            except Exception:
                pass

        tool_results.append({"tool": tc_name, "args": tc_args, "result": tool_res})

        if tc_name == "clarify":
            status = "waiting_for_user"
            final_text = tc_args.get("question", "Thầy/Cô vui lòng làm rõ ý định soạn bài tập.")
            break

    if on_event:
        await on_event("stage", {"stage": 3, "message": "🔍 Nhận kết quả truy vấn và tiếp tục phân tích..."})
        await on_event("tool_result", {"round": r_idx, "tool_results": tool_results})

    # Lấy rounds hiện tại và cập nhật round_record cuối cùng với kết quả của công cụ
    current_rounds = list(state.get("rounds", []))
    if current_rounds:
        current_rounds[-1]["tool_results"] = tool_results

    # Cập nhật lịch sử làm việc cho vòng sau
    new_messages = []
    if status != "waiting_for_user":
        new_messages.append({"role": "assistant", "content": assistant_msg_content})
        tool_results_content = "KẾT QUẢ THỰC THI CÔNG CỤ:\n" + json.dumps(tool_results, ensure_ascii=False)
        new_messages.append({"role": "user", "content": tool_results_content})

    return {
        "status": status,
        "final_text": final_text,
        "tool_results": tool_results,
        "messages": new_messages,
        "rounds": current_rounds,
    }
