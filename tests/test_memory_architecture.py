from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.graph import summarize_history_node
from src.database.vector_db import (
    collection,
    delete_fts_chunks,
    index_fts_chunks,
    reciprocal_rank_fusion,
    search_fts_chunks,
    search_rag_isolated,
)
from src.services.memory_service import episodic_collection, retrieve_episodes, store_episodic_revision

# --- 1. SHORT-TERM MEMORY TESTS ---


@pytest.mark.asyncio
async def test_summarize_history_node_trigger():
    # Mock LLM Client
    mock_choice = MagicMock()
    mock_choice.message.content = "Tóm tắt lịch sử: Giảng viên muốn soạn slide về cây nhị phân."
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_response.usage = None

    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    # 10 messages of size ~4000 chars each to exceed 8000 tokens estimation (8000 * 4 = 32000 chars)
    large_content = "X" * 4000
    messages = [
        {"role": "system", "content": "Prompt hệ thống gốc"},
    ]
    for i in range(5):
        messages.append({"role": "user", "content": f"Message {i}: {large_content}"})
        messages.append({"role": "assistant", "content": f"Response {i}: {large_content}"})

    state = {"messages": messages, "summary_history": ""}

    with patch("src.agents.graph.get_candidate_models") as mock_get_models:
        mock_get_models.return_value = [{"client": mock_client, "model": "mock-model"}]

        result = await summarize_history_node(state)

        assert "summary_history" in result
        assert result["summary_history"] == "Tóm tắt lịch sử: Giảng viên muốn soạn slide về cây nhị phân."
        assert len(result["messages"]) > 0
        # The new messages should have the system messages, the summary system message, and the last 2 messages
        assert result["messages"][-3]["role"] == "system"
        assert "[TÓM TẮT LỊCH SỬ HỘI THOẠI TRƯỚC ĐÓ]" in result["messages"][-3]["content"]


@pytest.mark.asyncio
async def test_summarize_history_node_no_trigger():
    messages = [
        {"role": "system", "content": "System prompt"},
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Hello"},
    ]
    state = {"messages": messages, "summary_history": ""}
    result = await summarize_history_node(state)
    assert result == {}


# --- 2. EPISODIC MEMORY TESTS ---


def test_levenshtein_ratio():
    from src.services.memory_service import levenshtein_ratio

    # Identical strings
    assert levenshtein_ratio("hello", "hello") == 0.0
    # Completely different strings
    assert levenshtein_ratio("abc", "") == 1.0
    # Edit distance of 1 substitution on len 6: 1/6
    assert round(levenshtein_ratio("kitten", "sitten"), 4) == round(1 / 6, 4)


def test_episodic_memory_flow():
    user_id = 9999
    course_id = 9999
    chapter_id = 123

    # Clean any old test records just in case
    try:
        episodic_collection.delete(where={"$and": [{"user_id": {"$eq": user_id}}, {"course_id": {"$eq": course_id}}]})
    except Exception:
        pass

    # 1. Test skip storing on small edit ratio
    stored_small = store_episodic_revision(
        user_id=user_id,
        course_id=course_id,
        chapter_id=chapter_id,
        prompt="Create intro slide",
        content_before="This is an intro slide content",
        content_after="This is the intro slide content",  # very small change
        layout_before="standard",
        layout_after="standard",
    )
    assert stored_small is False

    # 2. Test store on layout change
    stored_layout = store_episodic_revision(
        user_id=user_id,
        course_id=course_id,
        chapter_id=chapter_id,
        prompt="Create intro slide",
        content_before="This is an intro slide content",
        content_after="This is the intro slide content",
        layout_before="standard",
        layout_after="two_columns",
    )
    assert stored_layout is True

    # 3. Test store on large content change (> 20% Levenshtein)
    stored_content = store_episodic_revision(
        user_id=user_id,
        course_id=course_id,
        chapter_id=chapter_id,
        prompt="Create content slide",
        content_before="Introduction to data structures and simple arrays",
        content_after="Advanced trees, graphs, and network flow analysis algorithms",
        layout_before="standard",
        layout_after="standard",
    )
    assert stored_content is True

    # 4. Test retrieve episodes
    episodes = retrieve_episodes(user_id=user_id, course_id=course_id, query="intro slide", limit=5)
    assert len(episodes) > 0
    assert any(ep["layout"] == "two_columns" for ep in episodes)

    # Cleanup
    try:
        episodic_collection.delete(where={"$and": [{"user_id": {"$eq": user_id}}, {"course_id": {"$eq": course_id}}]})
    except Exception as e:
        print(f"Cleanup failed: {e}")


# --- 3. MEMORY CONTROLLER (HYBRID SEARCH & RRF) TESTS ---


def test_reciprocal_rank_fusion():
    dense = [
        {"file_name": "doc1.pdf", "page_number": 1, "text": "Cấu trúc dữ liệu cây", "score": 0.9},
        {"file_name": "doc2.pdf", "page_number": 2, "text": "Giải thuật sắp xếp", "score": 0.8},
    ]
    sparse = [
        {"file_name": "doc2.pdf", "page_number": 2, "text": "Giải thuật sắp xếp", "score": 0.0},
        {"file_name": "doc3.pdf", "page_number": 3, "text": "Cây nhị phân tìm kiếm", "score": 0.0},
    ]
    merged = reciprocal_rank_fusion(dense, sparse, top_k=2)
    assert len(merged) <= 2
    # doc2.pdf is in both, so it should rank first due to reciprocal ranks summation
    assert merged[0]["file_name"] == "doc2.pdf"


