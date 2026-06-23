"""
Unit tests for the slide_renderer module.

Tests cover escape_xml, render_slide_to_svg with various themes and layouts.
"""

import pytest

from src.services.slide_renderer import escape_xml, render_slide_to_svg


# ---------------------------------------------------------------------------
# escape_xml
# ---------------------------------------------------------------------------


class TestEscapeXml:
    def test_ampersand(self):
        assert escape_xml("A & B") == "A &amp; B"

    def test_less_than(self):
        assert escape_xml("a < b") == "a &lt; b"

    def test_greater_than(self):
        assert escape_xml("a > b") == "a &gt; b"

    def test_double_quote(self):
        assert escape_xml('say "hello"') == "say &quot;hello&quot;"

    def test_single_quote(self):
        assert escape_xml("it's") == "it&apos;s"

    def test_combined(self):
        assert escape_xml('<a href="x">&</a>') == "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;"

    def test_no_special_chars(self):
        assert escape_xml("hello world 123") == "hello world 123"

    def test_empty_string(self):
        assert escape_xml("") == ""

    def test_unicode_passthrough(self):
        assert escape_xml("Xin chào thế giới") == "Xin chào thế giới"


# ---------------------------------------------------------------------------
# render_slide_to_svg — basic structure
# ---------------------------------------------------------------------------


class TestRenderSlideToSvg:
    @pytest.fixture
    def basic_slide(self):
        return {
            "title": "Introduction to BST",
            "items": [
                {"type": "text", "raw_text": "Binary Search Trees are data structures.", "bullet": True},
                {"type": "text", "raw_text": "They support O(log n) search.", "bullet": True},
            ],
            "citations": [],
        }

    def test_returns_string(self, basic_slide):
        result = render_slide_to_svg(basic_slide, "warm_academic", 0)
        assert isinstance(result, str)

    def test_contains_svg_tags(self, basic_slide):
        result = render_slide_to_svg(basic_slide, "warm_academic", 0)
        assert "<svg" in result
        assert "</svg>" in result

    def test_contains_title(self, basic_slide):
        result = render_slide_to_svg(basic_slide, "warm_academic", 0)
        assert "Introduction to BST" in result

    def test_contains_slide_number(self, basic_slide):
        result = render_slide_to_svg(basic_slide, "warm_academic", 2)
        assert ">03<" in result  # idx 2 → display "03"

    def test_contains_content_text(self, basic_slide):
        result = render_slide_to_svg(basic_slide, "warm_academic", 0)
        assert "Binary Search Trees" in result

    def test_escapes_special_chars_in_title(self):
        slide = {"title": "A & B < C", "items": [], "citations": []}
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "A &amp; B &lt; C" in result


# ---------------------------------------------------------------------------
# render_slide_to_svg — themes
# ---------------------------------------------------------------------------


class TestRenderSlideThemes:
    @pytest.fixture
    def slide(self):
        return {
            "title": "Test",
            "items": [{"type": "text", "raw_text": "Content", "bullet": True}],
            "citations": [],
        }

    def test_deep_space_theme(self, slide):
        result = render_slide_to_svg(slide, "deep_space", 0)
        assert "#0A0A1A" in result  # deep_space bg color

    def test_warm_academic_theme(self, slide):
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "#FAF6EE" in result  # warm_academic bg color

    def test_mint_techno_theme(self, slide):
        result = render_slide_to_svg(slide, "mint_techno", 0)
        assert "#0B132B" in result  # mint_techno bg color

    def test_sunset_crimson_theme(self, slide):
        result = render_slide_to_svg(slide, "sunset_crimson", 0)
        assert "#1A0813" in result

    def test_mckinsey_consulting_theme(self, slide):
        result = render_slide_to_svg(slide, "mckinsey_consulting", 0)
        assert "#041E42" in result

    def test_unknown_theme_falls_back(self, slide):
        result = render_slide_to_svg(slide, "nonexistent_theme", 0)
        # Falls back to warm_academic
        assert "#FAF6EE" in result


# ---------------------------------------------------------------------------
# render_slide_to_svg — layouts
# ---------------------------------------------------------------------------


