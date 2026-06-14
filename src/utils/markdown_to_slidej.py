import math
import re


def extract_and_clean_citations(line_text: str):
    """
    Extracts citations like [Nguồn: ...] from a line of text.
    Returns the cleaned line text and the formatted citation.
    """
    pattern = r"\s*\[(nguồn|source|ref|trang|page)\s*:\s*([^\]]+)\]"
    match = re.search(pattern, line_text, re.IGNORECASE)

    citation = None
    cleaned_text = line_text

    if match:
        full_match_str = match.group(0)
        source_prefix = match.group(1).capitalize()
        source_detail = match.group(2).strip()

        citation = f"{source_prefix}: {source_detail}"
        cleaned_text = line_text.replace(full_match_str, "").strip()

    return cleaned_text, citation


def extract_and_clean_layout(line_text: str):
    """
    Extracts layout tags like [Layout: ...] from a line of text.
    Returns the cleaned line text and the layout name.
    """
    pattern = r"\s*\[Layout\s*:\s*([^\]]+)\]"
    match = re.search(pattern, line_text, re.IGNORECASE)
    layout = None
    cleaned_text = line_text
    if match:
        layout = match.group(1).strip()
        cleaned_text = line_text.replace(match.group(0), "").strip()
    return cleaned_text, layout


class SlideLayoutMapper:
    INCH_TO_PT = 72.0

    def __init__(self, canvas_width: float = 13.33, canvas_height: float = 7.5):
        self.width_pt = canvas_width * self.INCH_TO_PT
        self.height_pt = canvas_height * self.INCH_TO_PT

    def calculate_text_height(
        self, text_paragraphs: list[str], font_size: float, box_width_pt: float, line_spacing: float = 1.25
    ) -> float:
        char_width_pt = font_size * 0.40
        max_chars_per_line = max(1, int(box_width_pt / char_width_pt))

        total_height = 0.0
        for para in text_paragraphs:
            if not para.strip():
                continue
            text_len = len(para)
            num_lines = math.ceil(text_len / max_chars_per_line)
            para_height = num_lines * font_size * line_spacing
            total_height += para_height + (font_size * 0.3)
        return total_height

    def find_optimal_font_size(
        self,
        text_paragraphs: list[str],
        max_width_inch: float,
        max_height_inch: float,
        initial_font_size: float = 18.0,
        min_font_size: float = 10.0,
    ) -> float:
        box_width_pt = max_width_inch * self.INCH_TO_PT
        box_height_pt = max_height_inch * self.INCH_TO_PT

        current_fs = initial_font_size
        while current_fs >= min_font_size:
            est_height = self.calculate_text_height(
                text_paragraphs=text_paragraphs, font_size=current_fs, box_width_pt=box_width_pt
            )
            if est_height <= box_height_pt:
                return current_fs
            current_fs -= 0.5
        return min_font_size


layout_mapper = SlideLayoutMapper()


def text_to_runs(text_str: str, default_color: str = "E2E8F0", bold_color: str = "00D2FF"):
    """
    Splits text by '**' markdown bold indicators and returns runs list for SlideJ.
    """
    parts = text_str.split("**")
    runs = []
    for idx, part in enumerate(parts):
        if not part:
            continue
        is_bold = idx % 2 == 1
        runs.append({"text": part, "bold": is_bold, "color": bold_color if is_bold else default_color})
    return runs


def split_bullet_text(text_str: str):
    """
    Splits bullet text into (title, description).
    Supports splitting by bold indicators, colons, or dashes.
    """
    text_str = text_str.strip()

    # 1. Match bold prefix e.g., "**AI là gì?**: Nhánh của..."
    bold_match = re.match(r"^\*\*(.*?)\*\*\s*[:\-—]?\s*(.*)$", text_str)
    if bold_match:
        title = bold_match.group(1).strip()
        body = bold_match.group(2).strip()
        if title and body:
            return title, body

    # 2. Match colon prefix e.g., "Định nghĩa: Một tác nhân..."
    if ":" in text_str:
        prefix, suffix = text_str.split(":", 1)
        prefix = prefix.strip()
        suffix = suffix.strip()
        if 0 < len(prefix) < 25 and suffix:
            return prefix, suffix

    # 3. Match dash prefix e.g., "Định nghĩa - Một tác nhân..."
    for separator in [" — ", " - ", " – "]:
        if separator in text_str:
            prefix, suffix = text_str.split(separator, 1)
            prefix = prefix.strip()
            suffix = suffix.strip()
            if 0 < len(prefix) < 25 and suffix:
                return prefix, suffix

    return "", text_str


