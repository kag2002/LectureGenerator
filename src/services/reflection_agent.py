import json

from sqlalchemy.orm import Session

from src.database.models import Chapter, MaterialRevision, SystemRule
from src.utils.llm import async_call_llm_json

REFLECTION_SYSTEM_PROMPT = """Bạn là trợ lý AI phản tư sư phạm chuyên nghiệp (Pedagogical Reflection Agent).
Nhiệm vụ của bạn là phân tích lịch sử chỉnh sửa slide bài giảng hoặc kịch bản active learning của giảng viên,
từ đó rút ra các quy tắc/chỉ dẫn tự thân (Self-Instructions / Rules) để giúp các lượt sinh slide/bài học tiếp theo
khớp đúng với phong cách và yêu cầu của giảng viên mà không cần họ phải sửa lại.

Đầu ra của bạn PHẢI là định dạng JSON chứa danh sách quy tắc:
{
  "rules": [
    {
      "category": "slide_style",  // hoặc "active_learning"
      "rule_text": "Quy tắc viết bằng tiếng Việt ngắn gọn, rõ ràng, tập trung vào phong cách thiết kế, ngôn ngữ hoặc cấu trúc..."
    }
  ]
}
Chỉ trả về JSON hợp lệ. Không chèn giải thích bên ngoài JSON."""

CONSOLIDATION_SYSTEM_PROMPT = """Bạn là trợ lý AI hợp nhất quy tắc thiết kế (Rule Consolidation Agent).
Nhiệm vụ: Bạn nhận được danh sách quy tắc cũ hiện có và quy tắc mới đề xuất cho bài giảng.
Hãy loại bỏ trùng lặp, giải quyết các mâu thuẫn (nếu có) và biên tập lại thành một bộ quy tắc hợp nhất duy nhất.
RÀNG BUỘC CỰC KỲ QUAN TRỌNG:
1. Bộ quy tắc hợp nhất tối đa chỉ được chứa 5 quy tắc ngắn gọn dạng gạch đầu dòng.
2. Mỗi quy tắc viết súc tích, rõ ràng và có tính thực hành sư phạm cao.

Đầu ra định dạng JSON:
{
  "rules": [
    "Quy tắc 1...",
    "Quy tắc 2...",
    "Quy tắc 3..."
  ]
}
Chỉ trả về JSON hợp lệ."""


async def run_reflection_cycle(course_id: int, db: Session) -> dict:
    """
    Chạy chu kỳ phản tư: Đọc MaterialRevision của khóa học, trích xuất luật,
    gộp luật để giải quyết mâu thuẫn và lưu ở trạng thái pending_approval.
    """
    # 1. Thu thập tối đa 20 bản ghi revision gần nhất của khóa học
    revisions = (
        db.query(MaterialRevision)
        .join(Chapter)
        .filter(Chapter.course_id == course_id)
        .order_by(MaterialRevision.created_at.desc())
        .limit(20)
        .all()
    )

    if not revisions:
        return {"status": "skipped", "message": "Không tìm thấy lịch sử chỉnh sửa nào để phản tư."}

    # 2. Xây dựng ngữ cảnh các revisions gửi cho LLM
    revision_context_list = []
    for rev in revisions:
        revision_context_list.append(
            {
                "field": rev.field,
                "user_prompt": rev.user_prompt,
                "content_before": (rev.content_before[:300] + "...")
                if rev.content_before and len(rev.content_before) > 300
                else rev.content_before,
                "content_after": (rev.content_after[:300] + "...")
                if rev.content_after and len(rev.content_after) > 300
                else rev.content_after,
            }
        )

    prompt = f"Dưới đây là lịch sử chỉnh sửa bài giảng của giảng viên:\n{json.dumps(revision_context_list, ensure_ascii=False)}\n\nHãy rút ra các quy tắc thiết kế phù hợp."

    try:
        # Gọi LLM trích xuất luật nháp
        extracted_data = await async_call_llm_json(
            prompt,
            system_instruction=REFLECTION_SYSTEM_PROMPT,
            temperature=0.3,
            prompt_name="reflection_extractor",
            prompt_version="v1",
        )
        new_rules = extracted_data.get("rules", [])
    except Exception as e:
        print(f"[REFLECTION AGENT] Lỗi khi trích xuất luật: {e}")
        return {"status": "error", "message": f"Lỗi trích xuất luật: {str(e)}"}

    if not new_rules:
        return {"status": "skipped", "message": "Không trích xuất được quy tắc mới nào từ lịch sử sửa đổi."}

    # 3. Phân nhóm luật và chạy Consolidation (Gộp luật và khử mâu thuẫn)
    categories = ["slide_style", "active_learning"]
    added_count = 0

    for cat in categories:
        cat_new_rules = [r.get("rule_text") for r in new_rules if r.get("category") == cat]
        if not cat_new_rules:
            continue

        # Đọc các luật hiện có (bao gồm cả approved và pending_approval)
        existing_rules = (
            db.query(SystemRule).filter(SystemRule.course_id == course_id, SystemRule.rule_category == cat).all()
        )
        cat_existing_rules = [r.rule_text for r in existing_rules]

        # Gọi LLM gộp và giải quyết xung đột
        consolidation_prompt = f"Quy tắc hiện tại:\n{json.dumps(cat_existing_rules, ensure_ascii=False)}\n\nQuy tắc đề xuất mới:\n{json.dumps(cat_new_rules, ensure_ascii=False)}"

        try:
            consolidated_data = await async_call_llm_json(
                consolidation_prompt,
                system_instruction=CONSOLIDATION_SYSTEM_PROMPT,
                temperature=0.2,
                prompt_name="reflection_consolidator",
                prompt_version="v1",
            )
            merged_rule_texts = consolidated_data.get("rules", [])
        except Exception as e:
            print(f"[REFLECTION AGENT] Lỗi khi gộp luật nhóm {cat}: {e}")
            merged_rule_texts = (cat_existing_rules + cat_new_rules)[:5]  # Fallback cắt thô 5 luật

        # Xóa các luật cũ (để ghi đè bản ghi hợp nhất mới)
        db.query(SystemRule).filter(SystemRule.course_id == course_id, SystemRule.rule_category == cat).delete(
            synchronize_session=False
        )

        # Lưu các luật hợp nhất mới vào CSDL với trạng thái pending_approval
        for r_text in merged_rule_texts:
            new_db_rule = SystemRule(
                course_id=course_id, rule_text=r_text, rule_category=cat, status="pending_approval"
            )
            db.add(new_db_rule)
            added_count += 1

    db.commit()
    print(f"[REFLECTION AGENT] Chu kỳ phản tư thành công. Đã sinh {added_count} quy tắc ở trạng thái pending_approval.")
    return {"status": "success", "rules_generated": added_count}


def get_approved_rules_context(course_id: int, db: Session, category: str) -> str:
    """Lấy danh sách quy tắc đã được duyệt để đưa vào prompt sinh slide/MCQ."""
    rules = (
        db.query(SystemRule)
        .filter(
            SystemRule.course_id == course_id, SystemRule.rule_category == category, SystemRule.status == "approved"
        )
        .all()
    )
    if not rules:
        return ""

    context = "\n\nQUY TẮC THIẾT KẾ ĐÃ ĐƯỢC GIẢNG VIÊN PHÊ DUYỆT (TỰ HỌC TỪ PHIÊN TRƯỚC):\n"
    for idx, r in enumerate(rules, 1):
        context += f"- Quy tắc {idx}: {r.rule_text}\n"
    return context
