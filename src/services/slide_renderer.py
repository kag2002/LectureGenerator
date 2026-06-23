import logging
import re

logger = logging.getLogger(__name__)


def escape_xml(s: str) -> str:
    """Helper function to escape XML special characters."""
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")
    )


def render_slide_to_svg(s: dict, theme: str, idx: int) -> str:
    """
    Renders a slide dictionary to an SVG string using the specified theme.
    """
    title = escape_xml(s.get("title", ""))
    items = s.get("items", [])
    citations = s.get("citations", [])
    slide_layout = s.get("layout", None)

    # Colors based on theme name
    themes_colors = {
        "deep_space": {
            "bg": "#0A0A1A",
            "bg2": "#1E1B4B",
            "text": "#FFFFFF",
            "accent": "#00D2FF",
            "accent2": "#7C4DFF",
            "sub": "#8899BB",
            "card": "#12122B",
        },
        "warm_academic": {
            "bg": "#FAF6EE",
            "bg2": "#FAF6EE",
            "text": "#1A202C",
            "accent": "#8C6239",
            "accent2": "#1A365D",
            "sub": "#5A6A80",
            "card": "#FFFFFF",
        },
        "mint_techno": {
            "bg": "#0B132B",
            "bg2": "#1C2541",
            "text": "#FFFFFF",
            "accent": "#1DE9B6",
            "accent2": "#00B0FF",
            "sub": "#B2DFDB",
            "card": "#1C2541",
        },
        "sunset_crimson": {
            "bg": "#1A0813",
            "bg2": "#3B0F25",
            "text": "#FFFFFF",
            "accent": "#FF5252",
            "accent2": "#FF4081",
            "sub": "#FF8A80",
            "card": "#3B0F25",
        },
        "mckinsey_consulting": {
            "bg": "#041E42",
            "bg2": "#0B2545",
            "text": "#FFFFFF",
            "accent": "#00A3A6",
            "accent2": "#007A87",
            "sub": "#80CBC4",
            "card": "#0B2545",
        },
    }
    colors = themes_colors.get(theme, themes_colors["warm_academic"])

    # Determine layout
    text_items = [it for it in items if it.get("type") == "text"]
    table_items = [it for it in items if it.get("type") == "table"]
    num_text = len(text_items)
    has_table = len(table_items) > 0

    if slide_layout == "card_grid":
        use_cards = True
    elif slide_layout in ["standard_list", "two_column_comparison", "visual_highlight", "table"]:
        use_cards = False
    else:
        use_cards = (not has_table) and (1 <= num_text <= 4)

    # Dynamic font size based on total text content length
    total_chars = sum(len(it.get("raw_text", "")) for it in text_items)
    if total_chars > 800:
        body_font = 14
    elif total_chars > 500:
        body_font = 16
    elif total_chars > 300:
        body_font = 18
    else:
        body_font = 20
    line_height = int(body_font * 1.75)

    svg_lines = []
    svg_lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    svg_lines.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">')

    # Background with gradient
    svg_lines.append("  <defs>")
    svg_lines.append('    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">')
    svg_lines.append(f'      <stop offset="0%" stop-color="{colors["bg"]}" />')
    svg_lines.append(f'      <stop offset="100%" stop-color="{colors["bg2"]}" />')
    svg_lines.append("    </linearGradient>")
    svg_lines.append("  </defs>")
    svg_lines.append('  <rect x="0" y="0" width="1280" height="720" fill="url(#bgGrad)" />')

    # Decorative accent circle (top-right)
    svg_lines.append(f'  <circle cx="1180" cy="-40" r="200" fill="{colors["accent2"]}" opacity="0.08" />')

    # Title
    svg_lines.append(
        f'  <text x="80" y="85" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="{colors["accent"]}">{title}</text>'
    )
    # Gradient accent line
    svg_lines.append(
        f'  <defs><linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="{colors["accent2"]}" /><stop offset="100%" stop-color="{colors["accent"]}" /></linearGradient></defs>'
    )
    svg_lines.append('  <rect x="80" y="105" width="1120" height="3" fill="url(#lineGrad)" rx="1.5" />')

    # Mermaid rendering block
    mermaid_code = s.get("mermaid_content", None)
    rendered_mermaid_svg = ""
    if mermaid_code:
        try:
            from src.utils.mermaid_renderer import render_mermaid_to_svg
            rendered_mermaid_svg = render_mermaid_to_svg(mermaid_code, theme)
            # Remove XML declaration and doctype
            rendered_mermaid_svg = re.sub(r'<\?xml.*?\?>', '', rendered_mermaid_svg, flags=re.DOTALL)
            rendered_mermaid_svg = re.sub(r'<!DOCTYPE.*?>', '', rendered_mermaid_svg, flags=re.DOTALL)
        except Exception as e:
            logger.error(f"Failed to render mermaid diagram in slide_renderer: {e}")

    if rendered_mermaid_svg:
        # Split layout: text items on the left, Mermaid SVG on the right
        col_font = min(body_font, 18)
        col_lh = int(col_font * 1.7)
        cy = 180
        for item in text_items:
            raw = escape_xml(item.get("raw_text", "").replace("**", "").strip())
            prefix = "• " if item.get("bullet", True) else ""
            words = (prefix + raw).split()
            max_chars = max(20, int(520 / (col_font * 0.45)))
            curr = []
            for w in words:
                if len(" ".join(curr + [w])) > max_chars:
                    svg_lines.append(
                        f'  <text x="80" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">{" ".join(curr)}</text>'
                    )
                    cy += col_lh
                    curr = [w]
                else:
                    curr.append(w)
            if curr:
                svg_lines.append(
                    f'  <text x="80" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">{" ".join(curr)}</text>'
                )
                cy += col_lh
            cy += 8
            if cy > 600:
                break

        # Embed Mermaid SVG nested on the right side
        svg_lines.append('  <svg x="640" y="160" width="560" height="430" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">')
        svg_lines.append(rendered_mermaid_svg)
        svg_lines.append('  </svg>')

    elif slide_layout == "metric_callout":
        all_text = " ".join(escape_xml(it.get("raw_text", "").strip()) for it in text_items)
        number_text, label_text = "", all_text
        bold_match = re.match(r"^\*\*(.*?)\*\*\s*[:\-—]?\s*(.*)$", all_text)
        if not bold_match:
            bold_match = re.match(r"^(.*?)\s*[:\-—]\s*(.*)$", all_text)
        if bold_match:
            number_text = bold_match.group(1).replace("**", "")
            label_text = bold_match.group(2)
        else:
            parts = all_text.split(" ", 1)
            if parts:
                number_text = parts[0]
                label_text = parts[1] if len(parts) > 1 else ""

        svg_lines.append(
            f'  <text x="640" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="96" font-weight="800" fill="{colors["accent"]}">{number_text}</text>'
        )
        if label_text:
            svg_lines.append(
                f'  <text x="640" y="380" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="600" fill="{colors["text"]}">{label_text}</text>'
            )

    elif slide_layout == "hero_image_split":
        img_url = "https://images.unsplash.com/photo-placeholder"
        clean_text_items = []
        for it in text_items:
            raw = it.get("raw_text", "")
            img_match = re.search(r"!\[.*?\]\((.*?)\)", raw)
            if img_match:
                img_url = img_match.group(1)
            clean_raw = re.sub(r"!\[.*?\]\((.*?)\)", "", raw).strip()
            if clean_raw:
                clean_text_items.append(clean_raw)

        # Draw image on left
        svg_lines.append(
            '  <rect x="80" y="160" width="520" height="420" rx="8" fill="rgba(255,255,255,0.05)" />'
        )
        svg_lines.append(
            f'  <image href="{img_url}" x="80" y="160" width="520" height="420" preserveAspectRatio="xMidYMid slice" clip-path="inset(0% round 8px)" />'
        )

        # Draw text on right
        col_font = min(body_font, 18)
        col_lh = int(col_font * 1.7)
        cy = 180
        for raw in clean_text_items:
            raw_clean = escape_xml(raw.replace("**", "").strip())
            words = raw_clean.split()
            max_chars = max(20, int(520 / (col_font * 0.45)))
            curr = []
            for w in words:
                if len(" ".join(curr + [w])) > max_chars:
                    svg_lines.append(
                        f'  <text x="640" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">• {" ".join(curr)}</text>'
                    )
                    cy += col_lh
                    curr = [w]
                else:
                    curr.append(w)
            if curr:
                svg_lines.append(
                    f'  <text x="640" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">• {" ".join(curr)}</text>'
                )
                cy += col_lh
            cy += 10

    elif slide_layout == "pros_cons_comparison":
        pros = []
        cons = []
        for item in text_items:
            raw = item.get("raw_text", "").replace("**", "")
            raw_lower = raw.lower()
            if any(k in raw_lower for k in ["ưu điểm", "pro", "lợi ích", "advantages", "thuận lợi", "tích cực"]):
                pros.append(raw)
            elif any(k in raw_lower for k in ["nhược điểm", "con", "hạn chế", "disadvantages", "khó khăn", "tiêu cực"]):
                cons.append(raw)
            else:
                if len(pros) <= len(cons):
                    pros.append(raw)
                else:
                    cons.append(raw)

        col_font = min(body_font, 16)
        col_lh = int(col_font * 1.7)

        svg_lines.append(
            '  <line x1="640" y1="160" x2="640" y2="600" stroke="rgba(255,255,255,0.08)" stroke-width="1" />'
        )

        # Pros (Left)
        svg_lines.append(
            f'  <text x="80" y="190" font-family="Arial, sans-serif" font-size="{col_font + 2}" font-weight="700" fill="#10B981">▲ Ưu điểm &amp; Lợi ích</text>'
        )
        cy = 230
        for p in pros:
            raw_clean = escape_xml(p.strip())
            words = raw_clean.split()
            max_chars = max(20, int(480 / (col_font * 0.45)))
            curr = []
            for w in words:
                if len(" ".join(curr + [w])) > max_chars:
                    svg_lines.append(
                        f'  <text x="80" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">• {" ".join(curr)}</text>'
                    )
                    cy += col_lh
                    curr = [w]
                else:
                    curr.append(w)
            if curr:
                svg_lines.append(
                    f'  <text x="80" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">• {" ".join(curr)}</text>'
                )
                cy += col_lh
            cy += 8

        # Cons (Right)
        svg_lines.append(
            f'  <text x="680" y="190" font-family="Arial, sans-serif" font-size="{col_font + 2}" font-weight="700" fill="#EF4444">▼ Nhược điểm &amp; Hạn chế</text>'
        )
        cy = 230
        for c in cons:
            raw_clean = escape_xml(c.strip())
            words = raw_clean.split()
            max_chars = max(20, int(480 / (col_font * 0.45)))
            curr = []
            for w in words:
                if len(" ".join(curr + [w])) > max_chars:
                    svg_lines.append(
                        f'  <text x="680" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">• {" ".join(curr)}</text>'
                    )
                    cy += col_lh
                    curr = [w]
                else:
                    curr.append(w)
            if curr:
                svg_lines.append(
                    f'  <text x="680" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">• {" ".join(curr)}</text>'
                )
                cy += col_lh
            cy += 8

    elif use_cards and num_text <= 4:
        # Card grid layout
        card_configs = {
            1: [{"x": 120, "y": 155, "w": 1040, "h": 430}],
            2: [{"x": 80, "y": 155, "w": 560, "h": 430}, {"x": 660, "y": 155, "w": 560, "h": 430}],
            3: [
                {"x": 60, "y": 155, "w": 370, "h": 430},
                {"x": 450, "y": 155, "w": 370, "h": 430},
                {"x": 840, "y": 155, "w": 370, "h": 430},
            ],
            4: [
                {"x": 80, "y": 140, "w": 560, "h": 205},
                {"x": 660, "y": 140, "w": 560, "h": 205},
                {"x": 80, "y": 365, "w": 560, "h": 205},
                {"x": 660, "y": 365, "w": 560, "h": 205},
            ],
        }
        accent_list = [
            colors["accent2"],
            colors["accent"],
            colors.get("accent2", colors["accent"]),
            colors["sub"],
        ]
        configs = card_configs.get(num_text, card_configs[1])
        card_font = min(body_font, 16 if num_text == 4 else 18)
        card_lh = int(card_font * 1.75)

        for c_idx, item in enumerate(text_items[: len(configs)]):
            cfg = configs[c_idx]
            border_color = accent_list[c_idx % len(accent_list)]
            raw_text = item.get("raw_text", "")
            clean_text = escape_xml(raw_text.replace("**", "").strip())

            # Card background
            svg_lines.append(
                f'  <rect x="{cfg["x"]}" y="{cfg["y"]}" width="{cfg["w"]}" height="{cfg["h"]}" rx="12" fill="{colors["card"]}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />'
            )
            # Card left accent border
            svg_lines.append(
                f'  <rect x="{cfg["x"]}" y="{cfg["y"]}" width="5" height="{cfg["h"]}" rx="2" fill="{border_color}" />'
            )

            # Try to split title:body
            title_text, body_text = "", clean_text
            bold_match = re.match(r"^(.*?)\s*[:\-—]\s*(.+)$", clean_text)
            if bold_match and len(bold_match.group(1)) < 30:
                title_text = bold_match.group(1)
                body_text = bold_match.group(2)

            card_y = cfg["y"] + 30
            if title_text:
                svg_lines.append(
                    f'  <text x="{cfg["x"] + 25}" y="{card_y}" font-family="Arial, sans-serif" font-size="{card_font + 2}" font-weight="700" fill="{colors["accent"]}">{escape_xml(title_text)}</text>'
                )
                card_y += card_lh + 5

            # Word-wrap body text within card
            max_chars = max(20, int((cfg["w"] - 50) / (card_font * 0.45)))
            words = body_text.split()
            wrap_lines = []
            curr = []
            for w in words:
                if len(" ".join(curr + [w])) > max_chars:
                    wrap_lines.append(" ".join(curr))
                    curr = [w]
                else:
                    curr.append(w)
            if curr:
                wrap_lines.append(" ".join(curr))

            max_lines = max(1, int((cfg["h"] - (card_y - cfg["y"]) - 20) / card_lh))
            for li, lt in enumerate(wrap_lines[:max_lines]):
                svg_lines.append(
                    f'  <text x="{cfg["x"] + 25}" y="{card_y}" font-family="Arial, sans-serif" font-size="{card_font}" fill="{colors["text"]}">{lt}</text>'
                )
                card_y += card_lh

    elif slide_layout == "two_column_comparison" and num_text >= 2:
        # Two-column comparison
        mid = max(1, num_text // 2)
        left_items = text_items[:mid]
        right_items = text_items[mid:]
        col_font = min(body_font, 17)
        col_lh = int(col_font * 1.75)

        # Divider
        svg_lines.append(
            '  <line x1="640" y1="150" x2="640" y2="620" stroke="rgba(255,255,255,0.08)" stroke-width="1" />'
        )

        for col_idx, col_items in enumerate([left_items, right_items]):
            base_x = 80 if col_idx == 0 else 670
            cy = 175
            for item in col_items:
                raw = escape_xml(item.get("raw_text", "").replace("**", "").strip())
                prefix = "• " if item.get("bullet", True) else ""
                max_chars = max(20, int(530 / (col_font * 0.45)))
                words = (prefix + raw).split()
                curr = []
                for w in words:
                    if len(" ".join(curr + [w])) > max_chars:
                        svg_lines.append(
                            f'  <text x="{base_x}" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">{" ".join(curr)}</text>'
                        )
                        cy += col_lh
                        curr = [w]
                    else:
                        curr.append(w)
                if curr:
                    svg_lines.append(
                        f'  <text x="{base_x}" y="{cy}" font-family="Arial, sans-serif" font-size="{col_font}" fill="{colors["text"]}">{" ".join(curr)}</text>'
                    )
                    cy += col_lh
                cy += 8
                if cy > 620:
                    break

    elif slide_layout == "visual_highlight":
        # Centered large text
        all_text = " ".join(escape_xml(it.get("raw_text", "").replace("**", "").strip()) for it in text_items)
        hl_font = 28 if len(all_text) < 100 else (22 if len(all_text) < 200 else 18)
        max_chars = max(30, int(1060 / (hl_font * 0.45)))
        words = all_text.split()
        wrap_lines = []
        curr = []
        for w in words:
            if len(" ".join(curr + [w])) > max_chars:
                wrap_lines.append(" ".join(curr))
                curr = [w]
            else:
                curr.append(w)
        if curr:
            wrap_lines.append(" ".join(curr))

        total_h = len(wrap_lines) * int(hl_font * 1.8)
        start_y = max(180, 360 - total_h // 2)
        for lt in wrap_lines:
            svg_lines.append(
                f'  <text x="640" y="{start_y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="{hl_font}" font-weight="600" font-style="italic" fill="{colors["accent"]}">{lt}</text>'
            )
            start_y += int(hl_font * 1.8)

    elif has_table and table_items:
        # Table layout
        table_data = table_items[0]
        rows = table_data.get("rows", [])
        if rows:
            num_cols = max(len(r) for r in rows)
            col_w = min(250, int(1060 / max(1, num_cols)))
            row_h = 35
            table_x = 80 + (1060 - col_w * num_cols) // 2

            # Render text items above table if any
            ty = 155
            for item in text_items:
                raw = escape_xml(item.get("raw_text", "").replace("**", "").strip())
                prefix = "• " if item.get("bullet") else ""
                svg_lines.append(
                    f'  <text x="80" y="{ty}" font-family="Arial, sans-serif" font-size="{body_font}" fill="{colors["text"]}">{prefix}{raw}</text>'
                )
                ty += line_height
                if ty > 350:
                    break

            table_y = max(ty + 20, 250)
            for r_idx, row in enumerate(rows):
                for c_idx, cell in enumerate(row[:num_cols]):
                    cx = table_x + c_idx * col_w
                    cy = table_y + r_idx * row_h
                    cell_text = (
                        cell
                        if isinstance(cell, str)
                        else str(cell.get("text", ""))
                        if isinstance(cell, dict)
                        else str(cell)
                    )
                    cell_text = escape_xml(cell_text.replace("**", ""))

                    # Header row styling
                    if r_idx == 0:
                        svg_lines.append(
                            f'  <rect x="{cx}" y="{cy}" width="{col_w}" height="{row_h}" fill="{colors["accent2"]}" opacity="0.4" stroke="rgba(255,255,255,0.1)" stroke-width="1" />'
                        )
                        svg_lines.append(
                            f'  <text x="{cx + 10}" y="{cy + 23}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="{colors["accent"]}">{cell_text}</text>'
                        )
                    else:
                        svg_lines.append(
                            f'  <rect x="{cx}" y="{cy}" width="{col_w}" height="{row_h}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />'
                        )
                        svg_lines.append(
                            f'  <text x="{cx + 10}" y="{cy + 23}" font-family="Arial, sans-serif" font-size="13" fill="{colors["text"]}">{cell_text}</text>'
                        )

    else:
        # Standard bullet list
        y = 155
        for item in items:
            if item.get("type") == "table":
                continue
            raw_text = item.get("raw_text", "")
            clean_text = escape_xml(raw_text.replace("**", "").replace("* ", "").strip())

            max_chars = max(30, int(1100 / (body_font * 0.45)))
            words = clean_text.split()
            wrap_lines = []
            curr = []
            for w in words:
                if len(" ".join(curr + [w])) > max_chars:
                    wrap_lines.append(" ".join(curr))
                    curr = [w]
                else:
                    curr.append(w)
            if curr:
                wrap_lines.append(" ".join(curr))

            for i, l_text in enumerate(wrap_lines):
                prefix = "• " if (i == 0 and item.get("bullet", True)) else "  "
                svg_lines.append(
                    f'  <text x="80" y="{y}" font-family="Arial, sans-serif" font-size="{body_font}" fill="{colors["text"]}">{prefix}{l_text}</text>'
                )
                y += line_height
                if y > 620:
                    break
            y += 8
            if y > 620:
                break

    # Citations
    if citations:
        cite_text = escape_xml(" | ".join(citations))
        svg_lines.append(
            f'  <text x="80" y="680" font-family="Arial, sans-serif" font-size="11" font-style="italic" fill="{colors["sub"]}">📖 {cite_text}</text>'
        )

    # Slide number
    svg_lines.append(
        f'  <text x="1200" y="680" text-anchor="end" font-family="Arial, sans-serif" font-size="13" fill="{colors["sub"]}">{idx + 1:02d}</text>'
    )
    svg_lines.append("</svg>")

    return "\n".join(svg_lines)
