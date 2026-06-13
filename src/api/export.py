import json
import os
import re
import subprocess
from typing import List, Optional
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import CLO, Chapter, ChapterMaterial, Course, Question, User
from src.database.session import get_db
from src.utils.markdown_to_slidej import parse_markdown_to_slides

router = APIRouter(prefix="/api/courses", tags=["export"])


@router.get("/{course_id}/export-materials", response_class=PlainTextResponse)
def export_course_materials(
    course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # 1. Xác thực môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy danh sách chương học sắp xếp theo sort_order
    chapters = (
        db.query(Chapter)
        .filter(Chapter.course_id == course_id, Chapter.is_active)
        .order_by(Chapter.sort_order)
        .all()
    )

    # 3. Tạo nội dung file Markdown tổng hợp
    content = f"# GIÁO ÁN HỌC LIỆU MÔN HỌC: {course.course_name.upper()}\n"
    content += f"Mã môn học: {course.course_code}\n"
    content += f"Giảng viên biên soạn: {current_user.full_name or current_user.email}\n"
    content += "Sinh tự động bởi AI Lecture Assistant (G02-Team023)\n\n"
    content += "========================================================\n\n"

    if not chapters:
        content += "* Chưa có nội dung chương học nào được thiết kế cho môn học này.\n"
    else:
        for idx, ch in enumerate(chapters):
            content += f"## CHƯƠNG {idx + 1}: {ch.title.upper()}\n"
            content += f"Mô tả chương: {ch.description or 'N/A'}\n\n"

            # Lấy học liệu của chương
            material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == ch.id).first()
            if material:
                content += "### 1. Slide Bài giảng (Markdown)\n"
                if material.slide_content:
                    content += f"{material.slide_content}\n\n"
                else:
                    content += "* Chưa biên soạn slide cho chương này.\n\n"

                content += "### 2. Kịch bản Hoạt động (Active Learning)\n"
                if material.active_learning_script:
                    content += f"{material.active_learning_script}\n\n"
                else:
                    content += "* Chưa biên soạn kịch bản active learning cho chương này.\n\n"
            else:
                content += "* Chương học chưa được thiết kế học liệu.\n\n"

            content += "--------------------------------------------------------\n\n"

    # Thiết lập headers để trình duyệt nhận diện tải file đính kèm
    headers = {"Content-Disposition": f"attachment; filename=Giao_an_{course.course_code}.md"}
    return PlainTextResponse(content, headers=headers)