def parse_markdown_to_slides(md_content: str, default_color: str = "E2E8F0", bold_color: str = "00D2FF"):
    """
    Parses slide markdown content into slides metadata.
    Supports splitting by '#' headers, or by top-level list items (if '#' headers are sparse).
    Handles tables and citations.
    """
    lines = [line.strip() for line in md_content.replace("\r\n", "\n").split("\n")]

    hash_headers = [line for line in lines if line.startswith("#")]

    slides_raw = []

    if len(hash_headers) > 1:
        # Style 1: Split by lines starting with '#'
        current_slide = None
        for line in lines:
            if not line:
                continue
            if line.startswith("#"):
                header_level = len(line) - len(line.lstrip("#"))
                title = line.lstrip("#").strip()
                if header_level <= 3:
                    # Clean up slide title prefixes
                    cleaned_title = re.sub(
                        r"^(slide\s+\d+\s*[:.-]?\s*|chương\s+\d+\s*[:.-]?\s*|\d+\s*[:.-]\s*)",
                        "",
                        title,
                        flags=re.IGNORECASE,
                    ).strip()
                    if current_slide:
                        slides_raw.append(current_slide)
                    current_slide = {"title": cleaned_title or title, "lines": []}
            else:
                if current_slide:
                    current_slide["lines"].append(line)
        if current_slide:
            slides_raw.append(current_slide)

    else:
        # Style 2: Split by top-level list items that have bold text
        deck_title = hash_headers[0].lstrip("#").strip() if hash_headers else "Bài giảng"
        current_slide = None

        processing_lines = [line for line in lines if not line.startswith("#") and line]

        for line in processing_lines:
            match_header = re.match(r"^[-*+•]\s*\*\*(.*?)\*\*\s*$", line)
            if not match_header:
                match_header = re.match(r"^\*\*(.*?)\*\*\s*$", line)

            if match_header:
                title_text = match_header.group(1).strip()
                if current_slide:
                    slides_raw.append(current_slide)
                current_slide = {"title": title_text, "lines": []}
            else:
                if current_slide:
                    current_slide["lines"].append(line)
                else:
                    current_slide = {"title": deck_title, "lines": [line]}

        if current_slide:
            slides_raw.append(current_slide)

    # Process lines of each slide to parse items (bullets, tables, citations)
    processed_slides = []
    for slide in slides_raw:
        title = slide["title"]
        body_items = []
        citations = []
        slide_layout = None

        in_table = False
        table_rows = []

        in_svg = False
        svg_lines = []

        for line in slide["lines"]:
            if not line:
                continue

            # SVG detection
            line_stripped = line.strip()
            if line_stripped.startswith("<svg"):
                in_svg = True
                svg_lines.append(line)
                if line_stripped.endswith("</svg>") or "</svg>" in line_stripped:
                    in_svg = False
                continue
            elif in_svg:
                svg_lines.append(line)
                if line_stripped.endswith("</svg>") or "</svg>" in line_stripped:
                    in_svg = False
                continue

            line_clean, citation = extract_and_clean_citations(line)
            if citation:
                citations.append(citation)

            line_clean, layout = extract_and_clean_layout(line_clean)
            if layout:
                slide_layout = layout

            # Remove metadata tags like [CLO: CLO1] or [CLO CLO1] or [Bloom: 3] or [Bloom 3]
            line_clean = re.sub(r"\[CLO\s*:?\s*[^\]]+\]", "", line_clean, flags=re.IGNORECASE).strip()
            line_clean = re.sub(r"\[Bloom\s*:?\s*[^\]]+\]", "", line_clean, flags=re.IGNORECASE).strip()

            if not line_clean:
                continue

            # Skip separator lines or empty bullet indicators like ---, - -, _
            if re.match(r"^[-*+•\s_=]+$", line_clean):
                continue

            # Table detection
            if line_clean.startswith("|") and line_clean.endswith("|"):
                if re.match(r"^\|[\s:\-|]+$", line_clean):
                    continue
                cols = [c.strip() for c in line_clean.split("|")[1:-1]]
                table_rows.append(cols)
                in_table = True
                continue
            else:
                if in_table:
                    body_items.append({"type": "table", "rows": table_rows})
                    table_rows = []
                    in_table = False

            # Bullet point detection
            is_bullet = False
            if line.strip().startswith(("*", "-", "+", "•")):
                is_bullet = True

            if line_clean.startswith(("*", "-", "+", "•")):
                line_content = line_clean[1:].strip()
            else:
                line_content = line_clean

            if line_content.startswith(("*", "-", "+", "•")):
                line_content = line_content[1:].strip()
                is_bullet = True

            # Strip markdown formatting markers (* and _) from the start and end of text
            line_content = line_content.strip("*_").strip()

            if line_content:
                runs = text_to_runs(line_content, default_color=default_color, bold_color=bold_color)
                body_items.append({"type": "text", "raw_text": line_content, "runs": runs, "bullet": is_bullet})

        if in_table and table_rows:
            body_items.append({"type": "table", "rows": table_rows})

        processed_slides.append(
            {
                "title": title,
                "items": body_items,
                "citations": citations,
                "layout": slide_layout,
                "svg_content": "\n".join(svg_lines) if svg_lines else None,
            }
        )

    return processed_slides


