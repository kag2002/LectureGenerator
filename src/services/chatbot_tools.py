import asyncio
import json

from sqlalchemy.orm import Session

from src.database.models import CLO, Chapter, ChapterMaterial, Course, Question
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
        hits = search_rag_isolated(query, user_id=user_id, course_id=course_id, top_k=5)
        formatted_hits = []
        for hit in hits:
            formatted_hits.append(
                {"file_name": hit.get("file_name"), "page_number": hit.get("page_number"), "text": hit.get("text")}
            )
        return {"results": formatted_hits}

    elif name == "get_course_chapters":
        chapters = (
            db.query(Chapter)
            .filter(Chapter.course_id == course_id, Chapter.is_active)
            .order_by(Chapter.sort_order.asc())
            .all()
        )
        return {
            "chapters": [
                {"id": ch.id, "title": ch.title, "description": ch.description, "sort_order": ch.sort_order}
                for ch in chapters
            ]
        }

    elif name == "get_course_clos":
        clos = db.query(CLO).filter(CLO.course_id == course_id).all()
        return {
            "clos": [
                {"id": c.id, "clo_code": c.clo_code, "description": c.description, "bloom_level": c.bloom_level}
                for c in clos
            ]
        }

    elif name == "get_matrix_coverage":
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

        return {"matrix": matrix}

    elif name == "clarify":
        return {"status": "clarifying", "question": args.get("question", "")}

    elif name == "generate_course_outline_action":
        # 1. Kiểm tra quyền sở hữu môn học
        course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
        if not course:
            return {"error": "unauthorized", "message": "Môn học không tồn tại hoặc bạn không có quyền truy cập."}

        # 2. Lấy danh sách các CLO hiện có của môn học
        clos = db.query(CLO).filter(CLO.course_id == course_id).all()
        if not clos:
            return {"error": "missing_clos", "message": "Môn học chưa cấu hình CLO. Vui lòng nạp Syllabus trước."}

        # 3. Định dạng danh sách CLO gửi cho LLM
        clos_text = "\n".join([f"- [{c.clo_code}] {c.description} (Thang Bloom: {c.bloom_level})" for c in clos])

        system_prompt = """Bạn là chuyên gia sư phạm đại học. Thiết kế đề cương học tập (Lesson Outline).
Nhiệm vụ: Dựa vào các Chuẩn đầu ra (CLOs) môn học được cung cấp, hãy thiết kế một cấu trúc chương học logic (từ 5 đến 7 chương).
Đảm bảo:
- Nội dung đi từ cơ bản đến nâng cao.
- Phân bổ đều để phủ toàn bộ các CLOs đã cho.
- Mỗi chương gồm Tên chương (title) và Mô tả ngắn gọn (description) các chủ đề giảng dạy chính.

Đầu ra định dạng JSON:
{
  "chapters": [
    {
      "title": "Chương 1: Tên chương",
      "description": "Mô tả ngắn gọn nội dung chương..."
    }
  ]
}
"""
        prompt = f"Môn học: {course.course_name}\nChuẩn đầu ra môn học (CLOs):\n{clos_text}\n\nHãy sinh cấu trúc chương học phù hợp."

        try:
            outline_json = await async_call_llm_json(
                prompt,
                system_instruction=system_prompt,
                prompt_name="lesson_outline_chatbot",
                prompt_version="v1",
                metadata={"course_id": course_id, "user_id": user_id},
            )

            # Xóa outline cũ đang hoạt động để ghi đè mới
            db.query(Chapter).filter(Chapter.course_id == course_id, Chapter.is_active).delete(
                synchronize_session=False
            )

            # Lưu các chương học mới vào database
            created_chapters = []
            for idx, ch in enumerate(outline_json.get("chapters", [])):
                new_chapter = Chapter(
                    course_id=course_id,
                    sort_order=idx + 1,
                    title=ch.get("title", f"Chương {idx + 1}"),
                    description=ch.get("description", ""),
                    chat_message_id=chat_message_id,
                    is_active=True,
                )
                db.add(new_chapter)
                created_chapters.append(new_chapter)

            db.commit()

            return {
                "status": "success",
                "message": f"Sinh cấu trúc môn học thành công với {len(created_chapters)} chương.",
                "chapters": [
                    {"id": c.id, "sort_order": c.sort_order, "title": c.title, "description": c.description}
                    for c in created_chapters
                ],
            }
        except Exception as e:
            db.rollback()
            return {"error": "failed", "message": f"Lỗi khi AI sinh dàn ý: {str(e)}"}

    elif name == "generate_chapter_storyboard_action":
        chapter_id = args.get("chapter_id")
        if not chapter_id:
            return {"error": "missing_argument", "message": "Thiếu tham số chapter_id."}

        chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == user_id).first()
        if not chapter:
            return {"error": "unauthorized", "message": "Chương học không tồn tại hoặc bạn không có quyền truy cập."}

        clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
        clos_context = ""
        if clos:
            clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
            for c in clos:
                clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"

        language = args.get("language", "vi")
        target_lang = LANGUAGE_MAP.get(language, "Tiếng Việt (Vietnamese)")
        session_duration = args.get("session_duration", 90)

        orchestrator = MaterialOrchestrator(
            chapter_title=chapter.title,
            chapter_description=chapter.description or "",
            clos_context=clos_context,
            rag_context="",
            target_lang=target_lang,
            session_duration=session_duration,
            user_id=user_id,
            course_id=course_id,
            chapter_id=chapter_id,
        )

        try:
            storyboard = await orchestrator.async_run_storyboard_architect()
            return {
                "status": "success",
                "message": f"Lập cấu trúc slide storyboard thành công với {len(storyboard)} slide.",
                "storyboard": storyboard,
            }
        except Exception as e:
            return {"error": "failed", "message": f"Lỗi khi lập storyboard: {str(e)}"}

    elif name == "generate_chapter_materials_action":
        chapter_id = args.get("chapter_id")
        if not chapter_id:
            return {"error": "missing_argument", "message": "Thiếu tham số chapter_id."}

        chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == user_id).first()
        if not chapter:
            return {"error": "unauthorized", "message": "Chương học không tồn tại hoặc bạn không có quyền truy cập."}

        course_id = chapter.course_id

        # 1. Truy vấn RAG từ ChromaDB
        query = f"{chapter.title} {chapter.description or ''}"
        rag_hits = search_rag_isolated(query, user_id=user_id, course_id=course_id, top_k=4, chapter_id=chapter_id)
        rag_hits = deduplicate_rag_hits(rag_hits, threshold=0.75)

        rag_context = ""
        if rag_hits:
            for hit in rag_hits:
                rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"

        clos = db.query(CLO).filter(CLO.course_id == course_id).all()
        clos_context = ""
        if clos:
            clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
            for c in clos:
                clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"

        language = args.get("language", "vi")
        target_lang = LANGUAGE_MAP.get(language, "Tiếng Việt (Vietnamese)")
        session_duration = args.get("session_duration", 90)
        class_size = args.get("class_size", 40)
        has_wifi = args.get("has_wifi", True)
        furniture_type = args.get("furniture_type", "movable")
        storyboard = args.get("storyboard")

        orchestrator = MaterialOrchestrator(
            chapter_title=chapter.title,
            chapter_description=chapter.description or "",
            clos_context=clos_context,
            rag_context=rag_context,
            target_lang=target_lang,
            session_duration=session_duration,
            user_id=user_id,
            course_id=course_id,
            chapter_id=chapter_id,
        )

        try:
            if storyboard:
                orchestrator.state["outline"] = storyboard
            else:
                await orchestrator.async_run_storyboard_architect()

            await orchestrator.async_run_content_allocator()
            await orchestrator.async_run_slide_writer()
            await orchestrator.async_run_active_learning_planner(
                class_size=class_size, has_wifi=has_wifi, furniture_type=furniture_type
            )
            await orchestrator.async_run_logic_auditor()

            slide_content = "\n\n".join(orchestrator.state["generated_slides"])
            active_learning_script = orchestrator.state["active_learning_script"]

            # Lưu CSDL
            material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
            if not material:
                material = ChapterMaterial(
                    chapter_id=chapter_id, slide_content=slide_content, active_learning_script=active_learning_script
                )
                db.add(material)
            else:
                material.slide_content = slide_content
                material.active_learning_script = active_learning_script
            db.commit()
            db.refresh(material)

            # Trả về kết quả chi tiết kèm telemetry
            return {
                "status": "success",
                "message": "AI sinh học liệu (slide + active learning) và lưu CSDL thành công.",
                "slide_count": len(orchestrator.state["generated_slides"]),
                "active_learning_script_length": len(active_learning_script) if active_learning_script else 0,
                "warnings": orchestrator.state["warnings"],
                "slide_titles": [
                    s.get("title", f"Slide {s.get('slide_index')}") for s in orchestrator.state["outline"]
                ],
            }
        except Exception as e:
            db.rollback()
            return {"error": "failed", "message": f"Lỗi sinh bài giảng: {str(e)}"}

    elif name == "generate_chapter_questions_action":
        chapter_id = args.get("chapter_id")
        clo_id = args.get("clo_id")
        bloom_level = args.get("bloom_level", 3)
        count = args.get("count", 5)
        fast_mode = args.get("fast_mode", True)

        course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
        if not course:
            return {"error": "unauthorized", "message": "Môn học không tồn tại hoặc bạn không có quyền truy cập."}

        # 1. Thu thập ngữ cảnh (CLO / Chapter / RAG)
        clo_context = ""
        target_clo = None
        if clo_id:
            target_clo = db.query(CLO).filter(CLO.id == clo_id, CLO.course_id == course_id).first()
            if target_clo:
                clo_context = f"Chuẩn đầu ra mục tiêu: [{target_clo.clo_code}] {target_clo.description} (Thang Bloom: {target_clo.bloom_level})\n"

        chapter_context = ""
        target_chapter = None
        if chapter_id:
            target_chapter = db.query(Chapter).filter(Chapter.id == chapter_id, Chapter.course_id == course_id).first()
            if target_chapter:
                chapter_context = f"Chương học liên quan: {target_chapter.title} - {target_chapter.description or ''}\n"

        # 2. Tìm kiếm RAG ngữ cảnh
        query_str = f"Câu hỏi trắc nghiệm {target_clo.description if target_clo else ''} {target_chapter.title if target_chapter else ''}"
        rag_hits = search_rag_isolated(query_str, user_id=user_id, course_id=course_id, top_k=4, chapter_id=chapter_id)
        rag_context = ""
        if rag_hits:
            for hit in rag_hits:
                rag_context += f"[Tài liệu: {hit['file_name']}]: {hit['text']}\n\n"

        # 3. Pha 1: Generator sinh câu hỏi nháp
        generator_system_prompt = build_generator_system_prompt(count=count, bloom_level=bloom_level)
        prompt = build_generator_user_prompt(
            course_name=course.course_name,
            clo_context=clo_context,
            chapter_context=chapter_context,
            rag_context=rag_context,
        )

        try:
            gen_data = await async_call_llm_json(
                prompt,
                system_instruction=generator_system_prompt,
                temperature=0.7,
                prompt_name="mcq_generator_chatbot",
                prompt_version="v1",
                metadata={"course_id": course_id, "user_id": user_id},
            )
            raw_questions = gen_data.get("questions", [])
        except Exception as e:
            return {"error": "failed", "message": f"Lỗi khi sinh câu hỏi nháp: {str(e)}"}

        # 4. Pha 2: Solver/Verifier duyệt tự sửa lỗi (Self-Correction)
        validated_questions = []
        self_correction_attempts_log = []

        if fast_mode:
            validated_questions = raw_questions
        else:
            solver_system_prompt = SOLVER_SYSTEM_PROMPT

            async def validate_single_question(idx, q):
                correct = False
                attempts = 0
                current_question = q

                while not correct and attempts < 2:  # Giảm tối đa 2 lần để tăng hiệu năng
                    attempts += 1
                    solver_prompt = build_solver_prompt(
                        question_text=current_question.get("question_text"),
                        options_json=current_question.get("options_json"),
                    )

                    try:
                        solver_res = await async_call_llm_json(
                            solver_prompt,
                            system_instruction=solver_system_prompt,
                            temperature=0.0,
                            prompt_name="mcq_solver_guardrail_chatbot",
                            prompt_version="v1",
                        )
                        selected_ans_val = solver_res.get("selected_answer", "")
                        selected_ans = str(selected_ans_val).strip() if selected_ans_val is not None else ""

                        target_ans_val = current_question.get("correct_answer", "")
                        target_ans = str(target_ans_val).strip() if target_ans_val is not None else ""

                        if (
                            selected_ans.lower() == target_ans.lower()
                            or selected_ans in target_ans
                            or target_ans in selected_ans
                        ):
                            correct = True
                            current_question["reasoning_path"] = (
                                f"Generator reasoning: {current_question.get('reasoning_path')} | Solver reasoning: {solver_res.get('reasoning_path')}"
                            )
                        else:
                            correction_prompt = build_correction_prompt(
                                question_text=current_question.get("question_text"),
                                options_json=current_question.get("options_json"),
                                target_answer=target_ans,
                                solver_answer=selected_ans,
                                solver_reasoning=solver_res.get("reasoning_path", ""),
                            )
                            corrected_data = await async_call_llm_json(
                                correction_prompt,
                                system_instruction=generator_system_prompt,
                                temperature=0.7,
                                prompt_name="mcq_self_correction_chatbot",
                                prompt_version="v1",
                            )
                            if "questions" in corrected_data and corrected_data["questions"]:
                                current_question = corrected_data["questions"][0]
                            else:
                                current_question = corrected_data
                    except Exception as e:
                        print(f"[ERROR] Chatbot MCQ Solver validation exception for question {idx + 1}: {str(e)}")
                        correct = True

                return current_question, attempts, correct

            # Thực thi kiểm duyệt song song cho tất cả các câu hỏi
            tasks = [validate_single_question(idx, q) for idx, q in enumerate(raw_questions)]
            validation_results = await asyncio.gather(*tasks)

            for idx, (res_q, atts, is_correct) in enumerate(validation_results):
                self_correction_attempts_log.append(
                    {"question_index": idx + 1, "attempts": atts, "final_correct": is_correct}
                )
                validated_questions.append(res_q)

        # 5. Lưu các câu hỏi hợp lệ vào Database
        saved_questions = []
        for q_data in validated_questions:
            opts = q_data.get("options_json", "[]")
            if isinstance(opts, list):
                opts_str = json.dumps(opts)
            else:
                opts_str = opts

            new_q = Question(
                course_id=course_id,
                chapter_id=chapter_id,
                question_text=q_data.get("question_text", ""),
                question_type="MCQ",
                options_json=opts_str,
                correct_answer=q_data.get("correct_answer", ""),
                bloom_level=safe_parse_bloom_level(q_data.get("bloom_level", bloom_level), bloom_level),
                clo_id=clo_id,
                chat_message_id=chat_message_id,
                is_active=True,
            )
            db.add(new_q)
            saved_questions.append(new_q)

        db.commit()
        for q in saved_questions:
            db.refresh(q)

        return {
            "status": "success",
            "message": f"Sinh thành công {len(saved_questions)} câu hỏi trắc nghiệm đã qua Self-Correction.",
            "question_count": len(saved_questions),
            "questions": [
                {
                    "id": q.id,
                    "question_text": q.question_text,
                    "options_json": q.options_json,
                    "correct_answer": q.correct_answer,
                    "bloom_level": q.bloom_level,
                    "clo_id": q.clo_id,
                }
                for q in saved_questions
            ],
            "self_correction_log": self_correction_attempts_log,
        }

    else:
        return {"error": "unknown_tool", "message": f"Không tìm thấy công cụ {name}"}
