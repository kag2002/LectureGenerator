import json
import logging
from typing import Any
from src.agents.state import AgentState
import src.agents.graph

logger = logging.getLogger(__name__)

async def summarize_history_node(state: AgentState) -> dict[str, Any]:
    messages = state.get("messages", [])
    if not messages:
        return {}

    # Ước lượng số lượng tokens: 1 từ ~ 1.3 tokens hoặc len(str(messages)) // 4
    estimated_tokens = len(str(messages)) // 4

    # Chỉ tóm tắt hội thoại khi tổng tokens vượt quá 8.000
    if estimated_tokens <= 8000:
        return {}

    system_messages = [m for m in messages if m["role"] == "system"]
    non_system_messages = [m for m in messages if m["role"] != "system"]

    if len(non_system_messages) <= 2:
        return {}

    to_summarize = non_system_messages[:-2]
    to_keep = non_system_messages[-2:]

    # Lấy ứng cử viên model
    candidate_models = src.agents.graph.get_candidate_models()
    if not candidate_models:
        return {}

    model_info = candidate_models[0]
    client = model_info["client"]
    model_name = model_info["model"]
    headers = model_info.get("extra_headers", {})

    summary_prompt = [
        {
            "role": "system",
            "content": "Bạn là trợ lý ảo lưu trữ bộ nhớ sư phạm. Hãy tóm tắt ngắn gọn các tin nhắn hội thoại cũ sau đây thành các ý chính quan trọng (ngôn ngữ giảng dạy, chương học đang làm việc, các chuẩn đầu ra cần tập trung, thói quen thiết kế). Tóm tắt phải cực kỳ ngắn gọn, súc tích và dưới 250 từ.",
        },
        {"role": "user", "content": json.dumps(to_summarize, ensure_ascii=False)},
    ]

    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=summary_prompt,
            temperature=0.0,
            extra_headers=headers if headers else None,
        )
        summary_text = response.choices[0].message.content or ""

        # Dựng lại lịch sử hội thoại mới:
        new_messages = []
        if system_messages:
            new_messages.extend(system_messages)

        new_messages.append({"role": "system", "content": f"[TÓM TẮT LỊCH SỬ HỘI THOẠI TRƯỚC ĐÓ]:\n{summary_text}"})
        new_messages.extend(to_keep)

        return {"messages": new_messages, "summary_history": summary_text}
    except Exception as e:
        logger.error(f"[SUMMARIZE HISTORY NODE ERROR] Failed to summarize: {e}")
        return {}