@router.get("/{course_id}/export-questions", response_class=PlainTextResponse)
def export_course_questions(
    course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # 1. Xác thực môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy danh sách câu hỏi
    questions = db.query(Question).filter(Question.course_id == course_id, Question.is_active).all()
    clos = db.query(CLO).filter(CLO.course_id == course_id).all()

    # 3. Tạo đề thi
    content = f"# ĐỀ THI TRẮC NGHIỆM MÔN HỌC: {course.course_name.upper()}\n"
    content += f"Mã môn học: {course.course_code}\n"
    content += f"Số lượng câu hỏi: {len(questions)} câu\n"
    content += "Thời gian làm bài: 45 phút (Đề thi tham khảo)\n"
    content += "========================================================\n\n"

    if not questions:
        content += "* Chưa soạn câu hỏi thi trắc nghiệm nào trong ngân hàng đề thi.\n"
    else:
        # Phần 1: Đề thi
        content += "## PHẦN I: ĐỀ THI\n\n"
        for idx, q in enumerate(questions):
            content += f"Câu {idx + 1}: {q.question_text}\n"

            opts = []
            try:
                opts = json.loads(q.options_json) if q.options_json else []
            except Exception:
                opts = []

            labels = ["A", "B", "C", "D"]
            for o_idx, opt in enumerate(opts):
                if o_idx < len(labels):
                    content += f"  {labels[o_idx]}. {opt}\n"
            content += "\n"

        # Phần 2: Đáp án đối chiếu
        content += "========================================================\n\n"
        content += "## PHẦN II: ĐÁP ÁN VÀ MA TRẬN PHÂN LOẠI CHẤT LƯỢNG (CLO - BLOOM)\n\n"

        for idx, q in enumerate(questions):
            linked_clo = next((c for c in clos if c.id == q.clo_id), None)
            clo_code = linked_clo.clo_code if linked_clo else "N/A"

            content += f"Câu {idx + 1}:\n"
            content += f"  - Đáp án đúng: {q.correct_answer}\n"
            content += f"  - Chuẩn đầu ra: {clo_code}\n"
            content += f"  - Cấp độ Bloom: Mức {q.bloom_level}\n\n"

    headers = {"Content-Disposition": f"attachment; filename=De_thi_{course.course_code}.md"}
    return PlainTextResponse(content, headers=headers)


def parse_active_learning_into_notes(script: str) -> dict:
    """
    Parses active learning script and maps slide numbers to their respective notes content.
    Returns a dictionary mapping slide_index (1-indexed) to notes string.
    """
    notes_map = {}
    if not script:
        return notes_map

    pattern = r"(### Hoạt động\s*\d+.*?Slide\s*:\s*\d+.*?(?:\n|$))"
    parts = re.split(pattern, script, flags=re.IGNORECASE)

    current_slide_idx = None
    for part in parts:
        if not part:
            continue
        header_match = re.search(r"Slide\s*:\s*(\d+)", part, re.IGNORECASE)
        if header_match:
            current_slide_idx = int(header_match.group(1))
            if current_slide_idx not in notes_map:
                notes_map[current_slide_idx] = part
            else:
                notes_map[current_slide_idx] += "\n\n" + part
        elif current_slide_idx is not None:
            notes_map[current_slide_idx] += part

    for k in notes_map:
        notes_map[k] = notes_map[k].strip()

    return notes_map


# SlideJ logic removed


# PPT-Master script path: ưu tiên biến môi trường, fallback sang đường dẫn mặc định
_PPT_MASTER_SCRIPT_PATH = os.environ.get(
    "PPT_MASTER_SCRIPT_PATH",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "..",
        "ContentToSlide",
        "ppt-master",
        "skills",
        "ppt-master",
        "scripts",
        "svg_to_pptx.py",
    ),
)


@router.get("/chapters/{chapter_id}/export-pptx")
def export_chapter_pptx(
    chapter_id: int,
    theme: str = "warm_academic",
    engine: str = "ppt_master",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Xác thực chương học và quyền sở hữu môn học
    chapter = (
        db.query(Chapter)
        .join(Course)
        .filter(Chapter.id == chapter_id, Course.user_id == current_user.id, Chapter.is_active)
        .first()
    )
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy học liệu chương học
    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material or not material.slide_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Chương học này chưa có nội dung slide bài giảng thiết kế."
        )

    # Always use PPT-Master engine, SlideJ has been removed
    if True:
        import shutil
        import sys

        # 1. Parse slide markdown content
        parsed_slides = parse_markdown_to_slides(material.slide_content)

        # 2. Setup project directories
        project_dir = os.path.join("temp", f"ppt_master_{chapter_id}")
        svg_output_dir = os.path.join(project_dir, "svg_output")
        notes_dir = os.path.join(project_dir, "notes")
        exports_dir = os.path.join(project_dir, "exports")

        # Cleanup old run if exists
        if os.path.exists(project_dir):
            try:
                shutil.rmtree(project_dir)
            except Exception:
                pass

        os.makedirs(svg_output_dir, exist_ok=True)
        os.makedirs(notes_dir, exist_ok=True)
        os.makedirs(exports_dir, exist_ok=True)

        # Helper function to escape XML special characters
        def escape_xml(s):
            return (
                s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&apos;")
            )

        # Parse active learning notes map
        notes_by_slide = parse_active_learning_into_notes(material.active_learning_script)

        # 3. Create SVG and Notes files
        for idx, s in enumerate(parsed_slides):
            slide_name = f"slide_{idx + 1:05d}"
            svg_file_path = os.path.join(svg_output_dir, f"{slide_name}.svg")

            # Use inline SVG if available
            if s.get("svg_content"):
                with open(svg_file_path, "w", encoding="utf-8") as f:
                    f.write(s["svg_content"])
            else:
                # Dynamic generation of SVG slide
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
                svg_lines.append(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">'
                )

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

                if use_cards and num_text <= 4:
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
                    all_text = " ".join(
                        escape_xml(it.get("raw_text", "").replace("**", "").strip()) for it in text_items
                    )
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

                with open(svg_file_path, "w", encoding="utf-8") as f:
                    f.write("\n".join(svg_lines))

            # Speaker notes
            note_content = notes_by_slide.get(idx + 1) or ""
            if idx == 0 and material.active_learning_script and "---RATIONALE---" in material.active_learning_script:
                parts = material.active_learning_script.split("---RATIONALE---", 1)
                rationale_text = parts[1].strip()
                if rationale_text:
                    note_content = f"💡 PEDAGOGICAL RATIONALE:\n\n{rationale_text}\n\n{note_content}".strip()

            if note_content:
                note_file_path = os.path.join(notes_dir, f"{slide_name}.md")
                with open(note_file_path, "w", encoding="utf-8") as f:
                    f.write(note_content)

        # 4. Invoke PPT-Master svg_to_pptx.py
        ppt_master_script = _PPT_MASTER_SCRIPT_PATH
        if not os.path.isfile(ppt_master_script):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"PPT-Master script không tìm thấy: {ppt_master_script}. "
                f"Hãy cấu hình biến môi trường PPT_MASTER_SCRIPT_PATH.",
            )
        output_pptx = os.path.join(exports_dir, "output.pptx")
        cmd = f'"{sys.executable}" "{ppt_master_script}" "{project_dir}" -o "{output_pptx}" --no-compat'

        # Execute command
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"PPT-Master generate error: {res.stderr}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Lỗi PPT-Master CLI: {res.stderr or res.stdout}",
            )

        return FileResponse(
            output_pptx,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=f"Bai_Giang_Chuong_{chapter_id}.pptx",
        )


