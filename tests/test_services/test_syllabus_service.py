"""
Unit tests for the syllabus_service module.

Tests cover the SSE event generator pipeline with mocked DB and LLM calls.
"""

import json
import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest

from src.services.syllabus_service import generate_syllabus_parse_events


def _collect_events(generator) -> list[dict]:
    """Helper to collect all SSE events from the generator into parsed dicts."""
    events = []
    for raw_event in generator:
        # Parse SSE format: "event: <type>\ndata: <json>\n\n"
        lines = raw_event.strip().split("\n")
        event_type = None
        data = None
        for line in lines:
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if event_type and data is not None:
            events.append({"event": event_type, "data": data})
    return events


class TestGenerateSyllabusParseEventsFormat:
    """Test the SSE event format output."""

    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_empty_document_yields_error(self, mock_session_cls, mock_parse):
        """Empty document content should yield an error event."""
        mock_parse.return_value = ""
        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        # Create a temp file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("empty")
            temp_path = f.name

        try:
            events = _collect_events(generate_syllabus_parse_events(temp_path, course_id=1))
            assert len(events) >= 1
            # First event should be stage 1, then error
            error_events = [e for e in events if e["event"] == "error"]
            assert len(error_events) == 1
            assert "Không thể đọc" in error_events[0]["data"]["message"]
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_whitespace_only_document_yields_error(self, mock_session_cls, mock_parse):
        mock_parse.return_value = "   \n\n   "
        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test")
            temp_path = f.name

        try:
            events = _collect_events(generate_syllabus_parse_events(temp_path, course_id=1))
            error_events = [e for e in events if e["event"] == "error"]
            assert len(error_events) == 1
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    @patch("src.services.syllabus_service.analyse_syllabus")
    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_no_clos_found_yields_error(self, mock_session_cls, mock_parse, mock_analyse):
        """If AI finds no CLOs, should yield error."""
        mock_parse.return_value = "Some valid text content for analysis."
        mock_analyse.return_value = {
            "course_code": "CS101",
            "course_name": "Intro to CS",
            "clos": [],
        }

        mock_db = MagicMock()
        mock_course = MagicMock()
        mock_course.id = 1
        mock_course.course_code = "CS101"
        mock_course.course_name = "Intro to CS"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_course
        mock_db.query.return_value.filter.return_value.delete.return_value = 0
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test content")
            temp_path = f.name

        try:
            events = _collect_events(generate_syllabus_parse_events(temp_path, course_id=1))
            error_events = [e for e in events if e["event"] == "error"]
            assert len(error_events) == 1
            assert "Không tìm thấy chuẩn đầu ra" in error_events[0]["data"]["message"]
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