def optimize_slide_items(items, default_color="E2E8F0", bold_color="00D2FF"):
    """
    Optimizes slide items by grouping pros/cons bullets into dual comparison columns.
    """
    text_items = [item for item in items if item["type"] == "text"]
    if len(text_items) > 2:
        pros = []
        cons = []
        others = []
        for item in text_items:
            raw = item["raw_text"].lower()
            title, body = split_bullet_text(item["raw_text"])
            t_lower = title.lower()

            # Detect comparison headers
            is_pro = any(
                k in t_lower or k in raw[:20]
                for k in ["ưu điểm", "pro", "lợi ích", "advantages", "thuận lợi", "tích cực", "mặt tốt"]
            )
            is_con = any(
                k in t_lower or k in raw[:20]
                for k in ["nhược điểm", "con", "hạn chế", "disadvantages", "khó khăn", "tiêu cực", "mặt xấu"]
            )

            if is_pro:
                pros.append(item["raw_text"])
            elif is_con:
                cons.append(item["raw_text"])
            else:
                others.append(item)

        if pros and cons:
            new_items = []
            new_items.extend(others)

            # Merge pros into a single block
            pros_text = "**Ưu điểm & Lợi ích**:\n" + "\n".join(f"* {p}" for p in pros)
            new_items.append(
                {
                    "type": "text",
                    "raw_text": pros_text,
                    "runs": text_to_runs(pros_text, default_color=default_color, bold_color=bold_color),
                    "bullet": False,
                }
            )

            # Merge cons into a single block
            cons_text = "**Nhược điểm & Hạn chế**:\n" + "\n".join(f"* {c}" for c in cons)
            new_items.append(
                {
                    "type": "text",
                    "raw_text": cons_text,
                    "runs": text_to_runs(cons_text, default_color=default_color, bold_color=bold_color),
                    "bullet": False,
                }
            )

            # Add other non-text items
            for item in items:
                if item["type"] != "text":
                    new_items.append(item)
            return new_items
    return items


