"""
Unit tests for Chatbot Server-Sent Events (SSE) streaming routes.
Verifies correct event stream formatting (event: ... \n data: ...) and guardrail safety checks.
Mocks the LangGraph agent execution loop using unittest.mock.
"""

import json
import pytest
from unittest.mock import patch, AsyncMock
from src.database.models import ChatSession


@pytest.mark.asyncio
async def test_chat_stream_happy_path(client, auth_headers, db, test_course):
    """Happy path: Chatbot executes normally, triggers stage/text events, and finishes with done."""
    session = ChatSession(course_id=test_course.id, title="SSE Happy Path")
    db.add(session)
    db.commit()
    db.refresh(session)

    async def mock_run_agent(session_id, user_message, course_id, user_id, db, on_event, **kwargs):
        # Simulate agent events during execution
        await on_event("stage", {"stage": 1, "message": "Analyzing query..."})
        await on_event("text", {"text": "This is a streamed answer from the mock agent."})
        return {
            "status": "answered",
            "assistant_text": "This is a streamed answer from the mock agent.",
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "total_tokens": 30,
            "latency_ms": 150.0,
            "trace_id": "mock-trace-123",
            "rounds": []
        }

    with patch("src.api.chatbot.run_chatbot_agent_loop", side_effect=mock_run_agent):
        async with client.stream(
            "POST",
            "/api/chatbot/chat-stream",
            json={
                "session_id": session.id,
                "message": "Hello chatbot",
                "course_id": test_course.id
            },
            headers=auth_headers
        ) as response:
            assert response.status_code == 200
            
            # Read and parse SSE lines
            lines = [line async for line in response.aiter_lines() if line.strip()]

    # Assert SSE event flow formatting
    assert any("event: stage" in l for l in lines)
    assert any("Analyzing query..." in l for l in lines)
    assert any("event: text" in l for l in lines)
    assert any("This is a streamed answer from the mock agent." in l for l in lines)
    assert any("event: done" in l for l in lines)
    assert any('"status": "answered"' in l for l in lines)


@pytest.mark.asyncio
async def test_chat_stream_blocked_guardrail(client, auth_headers, db, test_course):
    """Guardrail path: Agent flags the input/output as blocked, streaming a warning and done status."""
    session = ChatSession(course_id=test_course.id, title="SSE Guardrail Path")
    db.add(session)
    db.commit()
    db.refresh(session)

    async def mock_run_agent(session_id, user_message, course_id, user_id, db, on_event, **kwargs):
        return {
            "status": "blocked",
            "assistant_text": "Xin lỗi Thầy/Cô, yêu cầu vi phạm chính sách bảo mật/học thuật.",
            "prompt_tokens": 5,
            "completion_tokens": 0,
            "total_tokens": 5,
            "latency_ms": 12.0,
            "trace_id": "mock-trace-blocked",
            "rounds": []
        }

    with patch("src.api.chatbot.run_chatbot_agent_loop", side_effect=mock_run_agent):
        async with client.stream(
            "POST",
            "/api/chatbot/chat-stream",
            json={
                "session_id": session.id,
                "message": "hack game",
                "course_id": test_course.id
            },
            headers=auth_headers
        ) as response:
            assert response.status_code == 200
            lines = [line async for line in response.aiter_lines() if line.strip()]

    # Assert guardrail warning event and blocked status
    assert any("event: stage" in l for l in lines)
    assert any("Cảnh báo: Phản hồi bị chặn do vi phạm Guardrails." in l for l in lines)
    assert any("event: done" in l for l in lines)
    assert any('"status": "blocked"' in l for l in lines)


@pytest.mark.asyncio
async def test_chat_stream_agent_error(client, auth_headers, db, test_course):
    """Error path: The agent execution loop throws an unhandled exception."""
    session = ChatSession(course_id=test_course.id, title="SSE Error Path")
    db.add(session)
    db.commit()
    db.refresh(session)

    async def mock_run_agent(session_id, user_message, course_id, user_id, db, on_event, **kwargs):
        raise RuntimeError("Agent loop crashed unexpectedly")

    with patch("src.api.chatbot.run_chatbot_agent_loop", side_effect=mock_run_agent):
        async with client.stream(
            "POST",
            "/api/chatbot/chat-stream",
            json={
                "session_id": session.id,
                "message": "trigger error",
                "course_id": test_course.id
            },
            headers=auth_headers
        ) as response:
            assert response.status_code == 200
            lines = [line async for line in response.aiter_lines() if line.strip()]

    # Assert error event formatting is delivered
    assert any("event: error" in l for l in lines)
    assert any("Lỗi hệ thống chatbot: Agent loop crashed unexpectedly" in l for l in lines)


# ═══════════════════════════════════════════════════════════════════════════
# CHATBOT CANCEL PROGRESS TESTS
# ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_cancel_chat_success(client, auth_headers, db, test_course):
    """Success path: Successfully cancel a running chat session task."""
    session = ChatSession(course_id=test_course.id, title="SSE Cancel Success Path")
    db.add(session)
    db.commit()
    db.refresh(session)

    with patch("src.api.chatbot.task_manager.cancel_task", return_value=True) as mock_cancel:
        resp = await client.post(
            f"/api/chatbot/sessions/{session.id}/cancel",
            headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["message"] == "Đã gửi lệnh hủy"
        mock_cancel.assert_called_once_with(f"chat_{session.id}")


@pytest.mark.asyncio
async def test_cancel_chat_not_running(client, auth_headers, db, test_course):
    """Not running path: Try to cancel a session that does not have a running task."""
    session = ChatSession(course_id=test_course.id, title="SSE Cancel Fail Path")
    db.add(session)
    db.commit()
    db.refresh(session)

    with patch("src.api.chatbot.task_manager.cancel_task", return_value=False) as mock_cancel:
        resp = await client.post(
            f"/api/chatbot/sessions/{session.id}/cancel",
            headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["message"] == "Không có tác vụ nào đang chạy"
        mock_cancel.assert_called_once_with(f"chat_{session.id}")
