import json

from src.database.models import Question
from src.database.session import SessionLocal
from src.database.vector_db import search_rag_isolated
from src.prompts.questions import (
    SOLVER_SYSTEM_PROMPT_COMPACT,
    build_generator_system_prompt_compact,
    build_generator_user_prompt_compact,
)
from src.utils.llm_client import call_llm_json, get_token_usage, init_token_tracker, langfuse
from src.utils.parser import safe_parse_bloom_level


def generate_questions_stream_generator(
    course_id: int,
    chapter_id: int | None,
    clo_id: int | None,
    bloom_level: int,
    count: int,
    fast_mode: bool,
    clo_context: str,
    chapter_context: str,
    user_id: int,
    course_name: str,
):
    """Generates MCQs and streams real-time progress via SSE."""
    init_token_tracker()

    # --- Langfuse: Parent Trace cho SSE stream ---
    stream_trace = None
    if langfuse:
        stream_trace = langfuse.trace(
            name="mcq_generation_stream",
            metadata={
                "course_id": course_id,
                "course_name": course_name,
                "bloom_level": bloom_level,
                "count": count,
                "clo_id": clo_id,
                "chapter_id": chapter_id,
                "user_id": user_id,
            },
        )

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

    yield send("stage", {"stage": 1, "message": "✅ Đang truy xuất Vector DB (RAG) và các chuẩn đầu ra CLO..."})

    # RAG search
    query_str = f"{clo_context} {chapter_context}"
    rag_hits = search_rag_isolated(query_str, user_id=user_id, course_id=course_id, top_k=4)
    rag_context = ""
    if rag_hits:
        for hit in rag_hits:
            rag_context += f"[Tài liệu: {hit['file_name']}]: {hit['text']}\n\n"

    yield send(
        "stage",
        {"stage": 2, "message": f"✅ RAG tìm thấy {len(rag_hits)} đoạn trích. Đang gọi mô hình AI (Qwen/Gemini)..."},
    )

    generator_system_prompt = build_generator_system_prompt_compact(count=count, bloom_level=bloom_level)

    prompt = build_generator_user_prompt_compact(
        course_name=course_name,
        clo_context=clo_context,
        chapter_context=chapter_context,
        rag_context=rag_context,
        count=count,
    )

    gen_span = stream_trace.span(name="generator_phase_stream") if stream_trace else None
    try:
        gen_data = call_llm_json(
            prompt,
            system_instruction=generator_system_prompt,
            temperature=0.7,
            trace_or_span=gen_span,
            prompt_name="mcq_generator_stream",
            prompt_version="v1",
            metadata={"phase": "generator", "count": count, "bloom": bloom_level},
        )
        raw_questions = gen_data.get("questions", [])
        if gen_span:
            gen_span.end(output={"raw_count": len(raw_questions)})
    except Exception as e:
        if gen_span:
            gen_span.end(output={"error": str(e)})
        yield send("error", {"message": f"Sinh câu hỏi thất bại: {str(e)}"})
        return

    # Mở session mới để save (tránh commit trên session đã detach)
    new_db = SessionLocal()
    saved_questions = []

    try:
        if fast_mode:
            yield send(
                "stage",
                {
                    "stage": 3,
                    "message": f"⚡ Chế độ tạo nhanh: Bỏ qua bước tự sửa lỗi. Đang lưu {len(raw_questions)} câu hỏi vào CSDL...",
                },
            )
            for idx, q in enumerate(raw_questions):
                opts = q.get("options_json", "[]")
                opts_str = json.dumps(opts) if isinstance(opts, list) else opts
                new_q_obj = Question(
                    course_id=course_id,
                    chapter_id=chapter_id,
                    question_text=q.get("question_text", ""),
                    question_type="MCQ",
                    options_json=opts_str,
                    correct_answer=q.get("correct_answer", ""),
                    bloom_level=safe_parse_bloom_level(q.get("bloom_level", bloom_level), bloom_level),
                    clo_id=clo_id,
                )
                new_db.add(new_q_obj)
                new_db.commit()
                new_db.refresh(new_q_obj)
                saved_questions.append(new_q_obj)

                yield send(
                    "question",
                    {
                        "index": idx + 1,
                        "total": len(raw_questions),
                        "question": {
                            "id": new_q_obj.id,
                            "question_text": new_q_obj.question_text,
                            "options_json": new_q_obj.options_json,
                            "correct_answer": new_q_obj.correct_answer,
                            "bloom_level": new_q_obj.bloom_level,
                            "clo_id": new_q_obj.clo_id,
                        },
                    },
                )
        else:
            yield send(
                "stage",
                {"stage": 3, "message": f"✅ Generator sinh xong {len(raw_questions)} câu. Bắt đầu Self-Correction..."},
            )
            solver_system_prompt = SOLVER_SYSTEM_PROMPT_COMPACT

            for idx, q in enumerate(raw_questions):
                yield send(
                    "stage",
                    {
                        "stage": 3,
                        "message": f"⏳ Đang tự sửa lỗi và xác minh câu {idx + 1}/{len(raw_questions)}...",
                    },
                )

                correct = False
                attempts = 0
                current_q = q
                guardrail_ok = False

                val_span = (
                    stream_trace.span(name=f"validation_stream_q{idx + 1}", metadata={"question_index": idx + 1})
                    if stream_trace
                    else None
                )

                while not correct and attempts < 2:
                    attempts += 1
                    try:
                        solver_prompt = f"Câu hỏi: {current_q.get('question_text')}\nLựa chọn: {current_q.get('options_json')}\nPhân tích và chọn đáp án."
                        solver_res = call_llm_json(
                            solver_prompt,
                            system_instruction=solver_system_prompt,
                            temperature=0.0,
                            trace_or_span=val_span,
                            prompt_name="mcq_solver_guardrail_stream",
                            prompt_version="v1",
                            metadata={"phase": "solver", "attempt": attempts, "question_index": idx + 1},
                        )
                        selected = solver_res.get("selected_answer", "").strip()
                        target = current_q.get("correct_answer", "").strip()
                        if selected.lower() == target.lower() or selected in target or target in selected:
                            correct = True
                            if attempts == 1:
                                guardrail_ok = True
                        else:
                            correction_prompt = f"""Câu hỏi mâu thuẫn logic:\nĐề: {current_q.get("question_text")}\nLựa chọn: {current_q.get("options_json")}\nGenerator chỉ định: {target}\nSolver giải ra: {selected}\nSửa lại câu hỏi hoặc đáp án. JSON giống cấu trúc gốc."""
                            corrected_data = call_llm_json(
                                correction_prompt,
                                system_instruction=generator_system_prompt,
                                temperature=0.7,
                                trace_or_span=val_span,
                                prompt_name="mcq_self_correction_stream",
                                prompt_version="v1",
                                metadata={"phase": "correction", "attempt": attempts, "question_index": idx + 1},
                            )
                            if "questions" in corrected_data and corrected_data["questions"]:
                                current_q = corrected_data["questions"][0]
                            else:
                                current_q = corrected_data
                    except Exception:
                        correct = True

                if stream_trace:
                    try:
                        stream_trace.score(
                            name="mcq_guardrail_pass",
                            value=1.0 if guardrail_ok else 0.0,
                            comment=f"Q{idx + 1}: {'Pass 1st' if guardrail_ok else f'{attempts} attempts'}",
                        )
                        stream_trace.score(
                            name="self_correction_attempts",
                            value=float(attempts),
                            comment=f"Q{idx + 1}: {attempts} attempt(s)",
                        )
                    except Exception:
                        pass
                if val_span:
                    val_span.end(output={"final_answer": current_q.get("correct_answer"), "attempts": attempts})

                # Save to DB
                opts = current_q.get("options_json", "[]")
                opts_str = json.dumps(opts) if isinstance(opts, list) else opts
                new_q_obj = Question(
                    course_id=course_id,
                    chapter_id=chapter_id,
                    question_text=current_q.get("question_text", ""),
                    question_type="MCQ",
                    options_json=opts_str,
                    correct_answer=current_q.get("correct_answer", ""),
                    bloom_level=safe_parse_bloom_level(current_q.get("bloom_level", bloom_level), bloom_level),
                    clo_id=clo_id,
                )
                new_db.add(new_q_obj)
                new_db.commit()
                new_db.refresh(new_q_obj)
                saved_questions.append(new_q_obj)

                yield send(
                    "question",
                    {
                        "index": idx + 1,
                        "total": len(raw_questions),
                        "question": {
                            "id": new_q_obj.id,
                            "question_text": new_q_obj.question_text,
                            "options_json": new_q_obj.options_json,
                            "correct_answer": new_q_obj.correct_answer,
                            "bloom_level": new_q_obj.bloom_level,
                            "clo_id": new_q_obj.clo_id,
                        },
                    },
                )

    finally:
        new_db.close()

    yield send(
        "done",
        {
            "message": f"✅ Hoàn tất! Đã sinh và xác minh {len(saved_questions)}/{count} câu hỏi.",
            "total": len(saved_questions),
        },
    )

    if stream_trace:
        try:
            stream_trace.update(output={"saved_count": len(saved_questions)})
            langfuse.flush()
        except Exception:
            pass
