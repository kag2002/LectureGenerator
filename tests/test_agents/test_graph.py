from unittest.mock import MagicMock

import pytest

from src.agents.graph import agent


@pytest.mark.asyncio
async def test_agent_basic_flow():
    # Cung cấp đầy đủ các trường bắt buộc trong AgentState
    state_input = {
        "user_message": "Hello",
        "messages": [{"role": "user", "content": "Hello"}],
        "course_id": 1,
        "user_id": 1,
        "db": MagicMock(),
    }
    result = await agent.ainvoke(state_input)
    assert "final_text" in result
    assert result["status"] == "answered"


@pytest.mark.asyncio
async def test_agent_state_structure():
    state_input = {
        "user_message": "Test query",
        "messages": [{"role": "user", "content": "Test query"}],
        "course_id": 1,
        "user_id": 1,
        "db": MagicMock(),
    }
    result = await agent.ainvoke(state_input)
    assert isinstance(result, dict)
    assert "user_message" in result
    assert "status" in result