class TestGenerateSyllabusParseEventsSuccess:
    """Test successful syllabus parsing pipeline."""

    @patch("src.services.syllabus_service.analyse_syllabus")
    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_successful_pipeline_yields_stages_clos_done(self, mock_session_cls, mock_parse, mock_analyse):
        """Successful pipeline should yield: stage(1-4) + clo events + done."""
        mock_parse.return_value = "Course outline with CLO1, CLO2."
        mock_analyse.return_value = {
            "course_code": "COMP2010",
            "course_name": "Data Structures",
            "required_textbooks": ["CLRS"],
            "recommended_readings": ["Sedgewick"],
            "clos": [
                {"clo_code": "CLO1", "description": "Understand BST", "bloom_level": 2},
                {"clo_code": "CLO2", "description": "Implement sorting", "bloom_level": 3},
            ],
        }

        # Mock database session and Course query
        mock_db = MagicMock()
        mock_course = MagicMock()
        mock_course.id = 1
        mock_course.course_code = ""
        mock_course.course_name = ""
        mock_course.required_textbooks = ""
        mock_course.recommended_readings = ""
        mock_db.query.return_value.filter.return_value.first.return_value = mock_course
        mock_db.query.return_value.filter.return_value.delete.return_value = 0

        # Mock CLO creation (add, commit, refresh)
        clo_counter = [0]

        def mock_refresh(obj):
            clo_counter[0] += 1
            obj.id = clo_counter[0]

        mock_db.refresh.side_effect = mock_refresh
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("Syllabus content")
            temp_path = f.name

        try:
            events = _collect_events(generate_syllabus_parse_events(temp_path, course_id=1))

            # Check we got stage events
            stage_events = [e for e in events if e["event"] == "stage"]
            assert len(stage_events) == 4  # stages 1-4

            # Check we got CLO events
            clo_events = [e for e in events if e["event"] == "clo"]
            assert len(clo_events) == 2

            # Check CLO data
            assert clo_events[0]["data"]["clo"]["clo_code"] == "CLO1"
            assert clo_events[1]["data"]["clo"]["clo_code"] == "CLO2"
            assert clo_events[0]["data"]["index"] == 1
            assert clo_events[1]["data"]["index"] == 2
            assert clo_events[0]["data"]["total"] == 2

            # Check done event
            done_events = [e for e in events if e["event"] == "done"]
            assert len(done_events) == 1
            assert "thành công" in done_events[0]["data"]["message"]
            assert len(done_events[0]["data"]["clos"]) == 2

            # Check course info was updated
            assert mock_course.course_code == "COMP2010"
            assert mock_course.course_name == "Data Structures"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    @patch("src.services.syllabus_service.analyse_syllabus")
    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_course_fields_update_partial(self, mock_session_cls, mock_parse, mock_analyse):
        """Only provided fields should update the course."""
        mock_parse.return_value = "Valid content"
        mock_analyse.return_value = {
            "course_code": "NEW101",
            "course_name": "",  # empty → should NOT overwrite
            "clos": [{"clo_code": "CLO1", "description": "Test", "bloom_level": 1}],
        }

        mock_db = MagicMock()
        mock_course = MagicMock()
        mock_course.id = 1
        mock_course.course_code = "OLD100"
        mock_course.course_name = "Old Name"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_course
        mock_db.query.return_value.filter.return_value.delete.return_value = 0

        def mock_refresh(obj):
            obj.id = 1

        mock_db.refresh.side_effect = mock_refresh
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test")
            temp_path = f.name

        try:
            list(generate_syllabus_parse_events(temp_path, course_id=1))
            # course_code should be updated
            assert mock_course.course_code == "NEW101"
            # course_name should NOT be updated (empty string)
            assert mock_course.course_name == "Old Name"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


class TestGenerateSyllabusParseEventsError:
    """Test error handling in the pipeline."""

    @patch("src.services.syllabus_service.analyse_syllabus")
    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_exception_yields_error_event(self, mock_session_cls, mock_parse, mock_analyse):
        """An exception during analysis should yield an error event and rollback."""
        mock_parse.return_value = "Valid content"
        mock_analyse.side_effect = RuntimeError("LLM API failed")

        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test")
            temp_path = f.name

        try:
            events = _collect_events(generate_syllabus_parse_events(temp_path, course_id=1))
            error_events = [e for e in events if e["event"] == "error"]
            assert len(error_events) == 1
            assert "LLM API failed" in error_events[0]["data"]["message"]
            mock_db.rollback.assert_called_once()
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_temp_file_cleanup_on_success(self, mock_session_cls, mock_parse):
        """Temp file should be deleted even after an error."""
        mock_parse.return_value = ""
        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test")
            temp_path = f.name

        list(generate_syllabus_parse_events(temp_path, course_id=1))
        assert not os.path.exists(temp_path), "Temp file should be cleaned up"


class TestSSEEventFormat:
    """Test that SSE events are properly formatted."""

    @patch("src.services.syllabus_service.parse_document")
    @patch("src.services.syllabus_service.SessionLocal")
    def test_sse_format_structure(self, mock_session_cls, mock_parse):
        mock_parse.return_value = ""
        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("test")
            temp_path = f.name

        try:
            raw_events = list(generate_syllabus_parse_events(temp_path, course_id=1))
            for raw in raw_events:
                assert raw.startswith("event: "), f"SSE event should start with 'event: ', got: {raw[:30]}"
                assert "\ndata: " in raw, "SSE event should contain data line"
                assert raw.endswith("\n\n"), "SSE event should end with double newline"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
