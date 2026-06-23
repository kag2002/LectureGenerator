import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import CLO, Chapter, ChapterMaterial, Course, OdinActionLog, Question, User
from src.database.session import get_db
from src.database.vector_db import search_rag_isolated
from src.prompts.questions import (
    SOLVER_SYSTEM_PROMPT,
    build_correction_prompt,
    build_generator_system_prompt,
    build_generator_user_prompt,
    build_solver_prompt,
)
from src.schemas.schemas import (
    QuestionCreateRequest,
    QuestionGenerateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
)
from src.services.lock_service import check_context_lock
from src.utils.llm import call_llm_json, get_token_usage, init_token_tracker, langfuse
from src.utils.parser import safe_parse_bloom_level

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/courses", tags=["questions"])


# --- API CRUD QUESTIONS ---


@router.get("/{course_id}/questions", response_model=list[QuestionResponse])
def get_course_questions(
    course_id: int,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )
    return (
        db.query(Question)
        .filter(Question.course_id == course_id, Question.is_active)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )


@router.post("/{course_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(
    course_id: int,
    req: QuestionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 1. Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Xác thực chapter nếu có truyền vào
    if req.chapter_id is not None:
        chapter = db.query(Chapter).filter(Chapter.id == req.chapter_id, Chapter.course_id == course_id).first()
        if not chapter:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chương học không thuộc môn học này.")

        check_context_lock(db, course_id, f"chapter_{req.chapter_id}", current_user.email)

    # 3. Xác thực CLO nếu có truyền vào
    if req.clo_id is not None:
        clo = db.query(CLO).filter(CLO.id == req.clo_id, CLO.course_id == course_id).first()
        if not clo:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CLO không thuộc môn học này.")

    new_q = Question(
        course_id=course_id,
        chapter_id=req.chapter_id,
        question_text=req.question_text,
        question_type="MCQ",
        options_json=req.options_json,
        correct_answer=req.correct_answer,
        bloom_level=req.bloom_level,
        clo_id=req.clo_id,
        is_active=True,
        created_by="user",
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)
    return new_q


@router.put("/questions/{question_id}", response_model=QuestionResponse)
def update_question(
    question_id: int,
    req: QuestionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Xác thực quyền
    question = (
        db.query(Question).join(Course).filter(Question.id == question_id, Course.user_id == current_user.id).first()
    )
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Câu hỏi không tồn tại hoặc bạn không có quyền chỉnh sửa."
        )

    if question.chapter_id is not None:
        check_context_lock(db, question.course_id, f"chapter_{question.chapter_id}", current_user.email)

    question.question_text = req.question_text
    question.options_json = req.options_json
    question.correct_answer = req.correct_answer
    question.bloom_level = req.bloom_level
    question.clo_id = req.clo_id
    question.created_by = "user"

    db.commit()
    db.refresh(question)
    return question


@router.delete("/questions/{question_id}")
def delete_question(question_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Xác thực quyền
    question = (
        db.query(Question).join(Course).filter(Question.id == question_id, Course.user_id == current_user.id).first()
    )
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Câu hỏi không tồn tại hoặc bạn không có quyền chỉnh sửa."
        )

    if question.chapter_id is not None:
        check_context_lock(db, question.course_id, f"chapter_{question.chapter_id}", current_user.email)

    db.delete(question)
    db.commit()
    return {"message": "Đã xóa câu hỏi thành công."}


@router.get("/questions/{question_id}", response_model=QuestionResponse)
def get_question_detail(
    question_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    question = (
        db.query(Question).join(Course).filter(Question.id == question_id, Course.user_id == current_user.id).first()
    )
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Câu hỏi không tồn tại hoặc bạn không có quyền truy cập."
        )
    return question


# --- API AI MCQ GENERATION WITH SELF-CORRECTION ---


@router.post("/{course_id}/questions/generate")
def generate_questions(
    course_id: int,
    req: QuestionGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    init_token_tracker()
    # 1. Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    if req.chapter_id is not None:
        check_context_lock(db, course_id, f"chapter_{req.chapter_id}", current_user.email)

    # --- Langfuse: Khởi tạo Parent Trace cho toàn bộ luồng sinh MCQ ---
    trace = None
    if langfuse:
        trace = langfuse.trace(
            name="mcq_generation_flow",
            metadata={
                "course_id": course_id,
                "course_name": course.course_name,
                "bloom_level": req.bloom_level,
                "count": req.count,
                "clo_id": req.clo_id,
                "chapter_id": req.chapter_id,
                "user_id": current_user.id,
            },
        )

    # 2. Thu thập ngữ cảnh (CLO / Chapter / RAG)
    clo_context = ""
    target_clo = None
    if req.clo_id:
        target_clo = db.query(CLO).filter(CLO.id == req.clo_id, CLO.course_id == course_id).first()
        if target_clo:
            clo_context = f"Chuẩn đầu ra mục tiêu: [{target_clo.clo_code}] {target_clo.description} (Thang Bloom: {target_clo.bloom_level})\n"

    chapter_context = ""
    target_chapter = None
    if req.chapter_id:
        target_chapter = db.query(Chapter).filter(Chapter.id == req.chapter_id, Chapter.course_id == course_id).first()
        if target_chapter:
            chapter_context = f"Chương học liên quan: {target_chapter.title} - {target_chapter.description or ''}\n"

    # 3. Tìm kiếm RAG ngữ cảnh
    query_str = f"Câu hỏi trắc nghiệm {target_clo.description if target_clo else ''} {target_chapter.title if target_chapter else ''}"
    rag_hits = search_rag_isolated(
        query_str, user_id=current_user.id, course_id=course_id, top_k=4, chapter_id=req.chapter_id
    )
    rag_context = ""
    if rag_hits:
        for hit in rag_hits:
            rag_context += f"[Tài liệu: {hit['file_name']}]: {hit['text']}\n\n"

    # 4. Thiết lập System Prompts cho Generator & Solver (Self-Correction)
    generator_system_prompt = build_generator_system_prompt(count=req.count, bloom_level=req.bloom_level)

    prompt = build_generator_user_prompt(
        course_name=course.course_name,
        clo_context=clo_context,
        chapter_context=chapter_context,
        rag_context=rag_context,
    )

    # 5. Pha 1: Generator sinh câu hỏi nháp
    generator_span = trace.span(name="generator_phase") if trace else None
    try:
        gen_data = call_llm_json(
            prompt,
            system_instruction=generator_system_prompt,
            temperature=0.7,
            trace_or_span=generator_span,
            prompt_name="mcq_generator",
            prompt_version="v1",
            metadata={"phase": "generator", "count": req.count, "bloom": req.bloom_level},
        )
        raw_questions = gen_data.get("questions", [])
        if generator_span:
            generator_span.end(output={"raw_count": len(raw_questions)})
    except Exception as e:
        if generator_span:
            generator_span.end(output={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi sinh câu hỏi nháp: {str(e)}"
        )

    # 6. Pha 2: Solver/Verifier duyệt tự sửa lỗi (Self-Correction)
    validated_questions = []

    if req.fast_mode:
        validated_questions = raw_questions
    else:
        solver_system_prompt = SOLVER_SYSTEM_PROMPT

        for idx, q in enumerate(raw_questions):
            correct = False
            attempts = 0
            current_question = q
            guardrail_passed_first = False

            # --- Langfuse: Span con cho mỗi câu hỏi qua Guardrail ---
            val_span = (
                trace.span(name=f"validation_phase_q{idx + 1}", metadata={"question_index": idx + 1}) if trace else None
            )

            while not correct and attempts < 3:
                attempts += 1
                # Đóng vai Solver giải thử
                solver_prompt = build_solver_prompt(
                    question_text=current_question.get("question_text"),
                    options_json=current_question.get("options_json"),
                )

                try:
                    solver_res = call_llm_json(
                        solver_prompt,
                        system_instruction=solver_system_prompt,
                        temperature=0.0,
                        trace_or_span=val_span,
                        prompt_name="mcq_solver_guardrail",
                        prompt_version="v1",
                        metadata={"phase": "solver", "attempt": attempts, "question_index": idx + 1},
                    )
                    selected_ans_val = solver_res.get("selected_answer", "")
                    selected_ans = str(selected_ans_val).strip() if selected_ans_val is not None else ""

                    target_ans_val = current_question.get("correct_answer", "")
                    target_ans = str(target_ans_val).strip() if target_ans_val is not None else ""

                    # So sánh đáp án Generator và Solver
                    if (
                        selected_ans.lower() == target_ans.lower()
                        or selected_ans in target_ans
                        or target_ans in selected_ans
                    ):
                        correct = True
                        if attempts == 1:
                            guardrail_passed_first = True
                        # Cập nhật reasoning_path kết hợp cả hai
                        current_question["reasoning_path"] = (
                            f"Generator reasoning: {current_question.get('reasoning_path')} | Solver reasoning: {solver_res.get('reasoning_path')}"
                        )
                    else:
                        # Nếu đáp án mâu thuẫn -> Bắt LLM sửa câu hỏi (Self-Correction Step)
                        correction_prompt = build_correction_prompt(
                            question_text=current_question.get("question_text"),
                            options_json=current_question.get("options_json"),
                            target_answer=target_ans,
                            solver_answer=selected_ans,
                            solver_reasoning=solver_res.get("reasoning_path", ""),
                        )

                        corrected_data = call_llm_json(
                            correction_prompt,
                            system_instruction=generator_system_prompt,
                            temperature=0.7,
                            trace_or_span=val_span,
                            prompt_name="mcq_self_correction",
                            prompt_version="v1",
                            metadata={"phase": "correction", "attempt": attempts, "question_index": idx + 1},
                        )
                        if "questions" in corrected_data and corrected_data["questions"]:
                            current_question = corrected_data["questions"][0]
                        else:
                            current_question = corrected_data
                except Exception as e:
                    # Nếu Solver lỗi, fallback chấp nhận câu hỏi gốc
                    logger.error(f"[ERROR] Solver validation exception: {str(e)}")
                    correct = True

            # --- Langfuse: Gửi Eval Scores cho câu hỏi này ---
            if trace:
                try:
                    trace.score(
                        name="mcq_guardrail_pass",
                        value=1.0 if guardrail_passed_first else 0.0,
                        comment=f"Q{idx + 1}: {'Pass on 1st attempt' if guardrail_passed_first else f'Required {attempts} attempts'}",
                    )
                    trace.score(
                        name="self_correction_attempts",
                        value=float(attempts),
                        comment=f"Q{idx + 1}: {attempts} solver attempt(s)",
                    )
                except Exception:
                    pass
            if val_span:
                val_span.end(
                    output={
                        "final_answer": current_question.get("correct_answer"),
                        "attempts": attempts,
                        "passed_first": guardrail_passed_first,
                    }
                )

            validated_questions.append(current_question)

    # 7. Lưu các câu hỏi hợp lệ vào Database
    saved_questions = []
    for q_data in validated_questions:
        # options_json cần được lưu dưới dạng chuỗi JSON hợp lệ trong DB
        opts = q_data.get("options_json", "[]")
        if isinstance(opts, list):
            opts_str = json.dumps(opts)
        else:
            opts_str = opts

        new_q = Question(
            course_id=course_id,
            chapter_id=req.chapter_id,
            question_text=q_data.get("question_text", ""),
            question_type="MCQ",
            options_json=opts_str,
            correct_answer=q_data.get("correct_answer", ""),
            bloom_level=safe_parse_bloom_level(q_data.get("bloom_level", req.bloom_level), req.bloom_level),
            clo_id=req.clo_id,
            created_by="odin_autopilot",
        )
        db.add(new_q)
        saved_questions.append(new_q)

    db.commit()
    for q in saved_questions:
        db.refresh(q)

    # Thêm log hành động để hoàn tác
    if saved_questions:
        try:
            action_log = OdinActionLog(
                course_id=course_id,
                action_type="generate_questions",
                affected_ids=json.dumps({"questions": [q.id for q in saved_questions]})
            )
            db.add(action_log)
            db.commit()
        except Exception as log_err:
            print(f"[ERROR] Failed to save OdinActionLog: {log_err}")

    # --- Langfuse: Đóng Parent Trace ---
    if trace:
        try:
            trace.update(output={"saved_count": len(saved_questions)})
            langfuse.flush()
        except Exception:
            pass

    usage = get_token_usage()
    return {
        "message": f"Sinh thành công {len(saved_questions)} câu hỏi trắc nghiệm đã qua Self-Correction.",
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
        "usage": {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_cost": usage.get("total_cost", 0.0),
            "model_name": usage.get("model_name"),
        }
        if usage
        else None,
    }


# --- STREAMING SSE ENDPOINT: Real-time progress per question ---


@router.post("/{course_id}/questions/generate-stream")
def generate_questions_stream(
    course_id: int,
    req: QuestionGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Sinh câu hỏi trắc nghiệm và stream tiến độ real-time qua SSE (Server-Sent Events).
    Frontend lắng nghe các event: stage | question | done | error
    """
    # 1. Xác thực quyền
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Môn học không tồn tại.")

    if req.chapter_id is not None:
        check_context_lock(db, course_id, f"chapter_{req.chapter_id}", current_user.email)

    # 2. Thu thập ngữ cảnh
    target_clo = db.query(CLO).filter(CLO.id == req.clo_id, CLO.course_id == course_id).first() if req.clo_id else None
    target_chapter = (
        db.query(Chapter).filter(Chapter.id == req.chapter_id, Chapter.course_id == course_id).first()
        if req.chapter_id
        else None
    )
    clo_context = (
        f"[{target_clo.clo_code}] {target_clo.description} (Bloom: {target_clo.bloom_level})" if target_clo else ""
    )
    chapter_context = f"{target_chapter.title} - {target_chapter.description or ''}" if target_chapter else ""

    # Snapshot tham số cần dùng trong generator (tránh giữ session qua thread)
    course_name = course.course_name
    bloom_level = req.bloom_level
    count = req.count
    clo_id = req.clo_id
    chapter_id = req.chapter_id
    user_id = current_user.id

    from src.services.questions_stream_service import generate_questions_stream_generator

    return StreamingResponse(
        generate_questions_stream_generator(
            course_id=course_id,
            chapter_id=chapter_id,
            clo_id=clo_id,
            bloom_level=bloom_level,
            count=count,
            fast_mode=req.fast_mode,
            clo_context=clo_context,
            chapter_context=chapter_context,
            user_id=user_id,
            course_name=course_name,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- API AI ISOMORPHIC GENERATION (SINH CÂU HỎI TƯƠNG TỰ) ---


@router.post("/questions/{question_id}/generate-isomorphic")
def generate_isomorphic_question(
    question_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    init_token_tracker()
    # 1. Tìm câu hỏi gốc và xác thực quyền
    orig_q = (
        db.query(Question).join(Course).filter(Question.id == question_id, Course.user_id == current_user.id).first()
    )
    if not orig_q:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Câu hỏi gốc không tồn tại hoặc bạn không có quyền sở hữu."
        )

    if orig_q.chapter_id is not None:
        check_context_lock(db, orig_q.course_id, f"chapter_{orig_q.chapter_id}", current_user.email)

    # 2. Gọi LLM sinh câu hỏi đồng cấu
    system_prompt = """Bạn là chuyên gia sư phạm. Nhiệm vụ của bạn là tạo một câu hỏi trắc nghiệm đồng cấu (isomorphic question).
Quy tắc:
- Giữ nguyên bản chất lý thuyết, giải thuật hoặc công thức toán học/logic của câu hỏi gốc.
- Thay đổi số liệu, ngữ cảnh dẫn, tên biến hoặc cách đặt câu hỏi để tránh trùng lặp.
- Các lựa chọn nhiễu và đáp án đúng phải được thay đổi tương ứng dựa trên thông số mới.

Đầu ra định dạng JSON:
{
  "question_text": "Nội dung câu hỏi đồng cấu mới...",
  "options_json": "[\"Lựa chọn A\", \"Lựa chọn B\", \"Lựa chọn C\", \"Lựa chọn D\"]",
  "correct_answer": "Lựa chọn đúng mới"
}
"""
    prompt = f"""Câu hỏi gốc: {orig_q.question_text}
Các lựa chọn gốc: {orig_q.options_json}
Đáp án gốc: {orig_q.correct_answer}

Hãy tạo câu hỏi đồng cấu."""

    # --- Langfuse: Trace cho isomorphic generation ---
    iso_trace = None
    if langfuse:
        iso_trace = langfuse.trace(
            name="isomorphic_question_generation",
            metadata={"original_question_id": question_id, "bloom_level": orig_q.bloom_level},
        )

    try:
        iso_json = call_llm_json(
            prompt,
            system_instruction=system_prompt,
            trace_or_span=iso_trace,
            prompt_name="mcq_isomorphic",
            prompt_version="v1",
            metadata={"original_question_id": question_id},
        )

        opts = iso_json.get("options_json", "[]")
        if isinstance(opts, list):
            opts_str = json.dumps(opts)
        else:
            opts_str = opts

        new_q = Question(
            course_id=orig_q.course_id,
            chapter_id=orig_q.chapter_id,
            question_text=iso_json.get("question_text", ""),
            question_type="MCQ",
            options_json=opts_str,
            correct_answer=iso_json.get("correct_answer", ""),
            bloom_level=orig_q.bloom_level,
            clo_id=orig_q.clo_id,
        )
        db.add(new_q)
        db.commit()
        db.refresh(new_q)

        usage = get_token_usage()
        return {
            "message": "Sinh câu hỏi đồng cấu tương tự thành công.",
            "question": {
                "id": new_q.id,
                "question_text": new_q.question_text,
                "options_json": new_q.options_json,
                "correct_answer": new_q.correct_answer,
                "bloom_level": new_q.bloom_level,
                "clo_id": new_q.clo_id,
            },
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
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi sinh câu hỏi đồng cấu: {str(e)}"
        )


# --- API CLO-BLOOM COVERAGE MATRIX ---


@router.get("/{course_id}/matrix-coverage")
def get_matrix_coverage(course_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Xác thực môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Lấy danh sách CLO của môn học
    clos = db.query(CLO).filter(CLO.course_id == course_id).all()
    clo_map = {c.id: c for c in clos}

    # 3. Lấy tất cả câu hỏi của môn học đang hoạt động
    questions = db.query(Question).filter(Question.course_id == course_id, Question.is_active).all()

    # 4. Thống kê số lượng câu hỏi và học liệu phủ theo ma trận CLO x Bloom Level (1->6)
    import re

    matrix = {}
    for c in clos:
        matrix[c.clo_code] = {
            "clo_id": c.id,
            "description": c.description,
            "target_bloom": c.bloom_level,
            "levels": {str(b): 0 for b in range(1, 7)},  # Backward compatibility for question levels
            "question_levels": {str(b): 0 for b in range(1, 7)},
            "material_levels": {str(b): 0 for b in range(1, 7)},
        }

    for q in questions:
        if q.clo_id:
            # Tìm clo_code tương ứng từ map thay vì query DB
            clo = clo_map.get(q.clo_id)
            if clo and clo.clo_code in matrix:
                bloom_str = str(q.bloom_level)
                if bloom_str in matrix[clo.clo_code]["question_levels"]:
                    matrix[clo.clo_code]["question_levels"][bloom_str] += 1
                    matrix[clo.clo_code]["levels"][bloom_str] += 1

    # Duyệt qua các học liệu slide đang hoạt động để phân tích độ phủ CLO/Bloom
    materials = (
        db.query(ChapterMaterial)
        .join(Chapter)
        .filter(Chapter.course_id == course_id, Chapter.is_active, ChapterMaterial.is_active)
        .all()
    )
    for m in materials:
        if not m.slide_content:
            continue
        # Tách các slide theo dấu tiêu đề '#'
        slides = re.split(r"\n#\s+", "\n" + m.slide_content)
        for slide in slides:
            if not slide.strip():
                continue
            clo_matches = re.findall(r"\[CLO\s*:\s*([^\]]+)\]", slide, re.IGNORECASE)
            bloom_matches = re.findall(r"\[Bloom\s*:\s*B?([1-6])\]", slide, re.IGNORECASE)

            bloom_lvl = int(bloom_matches[0]) if bloom_matches else None

            for clo_code in clo_matches:
                clo_code = clo_code.strip()
                if clo_code in matrix:
                    target_bloom = matrix[clo_code]["target_bloom"]
                    b_lvl = str(bloom_lvl) if bloom_lvl else str(target_bloom)
                    if b_lvl in matrix[clo_code]["material_levels"]:
                        matrix[clo_code]["material_levels"][b_lvl] += 1

    return {"course_id": course_id, "matrix": matrix}
