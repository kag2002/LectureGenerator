import asyncio
import json

from sqlalchemy.orm import Session

from src.database.models import CLO, Chapter, ChapterMaterial, Course, Question, RAGDocument, SystemRule
from src.database.vector_db import search_rag_isolated
from src.prompts.materials import LANGUAGE_MAP
from src.prompts.questions import (
    SOLVER_SYSTEM_PROMPT,
    build_correction_prompt,
    build_generator_system_prompt,
    build_generator_user_prompt,
    build_solver_prompt,
)
from src.services.material_orchestrator import MaterialOrchestrator, deduplicate_rag_hits
from src.utils.llm_client import async_call_llm_json
from src.utils.parser import safe_parse_bloom_level


async def execute_chatbot_tool(
    name: str, args: dict, course_id: int, user_id: int, db: Session, chat_message_id: int | None = None
) -> dict:
    """Thực thi công cụ cục bộ và trả về kết quả JSON."""
    if name == "search_course_knowledge":
        query = args.get("query", "")
        if not query:
            return {"error": "Missing query argument"}
        hits = await asyncio.to_thread(search_rag_isolated, query, user_id=user_id, course_id=course_id, top_k=5)
        formatted_hits = []
        for hit in hits:
            formatted_hits.append(
                {"file_name": hit.get("file_name"), "page_number": hit.get("page_number"), "text": hit.get("text")}
            )
        return {"results": formatted_hits}

    elif name == "get_course_chapters":
        def query_chapters():
            return (
                db.query(Chapter)
                .filter(Chapter.course_id == course_id, Chapter.is_active)
                .order_by(Chapter.sort_order.asc())
                .all()
            )
        chapters = await asyncio.to_thread(query_chapters)
        return {
            "chapters": [
                {"id": ch.id, "title": ch.title, "description": ch.description, "sort_order": ch.sort_order}
                for ch in chapters
            ]
        }

    elif name == "get_course_clos":
        clos = await asyncio.to_thread(lambda: db.query(CLO).filter(CLO.course_id == course_id).all())
        return {
            "clos": [
                {"id": c.id, "clo_code": c.clo_code, "description": c.description, "bloom_level": c.bloom_level}
                for c in clos
            ]
        }

    elif name == "get_matrix_coverage":
        def fetch_matrix():
            clos = db.query(CLO).filter(CLO.course_id == course_id).all()
            questions = db.query(Question).filter(Question.course_id == course_id, Question.is_active).all()
            materials = (
                db.query(ChapterMaterial)
                .join(Chapter)
                .filter(Chapter.course_id == course_id, Chapter.is_active, ChapterMaterial.is_active)
                .all()
            )

            matrix = {}
            for c in clos:
                matrix[c.clo_code] = {
                    "description": c.description,
                    "target_bloom": c.bloom_level,
                    "question_count": 0,
                    "material_slide_count": 0,
                }

            for q in questions:
                if q.clo_id:
                    clo_obj = db.query(CLO).filter(CLO.id == q.clo_id).first()
                    if clo_obj and clo_obj.clo_code in matrix:
                        matrix[clo_obj.clo_code]["question_count"] += 1

            import re

            for m in materials:
                if not m.slide_content:
                    continue
                slides = re.split(r"\n#\s+", "\n" + m.slide_content)
                for s in slides:
                    if not s.strip():
                        continue
                    matches = re.findall(r"\[CLO\s*:\s*([^\]]+)\]", s, re.IGNORECASE)
                    for clo_code in matches:
                        c_code = clo_code.strip()
                        if c_code in matrix:
                            matrix[c_code]["material_slide_count"] += 1
            return matrix

        matrix = await asyncio.to_thread(fetch_matrix)
        return {"matrix": matrix}

    elif name == "clarify":
        return {"status": "clarifying", "question": args.get("question", "")}

    elif name == "generate_course_outline_action":
        # 1. Kiểm tra quyền sở hữu môn học
        course = await asyncio.to_thread(lambda: db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first())
        if not course:
            return {"error": "unauthorized", "message": "Môn học không tồn tại hoặc bạn không có quyền truy cập."}

        # 2. Lấy danh sách các CLO hiện có của môn học
        clos = await asyncio.to_thread(lambda: db.query(CLO).filter(CLO.course_id == course_id).all())
        if not clos:
            return {
                "status": "proposed",
                "view": "course_config",
                "action": "navigate_to_upload",
                "params": {"course_id": course_id},
                "message": "Môn học chưa cấu hình CLO. Em đề xuất chuyển sang trang Cấu hình môn học để Thầy/Cô nạp Syllabus.",
            }

        return {
            "status": "proposed",
            "view": "lesson_planner",
            "action": "generate_outline",
            "params": {"course_id": course_id},
            "message": "Đề xuất sinh tự động cấu trúc chương học (đề cương) dựa trên danh sách CLOs hiện có.",
        }

    elif name == "generate_chapter_storyboard_action":
        # Check if CLOs exist
        clos = await asyncio.to_thread(lambda: db.query(CLO).filter(CLO.course_id == course_id).all())
        if not clos:
            return {
                "status": "proposed",
                "view": "course_config",
                "action": "navigate_to_upload",
                "params": {"course_id": course_id},
                "message": "Môn học chưa cấu hình CLO. Em đề xuất chuyển sang trang Cấu hình môn học để Thầy/Cô nạp Syllabus.",
            }

        # Check if Chapters outline exists
        chapters = await asyncio.to_thread(lambda: db.query(Chapter).filter(Chapter.course_id == course_id, Chapter.is_active).all())
        if not chapters:
            return {
                "status": "proposed",
                "view": "lesson_planner",
                "action": "generate_outline",
                "params": {"course_id": course_id},
                "message": "Môn học chưa có cấu trúc chương học (Outline). Em đề xuất chuyển sang trang Soạn bài giảng để sinh đề cương.",
            }

        chapter_id = args.get("chapter_id")
        if not chapter_id:
            chapter_id = chapters[0].id

        chapter = await asyncio.to_thread(lambda: db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == user_id).first())
        if not chapter:
            return {"error": "unauthorized", "message": "Chương học không tồn tại hoặc bạn không có quyền truy cập."}

        return {
            "status": "proposed",
            "view": "lesson_planner",
            "action": "generate_storyboard",
            "params": {
                "chapter_id": chapter_id,
                "chapter_title": chapter.title,
                "language": args.get("language", "vi"),
                "session_duration": args.get("session_duration", 90),
            },
            "message": f"Đề xuất lập storyboard nháp cho chương: {chapter.title}.",
        }

    elif name == "generate_chapter_materials_action":
        # Check if CLOs exist
        clos = await asyncio.to_thread(lambda: db.query(CLO).filter(CLO.course_id == course_id).all())
        if not clos:
            return {
                "status": "proposed",
                "view": "course_config",
                "action": "navigate_to_upload",
                "params": {"course_id": course_id},
                "message": "Môn học chưa cấu hình CLO. Em đề xuất chuyển sang trang Cấu hình môn học để Thầy/Cô nạp Syllabus.",
            }

        # Check if Chapters outline exists
        chapters = await asyncio.to_thread(lambda: db.query(Chapter).filter(Chapter.course_id == course_id, Chapter.is_active).all())
        if not chapters:
            return {
                "status": "proposed",
                "view": "lesson_planner",
                "action": "generate_outline",
                "params": {"course_id": course_id},
                "message": "Môn học đã có CLOs nhưng chưa có cấu trúc chương học (Outline). Em đề xuất chuyển sang trang Soạn bài giảng để sinh đề cương.",
            }

        chapter_id = args.get("chapter_id")
        if not chapter_id:
            chapter_id = chapters[0].id

        chapter = await asyncio.to_thread(lambda: db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == user_id).first())
        if not chapter:
            return {"error": "unauthorized", "message": "Chương học không tồn tại hoặc bạn không có quyền truy cập."}

        return {
            "status": "proposed",
            "view": "lesson_planner",
            "action": "generate_materials",
            "params": {
                "chapter_id": chapter_id,
                "chapter_title": chapter.title,
                "class_size": args.get("class_size", 40),
                "has_wifi": args.get("has_wifi", True),
                "furniture_type": args.get("furniture_type", "movable"),
                "language": args.get("language", "vi"),
                "session_duration": args.get("session_duration", 90),
                "storyboard": args.get("storyboard")
            },
            "message": f"Đề xuất soạn thảo chi tiết slide bài giảng và active learning cho chương: {chapter.title}.",
        }

    elif name == "generate_chapter_questions_action":
        # Check if CLOs exist
        clos = await asyncio.to_thread(lambda: db.query(CLO).filter(CLO.course_id == course_id).all())
        if not clos:
            return {
                "status": "proposed",
                "view": "course_config",
                "action": "navigate_to_upload",
                "params": {"course_id": course_id},
                "message": "Môn học chưa cấu hình CLO. Em đề xuất chuyển sang trang Cấu hình môn học để Thầy/Cô nạp Syllabus.",
            }

        # Check if Chapters outline exists
        chapters = await asyncio.to_thread(lambda: db.query(Chapter).filter(Chapter.course_id == course_id, Chapter.is_active).all())
        if not chapters:
            return {
                "status": "proposed",
                "view": "lesson_planner",
                "action": "generate_outline",
                "params": {"course_id": course_id},
                "message": "Môn học chưa có cấu trúc chương học (Outline). Em đề xuất chuyển sang trang Soạn bài giảng để sinh đề cương.",
            }

        chapter_id = args.get("chapter_id")
        clo_id = args.get("clo_id")
        bloom_level = args.get("bloom_level", 3)
        count = args.get("count", 5)
        fast_mode = args.get("fast_mode", True)

        course = await asyncio.to_thread(lambda: db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first())
        if not course:
            return {"error": "unauthorized", "message": "Môn học không tồn tại hoặc bạn không có quyền truy cập."}

        chapter = None
        if chapter_id:
            chapter = await asyncio.to_thread(lambda: db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.course_id == course_id).first())
        elif chapters:
            chapter = chapters[0]
            chapter_id = chapter.id

        clo = None
        if clo_id:
            clo = await asyncio.to_thread(lambda: db.query(CLO).filter(CLO.id == clo_id, CLO.course_id == course_id).first())
        elif clos:
            clo = clos[0]
            clo_id = clo.id

        return {
            "status": "proposed",
            "view": "question_bank",
            "action": "generate_questions",
            "params": {
                "chapter_id": chapter_id,
                "chapter_title": chapter.title if chapter else None,
                "clo_id": clo_id,
                "clo_code": clo.clo_code if clo else None,
                "bloom_level": bloom_level,
                "count": count,
                "fast_mode": fast_mode
            },
            "message": f"Đề xuất soạn {count} câu hỏi trắc nghiệm chuẩn Bloom B{bloom_level} cho chuẩn đầu ra {clo.clo_code if clo else 'môn học'}.",
        }

    elif name == "get_course_info":
        course = await asyncio.to_thread(lambda: db.query(Course).filter(Course.id == course_id).first())
        if not course:
            return {"error": "not_found", "message": "Không tìm thấy thông tin môn học."}
        return {
            "course_id": course.id,
            "course_name": course.course_name,
            "course_code": course.course_code,
            "required_textbooks": course.required_textbooks,
            "recommended_readings": course.recommended_readings
        }

    elif name == "get_chapter_materials":
        chapter_id = args.get("chapter_id")
        if not chapter_id:
            chapters = await asyncio.to_thread(lambda: db.query(Chapter).filter(Chapter.course_id == course_id, Chapter.is_active).all())
            if not chapters:
                return {"error": "not_found", "message": "Môn học chưa có chương học nào."}
            chapter_id = chapters[0].id

        mat = await asyncio.to_thread(lambda: db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id, ChapterMaterial.is_active == True).first())
        if not mat:
            return {"chapter_id": chapter_id, "slide_content": "", "active_learning_script": "", "message": "Chưa soạn slide bài giảng hay kịch bản cho chương này."}

        return {
            "chapter_id": chapter_id,
            "slide_content": mat.slide_content or "",
            "active_learning_script": mat.active_learning_script or ""
        }

    elif name == "get_chapter_questions":
        chapter_id = args.get("chapter_id")
        def query_questions():
            q_query = db.query(Question).filter(Question.course_id == course_id, Question.is_active == True)
            if chapter_id:
                q_query = q_query.filter(Question.chapter_id == chapter_id)
            return q_query.all()

        questions = await asyncio.to_thread(query_questions)
        formatted_qs = []
        for q in questions:
            opts = []
            if q.options_json:
                try:
                    opts = json.loads(q.options_json)
                except Exception:
                    opts = []
            
            clo_code = None
            if q.clo_id:
                clo_obj = db.query(CLO).filter(CLO.id == q.clo_id).first()
                if clo_obj:
                    clo_code = clo_obj.clo_code

            formatted_qs.append({
                "id": q.id,
                "chapter_id": q.chapter_id,
                "question_text": q.question_text,
                "options": opts,
                "correct_answer": q.correct_answer,
                "bloom_level": q.bloom_level,
                "clo_code": clo_code
            })
        return {"questions": formatted_qs}

    elif name == "get_uploaded_documents":
        docs = await asyncio.to_thread(lambda: db.query(RAGDocument).filter(RAGDocument.course_id == course_id).all())
        return {
            "documents": [
                {
                    "id": d.id,
                    "file_name": d.file_name,
                    "category": d.category,
                    "status": d.status,
                    "created_at": d.created_at.isoformat() if d.created_at else None
                }
                for d in docs
            ]
        }

    elif name == "get_system_rules":
        rules = await asyncio.to_thread(lambda: db.query(SystemRule).filter(SystemRule.course_id == course_id, SystemRule.status == "approved").all())
        return {
            "rules": [
                {
                    "id": r.id,
                    "rule_text": r.rule_text,
                    "rule_category": r.rule_category,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                }
                for r in rules
            ]
        }

    else:
        return {"error": "unknown_tool", "message": f"Không tìm thấy công cụ {name}"}
