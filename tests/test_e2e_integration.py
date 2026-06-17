import os
import re
import pytest
from unittest.mock import patch, MagicMock
from src.database.models import CLO

# Set TESTING to 1 to bypass actual sentence-transformers loading in vector_db if imported
os.environ["TESTING"] = "1"


@pytest.mark.asyncio
async def test_e2e_lecturer_lifecycle(client, db):
    """
    Exactly one comprehensive E2E integration test covering the entire lecturer lifecycle:
    1. Register new lecturer account
    2. Log in and acquire JWT token
    3. Create a new course
    4. Seed CLO for the course
    5. Generate outline (mocked LLM)
    6. Generate lecture materials (mocked Orchestrator & ChromaDB RAG)
    7. Export lesson plan/pptx (mocked subprocess/PPT-Master)
    """

    # 1. Register new lecturer account
    reg_payload = {
        "email": "e2e_lecturer@vinuni.edu.vn",
        "password": "strongPassword123",
        "full_name": "E2E Lecturer Tester"
    }
    reg_resp = await client.post("/api/auth/register", json=reg_payload)
    assert reg_resp.status_code == 200
    reg_data = reg_resp.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == "e2e_lecturer@vinuni.edu.vn"

    # 2. Log in and acquire JWT token
    login_payload = {
        "email": "e2e_lecturer@vinuni.edu.vn",
        "password": "strongPassword123"
    }
    login_resp = await client.post("/api/auth/login", json=login_payload)
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    token = login_data["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 3. Create a new course
    course_payload = {
        "course_code": "E2E-COMP",
        "course_name": "E2E Algorithmic Learning"
    }
    course_resp = await client.post("/api/courses", json=course_payload, headers=auth_headers)
    assert course_resp.status_code == 200
    course_data = course_resp.json()
    course_id = course_data["id"]
    assert course_data["course_code"] == "E2E-COMP"

    # 4. Seed CLO for the course directly in DB
    new_clo = CLO(
        course_id=course_id,
        clo_code="CLO1",
        description="Analyze algorithms using E2E testing.",
        bloom_level=4
    )
    db.add(new_clo)
    db.commit()
    db.refresh(new_clo)

    # 5. Generate outline (mocked LLM)
    mock_outline_json = {
        "chapters": [
            {
                "title": "Chương 1: Introduction to E2E Testing",
                "description": "Fundamental concepts and practices of automated E2E pipelines."
            }
        ]
    }
    with patch("src.api.outline.call_llm_json", return_value=mock_outline_json) as mock_llm:
        outline_resp = await client.post(
            f"/api/courses/{course_id}/generate-outline",
            headers=auth_headers
        )
        assert outline_resp.status_code == 200
        outline_data = outline_resp.json()
        assert "Sinh cấu trúc chương học thành công" in outline_data["message"]
        assert len(outline_data["chapters"]) == 1
        chapter_id = outline_data["chapters"][0]["id"]
        assert outline_data["chapters"][0]["title"] == "Chương 1: Introduction to E2E Testing"
        mock_llm.assert_called_once()

    # 6. Generate lecture materials (mocked Orchestrator & ChromaDB RAG)
    gen_payload = {
        "class_size": 30,
        "has_wifi": True,
        "furniture_type": "movable",
        "language": "vi",
        "session_duration": 90,
        "pedagogical_style": "interactive",
        "learner_level": "intermediate",
        "selected_clos": []
    }

    # Mock the MaterialOrchestrator agent methods
    def mock_storyboard(self, *args, **kwargs):
        self.state["storyboard"] = []
        return []

    def mock_content(self, *args, **kwargs):
        self.state["allocated_content"] = []
        return []

    def mock_slides(self, *args, **kwargs):
        self.state["generated_slides"] = ["# Slide 1: Introduction\n* Outline of E2E testing benefits."]
        return []

    def mock_active_learning(self, *args, **kwargs):
        self.state["active_learning_script"] = "### Activity: Design a Mock Service"
        return []

    def mock_auditor(self, *args, **kwargs):
        self.state["warnings"] = []
        return []

    with patch("src.services.material_orchestrator.MaterialOrchestrator.run_storyboard_architect", mock_storyboard), \
         patch("src.services.material_orchestrator.MaterialOrchestrator.run_content_allocator", mock_content), \
         patch("src.services.material_orchestrator.MaterialOrchestrator.run_slide_writer", mock_slides), \
         patch("src.services.material_orchestrator.MaterialOrchestrator.run_active_learning_planner", mock_active_learning), \
         patch("src.services.material_orchestrator.MaterialOrchestrator.run_logic_auditor", mock_auditor), \
         patch("src.api.materials.search_rag_isolated", return_value=[]) as mock_rag:

        gen_resp = await client.post(
            f"/api/courses/chapters/{chapter_id}/generate-materials",
            json=gen_payload,
            headers=auth_headers
        )
        assert gen_resp.status_code == 200
        gen_data = gen_resp.json()
        assert "AI sinh học liệu thành công" in gen_data["message"]
        assert "# Slide 1: Introduction" in gen_data["slide_content"]
        assert "Design a Mock Service" in gen_data["active_learning_script"]
        mock_rag.assert_called_once()

    # 7. Export lesson plan/pptx (mocked subprocess/PPT-Master)
    def mock_subprocess_run(cmd, *args, **kwargs):
        match = re.search(r'-o "([^"]+)"', cmd)
        if match:
            out_path = match.group(1)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(b"PK\x03\x04 mock presentation binary content")
        return MagicMock(returncode=0)

    with patch("os.path.isfile", return_value=True), \
         patch("subprocess.run", side_effect=mock_subprocess_run):

        export_resp = await client.get(
            f"/api/courses/chapters/{chapter_id}/export-pptx",
            headers=auth_headers
        )
        assert export_resp.status_code == 200
        assert export_resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        assert len(export_resp.content) > 0
        assert export_resp.content.startswith(b"PK\x03\x04")
