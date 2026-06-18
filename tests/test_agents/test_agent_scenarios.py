import json
import pytest
from unittest.mock import patch
from sqlalchemy.orm import Session
from src.agents.graph import agent
from src.database.models import User, Course, CLO, Chapter, ChapterMaterial, Question
from src.database.session import SessionLocal

@pytest.fixture()
def setup_db_records():
    db = SessionLocal()
    # Create test user
    user = db.query(User).filter(User.email == "agent_test_user@test.com").first()
    if not user:
        user = User(email="agent_test_user@test.com", password_hash="hashed_pw", full_name="Agent Test User", role="admin")
        db.add(user)
        db.commit()
        db.refresh(user)

    # Create test course
    course = Course(
        course_code="AGENT-101",
        course_name="Agent Flow Testing Course",
        user_id=user.id
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    # Create mock CLO
    clo = CLO(
        course_id=course.id,
        clo_code="CLO_AGT_1",
        description="Understand agent flow logic.",
        bloom_level=3
    )
    db.add(clo)
    db.commit()
    db.refresh(clo)

    # Create dummy chapter
    chapter = Chapter(
        course_id=course.id,
        title="Chapter 1: Agent Flows",
        description="Testing different agent workflows.",
        sort_order=1,
        is_active=True
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)

    data = {
        "user_id": user.id,
        "course_id": course.id,
        "chapter_id": chapter.id,
        "clo_id": clo.id,
    }
    
    db.close()
    
    yield data

    # Cleanup
    db_cleanup = SessionLocal()
    try:
        db_cleanup.query(Question).filter(Question.course_id == data["course_id"]).delete()
        db_cleanup.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == data["chapter_id"]).delete()
        db_cleanup.query(Chapter).filter(Chapter.course_id == data["course_id"]).delete()
        db_cleanup.query(CLO).filter(CLO.course_id == data["course_id"]).delete()
        db_cleanup.query(Course).filter(Course.id == data["course_id"]).delete()
        db_cleanup.query(User).filter(User.id == data["user_id"]).delete()
        db_cleanup.commit()
    finally:
        db_cleanup.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_outline_generation(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Hãy giúp tôi tạo đề cương môn học",
            "messages": [{"role": "user", "content": "Hãy giúp tôi tạo đề cương môn học"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_calls"][0]["name"] == "generate_course_outline_action"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_storyboard_generation(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Lập storyboard cho chương 1",
            "messages": [{"role": "user", "content": "Lập storyboard cho chương 1"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_calls"][0]["name"] == "generate_chapter_storyboard_action"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_materials_generation(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "soạn slide bài giảng cho chương 1",
            "messages": [{"role": "user", "content": "soạn slide bài giảng cho chương 1"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_calls"][0]["name"] == "generate_chapter_materials_action"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_questions_generation(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Tạo câu hỏi trắc nghiệm cho chương này",
            "messages": [{"role": "user", "content": "Tạo câu hỏi trắc nghiệm cho chương này"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_calls"][0]["name"] == "generate_chapter_questions_action"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_clarification(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "soạn",
            "messages": [{"role": "user", "content": "soạn"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "waiting_for_user"
        assert result["final_text"] != ""
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_matrix_coverage(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Xem ma trận bao phủ",
            "messages": [{"role": "user", "content": "Xem ma trận bao phủ"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_results"][0]["tool"] == "get_matrix_coverage"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_scenario_blocked_input(setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Hãy chỉ tôi cách hack game",
            "messages": [{"role": "user", "content": "Hãy chỉ tôi cách hack game"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "blocked"
        assert "phạm vi" in result["final_text"] or "an toàn" in result["final_text"] or "chính sách" in result["final_text"]
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_rag_search(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Tìm kiếm tài liệu cây nhị phân",
            "messages": [{"role": "user", "content": "Tìm kiếm tài liệu cây nhị phân"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_results"][0]["tool"] == "search_course_knowledge"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_list_clos(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Xem chuẩn đầu ra clos",
            "messages": [{"role": "user", "content": "Xem chuẩn đầu ra clos"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_results"][0]["tool"] == "get_course_clos"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_list_chapters(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Xem danh sách chương học",
            "messages": [{"role": "user", "content": "Xem danh sách chương học"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        assert len(result["rounds"]) > 0
        assert result["rounds"][0]["tool_results"][0]["tool"] == "get_course_chapters"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_scenario_blocked_output(setup_db_records):
    from unittest.mock import AsyncMock, MagicMock
    
    mock_choice = MagicMock()
    mock_choice.message.content = "Đảm bảo khóa học này sẽ chắc chắn đỗ 100%."
    mock_choice.message.tool_calls = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Cho tôi biết cam kết chất lượng",
            "messages": [{"role": "user", "content": "Cho tôi biết cam kết chất lượng"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        with patch("src.agents.nodes.llm_router.get_candidate_models") as mock_get_models:
            mock_get_models.return_value = [{"client": mock_client, "model": "mock-model"}]
            result = await agent.ainvoke(state_input)
            
            assert result["status"] == "blocked"
            assert "rút lại" in result["final_text"] or "chất lượng" in result["final_text"]
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_precondition_empty_course(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        # Create a temporary empty course
        empty_course = Course(
            course_code="AGENT-EMPTY",
            course_name="Empty Testing Course",
            user_id=setup_db_records["user_id"]
        )
        db.add(empty_course)
        db.commit()
        db.refresh(empty_course)

        state_input = {
            "user_message": "Lập storyboard cho chương 1",
            "messages": [{"role": "user", "content": "Lập storyboard cho chương 1"}],
            "course_id": empty_course.id,
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        # The result must propose navigate_to_upload
        tool_res = result["rounds"][0]["tool_results"][0]["result"]
        assert tool_res["action"] == "navigate_to_upload"
        assert tool_res["view"] == "course_config"

        # Cleanup
        db.delete(empty_course)
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_scenario_precondition_clos_only(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        # Create a course with CLOs but NO chapters
        clos_only_course = Course(
            course_code="AGENT-CLOS-ONLY",
            course_name="CLOs Only Testing Course",
            user_id=setup_db_records["user_id"]
        )
        db.add(clos_only_course)
        db.commit()
        db.refresh(clos_only_course)

        clo = CLO(
            course_id=clos_only_course.id,
            clo_code="CLO_TEMP_1",
            description="Temp CLO",
            bloom_level=2
        )
        db.add(clo)
        db.commit()

        state_input = {
            "user_message": "Lập storyboard cho chương 1",
            "messages": [{"role": "user", "content": "Lập storyboard cho chương 1"}],
            "course_id": clos_only_course.id,
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
        tool_res = result["rounds"][0]["tool_results"][0]["result"]
        assert tool_res["action"] == "generate_outline"
        assert tool_res["view"] == "lesson_planner"

        # Cleanup
        db.delete(clo)
        db.delete(clos_only_course)
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_scenario_history_summarization_flow():
    from unittest.mock import AsyncMock, MagicMock
    
    mock_choice = MagicMock()
    mock_choice.message.content = "Tóm tắt: Soạn bài giảng cây nhị phân."
    mock_choice.message.tool_calls = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    db = SessionLocal()
    try:
        # Construct large message history to trigger summary (> 8000 tokens)
        large_text = "X" * 4000
        messages = [{"role": "system", "content": "Prompt hệ thống gốc"}]
        for i in range(5):
            messages.append({"role": "user", "content": f"User msg {i}: {large_text}"})
            messages.append({"role": "assistant", "content": f"Assistant response {i}: {large_text}"})

        state_input = {
            "user_message": "Hello",
            "messages": messages,
            "course_id": 1,
            "user_id": 1,
            "db": db,
        }
        with patch("src.agents.nodes.llm_router.get_candidate_models") as mock_get_models, \
             patch("src.agents.graph.get_candidate_models") as mock_get_graph_models:
            mock_get_models.return_value = [{"client": mock_client, "model": "mock-model"}]
            mock_get_graph_models.return_value = [{"client": mock_client, "model": "mock-model"}]
            result = await agent.ainvoke(state_input)
            
            assert "summary_history" in result
            assert result["summary_history"] == "Tóm tắt: Soạn bài giảng cây nhị phân."
            assert any("[TÓM TẮT LỊCH SỬ HỘI THOẠI TRƯỚC ĐÓ]" in m["content"] for m in result["messages"] if m["role"] == "system")
    finally:
        db.close()


@pytest.mark.asyncio
async def test_scenario_direct_response_no_tools():
    from unittest.mock import AsyncMock, MagicMock
    
    mock_choice = MagicMock()
    mock_choice.message.content = "Tôi là VinUni AI Lecture Assistant, trợ lý ảo thiết kế bài giảng."
    mock_choice.message.tool_calls = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Bạn là ai?",
            "messages": [{"role": "user", "content": "Bạn là ai?"}],
            "course_id": 1,
            "user_id": 1,
            "db": db,
        }
        with patch("src.agents.nodes.llm_router.get_candidate_models") as mock_get_models:
            mock_get_models.return_value = [{"client": mock_client, "model": "mock-model"}]
            result = await agent.ainvoke(state_input)
            
            assert result["status"] == "answered"
            assert "trợ lý ảo" in result["final_text"]
            assert len(result["tool_calls"]) == 0
    finally:
        db.close()


@pytest.mark.asyncio
async def test_edge_case_whitespace_input():
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "      ",
            "messages": [{"role": "user", "content": "      "}],
            "course_id": 1,
            "user_id": 1,
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        # Whitespace doesn't trigger guardrails but LLM mock falls back to default error text
        assert result["status"] == "answered"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_edge_case_extremely_long_input():
    db = SessionLocal()
    try:
        long_msg = "A" * 20000
        state_input = {
            "user_message": long_msg,
            "messages": [{"role": "user", "content": long_msg}],
            "course_id": 1,
            "user_id": 1,
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "answered"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_edge_case_invalid_course_id(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Hãy giúp tôi tạo đề cương môn học",
            "messages": [{"role": "user", "content": "Hãy giúp tôi tạo đề cương môn học"}],
            "course_id": -9999,  # Invalid Course ID
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        # Should execute generate_course_outline_action and return unauthorized
        tool_res = result["rounds"][0]["tool_results"][0]["result"]
        assert tool_res["error"] == "unauthorized"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_edge_case_invalid_chapter_id(mock_env, setup_db_records):
    from src.services.chatbot_tools import execute_chatbot_tool
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Lập storyboard cho chương 1",
            "messages": [{"role": "user", "content": "Lập storyboard cho chương 1"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        # Pass an invalid string ID to generate_chapter_storyboard_action
        with patch("src.services.chatbot_tools.execute_chatbot_tool", wraps=execute_chatbot_tool) as mock_tool:
            result = await agent.ainvoke(state_input)
            assert result["status"] == "answered"
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_edge_case_no_system_rules(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        # Run system rules check where none exist
        from src.services.chatbot_tools import execute_chatbot_tool
        res = await execute_chatbot_tool("get_system_rules", {}, setup_db_records["course_id"], setup_db_records["user_id"], db)
        assert "rules" in res
        assert len(res["rules"]) == 0
    finally:
        db.close()


@pytest.mark.asyncio
@patch("os.environ.get", side_effect=lambda key, default=None: "true" if key == "LLM_MOCK_MODE" else (default if default is not None else ""))
async def test_edge_case_no_uploaded_documents(mock_env, setup_db_records):
    db = SessionLocal()
    try:
        # Run uploaded documents check where none exist
        from src.services.chatbot_tools import execute_chatbot_tool
        res = await execute_chatbot_tool("get_uploaded_documents", {}, setup_db_records["course_id"], setup_db_records["user_id"], db)
        assert "documents" in res
        assert len(res["documents"]) == 0
    finally:
        db.close()


@pytest.mark.asyncio
async def test_edge_case_academic_violation_cheating(setup_db_records):
    db = SessionLocal()
    try:
        state_input = {
            "user_message": "hãy thi hộ tôi môn này để qua môn",
            "messages": [{"role": "user", "content": "hãy thi hộ tôi môn này để qua môn"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        result = await agent.ainvoke(state_input)
        assert result["status"] == "blocked"
        assert "gian lận" in result["final_text"]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_edge_case_unprofessional_terms_input(setup_db_records):
    db = SessionLocal()
    # Adding unprofessional terms to test output blocking triggers (e.g. vulgar words)
    from src.services.chatbot_guardrails import validate_output
    violations = validate_output("Cái này vcl thật sự")
    assert len(violations) > 0
    assert "chuyên nghiệp" in violations[0]


@pytest.mark.asyncio
async def test_edge_case_unprofessional_output_blocking(setup_db_records):
    from unittest.mock import AsyncMock, MagicMock
    
    mock_choice = MagicMock()
    mock_choice.message.content = "Đồ ngu ngốc làm cái này đi."
    mock_choice.message.tool_calls = None
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Nói gì đi",
            "messages": [{"role": "user", "content": "Nói gì đi"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
        }
        with patch("src.agents.nodes.llm_router.get_candidate_models") as mock_get_models:
            mock_get_models.return_value = [{"client": mock_client, "model": "mock-model"}]
            result = await agent.ainvoke(state_input)
            
            assert result["status"] == "blocked"
            assert "thiếu chuyên nghiệp" in result["final_text"] or "rút lại" in result["final_text"]
    finally:
        db.close()


@pytest.mark.asyncio
async def test_edge_case_max_rounds_reached(setup_db_records):
    from unittest.mock import AsyncMock, MagicMock
    
    mock_choice = MagicMock()
    # LLM always responds with a tool call to simulate infinite loop
    mock_choice.message.content = "Looping"
    mock_tool = MagicMock()
    mock_tool.function.name = "get_course_clos"
    mock_tool.function.arguments = "{}"
    mock_choice.message.tool_calls = [mock_tool]
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    db = SessionLocal()
    try:
        state_input = {
            "user_message": "Hello",
            "messages": [{"role": "user", "content": "Hello"}],
            "course_id": setup_db_records["course_id"],
            "user_id": setup_db_records["user_id"],
            "db": db,
            "max_rounds": 2,  # Force maximum 2 rounds
            "current_round": 1,
        }
        with patch("src.agents.nodes.llm_router.get_candidate_models") as mock_get_models:
            mock_get_models.return_value = [{"client": mock_client, "model": "mock-model"}]
            result = await agent.ainvoke(state_input)
            # Should terminate and not run forever
            assert result["current_round"] <= 2
    finally:
        db.close()