def render_markdown_to_html(md_text: str) -> str:
    # Escape HTML characters safely
    html = md_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Title markers
    html = re.sub(r"^### (.*?)$", r"<h3 class='lp-h3'>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^## (.*?)$", r"<h2 class='lp-h2'>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^# (.*?)$", r"<h1 class='lp-h1'>\1</h1>", html, flags=re.MULTILINE)
    # Bold markers
    html = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", html)
    # List parsing
    lines = html.split("\n")
    in_list = False
    new_lines = []
    for line in lines:
        match = re.match(r"^[-*+•]\s*(.*)$", line.strip())
        if match:
            if not in_list:
                new_lines.append("<ul class='lp-ul'>")
                in_list = True
            new_lines.append(f"<li class='lp-li'>{match.group(1)}</li>")
        else:
            if in_list:
                new_lines.append("</ul>")
                in_list = False
            new_lines.append(line)
    if in_list:
        new_lines.append("</ul>")
    html = "\n".join(new_lines)
    # Paragraph mapping
    html = "\n".join(
        f"<p class='lp-p'>{line}</p>"
        if line.strip()
        and not line.strip().startswith("<h")
        and not line.strip().startswith("<u")
        and not line.strip().startswith("</u")
        and not line.strip().startswith("<l")
        else line
        for line in html.split("\n")
    )
    return html