def test_sqlite_fts5_indexing_and_search():
    user_id = 9999
    course_id = 9999
    file_name = "test_doc.pdf"

    chunks = [
        {"page_number": 1, "text": "Cấu trúc dữ liệu nâng cao như cây AVL và cây Đỏ Đen.", "chapter_id": 1},
        {"page_number": 2, "text": "Giải thuật tìm kiếm trên đồ thị có hướng.", "chapter_id": 2},
    ]
    ids = ["test_c1", "test_c2"]

    # Index FTS5
    index_fts_chunks(user_id, course_id, file_name, chunks, ids)

    # Search AVL -> Should match chunk 1
    results = search_fts_chunks("AVL", user_id, course_id)
    assert len(results) > 0
    assert results[0]["page_number"] == 1
    assert "AVL" in results[0]["text"]

    # Cleanup
    delete_fts_chunks(user_id, course_id, file_name)

    results_after = search_fts_chunks("AVL", user_id, course_id)
    assert len(results_after) == 0


def test_search_rag_isolated():
    user_id = 9999
    course_id = 9999
    file_name = "test_rag.pdf"

    # Add some vector document
    from src.database.vector_db import add_document_vector

    text_by_pages = [
        "Chương này giới thiệu về Cây Nhị Phân Tìm Kiếm (BST).",
        "Chương kia nói về đồ thị và giải thuật DFS.",
    ]

    add_document_vector(
        file_name=file_name, text_by_pages=text_by_pages, user_id=user_id, course_id=course_id, chapter_id=1
    )

    # Search with testing mode query expansion bypass (or mocked LLM)
    with patch("src.utils.llm_client.call_llm_json") as mock_llm:
        mock_llm.return_value = {"expanded_queries": ["BST nhị phân", "cây tìm kiếm"]}
        results = search_rag_isolated("BST", user_id, course_id, top_k=2, chapter_id=1)
        assert len(results) > 0
        assert any("BST" in res["text"] for res in results)

    # Cleanup
    try:
        collection.delete(where={"$and": [{"user_id": {"$eq": user_id}}, {"course_id": {"$eq": course_id}}]})
    except Exception:
        pass
    delete_fts_chunks(user_id, course_id)


# --- 4. CONSOLIDATION TESTS ---


@pytest.mark.asyncio
async def test_session_consolidation():
    from src.database.models import ChatMessage, ChatSession
    from src.database.session import SessionLocal
    from src.services.consolidation_worker import consolidate_session, decompress_message_content

    db = SessionLocal()
    try:
        # 1. Create a dummy session
        session = ChatSession(title="Test Consolidation Session")
        db.add(session)
        db.commit()
        db.refresh(session)

        # 2. Add some messages (at least 4 messages to trigger consolidation)
        msg1 = ChatMessage(session_id=session.id, role="user", content="Tôi muốn soạn bài giảng Cấu trúc dữ liệu")
        msg2 = ChatMessage(
            session_id=session.id, role="assistant", content="Tôi có thể giúp bạn soạn bài giảng. Bạn muốn chương nào?"
        )
        msg3 = ChatMessage(session_id=session.id, role="user", content="Soạn chương 3: Cây nhị phân tìm kiếm.")
        msg4 = ChatMessage(
            session_id=session.id, role="assistant", content="Dưới đây là cấu trúc slide nháp cho chương 3..."
        )

        db.add_all([msg1, msg2, msg3, msg4])
        db.commit()

        # Mock async_call_llm_json
        with patch("src.services.consolidation_worker.async_call_llm_json") as mock_llm_json:
            mock_llm_json.return_value = {"summary": "Tóm tắt phiên học cấu trúc dữ liệu chương 3."}

            res = await consolidate_session(session.id, db)
            assert res["status"] == "success"
            assert res["summary"] == "Tóm tắt phiên học cấu trúc dữ liệu chương 3."

            # Check that messages are archived and compressed
            db.expire_all()  # clear SQLAlchemy session cache
            archived_msgs = (
                db.query(ChatMessage).filter(ChatMessage.session_id == session.id, ChatMessage.is_archived).all()
            )
            assert len(archived_msgs) == 4
            for m in archived_msgs:
                assert m.content.startswith("[GZIP_COMPRESSED]:")

                # Verify decompression
                decompressed = decompress_message_content(m.content)
                assert any(term in decompressed.lower() for term in ["soạn", "giúp", "chương 3", "dưới đây"])

            summary_msg = (
                db.query(ChatMessage)
                .filter(
                    ChatMessage.session_id == session.id,
                    ChatMessage.is_archived == False,  # noqa: E712
                    ChatMessage.role == "system",
                )
                .first()
            )
            assert summary_msg is not None
            assert "Tóm tắt phiên học cấu trúc dữ liệu chương 3." in summary_msg.content

            # Cleanup
            db.delete(summary_msg)
            for m in archived_msgs:
                db.delete(m)
            db.delete(session)
            db.commit()
    finally:
        db.close()
