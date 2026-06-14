import os
import sys

# Ép kiểu mã hóa console sang UTF-8 để không bị crash khi ghi log tiếng Việt trên Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import argparse
import asyncio
import datetime
import json
import time

from sqlalchemy.orm import Session

from src.database.models import ChatEvalRun, ChatMessage, ChatSession, Course
from src.database.session import SessionLocal
from src.services.chatbot_agent import langfuse, run_chatbot_agent_loop
from src.services.chatbot_guardrails import validate_output


async def run_chatbot_evaluation(provider_name: str, db: Session) -> dict:
    """
    Chạy đánh giá tự động cho bộ test case của Chatbot.
    """
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cases_path = os.path.join(root_dir, "data", "chatbot_eval_cases.json")

    if not os.path.exists(cases_path):
        raise FileNotFoundError(f"Không tìm thấy file eval cases: {cases_path}")

    with open(cases_path, encoding="utf-8") as f:
        cases = json.load(f)

    # Tạo một Course giả định trong DB để chạy eval nếu chưa có bất kỳ Course nào
    course = db.query(Course).first()
    if not course:
        # Lấy user ID đầu tiên
        from src.database.models import User

        user = db.query(User).first()
        if not user:
            # Tạo user giả lập
            user = User(email="eval_user@vinuni.edu.vn", password_hash="dummy")
            db.add(user)
            db.commit()
            db.refresh(user)

        course = Course(user_id=user.id, course_code="DSA101", course_name="Cấu trúc dữ liệu và Giải thuật (Eval Mock)")
        db.add(course)
        db.commit()
        db.refresh(course)

    timestamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    eval_run_id = f"eval_chatbot_{provider_name}_{timestamp}"

    # Tạo một ChatSession tạm thời phục vụ chạy eval
    session = ChatSession(course_id=course.id, title=f"Eval Session {timestamp}")
    db.add(session)
    db.commit()
    db.refresh(session)

    results = []
    passed_cases = 0
    guardrail_violations_count = 0

    try:
        for case in cases:
            case_id = case["id"]
            name = case["name"]
            user_message = case["user_message"]
            expected_tool = case["expected_tool"]
            should_block = case["should_block"]

            print(f"Running eval case: {case_id} ({name})...")

            start_time = time.time()
            # Chạy agent loop cho ca kiểm thử này
            agent_res = await run_chatbot_agent_loop(
                session_id=session.id,
                user_message=user_message,
                course_id=course.id,
                user_id=course.user_id,
                db=db,
                max_rounds=3,
            )
            latency_ms = (time.time() - start_time) * 1000

            status = agent_res.get("status")
            assistant_text = agent_res.get("assistant_text", "")
            trace_id = agent_res.get("trace_id")

            # 1. Kiểm tra Guardrail Block
            actual_block = status == "blocked"
            block_correct = actual_block == should_block

            # 2. Kiểm tra định tuyến công cụ (Tool Routing)
            actual_tools_called = []
            rounds = agent_res.get("rounds", [])
            for r in rounds:
                for tc in r.get("tool_calls", []):
                    actual_tools_called.append(tc.get("name"))

            routing_correct = True
            if expected_tool:
                if expected_tool not in actual_tools_called:
                    routing_correct = False
            else:
                if len(actual_tools_called) > 0:
                    routing_correct = False

            # 3. Kiểm tra vi phạm guardrail ở đầu ra
            out_violations = validate_output(assistant_text)
            guardrail_passed = len(out_violations) == 0
            if not guardrail_passed:
                guardrail_violations_count += 1

            case_passed = block_correct and routing_correct and guardrail_passed
            if case_passed:
                passed_cases += 1

            # Ghi nhận điểm số lên Langfuse
            if trace_id and langfuse:
                try:
                    langfuse.score(
                        trace_id=trace_id,
                        name="eval_chatbot_accuracy",
                        value=1.0 if case_passed else 0.0,
                        comment=f"Case: {name}",
                    )
                    langfuse.score(
                        trace_id=trace_id, name="eval_chatbot_routing", value=1.0 if routing_correct else 0.0
                    )
                    langfuse.score(
                        trace_id=trace_id, name="eval_chatbot_guardrails", value=1.0 if guardrail_passed else 0.0
                    )
                except Exception as e:
                    print(f"[LANGFUSE] Error logging scores: {e}")

            results.append(
                {
                    "id": case_id,
                    "name": name,
                    "user_message": user_message,
                    "expected_tool": expected_tool,
                    "should_block": should_block,
                    "actual_status": status,
                    "actual_tools": actual_tools_called,
                    "routing_correct": routing_correct,
                    "block_correct": block_correct,
                    "guardrail_passed": guardrail_passed,
                    "out_violations": out_violations,
                    "passed": case_passed,
                    "latency_ms": latency_ms,
                    "assistant_text": assistant_text,
                }
            )
    finally:
        # Xóa tin nhắn tạm thời của eval session để không rác DB chính
        db.query(ChatMessage).filter(ChatMessage.session_id == session.id).delete()
        db.query(ChatSession).filter(ChatSession.id == session.id).delete()
        db.commit()

    accuracy = round(passed_cases / len(cases), 4) if cases else 0.0

    summary = {
        "total_cases": len(cases),
        "passed_cases": passed_cases,
        "accuracy": accuracy,
        "guardrail_violations_count": guardrail_violations_count,
        "run_at": datetime.datetime.now().isoformat(),
    }

    # Lưu kết quả chạy eval vào CSDL SQLite
    eval_run = ChatEvalRun(
        eval_run_id=eval_run_id,
        provider=provider_name,
        model="gemini-2.5-flash" if provider_name == "openrouter" else "gpt-4o-mini",
        total_cases=len(cases),
        passed_cases=passed_cases,
        accuracy=accuracy,
        guardrail_violations_count=guardrail_violations_count,
        results_json=json.dumps(results, ensure_ascii=False),
    )
    db.add(eval_run)
    db.commit()

    # Ghi nhận log JSON ra thư mục backend/runs
    runs_dir = os.path.join(root_dir, "runs")
    os.makedirs(runs_dir, exist_ok=True)
    run_file_path = os.path.join(runs_dir, f"{eval_run_id}.json")
    with open(run_file_path, "w", encoding="utf-8") as f:
        json.dump(
            {"eval_run_id": eval_run_id, "provider": provider_name, "summary": summary, "results": results},
            f,
            ensure_ascii=False,
            indent=2,
        )

    return {"eval_run_id": eval_run_id, "summary": summary, "results": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chạy bộ đánh giá chatbot trợ lý sư phạm.")
    parser.add_argument("--provider", default="openrouter", choices=["openrouter", "openai"])
    args = parser.parse_args()

    print(f"Bắt đầu chạy bộ kiểm định cho Chatbot (Provider: {args.provider})...")
    session_db = SessionLocal()
    try:
        res = asyncio.run(run_chatbot_evaluation(args.provider, session_db))
        summary = res["summary"]
        print("\n=== KẾT QUẢ ĐÁNH GIÁ CHATBOT ===")
        print(f"Tổng số ca kiểm thử: {summary['total_cases']}")
        print(f"Số ca đạt chuẩn: {summary['passed_cases']}")
        print(f"Tỷ lệ chính xác: {summary['accuracy'] * 100}%")
        print(f"Số lỗi vi phạm an toàn (Guardrail): {summary['guardrail_violations_count']}")
    finally:
        session_db.close()