@router.get("/chapters/{chapter_id}/export-lesson-plan", response_class=HTMLResponse)
def export_lesson_plan(chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Xác thực chương học và quyền sở hữu môn học
    chapter = (
        db.query(Chapter)
        .join(Course)
        .filter(Chapter.id == chapter_id, Course.user_id == current_user.id, Chapter.is_active)
        .first()
    )
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy học liệu chương học
    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material or not material.active_learning_script:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chương học này chưa có nội dung kịch bản giảng dạy Active Learning.",
        )

    active_learning_script = material.active_learning_script or ""
    marker = "---RATIONALE---"
    rationale_html = ""

    if marker in active_learning_script:
        parts = active_learning_script.split(marker, 1)
        main_script = parts[0].strip()
        rationale_text = parts[1].strip()
        script_html = render_markdown_to_html(main_script)
        if rationale_text:
            rationale_html = f"""
            <div class="rationale-panel" style="margin-top: 30px; padding: 20px; background-color: #f0fff4; border-left: 4px solid #38a169; border-radius: 8px; border: 1px solid #c6f6d5;">
                <h3 style="margin-top: 0; color: #276749; font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">
                    💡 GIẢI TRÌNH SƯ PHẠM (PEDAGOGICAL RATIONALE)
                </h3>
                <div style="font-size: 13.5px; color: #2f855a; font-style: italic; line-height: 1.5;">
                    {render_markdown_to_html(rationale_text)}
                </div>
            </div>
            """
    else:
        script_html = render_markdown_to_html(active_learning_script)

    course_name = chapter.course.course_name
    chapter_title = chapter.title
    author_name = current_user.full_name or current_user.email or "Giảng viên"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Giáo án tương tác - Chương: {chapter_title}</title>
    <style>
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1a202c;
            line-height: 1.6;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
            background-color: #ffffff;
        }}
        @media print {{
            body {{
                padding: 0;
                max-width: 100%;
                font-size: 12pt;
            }}
            .no-print {{
                display: none;
            }}
        }}
        .header-panel {{
            border-bottom: 2px solid #1a365d;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }}
        .meta-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-top: 15px;
            font-size: 14px;
            background-color: #f7fafc;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid #edf2f7;
        }}
        .meta-item {{
            margin-bottom: 5px;
        }}
        .meta-label {{
            font-weight: bold;
            color: #4a5568;
        }}
        .lp-h1 {{
            color: #1a365d;
            font-size: 24px;
            margin-top: 0;
            margin-bottom: 5px;
        }}
        .lp-h2 {{
            color: #2c5282;
            font-size: 18px;
            margin-top: 25px;
            margin-bottom: 12px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 5px;
        }}
        .lp-h3 {{
            color: #4a5568;
            font-size: 15px;
            margin-top: 18px;
            margin-bottom: 8px;
        }}
        .lp-p {{
            margin-bottom: 12px;
            text-align: justify;
        }}
        .lp-ul {{
            margin: 10px 0 15px 20px;
            padding: 0;
        }}
        .lp-li {{
            margin-bottom: 6px;
        }}
        .print-btn {{
            background-color: #1a365d;
            color: #ffffff;
            border: none;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: bold;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 20px;
        }}
        .print-btn:hover {{
            background-color: #2b6cb0;
        }}
    </style>
</head>
<body>
    <div class="no-print" style="text-align: right;">
        <button class="print-btn" onclick="window.print()">🖨️ In hoặc Lưu file PDF Giáo án</button>
    </div>
    <div class="header-panel">
        <h1 class="lp-h1">GIÁO ÁN HOẠT ĐỘNG SƯ PHẠM (LESSON PLAN)</h1>
        <div style="font-size: 14px; color: #718096; font-style: italic;">AI Lecture Assistant - Đảm bảo Chất lượng Đào tạo</div>
        <div class="meta-grid">
            <div class="meta-item"><span class="meta-label">Môn học:</span> {course_name}</div>
            <div class="meta-item"><span class="meta-label">Chương học:</span> {chapter_title}</div>
            <div class="meta-item"><span class="meta-label">Giảng viên:</span> {author_name}</div>
            <div class="meta-item"><span class="meta-label">Thiết kế Sư phạm:</span> Tương tác chủ động (Active Learning)</div>
        </div>
    </div>
    <div class="content-body">
        {script_html}
        {rationale_html}
    </div>
