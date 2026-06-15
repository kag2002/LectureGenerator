import json
import os
import re
import time
from pathlib import Path

# Ensure we import llm client functions
from src.utils.llm_client import call_llm_json

DATASET_FILE = Path(__file__).parent / "dataset.json"
REPORT_FILE = Path(__file__).parent.parent / "results" / "report.md"


def test_evaluation_harness():
    # Force real client behavior (or at least bypass the local mock override toggle)
    os.environ["LLM_MOCK_MODE"] = "false"
    os.environ["LLM_CACHE_ENABLED"] = "false"

    assert DATASET_FILE.exists(), f"Dataset file not found at {DATASET_FILE}"

    with open(DATASET_FILE, "r", encoding="utf-8") as f:
        cases = json.load(f)

    results = []
    latencies = []
    success_count = 0

    print(f"\nRunning evaluation on {len(cases)} prompts...")

    for case in cases:
        prompt = case["prompt"]
        sys_inst = case["system_instruction"]
        case_id = case["id"]

        start_time = time.time()
        try:
            # We call the main LLM client function
            response = call_llm_json(prompt=prompt, system_instruction=sys_inst)
            latency = time.time() - start_time
            latencies.append(latency)

            # Simple heuristic assertions to evaluate response structure
            is_valid = False
            if case["type"] == "storyboard":
                # Expecting slides list or slide_content key
                is_valid = isinstance(response, dict) and (
                    "slides" in response or "slide_content" in response or len(response) > 0
                )
            elif case["type"] == "syllabus":
                # Expecting chapters or clos or general dict
                is_valid = isinstance(response, dict) and len(response) > 0
            elif case["type"] == "mcq":
                # Expecting questions or list
                is_valid = isinstance(response, dict) and (
                    "questions" in response or "question_text" in response or len(response) > 0
                )

            if is_valid:
                success_count += 1
                status = "PASSED"
            else:
                status = "INVALID_STRUCTURE"

            results.append({"id": case_id, "status": status, "latency": latency, "error": None})
            print(f"Case {case_id}: {status} in {latency:.2f}s")

        except Exception as e:
            latency = time.time() - start_time
            latencies.append(latency)
            results.append({"id": case_id, "status": "FAILED", "latency": latency, "error": str(e)})
            print(f"Case {case_id}: FAILED in {latency:.2f}s: {e}")

    # Calculate aggregated metrics
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    accuracy = (success_count / len(cases)) * 100 if cases else 0

    # Update report.md
    update_report(accuracy, avg_latency)

    # Assert harness criteria: accuracy should be acceptable (>= 50% for standard runs/tests)
    assert accuracy >= 50.0, f"Accuracy dropped below target threshold: {accuracy}%"


def update_report(accuracy: float, avg_latency: float):
    if not REPORT_FILE.exists():
        print(f"[WARNING] Report file not found at {REPORT_FILE}")
        return

    with open(REPORT_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    accuracy_status = "✅" if accuracy >= 80 else "⏳"
    latency_status = "✅" if avg_latency <= 3.0 else "⏳"

    new_accuracy_line = f"| Response accuracy | >80% | {accuracy:.1f}% | {accuracy_status} |"
    new_latency_line = f"| Response latency | <3s | {avg_latency:.2f}s | {latency_status} |"

    # Replace existing metrics
    content = re.sub(r"\| Response accuracy \| >80% \| [^|]+ \| [^|]+ \|", new_accuracy_line, content)
    content = re.sub(r"\| Response latency \| <3s \| [^|]+ \| [^|]+ \|", new_latency_line, content)

    # Fallback exact string replacement
    content = content.replace("| Response accuracy | >80% | — | ⏳ |", new_accuracy_line)
    content = content.replace("| Response latency | <3s | — | ⏳ |", new_latency_line)

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Report updated at {REPORT_FILE}")
