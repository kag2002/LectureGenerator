import asyncio
import json
import math

from src.database.vector_db import embedding_func
from src.prompts.materials import (
    build_active_learning_detail_writer_system_prompt,
    build_active_learning_rationale_writer_system_prompt,
    build_active_learning_scheduler_system_prompt,
    build_content_allocator_system_prompt,
    build_logic_auditor_system_prompt,
    build_slide_writer_system_prompt,
    build_storyboard_architect_system_prompt,
)
from src.utils.llm_client import call_llm_json

BUDGETS = {"visual_highlight": 250, "card_grid": 600, "two_column_comparison": 800, "standard_list": 900, "table": 800}


def cosine_similarity(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def deduplicate_rag_hits(hits: list[dict], threshold: float = 0.75) -> list[dict]:
    """Lọc bỏ các chunks RAG có sự trùng lặp ngữ nghĩa cao qua Cosine Similarity."""
    if not hits:
        return []

    texts = [h["text"] for h in hits]
    try:
        embeddings = embedding_func(texts)
    except Exception as e:
        print(f"[WARNING] Cosine Similarity Guardrail: Failed to get embeddings: {e}")
        return hits

    unique_hits = []
    unique_embeddings = []

    for hit, emb in zip(hits, embeddings):
        is_duplicate = False
        for u_emb in unique_embeddings:
            sim = cosine_similarity(emb, u_emb)
            if sim > threshold:
                is_duplicate = True
                print(f"[INFO] Cosine Similarity Guardrail: Đã lọc bỏ chunk trùng lặp (Similarity = {sim:.4f})")
                break
        if not is_duplicate:
            unique_hits.append(hit)
            unique_embeddings.append(emb)

    return unique_hits


def get_slide_body_length(slide_md: str) -> int:
    """Tính độ dài nội dung chính của slide (loại trừ tiêu đề và dòng tag metadata)."""
    lines = [l.strip() for l in slide_md.split("\n") if l.strip()]
    content_lines = []
    for line in lines:
        if line.startswith("#"):
            continue
        if "[CLO:" in line and "Layout:" in line:
            continue
        content_lines.append(line)
    return len(" ".join(content_lines))


class MaterialOrchestrator:
    def __init__(
        self,
        chapter_title: str,
        chapter_description: str,
        clos_context: str,
        rag_context: str,
        target_lang: str,
        session_duration: int = 90,
    ):
        self.state = {
            "chapter_title": chapter_title,
            "chapter_description": chapter_description,
            "clos_context": clos_context,
            "rag_context": rag_context,
            "target_lang": target_lang,
            "session_duration": session_duration,
            "outline": [],
            "allocations": [],
            "generated_slides": [],
            "active_learning_script": "",
            "warnings": [],
        }

    def run_storyboard_architect(self, trace_or_span=None) -> list[dict]:
        """Bước 1: Storyboard Architect Agent lập đề cương cấu trúc bài giảng."""
        sys_prompt = build_storyboard_architect_system_prompt(
            clos_context=self.state["clos_context"],
            chapter_title=self.state["chapter_title"],
            chapter_description=self.state["chapter_description"],
            rag_context=self.state["rag_context"],
            session_duration=self.state["session_duration"],
        )
        user_prompt = "Hãy thiết kế Đề cương slide bài giảng dạng JSON chứa danh sách các slide."

        res = call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="storyboard_architect",
            prompt_version="v1",
        )
        self.state["outline"] = res.get("slides", [])
        return self.state["outline"]

    def run_content_allocator(self, trace_or_span=None) -> list[dict]:
        """Bước 2: Content Allocator Agent phân bổ nội dung và gán nhãn layout."""
        if not self.state["outline"]:
            raise ValueError("Outline is empty. Please run Storyboard Architect first.")

        sys_prompt = build_content_allocator_system_prompt(
            outline_json=json.dumps(self.state["outline"], ensure_ascii=False, indent=2),
            rag_context=self.state["rag_context"],
        )
        user_prompt = "Hãy phân chia thông tin RAG và gán nhãn layout cho từng slide."

        res = call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="content_allocator",
            prompt_version="v1",
        )
        self.state["allocations"] = res.get("allocations", [])
        return self.state["allocations"]

    def run_slide_writer(self, trace_or_span=None):
        """Bước 3: Slide Writer Agent sinh slide chi tiết và chạy Self-Correction."""
        if not self.state["allocations"]:
            raise ValueError("Allocations are empty. Please run Content Allocator first.")

        outline_map = {s["slide_index"]: s for s in self.state["outline"]}
        self.state["generated_slides"] = []

        for alloc in self.state["allocations"]:
            idx = alloc["slide_index"]
            plan = outline_map.get(
                idx, {"title": f"Slide {idx}", "purpose": "N/A", "target_clo": "N/A", "bloom_level": 2}
            )

            suggested_layout = alloc.get("suggested_layout", "standard_list")
            allocated_text = alloc.get("allocated_text", "")

            previous_slides_md = "\n\n".join(self.state["generated_slides"])

            # Khởi tạo sinh slide
            slide_md = self._generate_single_slide_with_retry(
                slide_index=idx,
                title=plan["title"],
                purpose=plan["purpose"],
                target_clo=plan["target_clo"],
                bloom_level=plan["bloom_level"],
                suggested_layout=suggested_layout,
                allocated_text=allocated_text,
                previous_slides_markdown=previous_slides_md,
                trace_or_span=trace_or_span,
            )
            self.state["generated_slides"].append(slide_md)

    def _generate_single_slide_with_retry(
        self,
        slide_index: int,
        title: str,
        purpose: str,
        target_clo: str,
        bloom_level: int,
        suggested_layout: str,
        allocated_text: str,
        previous_slides_markdown: str = "",
        trace_or_span=None,
    ) -> str:
        """Hàm sinh slide đơn lẻ kèm Self-Correction Loop kiểm soát Character Budget."""
        budget = BUDGETS.get(suggested_layout, 500)

        sys_prompt = build_slide_writer_system_prompt(
            slide_index=slide_index,
            title=title,
            purpose=purpose,
            target_clo=target_clo,
            bloom_level=bloom_level,
            suggested_layout=suggested_layout,
            allocated_text=allocated_text,
            target_lang=self.state["target_lang"],
            previous_slides_markdown=previous_slides_markdown,
        )

        user_prompt = "Hãy viết mã nguồn Markdown cho slide này dưới dạng JSON."

        # Thử lần 1
        res = call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name=f"slide_writer_slide_{slide_index}",
            prompt_version="v1",
        )
        slide_md = res.get("slide_markdown", "").strip()

        length = get_slide_body_length(slide_md)
        if length <= budget:
            return slide_md

        # Vòng lặp sửa lỗi (Self-Correction Loop - Thử lại tối đa 2 lần)
        for attempt in range(1, 3):
            print(
                f"[Self-Correction] Slide {slide_index} ({suggested_layout}) bị vượt budget ký tự: {length}/{budget} ở lần thử {attempt}. Đang yêu cầu AI tối ưu lại..."
            )
            correction_prompt = f"""Slide của bạn vừa sinh dài {length} ký tự, vượt quá hạn mức tối đa {budget} ký tự của layout '{suggested_layout}'.
Hãy tóm tắt ngắn gọn lại, giữ nguyên tiêu đề '#' và dòng tag metadata ở cuối slide.
Nội dung slide hiện tại để sửa đổi:
{slide_md}"""

            res = call_llm_json(
                correction_prompt,
                system_instruction=sys_prompt,
                trace_or_span=trace_or_span,
                prompt_name=f"slide_writer_correction_slide_{slide_index}",
                prompt_version="v1",
            )
            slide_md = res.get("slide_markdown", "").strip()
            length = get_slide_body_length(slide_md)
            if length <= budget:
                print(f"[Self-Correction] Tối ưu hóa Slide {slide_index} thành công! Kích thước mới: {length}/{budget}")
                return slide_md

        return slide_md

    def run_active_learning_planner(
        self, class_size: int, has_wifi: bool, furniture_type: str, trace_or_span=None
    ) -> str:
        """Bước 4: Lập kịch bản tương tác bằng vòng lặp Multi-Agent để kiểm soát chi phí & độ dài."""
        full_slides_content = "\n\n".join(self.state["generated_slides"])

        # Bước 4.1: Agent lập lịch hoạt động tương tác (Scheduler)
        scheduler_sys_prompt = build_active_learning_scheduler_system_prompt(
            target_lang=self.state["target_lang"],
            class_size=class_size,
            has_wifi=has_wifi,
            furniture_type=furniture_type,
            slide_content=full_slides_content,
            session_duration=self.state["session_duration"],
        )
        scheduler_user_prompt = "Hãy lập danh sách các hoạt động active learning xen kẽ cho bài giảng."

        scheduler_res = call_llm_json(
            scheduler_user_prompt,
            system_instruction=scheduler_sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="active_learning_scheduler",
            prompt_version="v1",
        )
        activities = scheduler_res.get("activities", [])

        detailed_scripts = []
        activities_summary_list = []

        # Bước 4.2: Vòng lặp sinh chi tiết kịch bản cho từng hoạt động đã lập lịch
        for act in activities:
            act_idx = act.get("activity_index", 1)
            act_title = act.get("title", f"Hoạt động {act_idx}")
            act_duration = act.get("duration_minutes", 10)
            act_type = act.get("activity_type", "Active Learning")

            # Lưu tóm tắt để tạo rationale sau
            activities_summary_list.append(
                f"- Hoạt động {act_idx}: {act_title} ({act_duration} phút, loại: {act_type})"
            )

            # Sinh chi tiết kịch bản
            act_json_str = json.dumps(act, ensure_ascii=False)
            act_slide = act.get("trigger_after_slide", 1)
            writer_sys_prompt = build_active_learning_detail_writer_system_prompt(
                target_lang=self.state["target_lang"],
                class_size=class_size,
                has_wifi=has_wifi,
                furniture_type=furniture_type,
                slide_content=full_slides_content,
                activity_json=act_json_str,
                activity_index=act_idx,
                title=act_title,
                duration_minutes=act_duration,
                trigger_after_slide=act_slide,
            )
            writer_user_prompt = f"Hãy viết kịch bản chi tiết cho Hoạt động {act_idx}: {act_title}."

            writer_res = call_llm_json(
                writer_user_prompt,
                system_instruction=writer_sys_prompt,
                trace_or_span=trace_or_span,
                prompt_name=f"active_learning_writer_act_{act_idx}",
                prompt_version="v1",
            )
            detailed_scripts.append(writer_res.get("detailed_script", "").strip())

        # Bước 4.3: Gọi Rationale Agent sinh giải trình sư phạm
        activities_summary = "\n".join(activities_summary_list)
        rationale_sys_prompt = build_active_learning_rationale_writer_system_prompt(
            target_lang=self.state["target_lang"],
            class_size=class_size,
            has_wifi=has_wifi,
            furniture_type=furniture_type,
            session_duration=self.state["session_duration"],
            activities_summary=activities_summary,
        )
        rationale_user_prompt = "Hãy viết giải trình sư phạm sư phạm cuối kịch bản."

        rationale_res = call_llm_json(
            rationale_user_prompt,
            system_instruction=rationale_sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="active_learning_rationale_writer",
            prompt_version="v1",
        )
        rationale_text = rationale_res.get("rationale", "").strip()

        # Ghép kịch bản hoạt động chi tiết cùng với rationale phân tách bởi ---RATIONALE---
        combined_scripts = "\n\n".join(detailed_scripts)
        self.state["active_learning_script"] = f"{combined_scripts}\n\n---RATIONALE---\n\n{rationale_text}"
        return self.state["active_learning_script"]

    def run_logic_auditor(self, trace_or_span=None) -> bool:
        """Bước 5: Logic Auditor Agent kiểm toán toàn bộ kết quả."""
        full_slides_content = "\n\n".join(self.state["generated_slides"])
        sys_prompt = build_logic_auditor_system_prompt(
            slides_content=full_slides_content,
            active_learning_script=self.state["active_learning_script"],
            clos_context=self.state["clos_context"],
        )
        user_prompt = "Hãy tiến hành kiểm toán logic bài học."

        res = call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="logic_auditor",
            prompt_version="v1",
        )

        is_valid = res.get("is_valid", True)
        self.state["warnings"] = [f"Slide {f['slide_index']}: {f['issue']}" for f in res.get("feedback", [])]
        return is_valid

    async def async_run_storyboard_architect(self, trace_or_span=None) -> list[dict]:
        """Bước 1: Storyboard Architect Agent lập đề cương cấu trúc bài giảng bất đồng bộ."""
        sys_prompt = build_storyboard_architect_system_prompt(
            clos_context=self.state["clos_context"],
            chapter_title=self.state["chapter_title"],
            chapter_description=self.state["chapter_description"],
            rag_context=self.state["rag_context"],
            session_duration=self.state["session_duration"],
        )
        user_prompt = "Hãy thiết kế Đề cương slide bài giảng dạng JSON chứa danh sách các slide."

        from src.utils.llm_client import async_call_llm_json

        res = await async_call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="storyboard_architect",
            prompt_version="v1",
        )
        self.state["outline"] = res.get("slides", [])
        return self.state["outline"]

    async def async_run_content_allocator(self, trace_or_span=None) -> list[dict]:
        """Bước 2: Content Allocator Agent phân bổ nội dung và gán nhãn layout bất đồng bộ."""
        if not self.state["outline"]:
            raise ValueError("Outline is empty. Please run Storyboard Architect first.")

        sys_prompt = build_content_allocator_system_prompt(
            outline_json=json.dumps(self.state["outline"], ensure_ascii=False, indent=2),
            rag_context=self.state["rag_context"],
        )
        user_prompt = "Hãy phân chia thông tin RAG và gán nhãn layout cho từng slide."

        from src.utils.llm_client import async_call_llm_json

        res = await async_call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="content_allocator",
            prompt_version="v1",
        )
        self.state["allocations"] = res.get("allocations", [])
        return self.state["allocations"]

    async def async_run_slide_writer(self, trace_or_span=None, progress_callback=None):
        """Bước 3: Slide Writer Agent sinh slide chi tiết và chạy Self-Correction bất đồng bộ theo tuần tự."""
        if not self.state["allocations"]:
            raise ValueError("Allocations are empty. Please run Content Allocator first.")

        outline_map = {s["slide_index"]: s for s in self.state["outline"]}
        self.state["generated_slides"] = []

        for alloc in self.state["allocations"]:
            idx = alloc["slide_index"]
            plan = outline_map.get(
                idx, {"title": f"Slide {idx}", "purpose": "N/A", "target_clo": "N/A", "bloom_level": 2}
            )

            suggested_layout = alloc.get("suggested_layout", "standard_list")
            allocated_text = alloc.get("allocated_text", "")

            previous_slides_md = "\n\n".join(self.state["generated_slides"])

            res = await self._async_generate_single_slide_with_retry(
                slide_index=idx,
                title=plan["title"],
                purpose=plan["purpose"],
                target_clo=plan["target_clo"],
                bloom_level=plan["bloom_level"],
                suggested_layout=suggested_layout,
                allocated_text=allocated_text,
                previous_slides_markdown=previous_slides_md,
                trace_or_span=trace_or_span,
            )

            self.state["generated_slides"].append(res)

            if progress_callback:
                try:
                    title = plan.get("title", f"Slide {idx}")
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(idx, title, suggested_layout)
                    else:
                        progress_callback(idx, title, suggested_layout)
                except Exception as callback_err:
                    print(f"[WARNING] Progress callback error: {callback_err}")

            # Sleep nhẹ để giãn dòng gọi API thay vì sleep 12s lớn
            await asyncio.sleep(1.0)

    async def _async_generate_single_slide_with_retry(
        self,
        slide_index: int,
        title: str,
        purpose: str,
        target_clo: str,
        bloom_level: int,
        suggested_layout: str,
        allocated_text: str,
        previous_slides_markdown: str = "",
        trace_or_span=None,
    ) -> str:
        """Hàm sinh slide đơn lẻ kèm Self-Correction Loop bất đồng bộ."""
        budget = BUDGETS.get(suggested_layout, 500)

        sys_prompt = build_slide_writer_system_prompt(
            slide_index=slide_index,
            title=title,
            purpose=purpose,
            target_clo=target_clo,
            bloom_level=bloom_level,
            suggested_layout=suggested_layout,
            allocated_text=allocated_text,
            target_lang=self.state["target_lang"],
            previous_slides_markdown=previous_slides_markdown,
        )

        user_prompt = "Hãy viết mã nguồn Markdown cho slide này dưới dạng JSON."

        from src.utils.llm_client import async_call_llm_json

        # Thử lần 1 bất đồng bộ
        res = await async_call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name=f"slide_writer_slide_{slide_index}",
            prompt_version="v1",
        )
        slide_md = res.get("slide_markdown", "").strip()

        length = get_slide_body_length(slide_md)
        if length <= budget:
            return slide_md

        # Vòng lặp sửa lỗi bất đồng bộ (Thử lại tối đa 2 lần)
        for attempt in range(1, 3):
            print(
                f"[Self-Correction-Async] Slide {slide_index} ({suggested_layout}) bị vượt budget ký tự: {length}/{budget} ở lần thử {attempt}. Đang yêu cầu AI tối ưu lại..."
            )
            await asyncio.sleep(12.0)
            correction_prompt = f"""Slide của bạn vừa sinh dài {length} ký tự, vượt quá hạn mức tối đa {budget} ký tự của layout '{suggested_layout}'.
Hãy tóm tắt ngắn gọn lại, giữ nguyên tiêu đề '#' và dòng tag metadata ở cuối slide.
Nội dung slide hiện tại để sửa đổi:
{slide_md}"""

            res = await async_call_llm_json(
                correction_prompt,
                system_instruction=sys_prompt,
                trace_or_span=trace_or_span,
                prompt_name=f"slide_writer_correction_slide_{slide_index}",
                prompt_version="v1",
            )
            slide_md = res.get("slide_markdown", "").strip()
            length = get_slide_body_length(slide_md)
            if length <= budget:
                print(
                    f"[Self-Correction-Async] Tối ưu hóa Slide {slide_index} thành công! Kích thước mới: {length}/{budget}"
                )
                return slide_md

        return slide_md

    async def async_run_active_learning_planner(
        self, class_size: int, has_wifi: bool, furniture_type: str, trace_or_span=None
    ) -> str:
        """Bước 4: Lập kịch bản tương tác bất đồng bộ."""
        full_slides_content = "\n\n".join(self.state["generated_slides"])

        # Bước 4.1: Agent lập lịch hoạt động tương tác (Scheduler)
        scheduler_sys_prompt = build_active_learning_scheduler_system_prompt(
            target_lang=self.state["target_lang"],
            class_size=class_size,
            has_wifi=has_wifi,
            furniture_type=furniture_type,
            slide_content=full_slides_content,
            session_duration=self.state["session_duration"],
        )
        scheduler_user_prompt = "Hãy lập danh sách các hoạt động active learning xen kẽ cho bài giảng."

        from src.utils.llm_client import async_call_llm_json

        scheduler_res = await async_call_llm_json(
            scheduler_user_prompt,
            system_instruction=scheduler_sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="active_learning_scheduler",
            prompt_version="v1",
        )
        activities = scheduler_res.get("activities", [])

        detailed_scripts = []
        activities_summary_list = []

        # Bước 4.2: Vòng lặp sinh chi tiết kịch bản cho từng hoạt động đã lập lịch bất đồng bộ song song
        tasks = []
        for act in activities:
            act_idx = act.get("activity_index", 1)
            act_title = act.get("title", f"Hoạt động {act_idx}")
            act_duration = act.get("duration_minutes", 10)
            act_type = act.get("activity_type", "Active Learning")

            activities_summary_list.append(
                f"- Hoạt động {act_idx}: {act_title} ({act_duration} phút, loại: {act_type})"
            )

            act_json_str = json.dumps(act, ensure_ascii=False)
            act_slide = act.get("trigger_after_slide", 1)
            writer_sys_prompt = build_active_learning_detail_writer_system_prompt(
                target_lang=self.state["target_lang"],
                class_size=class_size,
                has_wifi=has_wifi,
                furniture_type=furniture_type,
                slide_content=full_slides_content,
                activity_json=act_json_str,
                activity_index=act_idx,
                title=act_title,
                duration_minutes=act_duration,
                trigger_after_slide=act_slide,
            )
            writer_user_prompt = f"Hãy viết kịch bản chi tiết cho Hoạt động {act_idx}: {act_title}."

            tasks.append(
                async_call_llm_json(
                    writer_user_prompt,
                    system_instruction=writer_sys_prompt,
                    trace_or_span=trace_or_span,
                    prompt_name=f"active_learning_writer_act_{act_idx}",
                    prompt_version="v1",
                )
            )

        results = await asyncio.gather(*tasks)
        for res in results:
            detailed_scripts.append(res.get("detailed_script", "").strip())

        # Bước 4.3: Gọi Rationale Agent sinh giải trình sư phạm
        activities_summary = "\n".join(activities_summary_list)
        rationale_sys_prompt = build_active_learning_rationale_writer_system_prompt(
            target_lang=self.state["target_lang"],
            class_size=class_size,
            has_wifi=has_wifi,
            furniture_type=furniture_type,
            session_duration=self.state["session_duration"],
            activities_summary=activities_summary,
        )
        rationale_user_prompt = "Hãy viết giải trình sư phạm sư phạm cuối kịch bản."

        rationale_res = await async_call_llm_json(
            rationale_user_prompt,
            system_instruction=rationale_sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="active_learning_rationale_writer",
            prompt_version="v1",
        )
        rationale_text = rationale_res.get("rationale", "").strip()

        combined_scripts = "\n\n".join(detailed_scripts)
        self.state["active_learning_script"] = f"{combined_scripts}\n\n---RATIONALE---\n\n{rationale_text}"
        return self.state["active_learning_script"]

    async def async_run_logic_auditor(self, trace_or_span=None) -> bool:
        """Bước 5: Logic Auditor Agent kiểm toán toàn bộ kết quả bất đồng bộ."""
        full_slides_content = "\n\n".join(self.state["generated_slides"])
        sys_prompt = build_logic_auditor_system_prompt(
            slides_content=full_slides_content,
            active_learning_script=self.state["active_learning_script"],
            clos_context=self.state["clos_context"],
        )
        user_prompt = "Hãy tiến hành kiểm toán logic bài học."

        from src.utils.llm_client import async_call_llm_json

        res = await async_call_llm_json(
            user_prompt,
            system_instruction=sys_prompt,
            trace_or_span=trace_or_span,
            prompt_name="logic_auditor",
            prompt_version="v1",
        )

        is_valid = res.get("is_valid", True)
        self.state["warnings"] = [f"Slide {f['slide_index']}: {f['issue']}" for f in res.get("feedback", [])]
        return is_valid
