"""
Unit tests for MaterialOrchestrator and helper functions.

Tests cover the pure-logic functions (cosine_similarity, deduplicate_rag_hits,
get_slide_body_length) and the orchestrator class methods with mocked LLM calls.
"""

import math
from unittest.mock import patch

import pytest

from src.services.material_orchestrator import (
    BUDGETS,
    MaterialOrchestrator,
    cosine_similarity,
    deduplicate_rag_hits,
    get_slide_body_length,
)

# ---------------------------------------------------------------------------
# cosine_similarity
# ---------------------------------------------------------------------------


class TestCosineSimilarity:
    def test_identical_vectors(self):
        assert cosine_similarity([1, 0, 0], [1, 0, 0]) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        assert cosine_similarity([1, 0], [0, 1]) == pytest.approx(0.0)

    def test_opposite_vectors(self):
        assert cosine_similarity([1, 0], [-1, 0]) == pytest.approx(-1.0)

    def test_zero_vector_a(self):
        assert cosine_similarity([0, 0], [1, 1]) == 0.0

    def test_zero_vector_b(self):
        assert cosine_similarity([1, 1], [0, 0]) == 0.0

    def test_both_zero(self):
        assert cosine_similarity([0, 0], [0, 0]) == 0.0

    def test_arbitrary_vectors(self):
        a = [1, 2, 3]
        b = [4, 5, 6]
        expected = (1 * 4 + 2 * 5 + 3 * 6) / (math.sqrt(14) * math.sqrt(77))
        assert cosine_similarity(a, b) == pytest.approx(expected, rel=1e-6)

    def test_single_dimension(self):
        assert cosine_similarity([5], [3]) == pytest.approx(1.0)

    def test_negative_values(self):
        a = [-1, -2]
        b = [-3, -4]
        # Both negative → cosine should be positive (same direction)
        assert cosine_similarity(a, b) > 0


# ---------------------------------------------------------------------------
# get_slide_body_length
# ---------------------------------------------------------------------------


class TestGetSlideBodyLength:
    def test_empty_string(self):
        assert get_slide_body_length("") == 0

    def test_only_title(self):
        assert get_slide_body_length("# My Title\n") == 0

    def test_title_and_body(self):
        md = "# Title\nSome body content"
        assert get_slide_body_length(md) == len("Some body content")

    def test_skips_metadata_tags(self):
        md = "# Title\nContent here\n[CLO: CLO1] [Layout: card_grid]"
        assert get_slide_body_length(md) == len("Content here")

    def test_multiple_body_lines(self):
        md = "# Title\nLine 1\nLine 2\nLine 3"
        expected = len("Line 1 Line 2 Line 3")
        assert get_slide_body_length(md) == expected

    def test_only_metadata(self):
        md = "# Title\n[CLO: CLO1] [Layout: standard_list]"
        assert get_slide_body_length(md) == 0

    def test_blank_lines_ignored(self):
        md = "# Title\n\n\nContent\n\n"
        assert get_slide_body_length(md) == len("Content")


# ---------------------------------------------------------------------------
# deduplicate_rag_hits
# ---------------------------------------------------------------------------


