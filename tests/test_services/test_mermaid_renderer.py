import pytest
from src.utils.mermaid_renderer import render_mermaid_to_svg, render_via_playwright, render_via_mermaid_ink

@pytest.mark.asyncio
async def test_mermaid_render_success():
    mermaid_code = """graph TD
    A[Start] --> B(Process)
    B --> C{{Decision}}
    C -->|Yes| D[End]
    C -->|No| E[Loop]
    E --> B"""
    
    # Render using the unified wrapper
    svg_result = render_mermaid_to_svg(mermaid_code)
    
    # Assert result is non-empty and contains svg elements
    assert svg_result is not None
    assert "<svg" in svg_result
    assert "</svg>" in svg_result

def test_mermaid_ink_fallback():
    mermaid_code = """graph LR
    X --> Y"""
    
    # Force use of mermaid.ink render directly
    svg_result = render_via_mermaid_ink(mermaid_code)
    assert svg_result is not None
    assert "<svg" in svg_result