</body>
</html>"""
    return HTMLResponse(content=html_content, status_code=200)


class SlideItemPayload(BaseModel):
    type: str
    rawText: Optional[str] = None
    bullet: Optional[bool] = True


class SlidePayload(BaseModel):
    title: str
    layout: str
    items: List[SlideItemPayload]
    notes: Optional[str] = None
    screenshot: Optional[str] = None  # Full slide screenshot
    has_visual: Optional[bool] = False
    visual_screenshot: Optional[str] = None  # Base64 of diagram/chart/table


class ExportCanvasPayload(BaseModel):
    slides: List[SlidePayload]
    theme: Optional[str] = "warm_academic"


@router.post("/chapters/{chapter_id}/export-pptx-canvas")
def export_chapter_pptx_canvas(
    chapter_id: int,
    payload: ExportCanvasPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Xác thực chương học và quyền sở hữu môn học
    chapter = (
        db.query(Chapter)
        .join(Course)
        .filter(Chapter.id == chapter_id, Course.user_id == current_user.id, Chapter.is_active)
        .first()
    )
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Setup presentation
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # 3. Choose theme colors
    themes_colors = {
        "deep_space": {"bg": "#0A0A1A", "text": "#FFFFFF", "accent": "#00D2FF", "sub": "#8899BB"},
        "warm_academic": {"bg": "#FAF6EE", "text": "#1A202C", "accent": "#8C6239", "sub": "#5A6A80"},
        "mint_techno": {"bg": "#0B132B", "text": "#FFFFFF", "accent": "#1DE9B6", "sub": "#B2DFDB"},
        "sunset_crimson": {"bg": "#1A0813", "text": "#FFFFFF", "accent": "#FF5252", "sub": "#FF8A80"},
        "mckinsey_consulting": {"bg": "#041E42", "text": "#FFFFFF", "accent": "#00A3A6", "sub": "#80CBC4"},
    }

    theme_name = payload.theme or "warm_academic"
    colors = themes_colors.get(theme_name, themes_colors["warm_academic"])

    def hex_to_rgb(hex_str):
        hex_str = hex_str.lstrip("#")
        return RGBColor(int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))

    blank_layout = prs.slide_layouts[6]  # Blank layout

    for s_idx, s in enumerate(payload.slides):
        slide = prs.slides.add_slide(blank_layout)

        # Set slide background
        background = slide.background
        fill = background.fill
        fill.solid()
        fill.fore_color.rgb = hex_to_rgb(colors["bg"])

        # Add slide title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.5), Inches(11.7), Inches(1.0))
        tf_title = title_box.text_frame
        tf_title.word_wrap = True
        p_title = tf_title.paragraphs[0]
        p_title.text = s.title
        p_title.font.name = "Arial"
        p_title.font.size = Pt(32)
        p_title.font.bold = True
        p_title.font.color.rgb = hex_to_rgb(colors["accent"])

        # Determine if slide has a visual element (Mermaid, Chart, Table)
        has_visual = s.has_visual and s.visual_screenshot

        # Write slide items (bullet points)
        if has_visual:
            # Dựng 2 cột
            # Cột trái: Văn bản (Bullet points)
            text_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(5.5), Inches(4.8))
            tf = text_box.text_frame
            tf.word_wrap = True

            # Cột phải: Chèn ảnh chụp cấu phần trực quan
            try:
                img_data = s.visual_screenshot
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                image_bytes = base64.b64decode(img_data)
                image_stream = BytesIO(image_bytes)

                # Insert picture with right position (centered in the right column)
                slide.shapes.add_picture(image_stream, Inches(6.8), Inches(1.8), width=Inches(5.7))
            except Exception as e:
                print(f"Error inserting visual screenshot on slide {s_idx + 1}: {e}")
                # Fallback: make text box wider
                text_box.width = Inches(11.7)
        else:
            # Slide chỉ có văn bản (Text-only)
            text_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(11.7), Inches(4.8))
            tf = text_box.text_frame
            tf.word_wrap = True

        # Add items to text box
        text_items = [it for it in s.items if it.type == "text" or it.rawText]
        for item_idx, item in enumerate(text_items):
            raw_text = item.rawText or ""
            clean_text = raw_text.replace("**", "").replace("* ", "").strip()
            if not clean_text:
                continue

            if item_idx == 0 and len(tf.paragraphs) > 0 and not tf.paragraphs[0].text:
                p = tf.paragraphs[0]
            else:
                p = tf.add_paragraph()

            p.text = "• " + clean_text if item.bullet else clean_text
            p.font.name = "Arial"
            p.font.size = Pt(18 if len(text_items) > 5 else 20)
            p.font.color.rgb = hex_to_rgb(colors["text"])
            # Space after paragraphs
            p.space_after = Pt(12)

        # Add slide notes
        if s.notes:
            notes_slide = slide.notes_slide
            text_frame = notes_slide.notes_text_frame
            text_frame.text = s.notes

    # Save presentation to a temporary path
    project_dir = os.path.join("temp", f"ppt_canvas_{chapter_id}")
    os.makedirs(project_dir, exist_ok=True)
    output_pptx = os.path.join(project_dir, f"chapter_{chapter_id}_canvas.pptx")
    prs.save(output_pptx)

    return FileResponse(
        output_pptx,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"Bai_Giang_Chuong_{chapter_id}.pptx",
    )