class TestRenderSlideLayouts:
    def test_card_grid_layout(self):
        slide = {
            "title": "Cards",
            "layout": "card_grid",
            "items": [
                {"type": "text", "raw_text": "Card 1 content", "bullet": False},
                {"type": "text", "raw_text": "Card 2 content", "bullet": False},
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "deep_space", 0)
        assert "Card 1 content" in result
        assert "Card 2 content" in result
        assert "rx=\"12\"" in result  # card rounded corners

    def test_standard_list_layout(self):
        slide = {
            "title": "List",
            "layout": "standard_list",
            "items": [
                {"type": "text", "raw_text": "Item 1", "bullet": True},
                {"type": "text", "raw_text": "Item 2", "bullet": True},
                {"type": "text", "raw_text": "Item 3", "bullet": True},
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "Item 1" in result
        assert "•" in result

    def test_visual_highlight_layout(self):
        slide = {
            "title": "Highlight",
            "layout": "visual_highlight",
            "items": [
                {"type": "text", "raw_text": "Key insight about learning", "bullet": False},
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "deep_space", 0)
        assert "Key insight about learning" in result
        assert 'text-anchor="middle"' in result  # centered text

    def test_two_column_comparison_layout(self):
        slide = {
            "title": "Comparison",
            "layout": "two_column_comparison",
            "items": [
                {"type": "text", "raw_text": "Left column content", "bullet": True},
                {"type": "text", "raw_text": "Right column content", "bullet": True},
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "mint_techno", 0)
        assert "Left column content" in result
        assert "Right column content" in result

    def test_table_layout(self):
        slide = {
            "title": "Table",
            "layout": "table",
            "items": [
                {
                    "type": "table",
                    "rows": [
                        ["Header 1", "Header 2"],
                        ["Row 1 Col 1", "Row 1 Col 2"],
                        ["Row 2 Col 1", "Row 2 Col 2"],
                    ],
                }
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "Header 1" in result
        assert "Row 1 Col 1" in result


# ---------------------------------------------------------------------------
# render_slide_to_svg — citations
# ---------------------------------------------------------------------------


class TestRenderSlideCitations:
    def test_citations_rendered(self):
        slide = {
            "title": "With Citations",
            "items": [{"type": "text", "raw_text": "Content", "bullet": True}],
            "citations": ["Cormen et al., 2009", "Sedgewick, 2011"],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "Cormen et al., 2009" in result
        assert "Sedgewick, 2011" in result

    def test_no_citations(self):
        slide = {
            "title": "No Cite",
            "items": [{"type": "text", "raw_text": "Content", "bullet": True}],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "📖" not in result


# ---------------------------------------------------------------------------
# render_slide_to_svg — dynamic font sizing
# ---------------------------------------------------------------------------


class TestRenderSlideFontSizing:
    def test_short_content_uses_large_font(self):
        slide = {
            "title": "Short",
            "layout": "standard_list",
            "items": [{"type": "text", "raw_text": "Brief", "bullet": True}],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert 'font-size="20"' in result

    def test_long_content_uses_small_font(self):
        long_text = "A " * 500  # 1000 chars
        slide = {
            "title": "Long",
            "layout": "standard_list",
            "items": [{"type": "text", "raw_text": long_text, "bullet": True}],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert 'font-size="14"' in result


# ---------------------------------------------------------------------------
# render_slide_to_svg — edge cases
# ---------------------------------------------------------------------------


class TestRenderSlideEdgeCases:
    def test_empty_slide(self):
        slide = {"title": "", "items": [], "citations": []}
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "<svg" in result
        assert "</svg>" in result

    def test_four_card_layout(self):
        slide = {
            "title": "Four Cards",
            "layout": "card_grid",
            "items": [
                {"type": "text", "raw_text": f"Card {i}", "bullet": False}
                for i in range(4)
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "deep_space", 0)
        assert "Card 0" in result
        assert "Card 3" in result

    def test_table_with_dict_cells(self):
        slide = {
            "title": "Dict Table",
            "layout": "table",
            "items": [
                {
                    "type": "table",
                    "rows": [
                        [{"text": "H1"}, {"text": "H2"}],
                        [{"text": "V1"}, {"text": "V2"}],
                    ],
                }
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "warm_academic", 0)
        assert "H1" in result
        assert "V2" in result

    def test_card_with_title_body_split(self):
        """Cards with 'Title: Body' pattern should split correctly."""
        slide = {
            "title": "Split Test",
            "layout": "card_grid",
            "items": [
                {"type": "text", "raw_text": "Key Concept: This is the explanation", "bullet": False},
            ],
            "citations": [],
        }
        result = render_slide_to_svg(slide, "deep_space", 0)
        assert "Key Concept" in result
        assert "This is the explanation" in result