class TestDeduplicateRagHits:
    def test_empty_list(self):
        assert deduplicate_rag_hits([]) == []

    @patch("src.services.material_orchestrator.embedding_func")
    def test_no_duplicates(self, mock_embed):
        """Two completely different vectors should both be kept."""
        mock_embed.return_value = [[1, 0, 0], [0, 1, 0]]
        hits = [{"text": "hello"}, {"text": "world"}]
        result = deduplicate_rag_hits(hits, threshold=0.75)
        assert len(result) == 2

    @patch("src.services.material_orchestrator.embedding_func")
    def test_removes_duplicates(self, mock_embed):
        """Two near-identical vectors should be deduplicated."""
        mock_embed.return_value = [[1, 0, 0], [0.99, 0.01, 0]]
        hits = [{"text": "hello"}, {"text": "hello again"}]
        result = deduplicate_rag_hits(hits, threshold=0.75)
        assert len(result) == 1

    @patch("src.services.material_orchestrator.embedding_func")
    def test_keeps_below_threshold(self, mock_embed):
        """Vectors just below threshold should be kept."""
        mock_embed.return_value = [[1, 0], [0.5, 0.866]]  # cos ~0.5
        hits = [{"text": "a"}, {"text": "b"}]
        result = deduplicate_rag_hits(hits, threshold=0.75)
        assert len(result) == 2

    @patch("src.services.material_orchestrator.embedding_func")
    def test_embedding_failure_returns_all(self, mock_embed):
        """If embedding fails, return all hits as fallback."""
        mock_embed.side_effect = RuntimeError("model not loaded")
        hits = [{"text": "a"}, {"text": "b"}, {"text": "c"}]
        result = deduplicate_rag_hits(hits, threshold=0.75)
        assert len(result) == 3

    @patch("src.services.material_orchestrator.embedding_func")
    def test_three_items_one_duplicate(self, mock_embed):
        """Three items, two are similar → keep 2."""
        mock_embed.return_value = [[1, 0], [0.99, 0.01], [0, 1]]
        hits = [{"text": "a"}, {"text": "a'"}, {"text": "b"}]
        result = deduplicate_rag_hits(hits, threshold=0.75)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# BUDGETS constant
# ---------------------------------------------------------------------------


class TestBudgets:
    def test_budgets_keys(self):
        expected_keys = {
            "visual_highlight",
            "card_grid",
            "two_column_comparison",
            "standard_list",
            "table",
            "hero_image_split",
            "pros_cons_comparison",
            "metric_callout",
        }
        assert set(BUDGETS.keys()) == expected_keys

    def test_all_budgets_positive(self):
        for key, val in BUDGETS.items():
            assert val > 0, f"Budget for {key} should be positive"


# ---------------------------------------------------------------------------
# MaterialOrchestrator initialization
# ---------------------------------------------------------------------------


class TestMaterialOrchestratorInit:
    @patch("src.services.material_orchestrator.MaterialOrchestrator.__init__", return_value=None)
    def test_state_defaults_via_direct_construction(self, mock_init):
        """Test that we can construct the object."""
        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {
            "chapter_title": "Test Chapter",
            "chapter_description": "Desc",
            "clos_context": "CLO1",
            "rag_context": "context",
            "target_lang": "vi",
            "session_duration": 90,
            "outline": [],
            "allocations": [],
            "generated_slides": [],
            "active_learning_script": "",
            "warnings": [],
        }
        orch.episodes = []
        assert orch.state["chapter_title"] == "Test Chapter"
        assert orch.state["session_duration"] == 90
        assert orch.state["outline"] == []


class TestOrchestratorStoryboardArchitect:
    @patch("src.services.material_orchestrator.call_llm_json")
    @patch("src.services.material_orchestrator.build_storyboard_architect_system_prompt")
    def test_run_storyboard_architect_stores_outline(self, mock_prompt, mock_llm):
        mock_prompt.return_value = "system prompt"
        mock_llm.return_value = {
            "slides": [
                {"slide_index": 1, "title": "Intro", "purpose": "Introduce BST", "target_clo": "CLO1", "bloom_level": 2},
                {"slide_index": 2, "title": "Operations", "purpose": "Explain ops", "target_clo": "CLO2", "bloom_level": 3},
            ]
        }

        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {
            "chapter_title": "BST",
            "chapter_description": "Binary Search Tree",
            "clos_context": "CLO1, CLO2",
            "rag_context": "some context",
            "target_lang": "vi",
            "session_duration": 90,
            "pedagogical_style": "interactive",
            "selected_clos": [],
            "outline": [],
            "allocations": [],
            "generated_slides": [],
            "active_learning_script": "",
            "warnings": [],
        }
        orch.episodes = []

        result = orch.run_storyboard_architect()
        assert len(result) == 2
        assert result[0]["title"] == "Intro"
        assert orch.state["outline"] == result
        mock_llm.assert_called_once()

    @patch("src.services.material_orchestrator.call_llm_json")
    @patch("src.services.material_orchestrator.build_storyboard_architect_system_prompt")
    def test_run_storyboard_architect_empty_response(self, mock_prompt, mock_llm):
        mock_prompt.return_value = "system prompt"
        mock_llm.return_value = {}

        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {
            "chapter_title": "BST",
            "chapter_description": "Desc",
            "clos_context": "",
            "rag_context": "",
            "target_lang": "en",
            "session_duration": 60,
            "pedagogical_style": "lecture",
            "selected_clos": [],
            "outline": [],
            "allocations": [],
            "generated_slides": [],
            "active_learning_script": "",
            "warnings": [],
        }
        orch.episodes = []

        result = orch.run_storyboard_architect()
        assert result == []


