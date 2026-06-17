import operator
from typing import Annotated, Any, TypedDict


class AgentState(TypedDict, total=False):
    """State schema cho LangGraph agent.

    Mỗi node đọc và ghi vào state này.
    """

    messages: Annotated[list[dict[str, Any]], operator.add]
    session_id: int
    course_id: int
    user_id: int
    user_message: str
    current_round: int
    max_rounds: int
    tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    final_text: str
    status: str
    error: str
    trace_id: str
    db: Any
    on_event: Any
    user_message_id: Any
    rounds: list[dict[str, Any]]
    prompt_tokens: int
    completion_tokens: int
    latency_ms: float
    summary_history: str
    task_steps: list[str]
