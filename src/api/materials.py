import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import CLO, Chapter, ChapterMaterial, Course, MaterialRevision, OdinActionLog, User
from src.database.session import get_db
from src.database.vector_db import search_rag_isolated
from src.schemas.schemas import (
    AppendSlideRequest,
    MaterialGenerateFromStoryboardRequest,
    MaterialGenerateRequest,
    MaterialResponse,
    MaterialSave,
    ReconcileActiveLearningRequest,
    RevisionRequest,
    SingleSlideRevisionRequest,
)
from src.prompts.materials import (
    LANGUAGE_MAP,
    build_consistency_checker_system_prompt,
    build_reconcile_active_learning_system_prompt,
    build_revision_system_prompt,
    build_single_slide_revision_system_prompt,
)
from src.services.image_service import process_markdown_images
from src.services.material_orchestrator import MaterialOrchestrator, deduplicate_rag_hits
from src.utils.llm import call_llm_json, get_token_usage, init_token_tracker, langfuse
from src.services.lock_service import check_context_lock
from src.utils.task_manager import task_manager

router = APIRouter(prefix="/api/courses", tags=["materials"])


# --- HELPER ---


def _extract_layout(text: str) -> str:
    """Detect slide layout type from content text."""
    if not text:
        return "standard_list"
    for lay in ["card_grid", "two_column_comparison", "standard_list", "table", "visual_highlight"]:
        if lay in text.lower():
            return lay
    return "standard_list"


# --- API CHAPTER MATERIALS ---