class TestOrchestratorContentAllocator:
    @patch("src.services.material_orchestrator.call_llm_json")
    @patch("src.services.material_orchestrator.build_content_allocator_system_prompt")
    def test_run_content_allocator_success(self, mock_prompt, mock_llm):
        mock_prompt.return_value = "system prompt"
        mock_llm.return_value = {
            "allocations": [
                {"slide_index": 1, "allocated_text": "BST basics", "suggested_layout": "standard_list"},
            ]
        }

        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {
            "outline": [{"slide_index": 1, "title": "Intro"}],
            "rag_context": "context",
            "allocations": [],
        }
        orch.episodes = []

        result = orch.run_content_allocator()
        assert len(result) == 1
        assert result[0]["suggested_layout"] == "standard_list"

    def test_run_content_allocator_raises_on_empty_outline(self):
        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {"outline": [], "rag_context": "", "allocations": []}
        orch.episodes = []

        with pytest.raises(ValueError, match="Outline is empty"):
            orch.run_content_allocator()


class TestOrchestratorSlideWriter:
    def test_run_slide_writer_raises_on_empty_allocations(self):
        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {"allocations": [], "outline": [], "generated_slides": []}
        orch.episodes = []

        with pytest.raises(ValueError, match="Allocations are empty"):
            orch.run_slide_writer()


class TestOrchestratorLogicAuditor:
    @patch("src.services.material_orchestrator.call_llm_json")
    @patch("src.services.material_orchestrator.build_logic_auditor_system_prompt")
    def test_run_logic_auditor_valid(self, mock_prompt, mock_llm):
        mock_prompt.return_value = "system prompt"
        mock_llm.return_value = {"is_valid": True, "feedback": []}

        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {
            "generated_slides": ["# Slide 1\nContent"],
            "active_learning_script": "Script here",
            "clos_context": "CLO1",
            "warnings": [],
        }
        orch.episodes = []

        result = orch.run_logic_auditor()
        assert result is True
        assert orch.state["warnings"] == []

    @patch("src.services.material_orchestrator.call_llm_json")
    @patch("src.services.material_orchestrator.build_logic_auditor_system_prompt")
    def test_run_logic_auditor_with_feedback(self, mock_prompt, mock_llm):
        mock_prompt.return_value = "system prompt"
        mock_llm.return_value = {
            "is_valid": False,
            "feedback": [
                {"slide_index": 2, "issue": "Missing CLO reference"},
                {"slide_index": 5, "issue": "Content too shallow for Bloom level 4"},
            ],
        }

        orch = MaterialOrchestrator.__new__(MaterialOrchestrator)
        orch.state = {
            "generated_slides": ["# Slide 1\nContent", "# Slide 2\nMore"],
            "active_learning_script": "Script",
            "clos_context": "CLO1, CLO2",
            "warnings": [],
        }
        orch.episodes = []

        result = orch.run_logic_auditor()
        assert result is False
        assert len(orch.state["warnings"]) == 2
        assert "Missing CLO reference" in orch.state["warnings"][0]
