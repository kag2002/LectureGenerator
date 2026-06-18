from langgraph.graph import END, StateGraph

from src.agents.state import AgentState
from src.agents.nodes.guardrail_input import guardrail_input_node
from src.agents.nodes.summarize_history import summarize_history_node
from src.agents.nodes.llm_router import llm_router_node
from src.agents.nodes.execute_tools import execute_tools_node
from src.agents.nodes.guardrail_output import guardrail_output_node

# Expose constants and functions for backward compatibility
from src.prompts.chatbot_prompts import SYSTEM_PROMPT
from src.agents.tools.schemas import CHATBOT_TOOLS
from src.agents.nodes.helpers import get_candidate_models

# --- ROUTING CONDITION ---

def chatbot_routing_condition(state: AgentState) -> str:
    # Hạn chế loop vô hạn
    r_idx = state.get("current_round", 1)
    max_rounds = state.get("max_rounds", 4)
    if r_idx >= max_rounds:
        return "guardrail_output"

    status = state.get("status")

    if status in ["blocked", "waiting_for_user"]:
        return "end"

    if status == "calling_tools":
        return "execute_tools"

    if status == "answered":
        return "guardrail_output"

    return "llm_router"


# --- BUILD STATE GRAPH ---

def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Đăng ký nodes
    graph.add_node("guardrail_input", guardrail_input_node)
    graph.add_node("summarize_history", summarize_history_node)
    graph.add_node("llm_router", llm_router_node)
    graph.add_node("execute_tools", execute_tools_node)
    graph.add_node("guardrail_output", guardrail_output_node)

    # Đặt entry point
    graph.set_entry_point("guardrail_input")

    # Đặt các edges chuyển đổi trạng thái
    graph.add_edge("guardrail_input", "summarize_history")
    graph.add_edge("summarize_history", "llm_router")

    # Rẽ nhánh có điều kiện từ llm_router
    graph.add_conditional_edges(
        "llm_router",
        chatbot_routing_condition,
        {"execute_tools": "execute_tools", "guardrail_output": "guardrail_output", "end": END},
    )

    # Edge chuyển tiếp từ execute_tools quay lại summarize_history để kiểm tra tóm tắt
    graph.add_conditional_edges(
        "execute_tools",
        lambda state: "end" if state.get("status") == "waiting_for_user" else "summarize_history",
        {"end": END, "summarize_history": "summarize_history"},
    )

    graph.add_edge("guardrail_output", END)

    return graph.compile()


agent = build_graph()
