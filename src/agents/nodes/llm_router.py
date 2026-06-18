import json
import logging
import time
from typing import Any
from src.agents.state import AgentState
from src.agents.tools.schemas import CHATBOT_TOOLS
from src.agents.nodes.helpers import get_candidate_models, get_mock_fallback_response
from src.utils.llm_client import calculate_cost, langfuse

logger = logging.getLogger(__name__)

async def llm_router_node(state: AgentState) -> dict[str, Any]:
    # Kiểm duyệt thành công hoặc đang ở vòng tiếp theo
    if state.get("status") == "blocked":
        return {}

    r_idx = state.get("current_round", 1)

    # Chuẩn bị model list
    candidate_models = get_candidate_models()
    working_messages = state["messages"]

    round_start = time.time()
    response_text = ""
    tool_calls = None
    p_tokens = 0
    c_tokens = 0
    called_successfully = False

    # Trace telemetry
    trace_id = state.get("trace_id")
    trace = None
    if trace_id and langfuse:
        try:
            trace = langfuse.trace(id=trace_id)
        except Exception:
            pass

    for candidate in candidate_models:
        model_name = candidate["model"]
        client = candidate["client"]
        headers = candidate.get("extra_headers", {})

        generation = None
        if trace:
            try:
                generation = trace.generation(
                    name=f"round-{r_idx}-generation-{model_name.replace('/', '-')}",
                    model=model_name,
                    input=working_messages,
                )
            except Exception:
                pass

        try:
            is_local = "qwen" in model_name.lower() or "gguf" in model_name.lower()
            current_timeout = 600.0 if is_local else 20.0
            response = await client.chat.completions.create(
                model=model_name,
                messages=working_messages,
                tools=CHATBOT_TOOLS,
                tool_choice="auto",
                temperature=0.2,
                timeout=current_timeout,
                extra_headers=headers if headers else None,
            )
            response_msg = response.choices[0].message
            response_text = response_msg.content or ""
            tool_calls = response_msg.tool_calls

            p_tokens = response.usage.prompt_tokens if response.usage else len(str(working_messages)) // 4
            c_tokens = response.usage.completion_tokens if response.usage else len(response_text) // 4
            called_successfully = True

            if generation:
                try:
                    costs = calculate_cost(model_name, p_tokens, c_tokens)
                    generation.end(
                        output={
                            "text": response_text,
                            "tool_calls": [
                                {"name": tc.function.name, "args": tc.function.arguments} for tc in tool_calls
                            ]
                            if tool_calls
                            else [],
                        },
                        usage={
                            "input_tokens": p_tokens,
                            "output_tokens": c_tokens,
                            "total_tokens": p_tokens + c_tokens,
                            "input_cost": costs["input_cost"],
                            "output_cost": costs["output_cost"],
                            "total_cost": costs["total_cost"],
                        },
                    )
                except Exception:
                    pass
            break
        except Exception as e:
            logger.warning(f"[CHATBOT AGENT ROTATION] Model {model_name} failed: {e}")
            if generation:
                try:
                    generation.end(output={"error": str(e)})
                except Exception:
                    pass
            continue

    if not called_successfully:
        logger.warning("[CHATBOT AGENT WARNING] All candidate models failed. Fallback to mock template.")
        response_text, tool_calls = get_mock_fallback_response(state["user_message"], working_messages)
        p_tokens = len(str(working_messages)) // 4
        c_tokens = len(response_text) // 4

    round_latency = (time.time() - round_start) * 1000

    # Gom tool calls thô
    formatted_tool_calls = []
    if tool_calls:
        for tc in tool_calls:
            tc_name = tc.function.name
            try:
                tc_args = json.loads(tc.function.arguments)
            except Exception:
                tc_args = {}
            formatted_tool_calls.append({"name": tc_name, "args": tc_args})

    # Cập nhật round logs
    round_record = {
        "round": r_idx,
        "assistant_text": response_text,
        "tool_calls": formatted_tool_calls,
        "tool_results": [],
        "latency_ms": round_latency,
        "p_tokens": p_tokens,
        "c_tokens": c_tokens,
    }

    # Tích lũy telemetry
    new_rounds = list(state.get("rounds", [])) + [round_record]
    new_prompt_tokens = state.get("prompt_tokens", 0) + p_tokens
    new_completion_tokens = state.get("completion_tokens", 0) + c_tokens
    new_latency_ms = state.get("latency_ms", 0.0) + round_latency

    if not tool_calls:
        # Trả lời trực tiếp
        return {
            "status": "answered",
            "final_text": response_text,
            "tool_calls": [],
            "tool_results": [],
            "current_round": r_idx,
            "error": "",
            "rounds": new_rounds,
            "prompt_tokens": new_prompt_tokens,
            "completion_tokens": new_completion_tokens,
            "latency_ms": new_latency_ms,
        }

    return {
        "status": "calling_tools",
        "tool_calls": formatted_tool_calls,
        "current_round": r_idx + 1,
        "error": "",
        "rounds": new_rounds,
        "prompt_tokens": new_prompt_tokens,
        "completion_tokens": new_completion_tokens,
        "latency_ms": new_latency_ms,
    }
