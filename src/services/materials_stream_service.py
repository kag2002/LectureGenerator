import asyncio
import json

from src.database.models import CLO, ChapterMaterial
from src.database.session import SessionLocal
from src.database.vector_db import search_rag_isolated
from src.prompts.materials import (
    LANGUAGE_MAP,
    build_active_learning_planner_system_prompt,
    build_material_user_prompt,
    build_slide_designer_system_prompt,
)
from src.services.image_service import process_markdown_images
from src.services.material_orchestrator import MaterialOrchestrator, deduplicate_rag_hits
from src.utils.llm_client import call_llm_json, call_llm_stream, get_token_usage, init_token_tracker, langfuse
from src.utils.task_manager import task_manager


async def generate_chapter_materials_stream_generator(
    chapter_id: int,
    req_language: str,
    req_session_duration: int,
    req_class_size: int,
    req_has_wifi: bool,
    req_furniture_type: str,
    chapter_title: str,
    chapter_description: str,
    course_id: int,
    user_id: int,
    req_pedagogical_style: str = "interactive",
    req_learner_level: str = "intermediate",
    req_selected_clos: list[str] = None,
):
    init_token_tracker()

    def send(event: str, data: dict):
        usage = get_token_usage()
        if usage:
            data["usage"] = {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    current_task = asyncio.current_task()
    if current_task:
        task_manager.register_task(f"material_{chapter_id}", current_task)

    try:
        yield send("stage", {"stage": 1, "message": "Đang tìm kiếm học liệu tham chiếu phù hợp..."})

        # 2. Truy vấn RAG cô lập từ ChromaDB
        query = f"{chapter_title} {chapter_description}"
        rag_hits = search_rag_isolated(query, user_id=user_id, course_id=course_id, top_k=4, chapter_id=chapter_id)

        # 3. Lọc trùng bằng Cosine Similarity
        rag_hits = deduplicate_rag_hits(rag_hits, threshold=0.75)

        # 4. Định dạng ngữ cảnh RAG
        rag_context = ""
        if rag_hits:
            for hit in rag_hits:
                rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"

        # Lấy danh sách CLO của môn học
        new_db_for_clos = SessionLocal()
        clos_context = ""
        try:
            clos = new_db_for_clos.query(CLO).filter(CLO.course_id == course_id).all()
            if clos:
                clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
                for c in clos:
                    clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"
        finally:
            new_db_for_clos.close()

        target_lang = LANGUAGE_MAP.get(req_language, "Tiếng Việt (Vietnamese)")

        # Khởi tạo Orchestrator
        orchestrator = MaterialOrchestrator(
            chapter_title=chapter_title,
            chapter_description=chapter_description,
            clos_context=clos_context,
            rag_context=rag_context,
            target_lang=target_lang,
            session_duration=req_session_duration,
            user_id=user_id,
            course_id=course_id,
            chapter_id=chapter_id,
            pedagogical_style=req_pedagogical_style,
            learner_level=req_learner_level,
            selected_clos=req_selected_clos,
        )

        mat_stream_trace = None
        if langfuse:
            mat_stream_trace = langfuse.trace(
                name="chapter_materials_generation_stream_multi_agent",
                metadata={"chapter_id": chapter_id, "chapter_title": chapter_title, "language": req_language},
            )

        # --- BƯỚC 1: STORYBOARD ARCHITECT ---
        yield send(
            "stage",
            {
                "stage": 1,
                "message": "Bước 1: Đang thiết kế cấu trúc đề cương bài giảng (Storyboard)...",
                "active_agent": "storyboard_architect",
                "agent_status": "running",
            },
        )
        try:
            await orchestrator.async_run_storyboard_architect(trace_or_span=mat_stream_trace)
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 1 (Lập storyboard): {str(e)}"})
            return

        # --- BƯỚC 2: CONTENT ALLOCATOR ---
        yield send(
            "stage",
            {
                "stage": 2,
                "message": "Bước 2: Đang phân bổ nội dung cho từng slide...",
                "active_agent": "content_allocator",
                "agent_status": "running",
            },
        )
        try:
            await orchestrator.async_run_content_allocator(trace_or_span=mat_stream_trace)
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 2 (Phân phối thông tin): {str(e)}"})
            return

        # --- BƯỚC 3: SLIDE WRITER & STREAM TOKENS ---
        yield send(
            "stage",
            {
                "stage": 3,
                "message": "Bước 3: Đang soạn nội dung slide chi tiết...",
                "active_agent": "slide_writer",
                "agent_status": "running",
            },
        )
        yield send("token", {"token": "---SLIDES---\n"})

        slide_content = ""

        try:
            progress_queue = asyncio.Queue()

            async def on_slide_status(slide_idx, status, details):
                await progress_queue.put((slide_idx, status, details))

            writer_task = asyncio.create_task(
                orchestrator.async_run_slide_writer(
                    trace_or_span=mat_stream_trace, slide_status_callback=on_slide_status
                )
            )

            completed_slides = 0
            total_slides = len(orchestrator.state["allocations"])

            while not writer_task.done() or not progress_queue.empty():
                try:
                    slide_idx, status, details = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    if status == "start":
                        yield send(
                            "stage",
                            {
                                "stage": 3,
                                "message": f"Bước 3: Đang soạn thảo Slide {slide_idx}/{total_slides}: '{details.get('title')}'...",
                                "active_agent": "slide_writer",
                                "agent_status": "running",
                                "current_slide": slide_idx,
                                "total_slides": total_slides,
                            },
                        )
                    elif status == "correcting":
                        yield send(
                            "stage",
                            {
                                "stage": 3,
                                "message": f"Bước 3: Slide {slide_idx} vượt quá hạn mức ký tự ({details.get('length')}/{details.get('budget')}). Đang chạy Self-Correction lần {details.get('attempt')}...",
                                "active_agent": "slide_writer",
                                "agent_status": "correcting",
                                "self_correction_attempt": details.get("attempt"),
                                "current_slide": slide_idx,
                                "total_slides": total_slides,
                            },
                        )
                    elif status == "done":
                        completed_slides += 1
                        yield send(
                            "stage",
                            {
                                "stage": 3,
                                "message": f"Bước 3: Đã hoàn tất Slide {slide_idx}/{total_slides} (Bố cục: {details.get('layout')}).",
                                "active_agent": "slide_writer",
                                "agent_status": "completed",
                                "current_slide": completed_slides,
                                "total_slides": total_slides,
                            },
                        )
                    progress_queue.task_done()
                except TimeoutError:
                    continue

            await writer_task

            for single_slide_md in orchestrator.state["generated_slides"]:
                slide_token = single_slide_md + "\n\n"
                slide_content += slide_token
                yield send("token", {"token": slide_token})
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 3 (Sinh Slide): {str(e)}"})
            return

        # Lưu tạm slide_content vào DB
        slide_content = process_markdown_images(slide_content)
        new_db = SessionLocal()
        try:
            material = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
            if not material:
                material = ChapterMaterial(
                    chapter_id=chapter_id, slide_content=slide_content, active_learning_script="", created_by="odin_autopilot"
                )
                new_db.add(material)
            else:
                material.slide_content = slide_content
                material.created_by = "odin_autopilot"
            new_db.commit()
        except Exception as e:
            new_db.rollback()
            yield send("error", {"message": f"Lỗi lưu trữ DB trung gian: {str(e)}"})
            new_db.close()
            return
        new_db.close()

        # --- BƯỚC 4: ACTIVE LEARNING PLANNER ---
        yield send(
            "stage",
            {
                "stage": 4,
                "message": "Bước 4: Đang thiết kế các hoạt động tương tác trên lớp...",
                "active_agent": "active_learning_scheduler",
                "agent_status": "running",
            },
        )
        yield send("token", {"token": "\n---ACTIVE_LEARNING---\n"})

        try:
            active_learning_script = await orchestrator.async_run_active_learning_planner(
                class_size=req_class_size,
                has_wifi=req_has_wifi,
                furniture_type=req_furniture_type,
                trace_or_span=mat_stream_trace,
            )
            yield send("token", {"token": active_learning_script})
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 4 (Kịch bản Active Learning): {str(e)}"})
            return

        # --- BƯỚC 5: LOGIC AUDITOR (KIỂM TOÁN CHÉO) ---
        yield send(
            "stage",
            {
                "stage": 5,
                "message": "Bước 5: Rà soát tính nhất quán sư phạm...",
                "active_agent": "logic_auditor",
                "agent_status": "running",
            },
        )
        try:
            is_valid = await orchestrator.async_run_logic_auditor(trace_or_span=mat_stream_trace)
            if not is_valid:
                print(f"[Logic Auditor] Phát hiện lỗi kiểm định: {orchestrator.state['warnings']}")
        except Exception as e:
            print(f"[WARNING] Lỗi chạy Logic Auditor: {e}")

        # 6. Lưu kết quả cuối cùng vào DB
        yield send(
            "stage",
            {
                "stage": 6,
                "message": "Bước 6: Đang lưu bài giảng và giáo án đã hoàn thiện...",
                "active_agent": "saver",
                "agent_status": "running",
            },
        )

        new_db = SessionLocal()
        try:
            material = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
            if not material:
                material = ChapterMaterial(
                    chapter_id=chapter_id,
                    slide_content=slide_content,
                    active_learning_script=active_learning_script,
                    created_by="odin_autopilot",
                )
                new_db.add(material)
            else:
                material.slide_content = slide_content
                material.active_learning_script = active_learning_script
                material.created_by = "odin_autopilot"
            new_db.commit()
            new_db.refresh(material)

            # Thêm log hành động để hoàn tác
            try:
                from src.database.models import OdinActionLog
                action_log = OdinActionLog(
                    course_id=course_id,
                    action_type="generate_materials",
                    affected_ids=json.dumps({"materials": [material.id]})
                )
                new_db.add(action_log)
                new_db.commit()
            except Exception as log_err:
                print(f"[ERROR] Failed to save OdinActionLog: {log_err}")
        except Exception as e:
            new_db.rollback()
            yield send("error", {"message": f"Lỗi lưu cơ sở dữ liệu: {str(e)}"})
            return
        finally:
            new_db.close()

        yield send(
            "done",
            {
                "message": "Đã thiết kế xong bài giảng và giáo án tương tác!",
                "slide_content": slide_content,
                "active_learning_script": active_learning_script,
                "warnings": orchestrator.state["warnings"],
            },
        )
    except asyncio.CancelledError:
        print(f"[MATERIAL STREAM] Task cancelled for chapter {chapter_id}")
        yield send("stage", {"stage": 6, "message": "Tiến trình thiết kế bài giảng đã bị hủy."})
        yield send(
            "done",
            {
                "message": "Đã dừng thiết kế bài giảng.",
                "slide_content": "",
                "active_learning_script": "",
                "warnings": ["Đã hủy tác vụ theo yêu cầu."],
            },
        )
    finally:
        task_manager.unregister_task(f"material_{chapter_id}")


async def generate_materials_from_storyboard_stream_generator(
    chapter_id: int,
    req_language: str,
    req_session_duration: int,
    req_class_size: int,
    req_has_wifi: bool,
    req_furniture_type: str,
    req_storyboard: list[dict],
    chapter_title: str,
    chapter_description: str,
    course_id: int,
    user_id: int,
    req_pedagogical_style: str = "interactive",
    req_learner_level: str = "intermediate",
    req_selected_clos: list[str] = None,
):
    init_token_tracker()

    def send(event: str, data: dict):
        usage = get_token_usage()
        if usage:
            data["usage"] = {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    current_task = asyncio.current_task()
    if current_task:
        task_manager.register_task(f"material_{chapter_id}", current_task)

    try:
        yield send("stage", {"stage": 1, "message": "Đang tìm kiếm học liệu tham chiếu phù hợp..."})

        # 2. Truy vấn RAG cô lập từ ChromaDB
        query = f"{chapter_title} {chapter_description}"
        rag_hits = search_rag_isolated(query, user_id=user_id, course_id=course_id, top_k=4, chapter_id=chapter_id)
        rag_hits = deduplicate_rag_hits(rag_hits, threshold=0.75)

        rag_context = ""
        if rag_hits:
            for hit in rag_hits:
                rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"

        # Lấy danh sách CLO của môn học
        new_db_for_clos = SessionLocal()
        clos_context = ""
        try:
            clos = new_db_for_clos.query(CLO).filter(CLO.course_id == course_id).all()
            if clos:
                clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
                for c in clos:
                    clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"
        finally:
            new_db_for_clos.close()

        target_lang = LANGUAGE_MAP.get(req_language, "Tiếng Việt (Vietnamese)")

        # 3. Khởi tạo Orchestrator và gán outline từ người dùng gửi lên
        orchestrator = MaterialOrchestrator(
            chapter_title=chapter_title,
            chapter_description=chapter_description,
            clos_context=clos_context,
            rag_context=rag_context,
            target_lang=target_lang,
            session_duration=req_session_duration,
            user_id=user_id,
            course_id=course_id,
            chapter_id=chapter_id,
            pedagogical_style=req_pedagogical_style,
            learner_level=req_learner_level,
            selected_clos=req_selected_clos,
        )
        # Gán Storyboard đã duyệt/sửa
        orchestrator.state["outline"] = req_storyboard

        mat_stream_trace = None
        if langfuse:
            mat_stream_trace = langfuse.trace(
                name="chapter_materials_generation_from_storyboard_stream",
                metadata={"chapter_id": chapter_id, "chapter_title": chapter_title, "language": req_language},
            )

        # --- BƯỚC 2: CONTENT ALLOCATOR ---
        yield send(
            "stage",
            {
                "stage": 2,
                "message": "Bước 2: Đang phân bổ nội dung dựa trên đề cương đã duyệt...",
                "active_agent": "content_allocator",
                "agent_status": "running",
            },
        )
        try:
            await orchestrator.async_run_content_allocator(trace_or_span=mat_stream_trace)
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 2 (Phân phối thông tin): {str(e)}"})
            return

        # --- BƯỚC 3: SLIDE WRITER & STREAM TOKENS ---
        yield send(
            "stage",
            {
                "stage": 3,
                "message": "Bước 3: Đang soạn nội dung slide chi tiết...",
                "active_agent": "slide_writer",
                "agent_status": "running",
            },
        )
        yield send("token", {"token": "---SLIDES---\n"})

        slide_content = ""

        try:
            progress_queue = asyncio.Queue()

            async def on_slide_status(slide_idx, status, details):
                await progress_queue.put((slide_idx, status, details))

            writer_task = asyncio.create_task(
                orchestrator.async_run_slide_writer(
                    trace_or_span=mat_stream_trace, slide_status_callback=on_slide_status
                )
            )

            completed_slides = 0
            total_slides = len(orchestrator.state["allocations"])

            while not writer_task.done() or not progress_queue.empty():
                try:
                    slide_idx, status, details = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    if status == "start":
                        yield send(
                            "stage",
                            {
                                "stage": 3,
                                "message": f"Bước 3: Đang soạn thảo Slide {slide_idx}/{total_slides}: '{details.get('title')}'...",
                                "active_agent": "slide_writer",
                                "agent_status": "running",
                                "current_slide": slide_idx,
                                "total_slides": total_slides,
                            },
                        )
                    elif status == "correcting":
                        yield send(
                            "stage",
                            {
                                "stage": 3,
                                "message": f"Bước 3: Slide {slide_idx} vượt quá hạn mức ký tự ({details.get('length')}/{details.get('budget')}). Đang chạy Self-Correction lần {details.get('attempt')}...",
                                "active_agent": "slide_writer",
                                "agent_status": "correcting",
                                "self_correction_attempt": details.get("attempt"),
                                "current_slide": slide_idx,
                                "total_slides": total_slides,
                            },
                        )
                    elif status == "done":
                        completed_slides += 1
                        yield send(
                            "stage",
                            {
                                "stage": 3,
                                "message": f"Bước 3: Đã hoàn tất Slide {slide_idx}/{total_slides} (Bố cục: {details.get('layout')}).",
                                "active_agent": "slide_writer",
                                "agent_status": "completed",
                                "current_slide": completed_slides,
                                "total_slides": total_slides,
                            },
                        )
                    progress_queue.task_done()
                except TimeoutError:
                    continue

            await writer_task

            for single_slide_md in orchestrator.state["generated_slides"]:
                slide_token = single_slide_md + "\n\n"
                slide_content += slide_token
                yield send("token", {"token": slide_token})
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 3 (Sinh Slide): {str(e)}"})
            return

        # Lưu tạm slide_content vào DB
        slide_content = process_markdown_images(slide_content)
        new_db = SessionLocal()
        try:
            material = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
            if not material:
                material = ChapterMaterial(
                    chapter_id=chapter_id, slide_content=slide_content, active_learning_script="", created_by="odin_autopilot"
                )
                new_db.add(material)
            else:
                material.slide_content = slide_content
                material.created_by = "odin_autopilot"
            new_db.commit()
        except Exception as e:
            new_db.rollback()
            yield send("error", {"message": f"Lỗi lưu trữ DB trung gian: {str(e)}"})
            new_db.close()
            return
        new_db.close()

        # --- BƯỚC 4: ACTIVE LEARNING PLANNER ---
        yield send(
            "stage",
            {
                "stage": 4,
                "message": "Bước 4: Đang thiết kế các hoạt động tương tác trên lớp...",
                "active_agent": "active_learning_scheduler",
                "agent_status": "running",
            },
        )
        yield send("token", {"token": "\n---ACTIVE_LEARNING---\n"})

        try:
            active_learning_script = await orchestrator.async_run_active_learning_planner(
                class_size=req_class_size,
                has_wifi=req_has_wifi,
                furniture_type=req_furniture_type,
                trace_or_span=mat_stream_trace,
            )
            yield send("token", {"token": active_learning_script})
        except Exception as e:
            yield send("error", {"message": f"Lỗi ở Bước 4 (Kịch bản Active Learning): {str(e)}"})
            return

        # --- BƯỚC 5: LOGIC AUDITOR ---
        yield send(
            "stage",
            {
                "stage": 5,
                "message": "Bước 5: Rà soát tính nhất quán sư phạm...",
                "active_agent": "logic_auditor",
                "agent_status": "running",
            },
        )
        try:
            is_valid = await orchestrator.async_run_logic_auditor(trace_or_span=mat_stream_trace)
            if not is_valid:
                print(f"[Logic Auditor] Cảnh báo kiểm toán: {orchestrator.state['warnings']}")
        except Exception as e:
            print(f"[WARNING] Lỗi Logic Auditor: {e}")

        # 6. Lưu kết quả cuối cùng vào DB
        yield send(
            "stage",
            {
                "stage": 6,
                "message": "Bước 6: Đang lưu bài giảng và giáo án...",
                "active_agent": "saver",
                "agent_status": "running",
            },
        )
        new_db = SessionLocal()
        try:
            material = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
            if not material:
                material = ChapterMaterial(
                    chapter_id=chapter_id,
                    slide_content=slide_content,
                    active_learning_script=active_learning_script,
                    created_by="odin_autopilot",
                )
                new_db.add(material)
            else:
                material.slide_content = slide_content
                material.active_learning_script = active_learning_script
                material.created_by = "odin_autopilot"
            new_db.commit()
            new_db.refresh(material)

            # Thêm log hành động để hoàn tác
            try:
                from src.database.models import OdinActionLog
                action_log = OdinActionLog(
                    course_id=course_id,
                    action_type="generate_materials",
                    affected_ids=json.dumps({"materials": [material.id]})
                )
                new_db.add(action_log)
                new_db.commit()
            except Exception as log_err:
                print(f"[ERROR] Failed to save OdinActionLog: {log_err}")
        except Exception as e:
            new_db.rollback()
            yield send("error", {"message": f"Lỗi lưu DB: {str(e)}"})
            return
        finally:
            new_db.close()

        yield send(
            "done",
            {
                "message": "Đã hoàn thành thiết kế bài giảng và giáo án tương tác!",
                "slide_content": slide_content,
                "active_learning_script": active_learning_script,
                "warnings": orchestrator.state["warnings"],
            },
        )
    except asyncio.CancelledError:
        print(f"[MATERIAL STREAM] Task cancelled for chapter {chapter_id}")
        yield send("stage", {"stage": 6, "message": "Tiến trình thiết kế bài giảng đã bị hủy."})
        yield send(
            "done",
            {
                "message": "Đã dừng thiết kế bài giảng.",
                "slide_content": "",
                "active_learning_script": "",
                "warnings": ["Đã hủy tác vụ theo yêu cầu."],
            },
        )
    finally:
        task_manager.unregister_task(f"material_{chapter_id}")


async def append_slide_for_clo_stream_generator(
    chapter_id: int,
    course_id: int,
    chapter_title: str,
    chapter_desc: str,
    clo_code: str,
    clo_desc: str,
    bloom_level: int,
    user_id: int,
):
    init_token_tracker()

    def send(event: str, data: dict):
        usage = get_token_usage()
        if usage:
            data["usage"] = {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    try:
        yield send("stage", {"stage": 1, "message": "Đang tra cứu tài liệu tham khảo..."})

        # 3. Lấy RAG context
        query = f"{clo_code} {clo_desc} {chapter_title}"
        rag_hits = search_rag_isolated(query, user_id=user_id, course_id=course_id, top_k=3, chapter_id=chapter_id)
        rag_context = ""
        if rag_hits:
            for hit in rag_hits:
                rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"

        yield send("stage", {"stage": 2, "message": "Đang soạn nội dung slide..."})

        system_prompt = f"""Bạn là chuyên gia sư phạm thiết kế slide bài giảng. Nhiệm vụ của bạn là soạn thảo duy nhất MỘT slide bài giảng dạng Markdown để bao phủ chuẩn đầu ra [{clo_code}] và mức Bloom B{bloom_level}.
Quy tắc định dạng Slide:
- Slide phải bắt đầu bằng '#' theo cấu trúc:
  # [Tiêu đề slide]
- Nội dung slide gồm các gạch đầu dòng ngắn gọn '*'.
- Bắt buộc phải gắn thẻ chuẩn đầu ra và mức Bloom ở dòng cuối của slide dưới dạng: `[CLO: {clo_code}] [Bloom: B{bloom_level}]`.
- Trích dẫn nguồn tài liệu tham chiếu từ RAG dưới dạng: `[Nguồn: tên_file - Trang: số_trang]` nếu có.
- Trả về kết quả trực tiếp dưới dạng JSON chứa khoá "slide_markdown". Không bao gồm giải thích bên ngoài JSON.
  {{
    "slide_markdown": "# Tiêu đề Slide\\n* Ý chính 1...\\n* Ý chính 2...\\n[CLO: {clo_code}] [Bloom: B{bloom_level}]"
  }}
"""
        prompt = f"""Chuẩn đầu ra cần bao phủ: [{clo_code}] {clo_desc}
Mức độ Bloom: B{bloom_level}
Ngữ cảnh chương học: {chapter_title} - {chapter_desc}
Tài liệu tham khảo (RAG):
{rag_context}

Hãy soạn thảo duy nhất 1 slide Markdown hoàn chỉnh."""

        res = call_llm_json(prompt, system_instruction=system_prompt, temperature=0.3)
        slide_markdown = res.get("slide_markdown", "").strip()
        if not slide_markdown:
            raise ValueError("Mô hình không trả về slide_markdown hợp lệ.")

        yield send("stage", {"stage": 3, "message": "Đang lưu nội dung slide..."})

        slide_markdown = process_markdown_images(slide_markdown)
        new_db = SessionLocal()
        try:
            material = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
            if not material:
                material = ChapterMaterial(
                    chapter_id=chapter_id, slide_content=slide_markdown, active_learning_script=""
                )
                new_db.add(material)
            else:
                existing = material.slide_content or ""
                if existing.strip():
                    material.slide_content = existing.strip() + "\n\n" + slide_markdown
                else:
                    material.slide_content = slide_markdown

            new_db.commit()
            new_db.refresh(material)
        finally:
            new_db.close()

        yield send(
            "done",
            {
                "message": f"Đã thêm slide thành công cho chuẩn đầu ra {clo_code} - Bloom B{bloom_level}",
                "chapter_title": chapter_title,
            },
        )
    except Exception as e:
        yield send("error", {"message": f"Soạn slide thất bại: {str(e)}"})


async def generate_slides_stream_generator(
    chapter_id: int, req_language: str, chapter_title: str, chapter_description: str, course_id: int, user_id: int
):
    init_token_tracker()

    def send(event: str, data: dict):
        usage = get_token_usage()
        if usage:
            data["usage"] = {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    yield send("stage", {"stage": 1, "message": "Đang tìm kiếm học liệu tham chiếu phù hợp..."})
    query = f"{chapter_title} {chapter_description}"
    rag_hits = search_rag_isolated(query, user_id=user_id, course_id=course_id, top_k=4, chapter_id=chapter_id)
    rag_context = ""
    if rag_hits:
        for hit in rag_hits:
            rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"

    new_db_for_clos = SessionLocal()
    clos_context = ""
    try:
        clos = new_db_for_clos.query(CLO).filter(CLO.course_id == course_id).all()
        if clos:
            clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
            for c in clos:
                clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"
    finally:
        new_db_for_clos.close()

    target_lang = LANGUAGE_MAP.get(req_language, "Tiếng Việt (Vietnamese)")
    prompt = build_material_user_prompt(
        chapter_title=chapter_title,
        chapter_description=chapter_description,
        clos_context=clos_context,
        rag_context=rag_context,
    )

    yield send("stage", {"stage": 2, "message": "Đang thiết kế nội dung các slide bài giảng..."})
    yield send("token", {"token": "---SLIDES---\n"})

    slide_system_prompt = build_slide_designer_system_prompt(target_lang=target_lang)
    slide_content = ""

    try:
        for chunk in call_llm_stream(
            prompt,
            system_instruction=slide_system_prompt,
            prompt_name="slide_designer_only_stream",
            prompt_version="v1",
            metadata={"chapter_id": chapter_id},
        ):
            slide_content += chunk
            yield send("token", {"token": chunk})
    except Exception as e:
        yield send("error", {"message": f"Lỗi sinh Slide: {str(e)}"})
        return

    slide_content = process_markdown_images(slide_content)
    new_db = SessionLocal()
    try:
        material = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
        if not material:
            material = ChapterMaterial(
                chapter_id=chapter_id,
                slide_content=slide_content,
                active_learning_script="",
                created_by="odin_autopilot",
            )
            new_db.add(material)
        else:
            material.slide_content = slide_content
            material.created_by = "odin_autopilot"
        new_db.commit()
        new_db.refresh(material)

        # Thêm log hành động để hoàn tác
        try:
            from src.database.models import OdinActionLog
            action_log = OdinActionLog(
                course_id=course_id,
                action_type="generate_materials",
                affected_ids=json.dumps({"materials": [material.id]})
            )
            new_db.add(action_log)
            new_db.commit()
        except Exception as log_err:
            print(f"[ERROR] Failed to save OdinActionLog: {log_err}")
    except Exception as e:
        new_db.rollback()
        yield send("error", {"message": f"Lỗi lưu DB: {str(e)}"})
        return
    finally:
        new_db.close()

    yield send("done", {"message": "Đã hoàn tất thiết kế các slide bài giảng!", "slide_content": slide_content})


async def generate_active_learning_stream_generator(
    chapter_id: int,
    req_language: str,
    req_class_size: int,
    req_has_wifi: bool,
    req_furniture_type: str,
    slide_content: str,
    course_id: int,
    chapter_title: str,
    chapter_description: str,
):
    init_token_tracker()

    def send(event: str, data: dict):
        usage = get_token_usage()
        if usage:
            data["usage"] = {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    yield send("stage", {"stage": 1, "message": "Đang chuẩn bị dữ liệu bài học..."})

    new_db_for_clos = SessionLocal()
    clos_context = ""
    try:
        clos = new_db_for_clos.query(CLO).filter(CLO.course_id == course_id).all()
        if clos:
            clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
            for c in clos:
                clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"
    finally:
        new_db_for_clos.close()

    target_lang = LANGUAGE_MAP.get(req_language, "Tiếng Việt (Vietnamese)")
    prompt = build_material_user_prompt(
        chapter_title=chapter_title,
        chapter_description=chapter_description,
        clos_context=clos_context,
        rag_context="",  # Không dùng RAG cho bước 2
    )

    yield send("stage", {"stage": 2, "message": "Đang thiết kế hoạt động tương tác..."})
    yield send("token", {"token": "---ACTIVE_LEARNING---\n"})

    al_system_prompt = build_active_learning_planner_system_prompt(
        target_lang=target_lang,
        class_size=req_class_size,
        has_wifi=req_has_wifi,
        furniture_type=req_furniture_type,
        slide_content=slide_content,
    )

    active_learning_script = ""
    try:
        for chunk in call_llm_stream(
            prompt,
            system_instruction=al_system_prompt,
            prompt_name="active_learning_planner_only_stream",
            prompt_version="v1",
            metadata={"chapter_id": chapter_id},
        ):
            active_learning_script += chunk
            yield send("token", {"token": chunk})
    except Exception as e:
        yield send("error", {"message": f"Lỗi sinh kịch bản Active Learning: {str(e)}"})
        return

    new_db = SessionLocal()
    try:
        mat = new_db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
        if mat:
            mat.active_learning_script = active_learning_script
            mat.created_by = "odin_autopilot"
            new_db.commit()
            new_db.refresh(mat)

            # Thêm log hành động để hoàn tác
            try:
                from src.database.models import OdinActionLog
                action_log = OdinActionLog(
                    course_id=course_id,
                    action_type="generate_materials",
                    affected_ids=json.dumps({"materials": [mat.id]})
                )
                new_db.add(action_log)
                new_db.commit()
            except Exception as log_err:
                print(f"[ERROR] Failed to save OdinActionLog: {log_err}")
    except Exception as e:
        new_db.rollback()
        yield send("error", {"message": f"Lỗi lưu DB: {str(e)}"})
        return
    finally:
        new_db.close()

    yield send(
        "done",
        {
            "message": "Đã hoàn tất thiết kế hoạt động tương tác!",
            "active_learning_script": active_learning_script,
        },
    )