@router.get("/chapters/{chapter_id}/materials", response_model=MaterialResponse)
def get_chapter_materials(
    chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # Xác thực quyền sở hữu
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material:
        # Trả về đối tượng trống nếu chưa có
        return {"id": 0, "chapter_id": chapter_id, "slide_content": "", "active_learning_script": "", "diagram_layouts": None}
    return material


@router.put("/chapters/{chapter_id}/materials", response_model=MaterialResponse)
def save_chapter_materials(
    chapter_id: int,
    material_data: MaterialSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    processed_slides = process_markdown_images(material_data.slide_content)
    if not material:
        material = ChapterMaterial(
            chapter_id=chapter_id,
            slide_content=processed_slides,
            active_learning_script=material_data.active_learning_script,
            diagram_layouts=material_data.diagram_layouts,
            created_by="user",
        )
        db.add(material)
    else:
        material.slide_content = processed_slides
        material.active_learning_script = material_data.active_learning_script
        material.diagram_layouts = material_data.diagram_layouts
        material.created_by = "user"

    db.commit()
    db.refresh(material)
    return material


# --- API AI DEEP GENERATION (SLIDE & ACTIVE LEARNING) ---


@router.post("/chapters/{chapter_id}/generate-materials")
def generate_chapter_materials(
    chapter_id: int,
    req: MaterialGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Xác thực quyền sở hữu môn học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    # 2. Truy vấn RAG cô lập từ ChromaDB
    query = f"{chapter.title} {chapter.description or ''}"
    rag_hits = search_rag_isolated(
        query, user_id=current_user.id, course_id=chapter.course_id, top_k=4, chapter_id=chapter_id
    )

    # 3. Lọc trùng bằng Cosine Similarity
    rag_hits = deduplicate_rag_hits(rag_hits, threshold=0.75)

    # 4. Định dạng ngữ cảnh RAG kèm tiền tố số trang thật
    rag_context = ""
    if rag_hits:
        for idx, hit in enumerate(rag_hits):
            rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"
    else:
        print("⚠️ ChromaDB RAG: Không tìm thấy ngữ cảnh tài liệu cho truy vấn này.")

    # Lấy danh sách CLO của môn học
    clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
    clos_context = ""
    if clos:
        clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
        for c in clos:
            clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"

    target_lang = LANGUAGE_MAP.get(req.language, "Tiếng Việt (Vietnamese)")

    # Khởi tạo Orchestrator
    orchestrator = MaterialOrchestrator(
        chapter_title=chapter.title,
        chapter_description=chapter.description or "",
        clos_context=clos_context,
        rag_context=rag_context,
        target_lang=target_lang,
        session_duration=req.session_duration,
        user_id=current_user.id,
        course_id=chapter.course_id,
        chapter_id=chapter_id,
        pedagogical_style=req.pedagogical_style,
        learner_level=req.learner_level,
        selected_clos=req.selected_clos,
    )

    # --- Langfuse: Parent Trace ---
    mat_trace = None
    if langfuse:
        mat_trace = langfuse.trace(
            name="chapter_materials_generation_multi_agent",
            metadata={"chapter_id": chapter_id, "chapter_title": chapter.title, "language": req.language},
        )

    try:
        # Chạy từng bước của Orchestrator
        orchestrator.run_storyboard_architect(trace_or_span=mat_trace)
        orchestrator.run_content_allocator(trace_or_span=mat_trace)
        orchestrator.run_slide_writer(trace_or_span=mat_trace)
        orchestrator.run_active_learning_planner(
            class_size=req.class_size, has_wifi=req.has_wifi, furniture_type=req.furniture_type, trace_or_span=mat_trace
        )
        orchestrator.run_logic_auditor(trace_or_span=mat_trace)

        slide_content = process_markdown_images("\n\n".join(orchestrator.state["generated_slides"]))
        active_learning_script = orchestrator.state["active_learning_script"]

        # 5. Lưu kết quả vào DB để giảng viên có thể load lại
        material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
        if not material:
            material = ChapterMaterial(
                chapter_id=chapter_id,
                slide_content=slide_content,
                active_learning_script=active_learning_script,
                created_by="odin_autopilot",
            )
            db.add(material)
        else:
            material.slide_content = slide_content
            material.active_learning_script = active_learning_script
            material.created_by = "odin_autopilot"

        db.commit()
        db.refresh(material)

        # Thêm log hành động để hoàn tác
        try:
            action_log = OdinActionLog(
                course_id=chapter.course_id,
                action_type="generate_materials",
                affected_ids=json.dumps({"materials": [material.id]})
            )
            db.add(action_log)
            db.commit()
        except Exception as log_err:
            print(f"[ERROR] Failed to save OdinActionLog: {log_err}")

        return {
            "message": "AI sinh học liệu thành công.",
            "slide_content": material.slide_content,
            "active_learning_script": material.active_learning_script,
            "warnings": orchestrator.state["warnings"],
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi AI sinh bài giảng: {str(e)}"
        )


@router.post("/chapters/{chapter_id}/generate-materials-stream")
async def generate_chapter_materials_stream(
    chapter_id: int,
    req: MaterialGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sinh học liệu (slide + active learning) tuần tự qua 4 Agent chuyên biệt và stream SSE."""
    # 1. Xác thực quyền sở hữu môn học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    chapter_title = chapter.title
    chapter_description = chapter.description or ""
    course_id = chapter.course_id
    user_id = current_user.id

    from src.services.materials_stream_service import generate_chapter_materials_stream_generator

    return StreamingResponse(
        generate_chapter_materials_stream_generator(
            chapter_id=chapter_id,
            req_language=req.language,
            req_session_duration=req.session_duration,
            req_class_size=req.class_size,
            req_has_wifi=req.has_wifi,
            req_furniture_type=req.furniture_type,
            chapter_title=chapter_title,
            chapter_description=chapter_description,
            course_id=course_id,
            user_id=user_id,
            req_pedagogical_style=req.pedagogical_style,
            req_learner_level=req.learner_level,
            req_selected_clos=req.selected_clos,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chapters/{chapter_id}/generate-storyboard")
def generate_storyboard(
    chapter_id: int,
    req: MaterialGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Giai đoạn 1: Lập đề cương cấu trúc slide (Storyboard Outline)."""
    # 1. Xác thực chương học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy danh sách CLO của môn học
    clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
    clos_context = ""
    if clos:
        clos_context = "Danh sách Chuẩn đầu ra (CLOs) của môn học:\n"
        for c in clos:
            clos_context += f"- [{c.clo_code}] {c.description} (Thang Bloom mục tiêu: {c.bloom_level})\n"

    target_lang = LANGUAGE_MAP.get(req.language, "Tiếng Việt (Vietnamese)")

    # 3. Khởi tạo Orchestrator (chưa cần RAG ở giai đoạn này)
    orchestrator = MaterialOrchestrator(
        chapter_title=chapter.title,
        chapter_description=chapter.description or "",
        clos_context=clos_context,
        rag_context="",
        target_lang=target_lang,
        session_duration=req.session_duration,
        user_id=current_user.id,
        course_id=chapter.course_id,
        chapter_id=chapter_id,
        pedagogical_style=req.pedagogical_style,
        learner_level=req.learner_level,
        selected_clos=req.selected_clos,
    )

    mat_trace = None
    if langfuse:
        mat_trace = langfuse.trace(
            name="chapter_storyboard_generation",
            metadata={"chapter_id": chapter_id, "chapter_title": chapter.title, "language": req.language},
        )

    init_token_tracker()
    try:
        storyboard = orchestrator.run_storyboard_architect(trace_or_span=mat_trace)
        usage = get_token_usage()
        return {
            "message": "AI đã lập đề cương cấu trúc bài giảng thành công.",
            "storyboard": storyboard,
            "usage": {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
            if usage
            else None,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi lập storyboard: {str(e)}"
        )


@router.post("/chapters/{chapter_id}/generate-materials-from-storyboard-stream")
async def generate_materials_from_storyboard_stream(
    chapter_id: int,
    req: MaterialGenerateFromStoryboardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Giai đoạn 2: Nhận Storyboard đã duyệt và sinh chi tiết slide + active learning."""
    # 1. Xác thực chương học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    chapter_title = chapter.title
    chapter_description = chapter.description or ""
    course_id = chapter.course_id
    user_id = current_user.id

    from src.services.materials_stream_service import generate_materials_from_storyboard_stream_generator

    return StreamingResponse(
        generate_materials_from_storyboard_stream_generator(
            chapter_id=chapter_id,
            req_language=req.language,
            req_session_duration=req.session_duration,
            req_class_size=req.class_size,
            req_has_wifi=req.has_wifi,
            req_furniture_type=req.furniture_type,
            req_storyboard=[s.dict() for s in req.storyboard],
            chapter_title=chapter_title,
            chapter_description=chapter_description,
            course_id=course_id,
            user_id=user_id,
            req_pedagogical_style=req.pedagogical_style,
            req_learner_level=req.learner_level,
            req_selected_clos=req.selected_clos,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chapters/{chapter_id}/cancel-materials-generation")
def cancel_materials_generation(
    chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Hủy tiến trình sinh học liệu bài giảng."""
    success = task_manager.cancel_task(f"material_{chapter_id}")
    return {"success": success, "message": "Đã gửi lệnh hủy" if success else "Không có tác vụ nào đang chạy"}


@router.get("/chapters/{chapter_id}/rag-references")
def get_chapter_rag_references(
    chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Lấy danh sách các đoạn trích RAG gốc phục vụ tính năng click-to-source."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )
    query = f"{chapter.title} {chapter.description or ''}"
    rag_hits = search_rag_isolated(
        query, user_id=current_user.id, course_id=chapter.course_id, top_k=6, chapter_id=chapter_id
    )
    return {"references": rag_hits}


@router.delete("/chapters/{chapter_id}/materials")
def delete_chapter_materials(
    chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # 1. Xác thực quyền sở hữu môn học của chương học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    # 2. Tìm bản ghi học liệu và xóa
    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if material:
        db.delete(material)
        db.commit()
    return {"message": "Đã reset/xóa học liệu chương thành công."}


@router.post("/chapters/{chapter_id}/append-slide-for-clo")
def append_slide_for_clo(
    chapter_id: int,
    req: AppendSlideRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Xác thực chương học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    # 2. Xác thực CLO
    clo = db.query(CLO).filter(CLO.id == req.clo_id, CLO.course_id == chapter.course_id).first()
    if not clo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CLO không tồn tại trong môn học này.")

    # 3. Lấy RAG context
    query = f"{clo.clo_code} {clo.description} {chapter.title}"
    rag_hits = search_rag_isolated(
        query, user_id=current_user.id, course_id=chapter.course_id, top_k=3, chapter_id=chapter_id
    )
    rag_context = ""
    if rag_hits:
        for hit in rag_hits:
            rag_context += f"[Tài liệu: {hit['file_name']} - Trang: {hit['page_number']}]: {hit['text']}\n\n"

    # 4. Gửi prompt cho LLM để tạo duy nhất 1 slide
    system_prompt = f"""Bạn là chuyên gia sư phạm thiết kế slide bài giảng. Nhiệm vụ của bạn là soạn thảo duy nhất MỘT slide bài giảng dạng Markdown để bao phủ chuẩn đầu ra [{clo.clo_code}] và mức Bloom B{req.bloom_level}.
Quy tắc định dạng Slide:
- Slide phải bắt đầu bằng '#' theo cấu trúc:
  # [Tiêu đề slide]
- Nội dung slide gồm các gạch đầu dòng ngắn gọn '*'.
- Bắt buộc phải gắn thẻ chuẩn đầu ra và mức Bloom ở dòng cuối của slide dưới dạng: `[CLO: {clo.clo_code}] [Bloom: B{req.bloom_level}]`.
- Trích dẫn nguồn tài liệu tham chiếu từ RAG dưới dạng: `[Nguồn: tên_file - Trang: số_trang]` nếu có.
- Trả về kết quả trực tiếp dưới dạng JSON chứa khoá "slide_markdown". Không bao gồm giải thích bên ngoài JSON.
  {{
    "slide_markdown": "# Tiêu đề Slide\\n* Ý chính 1...\\n* Ý chính 2...\\n[CLO: {clo.clo_code}] [Bloom: B{req.bloom_level}]"
  }}
"""
    prompt = f"""Chuẩn đầu ra cần bao phủ: [{clo.clo_code}] {clo.description}
Mức độ Bloom: B{req.bloom_level}
Ngữ cảnh chương học: {chapter.title} - {chapter.description or ""}
Tài liệu tham khảo (RAG):
{rag_context}

Hãy soạn thảo duy nhất 1 slide Markdown hoàn chỉnh."""

    try:
        res = call_llm_json(prompt, system_instruction=system_prompt, temperature=0.3)
        slide_markdown = res.get("slide_markdown", "").strip()
        if not slide_markdown:
            raise ValueError("Mô hình không trả về slide_markdown hợp lệ.")

        slide_markdown = process_markdown_images(slide_markdown)

        # 5. Lưu hoặc bổ sung vào ChapterMaterial
        material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
        if not material:
            material = ChapterMaterial(chapter_id=chapter_id, slide_content=slide_markdown, active_learning_script="")
            db.add(material)
        else:
            existing = material.slide_content or ""
            if existing.strip():
                material.slide_content = existing.strip() + "\n\n" + slide_markdown
            else:
                material.slide_content = slide_markdown

        db.commit()
        db.refresh(material)

        return {
            "message": f"Đã bổ sung thành công slide cho {clo.clo_code} - Bloom B{req.bloom_level} vào chương {chapter.title}",
            "chapter_title": chapter.title,
            "slide_content": material.slide_content,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi AI bổ sung slide: {str(e)}"
        )


@router.post("/chapters/{chapter_id}/append-slide-for-clo-stream")
def append_slide_for_clo_stream(
    chapter_id: int,
    req: AppendSlideRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Bổ sung slide bài giảng cho CLO và Bloom và stream tiến trình xử lý qua SSE.
    """
    # 1. Xác thực chương học
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    # 2. Xác thực CLO
    clo = db.query(CLO).filter(CLO.id == req.clo_id, CLO.course_id == chapter.course_id).first()
    if not clo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CLO không tồn tại trong môn học này.")

    # Trích xuất dữ liệu ra ngoài để tránh giữ SQLAlchemy object qua luồng generator
    course_id = chapter.course_id
    chapter_title = chapter.title
    chapter_desc = chapter.description or ""
    clo_code = clo.clo_code
    clo_desc = clo.description
    bloom_level = req.bloom_level
    user_id = current_user.id

    from src.services.materials_stream_service import append_slide_for_clo_stream_generator

    return StreamingResponse(
        append_slide_for_clo_stream_generator(
            chapter_id=chapter_id,
            course_id=course_id,
            chapter_title=chapter_title,
            chapter_desc=chapter_desc,
            clo_code=clo_code,
            clo_desc=clo_desc,
            bloom_level=bloom_level,
            user_id=user_id,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- API TIỂU HỢP PHÂN RÃ AGENT & REVISION ---


@router.post("/chapters/{chapter_id}/generate-slides-stream")
def generate_slides_stream(
    chapter_id: int,
    req: MaterialGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chỉ sinh slide bài giảng và stream SSE."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    course_id = chapter.course_id
    chapter_title = chapter.title
    chapter_description = chapter.description or ""
    user_id = current_user.id

    from src.services.materials_stream_service import generate_slides_stream_generator

    return StreamingResponse(
        generate_slides_stream_generator(
            chapter_id=chapter_id,
            req_language=req.language,
            chapter_title=chapter_title,
            chapter_description=chapter_description,
            course_id=course_id,
            user_id=user_id,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chapters/{chapter_id}/generate-active-learning-stream")
def generate_active_learning_stream(
    chapter_id: int,
    req: MaterialGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chỉ sinh kịch bản active learning dựa trên slide đã có."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material or not material.slide_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn phải sinh slide bài giảng trước khi thiết kế kịch bản hoạt động tương tác.",
        )

    slide_content = material.slide_content
    course_id = chapter.course_id
    chapter_title = chapter.title
    chapter_description = chapter.description or ""

    from src.services.materials_stream_service import generate_active_learning_stream_generator

    return StreamingResponse(
        generate_active_learning_stream_generator(
            chapter_id=chapter_id,
            req_language=req.language,
            req_class_size=req.class_size,
            req_has_wifi=req.has_wifi,
            req_furniture_type=req.furniture_type,
            slide_content=slide_content,
            course_id=course_id,
            chapter_title=chapter_title,
            chapter_description=chapter_description,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chapters/{chapter_id}/revise-slides")
def revise_slides(
    chapter_id: int, req: RevisionRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Chỉnh sửa slide theo prompt giảng viên, chạy consistency check."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material or not material.slide_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Không tìm thấy slide hiện tại để chỉnh sửa."
        )

    clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
    clos_context = "Chuẩn đầu ra:\n" + "\n".join([f"- [{c.clo_code}] {c.description}" for c in clos])

    # 1. Gọi Revision Agent
    system_prompt = build_revision_system_prompt(
        field="slide_content",
        full_current_content=material.slide_content,
        clos_context=clos_context,
        user_edit_prompt=req.prompt,
        target_lang="Tiếng Việt (Vietnamese)",
    )

    init_token_tracker()
    try:
        revision_res = call_llm_json("Hãy thực hiện sửa đổi theo yêu cầu.", system_instruction=system_prompt)
        revised_content = revision_res.get("revised_content", "").strip()
        changes_summary = revision_res.get("changes_summary", "")
        consistency_warnings = revision_res.get("consistency_warnings", [])

        if not revised_content:
            raise ValueError("Không thể nhận diện slide được chỉnh sửa từ phản hồi của AI.")

        # 2. Gọi Consistency Checker chéo với Active Learning hiện tại
        checker_prompt = build_consistency_checker_system_prompt(
            slide_content=revised_content,
            active_learning_script=material.active_learning_script or "",
            clos_context=clos_context,
        )
        checker_res = call_llm_json("Kiểm tra tính nhất quán.", system_instruction=checker_prompt)

        # 3. Lưu revision history
        new_rev = MaterialRevision(
            chapter_id=chapter_id,
            field="slide_content",
            content_before=material.slide_content,
            content_after=revised_content,
            user_prompt=req.prompt,
            ai_consistency_note=json.dumps(checker_res, ensure_ascii=False),
        )
        db.add(new_rev)

        # Cập nhật slide hiện tại
        material.slide_content = process_markdown_images(revised_content)
        db.commit()
        db.refresh(material)

        # Lưu vào bộ nhớ trải nghiệm (Episodic Memory)
        try:
            from src.services.memory_service import store_episodic_revision

            store_episodic_revision(
                user_id=current_user.id,
                course_id=chapter.course_id,
                chapter_id=chapter_id,
                prompt=req.prompt,
                content_before=new_rev.content_before,
                content_after=new_rev.content_after,
                layout_before=_extract_layout(new_rev.content_before),
                layout_after=_extract_layout(new_rev.content_after),
            )
        except Exception as mem_err:
            print(f"[WARNING] Episodic memory store failed in revise_slides: {mem_err}")

        usage = get_token_usage()
        return {
            "slide_content": material.slide_content,
            "active_learning_script": material.active_learning_script,
            "changes_summary": changes_summary,
            "consistency_warnings": consistency_warnings,
            "consistency_check": checker_res,
            "usage": {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
            if usage
            else None,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi AI thực hiện chỉnh sửa: {str(e)}"
        )


@router.post("/chapters/{chapter_id}/revise-single-slide")
def revise_single_slide(
    chapter_id: int,
    req: SingleSlideRevisionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Chỉnh sửa một slide duy nhất theo prompt giảng viên và trả về nội dung đã sửa + đánh giá sư phạm."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
    clos_context = "Chuẩn đầu ra môn học:\n" + "\n".join([f"- [{c.clo_code}] {c.description}" for c in clos])

    system_prompt = build_single_slide_revision_system_prompt(
        current_slide_content=req.current_slide_content,
        clos_context=clos_context,
        user_edit_prompt=req.prompt,
        target_lang="Tiếng Việt (Vietnamese)",
    )

    init_token_tracker()
    try:
        revision_res = call_llm_json("Hãy thực hiện sửa đổi slide theo yêu cầu.", system_instruction=system_prompt)
        revised_slide = revision_res.get("revised_slide", "").strip()
        changes_summary = revision_res.get("changes_summary", "")
        pedagogical_feedback = revision_res.get("pedagogical_feedback", "")

        if not revised_slide:
            raise ValueError("Không thể nhận diện nội dung slide được chỉnh sửa từ phản hồi của AI.")

        revised_slide = process_markdown_images(revised_slide)

        usage = get_token_usage()
        return {
            "revised_slide": revised_slide,
            "changes_summary": changes_summary,
            "pedagogical_feedback": pedagogical_feedback,
            "usage": {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
            if usage
            else None,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi AI hiệu đính slide: {str(e)}"
        )


@router.post("/chapters/{chapter_id}/revise-active-learning")
def revise_active_learning(
    chapter_id: int, req: RevisionRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Chỉnh sửa active learning theo prompt giảng viên, chạy consistency check."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material or not material.active_learning_script:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không tìm thấy kịch bản Active Learning hiện tại để chỉnh sửa.",
        )

    clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
    clos_context = "Chuẩn đầu ra:\n" + "\n".join([f"- [{c.clo_code}] {c.description}" for c in clos])

    # 1. Gọi Revision Agent
    system_prompt = build_revision_system_prompt(
        field="active_learning_script",
        full_current_content=material.active_learning_script,
        clos_context=clos_context,
        user_edit_prompt=req.prompt,
        target_lang="Tiếng Việt (Vietnamese)",
    )

    init_token_tracker()
    try:
        revision_res = call_llm_json("Hãy thực hiện sửa đổi theo yêu cầu.", system_instruction=system_prompt)
        revised_content = revision_res.get("revised_content", "").strip()
        changes_summary = revision_res.get("changes_summary", "")
        consistency_warnings = revision_res.get("consistency_warnings", [])

        if not revised_content:
            raise ValueError("Không thể nhận diện kịch bản được chỉnh sửa từ phản hồi của AI.")

        # 2. Gọi Consistency Checker chéo với Slide hiện tại
        checker_prompt = build_consistency_checker_system_prompt(
            slide_content=material.slide_content or "",
            active_learning_script=revised_content,
            clos_context=clos_context,
        )
        checker_res = call_llm_json("Kiểm tra tính nhất quán.", system_instruction=checker_prompt)

        # 3. Lưu revision history
        new_rev = MaterialRevision(
            chapter_id=chapter_id,
            field="active_learning_script",
            content_before=material.active_learning_script,
            content_after=revised_content,
            user_prompt=req.prompt,
            ai_consistency_note=json.dumps(checker_res, ensure_ascii=False),
        )
        db.add(new_rev)

        # Cập nhật kịch bản hiện tại
        material.active_learning_script = revised_content
        db.commit()
        db.refresh(material)

        # Lưu vào bộ nhớ trải nghiệm (Episodic Memory)
        try:
            from src.services.memory_service import store_episodic_revision

            store_episodic_revision(
                user_id=current_user.id,
                course_id=chapter.course_id,
                chapter_id=chapter_id,
                prompt=req.prompt,
                content_before=new_rev.content_before,
                content_after=new_rev.content_after,
                layout_before="active_learning",
                layout_after="active_learning",
            )
        except Exception as mem_err:
            print(f"[WARNING] Episodic memory store failed in revise_active_learning: {mem_err}")

        usage = get_token_usage()
        return {
            "slide_content": material.slide_content,
            "active_learning_script": material.active_learning_script,
            "changes_summary": changes_summary,
            "consistency_warnings": consistency_warnings,
            "consistency_check": checker_res,
            "usage": {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
            if usage
            else None,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi AI thực hiện chỉnh sửa: {str(e)}"
        )


@router.post("/chapters/{chapter_id}/reconcile-active-learning")
def reconcile_active_learning(
    chapter_id: int,
    req: ReconcileActiveLearningRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Đồng bộ nhanh kịch bản tương tác (Active Learning) với Slide mới chỉnh sửa."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material or not material.active_learning_script:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không tìm thấy kịch bản Active Learning hiện tại để đồng bộ hóa.",
        )

    clos = db.query(CLO).filter(CLO.course_id == chapter.course_id).all()
    clos_context = "Danh sách Chuẩn đầu ra (CLOs):\n" + "\n".join([f"- [{c.clo_code}] {c.description}" for c in clos])

    target_lang = LANGUAGE_MAP.get(req.language, "Tiếng Việt (Vietnamese)")

    # 1. Gọi Reconciler Agent để đồng bộ hóa cục bộ
    system_prompt = build_reconcile_active_learning_system_prompt(
        slides_content=req.slide_content,
        active_learning_script=material.active_learning_script,
        clos_context=clos_context,
        class_size=req.class_size,
        has_wifi=req.has_wifi,
        furniture_type=req.furniture_type,
        target_lang=target_lang,
    )

    init_token_tracker()
    try:
        reconcile_res = call_llm_json("Hãy thực hiện đồng bộ hóa kịch bản hoạt động.", system_instruction=system_prompt)
        revised_script = reconcile_res.get("revised_active_learning_script", "").strip()
        changes_summary = reconcile_res.get("changes_summary", "")

        if not revised_script:
            raise ValueError("Không thể nhận diện kịch bản active learning đã đồng bộ từ phản hồi của AI.")

        # 2. Lưu lịch sử hiệu đính
        new_rev = MaterialRevision(
            chapter_id=chapter_id,
            field="active_learning_script",
            content_before=material.active_learning_script,
            content_after=revised_script,
            user_prompt=f"Đồng bộ hóa giáo án sau khi sửa slide: {changes_summary}",
            ai_consistency_note="{}",
        )
        db.add(new_rev)

        # 3. Cập nhật cơ sở dữ liệu
        material.slide_content = process_markdown_images(req.slide_content)
        material.active_learning_script = revised_script
        db.commit()
        db.refresh(material)

        usage = get_token_usage()
        return {
            "slide_content": material.slide_content,
            "active_learning_script": material.active_learning_script,
            "changes_summary": changes_summary,
            "usage": {
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_cost": usage.get("total_cost", 0.0),
                "model_name": usage.get("model_name"),
            }
            if usage
            else None,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi AI đồng bộ giáo án: {str(e)}"
        )


@router.get("/chapters/{chapter_id}/revisions")
def get_chapter_revisions(
    chapter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Lấy danh sách lịch sử hiệu đính slide/kịch bản."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    revisions = (
        db.query(MaterialRevision)
        .filter(MaterialRevision.chapter_id == chapter_id)
        .order_by(MaterialRevision.created_at.desc())
        .all()
    )

    return [
        {
            "id": r.id,
            "field": r.field,
            "content_before": r.content_before,
            "content_after": r.content_after,
            "user_prompt": r.user_prompt,
            "ai_consistency_note": json.loads(r.ai_consistency_note) if r.ai_consistency_note else {},
            "created_at": r.created_at,
        }
        for r in revisions
    ]


@router.post("/chapters/{chapter_id}/revert-revision/{rev_id}")
def revert_chapter_revision(
    chapter_id: int, rev_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Khôi phục nội dung slide/kịch bản về trạng thái trước đó."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    check_context_lock(db, chapter.course_id, f"chapter_{chapter_id}", current_user.email)

    revision = (
        db.query(MaterialRevision)
        .filter(MaterialRevision.id == rev_id, MaterialRevision.chapter_id == chapter_id)
        .first()
    )
    if not revision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bản hiệu đính không tồn tại.")

    material = db.query(ChapterMaterial).filter(ChapterMaterial.chapter_id == chapter_id).first()
    if not material:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy học liệu để khôi phục.")

    # Revert to content_before
    if revision.field == "slide_content":
        material.slide_content = revision.content_before
    elif revision.field == "active_learning_script":
        material.active_learning_script = revision.content_before

    # Tạo một revision ghi nhận hành động khôi phục
    revert_note = f"Reverted to state before revision {rev_id}"
    new_rev = MaterialRevision(
        chapter_id=chapter_id,
        field=revision.field,
        content_before=revision.content_after,
        content_after=revision.content_before,
        user_prompt=revert_note,
        ai_consistency_note="{}",
    )
    db.add(new_rev)
    db.commit()
    db.refresh(material)

    return {
        "slide_content": material.slide_content,
        "active_learning_script": material.active_learning_script,
        "message": f"Đã khôi phục thành công trường {revision.field} về phiên bản cũ.",
    }





class GenerateAIImageRequest(BaseModel):
    keyword: str
    theme: str = "warm_academic"

@router.post("/chapters/{chapter_id}/generate-ai-image")
def generate_ai_image(
    chapter_id: int,
    req: GenerateAIImageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sinh ảnh minh họa bằng AI (DALL-E 3) cho slide bài giảng."""
    chapter = db.query(Chapter).join(Course).filter(Chapter.id == chapter_id, Course.user_id == current_user.id).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chương học không tồn tại hoặc bạn không có quyền truy cập."
        )

    from src.services.image_service import generate_ai_illustration

    try:
        image_url = generate_ai_illustration(keyword=req.keyword, theme=req.theme)
        return {"image_url": image_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi sinh ảnh AI: {str(e)}"
        )