def convert_markdown_to_slidej(
    markdown_text: str,
    course_title: str = "Bài giảng",
    author_name: str = "AI Assistant",
    theme_name: str = "warm_academic",
) -> dict:
    """
    Converts lecture slide markdown to a complete SlideJ JSON object with theme support.
    """
    # Theme configuration colors
    themes_colors = {
        "deep_space": {
            "dk1": "0A0A1A",
            "lt1": "FFFFFF",
            "accent1": "00D2FF",
            "accent2": "7C4DFF",
            "accent3": "00B894",
            "accent4": "FFC000",
        },
        "warm_academic": {
            "dk1": "FAF6EE",
            "lt1": "1A202C",
            "accent1": "8C6239",
            "accent2": "1A365D",
            "accent3": "9A3412",
            "accent4": "D97706",
        },
        "mint_techno": {
            "dk1": "0B132B",
            "lt1": "FFFFFF",
            "accent1": "1DE9B6",
            "accent2": "00B0FF",
            "accent3": "00E5FF",
            "accent4": "76FF03",
        },
        "sunset_crimson": {
            "dk1": "1A0813",
            "lt1": "FFFFFF",
            "accent1": "FF5252",
            "accent2": "FF4081",
            "accent3": "FF9100",
            "accent4": "E040FB",
        },
        "mckinsey_consulting": {
            "dk1": "041E42",
            "lt1": "FFFFFF",
            "accent1": "00A3A6",
            "accent2": "007A87",
            "accent3": "4A90E2",
            "accent4": "F5A623",
        },
    }

    theme_colors = themes_colors.get(theme_name, themes_colors["warm_academic"])

    # Theme background gradients
    themes_bg = {
        "deep_space": {
            "type": "gradient",
            "stops": [{"position": 0, "color": "0A0A1A"}, {"position": 100, "color": "1E1B4B"}],
            "angle": 135,
        },
        "warm_academic": {
            "type": "gradient",
            "stops": [{"position": 0, "color": "FAF6EE"}, {"position": 100, "color": "FAF6EE"}],
            "angle": 135,
        },
        "mint_techno": {
            "type": "gradient",
            "stops": [{"position": 0, "color": "0B132B"}, {"position": 100, "color": "1C2541"}],
            "angle": 135,
        },
        "sunset_crimson": {
            "type": "gradient",
            "stops": [{"position": 0, "color": "1A0813"}, {"position": 100, "color": "3B0F25"}],
            "angle": 135,
        },
        "mckinsey_consulting": {
            "type": "gradient",
            "stops": [{"position": 0, "color": "041E42"}, {"position": 100, "color": "0B2545"}],
            "angle": 135,
        },
    }

    # Theme text colors
    theme_text_colors = {
        "deep_space": {"title": "FFFFFF", "subtitle": "8899BB", "author": "7C4DFF"},
        "warm_academic": {"title": "1A365D", "subtitle": "5A6A80", "author": "8C6239"},
        "mint_techno": {"title": "FFFFFF", "subtitle": "B2DFDB", "author": "1DE9B6"},
        "sunset_crimson": {"title": "FFFFFF", "subtitle": "FF8A80", "author": "FF4081"},
        "mckinsey_consulting": {"title": "FFFFFF", "subtitle": "80CBC4", "author": "00A3A6"},
    }
    text_colors = theme_text_colors.get(theme_name, theme_text_colors["warm_academic"])

    # Card backgrounds
    card_bg_colors = {
        "deep_space": "12122B",
        "warm_academic": "FFFFFF",
        "mint_techno": "1C2541",
        "sunset_crimson": "3B0F25",
        "mckinsey_consulting": "0B2545",
    }
    card_bg = card_bg_colors.get(theme_name, card_bg_colors["warm_academic"])

    parsed_slides = parse_markdown_to_slides(
        markdown_text, default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"]
    )

    slidej_data = {
        "width": 13.333,
        "height": 7.5,
        "meta": {"title": course_title, "author": author_name},
        "theme": {"colors": theme_colors, "majorFont": "Calibri Light", "minorFont": "Calibri"},
        "slides": [],
    }

    # 1. Add Title Slide
    title_slide_title = course_title
    title_slide_subtitle = "Tài liệu giảng dạy thiết kế bởi AI"

    if parsed_slides:
        title_slide_subtitle = f"Chương học: {parsed_slides[0]['title']}"

    title_slide = {
        "background": themes_bg.get(theme_name, themes_bg["warm_academic"]),
        "transition": {"type": "fade", "speed": "med"},
        "elements": [
            {
                "type": "shape",
                "shapeType": "ellipse",
                "position": {"x": 9.5, "y": -1.5, "w": 6, "h": 6},
                "fill": {
                    "type": "gradient",
                    "stops": [
                        {"position": 0, "color": theme_colors["accent2"]},
                        {"position": 100, "color": theme_colors["accent1"]},
                    ],
                    "angle": 45,
                },
            },
            {
                "type": "text",
                "text": title_slide_title,
                "position": {"x": 1.0, "y": 2.2, "w": 8.5, "h": 1.8},
                "fontSize": 48,
                "bold": True,
                "color": text_colors["title"],
                "align": "left",
                "animations": [{"type": "fadeIn", "duration": 800, "trigger": "afterPrevious"}],
            },
            {
                "type": "text",
                "text": title_slide_subtitle,
                "position": {"x": 1.0, "y": 4.2, "w": 8.5, "h": 0.8},
                "fontSize": 20,
                "color": text_colors["subtitle"],
                "align": "left",
                "animations": [{"type": "fadeIn", "duration": 600, "trigger": "afterPrevious", "delay": 200}],
            },
            {
                "type": "text",
                "text": f"Biên soạn: {author_name}  |  AI Lecture Generator",
                "position": {"x": 1.0, "y": 5.5, "w": 8.5, "h": 0.6},
                "fontSize": 14,
                "color": text_colors["author"],
                "align": "left",
                "animations": [{"type": "fadeIn", "duration": 600, "trigger": "afterPrevious", "delay": 400}],
            },
        ],
    }
    slidej_data["slides"].append(title_slide)

    # 2. Add Content Slides
    for idx, parsed in enumerate(parsed_slides):
        slide_elements = []

        # Slide Title text element
        slide_elements.append(
            {
                "type": "text",
                "text": parsed["title"],
                "position": {"x": 0.8, "y": 0.5, "w": 11.7, "h": 0.8},
                "fontSize": 32,
                "bold": True,
                "color": theme_colors["accent1"],
                "align": "left",
                "animations": [{"type": "fadeIn", "duration": 500, "trigger": "afterPrevious"}],
            }
        )

        # Thin divider line
        slide_elements.append(
            {
                "type": "shape",
                "shapeType": "rect",
                "position": {"x": 0.8, "y": 1.35, "w": 11.7, "h": 0.03},
                "fill": theme_colors["accent2"],
            }
        )

        # Optimize slide items (Group comparative lists)
        optimized_items = optimize_slide_items(
            parsed["items"], default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"]
        )

        # Check layout configurations: Table or Cards or List
        slide_layout = parsed.get("layout", "standard_list")
        num_text_items = sum(1 for item in optimized_items if item["type"] == "text")
        has_table = any(item["type"] == "table" for item in optimized_items)

        if slide_layout == "card_grid":
            use_card_layout = True
        elif slide_layout in ["standard_list", "two_column_comparison", "visual_highlight", "table"]:
            use_card_layout = False
        else:
            # Fallback to old heuristic
            use_card_layout = (not has_table) and (1 <= num_text_items <= 4)

        if use_card_layout:
            text_items = [item for item in optimized_items if item["type"] == "text"]
            border_colors = [
                theme_colors["accent2"],
                theme_colors["accent1"],
                theme_colors["accent3"],
                theme_colors["accent4"],
            ]

            cards_config = []
            if num_text_items == 1:
                cards_config = [{"x": 1.5, "y": 2.2, "w": 10.33, "h": 3.8, "border": border_colors[0]}]
            elif num_text_items == 2:
                cards_config = [
                    {"x": 1.0, "y": 2.2, "w": 5.2, "h": 3.8, "border": border_colors[0]},
                    {"x": 7.13, "y": 2.2, "w": 5.2, "h": 3.8, "border": border_colors[1]},
                ]
            elif num_text_items == 3:
                cards_config = [
                    {"x": 0.8, "y": 2.2, "w": 3.64, "h": 3.8, "border": border_colors[0]},
                    {"x": 4.84, "y": 2.2, "w": 3.64, "h": 3.8, "border": border_colors[1]},
                    {"x": 8.89, "y": 2.2, "w": 3.64, "h": 3.8, "border": border_colors[2]},
                ]
            elif num_text_items == 4:
                cards_config = [
                    {"x": 1.0, "y": 1.8, "w": 5.2, "h": 2.1, "border": border_colors[0]},
                    {"x": 7.13, "y": 1.8, "w": 5.2, "h": 2.1, "border": border_colors[1]},
                    {"x": 1.0, "y": 4.3, "w": 5.2, "h": 2.1, "border": border_colors[2]},
                    {"x": 7.13, "y": 4.3, "w": 5.2, "h": 2.1, "border": border_colors[3]},
                ]

            for c_idx, item in enumerate(text_items):
                if c_idx >= len(cards_config):
                    break
                config = cards_config[c_idx]
                title, body = split_bullet_text(item["raw_text"])

                card_paragraphs = []
                if title:
                    card_paragraphs.append(
                        {
                            "align": "left",
                            "runs": [
                                {
                                    "text": title,
                                    "bold": True,
                                    "color": theme_colors["accent1"],
                                    "fontSize": 18 if num_text_items == 4 else 20,
                                }
                            ],
                        }
                    )

                body_runs = text_to_runs(body, default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"])
                # Adjust font size dynamically based on geometric mapping to prevent overflow
                card_font_size = layout_mapper.find_optimal_font_size(
                    text_paragraphs=[body],
                    max_width_inch=config["w"],
                    max_height_inch=config["h"],
                    initial_font_size=13 if num_text_items == 4 else 14,
                )

                for run in body_runs:
                    run["fontSize"] = card_font_size

                card_paragraphs.append({"align": "left", "runs": body_runs})

                slide_elements.append(
                    {
                        "type": "shape",
                        "shapeType": "roundRect",
                        "position": {"x": config["x"], "y": config["y"], "w": config["w"], "h": config["h"]},
                        "fill": card_bg,
                        "line": {"color": config["border"], "width": 1.5},
                        "margin": 0.25,
                        "align": "left",
                        "vertAlign": "top",
                        "text": card_paragraphs,
                        "animations": [
                            {
                                "type": "flyIn",
                                "direction": "bottom",
                                "duration": 500,
                                "trigger": "afterPrevious",
                                "delay": c_idx * 100,
                            }
                        ],
                    }
                )

        elif slide_layout == "two_column_comparison":
            text_items = [item for item in optimized_items if item["type"] == "text"]
            mid = max(1, len(text_items) // 2)
            left_items = text_items[:mid]
            right_items = text_items[mid:]

            left_paragraphs = []
            for item in left_items:
                left_paragraphs.append({"runs": item["runs"], "bullet": item["bullet"]})
            right_paragraphs = []
            for item in right_items:
                right_paragraphs.append({"runs": item["runs"], "bullet": item["bullet"]})

            left_texts = [item["raw_text"] for item in left_items]
            left_font_size = layout_mapper.find_optimal_font_size(
                text_paragraphs=left_texts, max_width_inch=5.6, max_height_inch=4.5, initial_font_size=16.0
            )
            right_texts = [item["raw_text"] for item in right_items]
            right_font_size = layout_mapper.find_optimal_font_size(
                text_paragraphs=right_texts, max_width_inch=5.6, max_height_inch=4.5, initial_font_size=16.0
            )

            slide_elements.append(
                {
                    "type": "text",
                    "text": left_paragraphs,
                    "position": {"x": 0.8, "y": 1.7, "w": 5.6, "h": 4.5},
                    "fontSize": left_font_size,
                    "align": "left",
                    "lineSpacing": 1.25,
                    "animations": [
                        {"type": "flyIn", "direction": "bottom", "duration": 500, "trigger": "afterPrevious"}
                    ],
                }
            )
            slide_elements.append(
                {
                    "type": "text",
                    "text": right_paragraphs,
                    "position": {"x": 6.8, "y": 1.7, "w": 5.6, "h": 4.5},
                    "fontSize": right_font_size,
                    "align": "left",
                    "lineSpacing": 1.25,
                    "animations": [
                        {
                            "type": "flyIn",
                            "direction": "bottom",
                            "duration": 500,
                            "trigger": "afterPrevious",
                            "delay": 100,
                        }
                    ],
                }
            )

        elif slide_layout == "three_column":
            text_items = [item for item in optimized_items if item["type"] == "text"]
            cols_to_render = text_items[:3]
            border_colors = [theme_colors["accent2"], theme_colors["accent1"], theme_colors["accent3"]]

            for c_idx, item in enumerate(cols_to_render):
                x_pos = 0.8 + c_idx * 4.0
                title, body = split_bullet_text(item["raw_text"])
                col_paragraphs = []
                if title:
                    col_paragraphs.append(
                        {
                            "align": "left",
                            "runs": [{"text": title, "bold": True, "color": theme_colors["accent1"], "fontSize": 18}],
                        }
                    )
                body_runs = text_to_runs(body, default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"])
                col_font_size = layout_mapper.find_optimal_font_size(
                    text_paragraphs=[body], max_width_inch=3.6, max_height_inch=4.2, initial_font_size=13
                )
                for run in body_runs:
                    run["fontSize"] = col_font_size
                col_paragraphs.append({"align": "left", "runs": body_runs})

                slide_elements.append(
                    {
                        "type": "shape",
                        "shapeType": "roundRect",
                        "position": {"x": x_pos, "y": 1.8, "w": 3.6, "h": 4.2},
                        "fill": card_bg,
                        "line": {"color": border_colors[c_idx % len(border_colors)], "width": 1.5},
                        "margin": 0.2,
                        "align": "left",
                        "vertAlign": "top",
                        "text": col_paragraphs,
                        "animations": [
                            {
                                "type": "flyIn",
                                "direction": "bottom",
                                "duration": 500,
                                "trigger": "afterPrevious",
                                "delay": c_idx * 100,
                            }
                        ],
                    }
                )

        elif slide_layout == "timeline_flow":
            text_items = [item for item in optimized_items if item["type"] == "text"]
            steps_to_render = text_items[:4]
            num_steps = len(steps_to_render)
            col_w = 3.6 if num_steps <= 3 else 2.6
            col_gap = 0.4

            for s_idx, item in enumerate(steps_to_render):
                x_pos = 0.8 + s_idx * (col_w + col_gap)
                title, body = split_bullet_text(item["raw_text"])
                step_paragraphs = []
                step_paragraphs.append(
                    {
                        "align": "left",
                        "runs": [
                            {
                                "text": f"Giai đoạn {s_idx + 1}" + (f": {title}" if title else ""),
                                "bold": True,
                                "color": theme_colors["accent1"],
                                "fontSize": 16,
                            }
                        ],
                    }
                )
                body_runs = text_to_runs(body, default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"])
                col_font_size = layout_mapper.find_optimal_font_size(
                    text_paragraphs=[body], max_width_inch=col_w, max_height_inch=3.8, initial_font_size=12
                )
                for run in body_runs:
                    run["fontSize"] = col_font_size
                step_paragraphs.append({"align": "left", "runs": body_runs})

                slide_elements.append(
                    {
                        "type": "shape",
                        "shapeType": "roundRect",
                        "position": {"x": x_pos, "y": 2.0, "w": col_w, "h": 3.8},
                        "fill": card_bg,
                        "line": {"color": theme_colors["accent2"], "width": 1.5},
                        "margin": 0.2,
                        "align": "left",
                        "vertAlign": "top",
                        "text": step_paragraphs,
                        "animations": [
                            {
                                "type": "flyIn",
                                "direction": "bottom",
                                "duration": 500,
                                "trigger": "afterPrevious",
                                "delay": s_idx * 100,
                            }
                        ],
                    }
                )

        elif slide_layout == "quadrant_matrix":
            text_items = [item for item in optimized_items if item["type"] == "text"]
            quad_config = [
                {"x": 0.8, "y": 1.8, "w": 5.6, "h": 2.1, "border": theme_colors["accent1"]},
                {"x": 6.8, "y": 1.8, "w": 5.6, "h": 2.1, "border": theme_colors["accent2"]},
                {"x": 0.8, "y": 4.1, "w": 5.6, "h": 2.1, "border": theme_colors["accent3"]},
                {"x": 6.8, "y": 4.1, "w": 5.6, "h": 2.1, "border": theme_colors["accent4"]},
            ]
            for q_idx, item in enumerate(text_items[:4]):
                config = quad_config[q_idx]
                title, body = split_bullet_text(item["raw_text"])

                quad_paragraphs = []
                if title:
                    quad_paragraphs.append(
                        {
                            "align": "left",
                            "runs": [{"text": title, "bold": True, "color": theme_colors["accent1"], "fontSize": 16}],
                        }
                    )
                body_runs = text_to_runs(body, default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"])
                col_font_size = layout_mapper.find_optimal_font_size(
                    text_paragraphs=[body],
                    max_width_inch=config["w"],
                    max_height_inch=config["h"],
                    initial_font_size=12,
                )
                for run in body_runs:
                    run["fontSize"] = col_font_size
                quad_paragraphs.append({"align": "left", "runs": body_runs})

                slide_elements.append(
                    {
                        "type": "shape",
                        "shapeType": "roundRect",
                        "position": {"x": config["x"], "y": config["y"], "w": config["w"], "h": config["h"]},
                        "fill": card_bg,
                        "line": {"color": config["border"], "width": 1.5},
                        "margin": 0.15,
                        "align": "left",
                        "vertAlign": "top",
                        "text": quad_paragraphs,
                        "animations": [
                            {
                                "type": "flyIn",
                                "direction": "bottom",
                                "duration": 500,
                                "trigger": "afterPrevious",
                                "delay": q_idx * 100,
                            }
                        ],
                    }
                )

        elif slide_layout == "split_intro":
            text_items = [item for item in optimized_items if item["type"] == "text"]
            intro_item = text_items[0] if text_items else None
            right_items = text_items[1:] if len(text_items) > 1 else []

            if intro_item:
                title, body = split_bullet_text(intro_item["raw_text"])
                intro_paragraphs = []
                if title:
                    intro_paragraphs.append(
                        {
                            "align": "left",
                            "runs": [{"text": title, "bold": True, "color": theme_colors["accent1"], "fontSize": 20}],
                        }
                    )
                body_runs = text_to_runs(body, default_color=theme_colors["lt1"], bold_color=theme_colors["accent1"])
                col_font_size = layout_mapper.find_optimal_font_size(
                    text_paragraphs=[body], max_width_inch=5.0, max_height_inch=4.2, initial_font_size=14
                )
                for run in body_runs:
                    run["fontSize"] = col_font_size
                intro_paragraphs.append({"align": "left", "runs": body_runs})

                slide_elements.append(
                    {
                        "type": "shape",
                        "shapeType": "roundRect",
                        "position": {"x": 0.8, "y": 1.8, "w": 5.0, "h": 4.2},
                        "fill": card_bg,
                        "line": {"color": theme_colors["accent1"], "width": 1.5},
                        "margin": 0.25,
                        "align": "left",
                        "vertAlign": "top",
                        "text": intro_paragraphs,
                        "animations": [
                            {"type": "flyIn", "direction": "bottom", "duration": 500, "trigger": "afterPrevious"}
                        ],
                    }
                )

            if right_items:
                right_paragraphs = []
                for item in right_items:
                    right_paragraphs.append({"runs": item["runs"], "bullet": True})
                right_texts = [item["raw_text"] for item in right_items]
                right_fs = layout_mapper.find_optimal_font_size(
                    text_paragraphs=right_texts, max_width_inch=6.2, max_height_inch=4.2, initial_font_size=16.0
                )
                slide_elements.append(
                    {
                        "type": "text",
                        "text": right_paragraphs,
                        "position": {"x": 6.3, "y": 1.8, "w": 6.2, "h": 4.2},
                        "fontSize": right_fs,
                        "align": "left",
                        "lineSpacing": 1.25,
                        "animations": [
                            {
                                "type": "flyIn",
                                "direction": "bottom",
                                "duration": 500,
                                "trigger": "afterPrevious",
                                "delay": 150,
                            }
                        ],
                    }
                )

        elif slide_layout == "visual_highlight":
            text_items = [item for item in optimized_items if item["type"] == "text"]
            highlight_paragraphs = []
            for item in text_items:
                highlight_paragraphs.append({"runs": item["runs"], "bullet": False})

            highlight_texts = [item["raw_text"] for item in text_items]
            fs = layout_mapper.find_optimal_font_size(
                text_paragraphs=highlight_texts, max_width_inch=10.33, max_height_inch=3.8, initial_font_size=28.0
            )

            slide_elements.append(
                {
                    "type": "text",
                    "text": highlight_paragraphs,
                    "position": {"x": 1.5, "y": 2.2, "w": 10.33, "h": 3.8},
                    "fontSize": fs,
                    "align": "center",
                    "lineSpacing": 1.3,
                    "animations": [{"type": "fadeIn", "duration": 600, "trigger": "afterPrevious"}],
                }
            )

        else:
            # Traditional List and Table Layout
            text_paragraphs = []
            table_item = None

            for item in optimized_items:
                if item["type"] == "text":
                    para = {"runs": item["runs"]}
                    if item["bullet"]:
                        para["bullet"] = True
                    text_paragraphs.append(para)
                elif item["type"] == "table":
                    table_item = item

            if text_paragraphs:
                list_texts = [item["raw_text"] for item in optimized_items if item["type"] == "text"]
                font_size = layout_mapper.find_optimal_font_size(
                    text_paragraphs=list_texts,
                    max_width_inch=11.7,
                    max_height_inch=4.5 if not table_item else 2.2,
                    initial_font_size=18.0,
                )

                slide_elements.append(
                    {
                        "type": "text",
                        "text": text_paragraphs,
                        "position": {"x": 0.8, "y": 1.7, "w": 11.7, "h": 4.5 if not table_item else 2.2},
                        "fontSize": font_size,
                        "align": "left",
                        "lineSpacing": 1.25,
                        "animations": [
                            {
                                "type": "flyIn",
                                "direction": "bottom",
                                "duration": 600,
                                "trigger": "afterPrevious",
                                "delay": 150,
                            }
                        ],
                    }
                )

            if table_item:
                table_y = 4.0 if text_paragraphs else 1.8
                table_h = 2.5 if text_paragraphs else 4.5

                rows_formatted = []
                for r_idx, r in enumerate(table_item["rows"]):
                    if r_idx == 0:
                        rows_formatted.append(
                            [
                                {"text": col, "bold": True, "fill": theme_colors["accent2"], "color": "FFFFFF"}
                                for col in r
                            ]
                        )
                    else:
                        rows_formatted.append(r)

                # Estimate font size for table
                total_chars = (
                    sum(len(run["text"]) for para in text_paragraphs for run in para["runs"]) if text_paragraphs else 0
                )
                slide_elements.append(
                    {
                        "type": "table",
                        "position": {"x": 0.8, "y": table_y, "w": 11.7, "h": table_h},
                        "headerRow": True,
                        "fontSize": 10 if total_chars > 500 else (12 if text_paragraphs else 14),
                        "color": theme_colors["lt1"],
                        "rows": rows_formatted,
                    }
                )

        # Source Footer (Citations)
        if parsed["citations"]:
            citation_str = "  |  ".join(parsed["citations"])
            slide_elements.append(
                {
                    "type": "text",
                    "text": f"📖 {citation_str}",
                    "position": {"x": 0.8, "y": 6.6, "w": 11.7, "h": 0.4},
                    "fontSize": 11,
                    "italic": True,
                    "color": "64748B",
                    "align": "left",
                }
            )

        content_slide = {
            "background": theme_colors["dk1"],
            "transition": {"type": "push", "speed": "med"},
            "elements": slide_elements,
        }
        slidej_data["slides"].append(content_slide)

    return slidej_data
