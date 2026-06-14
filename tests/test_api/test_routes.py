import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post("/api/v1/chat", json={"message": ""})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status")
    assert response.status_code == 200


def test_format_to_gift():
    from src.api.export import format_to_gift
    question = "What is the complexity of searching in a BST?"
    options = ["O(n)", "O(log n)", "O(1)", "O(n log n)"]
    correct = "O(log n)"
    gift = format_to_gift(question, options, correct)
    assert "What is the complexity of searching in a BST?" in gift
    assert "=O(log n)" in gift
    assert "~O(n)" in gift


def test_sanitize_filename():
    from src.api.export import sanitize_filename
    assert sanitize_filename("Giáo án Chương 1: Giới thiệu") == "Giao_an_Chuong_1_Gioi_thieu"
    assert sanitize_filename("Page & Section #4") == "Page_Section_4"
