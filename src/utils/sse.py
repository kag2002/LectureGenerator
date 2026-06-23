import json
from src.utils.llm_shared import get_token_usage

def format_sse(event: str, data: dict, trace_id: str = None, include_usage: bool = False) -> str:
    """Format an event and data dictionary as a Server-Sent Events (SSE) string."""
    if trace_id:
        data["trace_id"] = trace_id
    if include_usage:
        usage = get_token_usage()
        if usage:
            data["usage"] = {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
