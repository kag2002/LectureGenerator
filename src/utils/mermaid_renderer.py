import base64
import logging

import requests

logger = logging.getLogger(__name__)

# Fallback styled text SVG if everything fails
def get_fallback_svg(mermaid_code: str, error_msg: str = "") -> str:
    escaped_code = mermaid_code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="800" height="400">
  <rect x="10" y="10" width="780" height="380" rx="10" fill="#1E1B4B" stroke="#7C4DFF" stroke-width="2" />
  <text x="400" y="50" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#00D2FF" text-anchor="middle">Sơ đồ bài giảng (Mermaid.js)</text>
  <foreignObject x="40" y="80" width="720" height="280">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color: #E2E8F0; font-family: monospace; font-size: 13px; overflow: auto; height: 100%; white-space: pre-wrap;">
{escaped_code}
    </div>
  </foreignObject>
</svg>"""

def render_via_mermaid_ink(mermaid_code: str) -> str:
    """Renders the Mermaid code using the mermaid.ink public API."""
    try:
        # Base64 encode the code for mermaid.ink
        code_bytes = mermaid_code.encode("utf-8")
        b64_encoded = base64.b64encode(code_bytes).decode("utf-8")
        url = f"https://mermaid.ink/svg/{b64_encoded}"

        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            logger.info("Successfully rendered Mermaid diagram via mermaid.ink.")
            return response.text
        else:
            logger.warning(f"mermaid.ink returned status code: {response.status_code}")
    except Exception as e:
        logger.error(f"Error rendering via mermaid.ink: {e}")
    raise RuntimeError("Failed to render diagram via mermaid.ink API")

def render_via_playwright(mermaid_code: str, theme: str = "default") -> str:
    """Renders the Mermaid code locally using Playwright."""
    from playwright.sync_api import sync_playwright

    # Map our slide themes to Mermaid built-in themes
    # Mermaid themes: default, neutral, dark, forest
    mermaid_theme = "default"
    if theme in ["deep_space", "mint_techno", "sunset_crimson", "mckinsey_consulting"]:
        mermaid_theme = "dark"
    elif theme == "warm_academic":
        mermaid_theme = "neutral"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()

            # Simple wrapper page loading Mermaid from CDN
            html_content = f"""<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body {{
      margin: 0;
      padding: 20px;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
    }}
    /* Style overrides for custom themes */
    .node rect {{
      rx: 6px;
      ry: 6px;
    }}
  </style>
</head>
<body>
  <div id="mermaid-container" class="mermaid">
{mermaid_code}
  </div>
  <script>
    mermaid.initialize({{
      startOnLoad: true,
      theme: '{mermaid_theme}',
      securityLevel: 'loose'
    }});
  </script>
</body>
</html>"""
            page.set_content(html_content)

            # Wait for Mermaid to compile and render the SVG element
            page.wait_for_selector("div.mermaid svg", timeout=8000)

            # Extract outer HTML of SVG
            svg_content = page.eval_on_selector("div.mermaid svg", "el => el.outerHTML")
            return svg_content
        finally:
            browser.close()

def render_mermaid_to_svg(mermaid_code: str, theme: str = "default") -> str:
    """
    Tries to render Mermaid to SVG using Playwright.
    Falls back to mermaid.ink if Playwright is unavailable or fails.
    Falls back to a styled text box if everything fails.
    """
    if not mermaid_code or not mermaid_code.strip():
        return ""

    # Try local Playwright first
    try:
        logger.info("Attempting local Playwright render...")
        return render_via_playwright(mermaid_code, theme)
    except ImportError:
        logger.warning("Playwright python package is not installed. Falling back to mermaid.ink API.")
    except Exception as e:
        logger.warning(f"Playwright render failed: {e}. Falling back to mermaid.ink API.")

    # Try mermaid.ink public API next
    try:
        logger.info("Attempting mermaid.ink API render...")
        return render_via_mermaid_ink(mermaid_code)
    except Exception as e:
        logger.error(f"mermaid.ink render failed: {e}")

    # Final fallback: return styled text box SVG containing code
    logger.warning("All Mermaid render paths failed. Using text-based fallback SVG.")
    return get_fallback_svg(mermaid_code)
