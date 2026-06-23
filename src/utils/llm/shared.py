"""
LLM Shared Module — Contains shared configurations, constants, logging helpers,
formatters, JSON parsing, and cost calculators to avoid circular imports.
"""

import contextvars
import datetime
import json
import os
import re

from google.genai import types
from langfuse import Langfuse

# ═══════════════════════════════════════════════════════════════════════
# Environment Loading
# ═══════════════════════════════════════════════════════════════════════

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.env"))
if not os.path.exists(env_path):
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env"))

if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                k = key.strip()
                if k not in os.environ:
                    os.environ[k] = val.strip()


# ═══════════════════════════════════════════════════════════════════════
# Token Tracker (request/stream-scoped via contextvars)
# ═══════════════════════════════════════════════════════════════════════

token_tracker = contextvars.ContextVar("token_tracker", default=None)


def init_token_tracker():
    token_tracker.set({"input_tokens": 0, "output_tokens": 0, "total_cost": 0.0, "model_name": None})


def get_token_usage() -> dict | None:
    return token_tracker.get()


# ═══════════════════════════════════════════════════════════════════════
# Langfuse Initialization
# ═══════════════════════════════════════════════════════════════════════

langfuse = None
try:
    if (
        os.environ.get("TESTING") != "1"
        and os.environ.get("LLM_MOCK_MODE") != "true"
        and os.environ.get("LANGFUSE_SECRET_KEY")
        and os.environ.get("LANGFUSE_PUBLIC_KEY")
    ):
        langfuse = Langfuse(
            public_key=os.environ.get("LANGFUSE_PUBLIC_KEY"),
            secret_key=os.environ.get("LANGFUSE_SECRET_KEY"),
            host=os.environ.get("LANGFUSE_HOST", "http://localhost:3000"),
        )
        print("[INFO] Langfuse initialized successfully.")
except Exception as e:
    print(f"[WARNING] Failed to initialize Langfuse: {e}")


# ═══════════════════════════════════════════════════════════════════════
# Cost Calculation
# ═══════════════════════════════════════════════════════════════════════


def calculate_cost(model_name: str, input_tokens: int, output_tokens: int) -> dict:
    """Tính toán chi phí sử dụng dựa trên model và số lượng token."""
    pricing = {
        "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
        "gemini-flash-latest": {"input": 0.075, "output": 0.30},
        "gemini-2.5-flash-lite": {"input": 0.075, "output": 0.30},
        "gpt-4o-mini": {"input": 0.150, "output": 0.600},
    }
    model_lower = model_name.lower()
    matched = {"input": 0.0, "output": 0.0}
    for k, v in pricing.items():
        if k in model_lower:
            matched = v
            break

    input_cost = (input_tokens / 1_000_000.0) * matched["input"]
    output_cost = (output_tokens / 1_000_000.0) * matched["output"]
    return {"input_cost": input_cost, "output_cost": output_cost, "total_cost": input_cost + output_cost}


# ═══════════════════════════════════════════════════════════════════════
# Langfuse Logging
# ═══════════════════════════════════════════════════════════════════════


def log_generation_to_langfuse(
    model_name: str,
    prompt,
    system_instruction: str,
    output: str,
    usage_data: dict,
    start_time,
    end_time,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
    temperature: float = 0.2,
):
    """Ghi nhận LLM Generation chi tiết lên Langfuse."""
    in_tokens = 0
    out_tokens = 0
    if usage_data:
        in_tokens = usage_data.get("input_tokens", 0)
        out_tokens = usage_data.get("output_tokens", 0)
    else:
        in_tokens = len(str(prompt)) // 4
        out_tokens = len(output) // 4

    costs = calculate_cost(model_name, in_tokens, out_tokens)

    try:
        tracker = token_tracker.get()
        if tracker is not None:
            tracker["input_tokens"] += in_tokens
            tracker["output_tokens"] += out_tokens
            tracker["total_cost"] += costs["total_cost"]
            tracker["model_name"] = model_name
    except Exception as tracker_err:
        print(f"[WARNING] Token tracker accumulation error: {tracker_err}")

    if not langfuse:
        return
    try:
        input_rep = prompt
        history_count = 0
        if isinstance(prompt, list):
            history_count = len(prompt)
            input_rep = json.dumps(prompt, ensure_ascii=False)

        usage_payload = {
            "input_tokens": in_tokens,
            "output_tokens": out_tokens,
            "total_tokens": in_tokens + out_tokens,
            "input_cost": costs["input_cost"],
            "output_cost": costs["output_cost"],
            "total_cost": costs["total_cost"],
        }

        meta_payload = {
            **(metadata or {}),
            "system_instruction": system_instruction,
            "temperature": temperature,
            "history_count": history_count,
        }

        active_target = trace_or_span
        if not active_target:
            active_target = langfuse.trace(
                name=prompt_name or "lecture_generation", input=input_rep, metadata=meta_payload
            )

        generation = active_target.generation(
            name=prompt_name or f"call_{model_name}",
            model=model_name,
            input=input_rep,
            output=output,
            usage=usage_payload,
            start_time=start_time,
            end_time=end_time,
            metadata=meta_payload,
        )

        if prompt_name:
            try:
                lf_prompt = langfuse.get_prompt(prompt_name, version=prompt_version)
                generation.update(prompt=lf_prompt)
            except Exception:
                pass
    except Exception as e:
        print(f"[WARNING] Langfuse logging error: {e}")


def log_to_langfuse(model_name: str, prompt: str, system_instruction: str, output: str, usage: dict = None):
    now = datetime.datetime.now(datetime.UTC)
    log_generation_to_langfuse(model_name, prompt, system_instruction, output, usage, now, now)


# ═══════════════════════════════════════════════════════════════════════
# JSON Parsing
# ═══════════════════════════════════════════════════════════════════════


def robust_parse_json(text: str) -> dict:
    """Hàm trích xuất và parse JSON mạnh mẽ từ văn bản phản hồi của LLM."""
    if not text:
        raise ValueError("Empty response text")

    text = text.strip()

    # 1. Loại bỏ markdown code blocks ```json ... ``` hoặc ``` ... ```
    if text.startswith("```"):
        lines = text.splitlines()
        start_idx = 0
        for i, line in enumerate(lines):
            if line.strip().startswith("```"):
                start_idx = i + 1
                break
        end_idx = len(lines)
        for i in range(len(lines) - 1, start_idx - 1, -1):
            if lines[i].strip().startswith("```"):
                end_idx = i
                break
        text = "\n".join(lines[start_idx:end_idx]).strip()

    # 2. Thử parse trực tiếp
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 3. Tìm kiếm { đầu tiên và } cuối cùng
    try:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            json_str = text[start : end + 1]
            return json.loads(json_str)
    except json.JSONDecodeError:
        pass

    # 4. Cleanup các lỗi cú pháp JSON phổ biến
    try:
        cleaned = re.sub(r",\s*([\]}])", r"\1", text)
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        pass

    raise ValueError("Failed to parse JSON content from text")


# ═══════════════════════════════════════════════════════════════════════
# Model Configuration
# ═══════════════════════════════════════════════════════════════════════

FREE_MODELS = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "meta-llama/llama-3-8b-instruct:free",
    "google/gemma-2-9b-it:free",
    "google/gemini-2.5-flash:free",
    "qwen/qwen3-coder:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "openai/gpt-oss-120b:free",
    "z-ai/glm-4.5-air:free",
    "openrouter/free",
]


def get_local_llm_config() -> tuple[list[str], str, str]:
    """Lấy danh sách các URL, model và API Key cấu hình sẵn cho Local LLM."""
    local_api_key = os.environ.get("LOCAL_LLM_API_KEY", "AIVIAL-SECURE-KEY-2026")
    local_model = os.environ.get("LOCAL_LLM_MODEL", "Qwen2.5-14B-Instruct-Q4_K_M.gguf")
    local_urls = []

    env_local_url = os.environ.get("LOCAL_LLM_URL")
    env_tunnel_url = os.environ.get("LOCAL_LLM_TUNNEL_URL")
    if env_local_url:
        local_urls.append(env_local_url)
    else:
        local_urls.append("http://127.0.0.1:8081/v1")

    if env_tunnel_url:
        local_urls.append(env_tunnel_url)
    else:
        local_urls.append("https://officials-spice-digital-casting.trycloudflare.com/v1")

    return local_urls, local_model, local_api_key


# ═══════════════════════════════════════════════════════════════════════
# Message Formatting
# ═══════════════════════════════════════════════════════════════════════


def format_openai_messages(prompt, system_instruction: str = None) -> list[dict]:
    """Định dạng prompt và system instruction thành cấu trúc tin nhắn chuẩn của OpenAI."""
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    if isinstance(prompt, list):
        for msg in prompt:
            messages.append({"role": msg.get("role"), "content": msg.get("content")})
    else:
        messages.append({"role": "user", "content": prompt})
    return messages


def format_gemini_contents(prompt):
    """Định dạng prompt thành cấu trúc contents của Google GenAI SDK."""
    if isinstance(prompt, list):
        gemini_contents = []
        for msg in prompt:
            role = "user" if msg.get("role") == "user" else "model"
            gemini_contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.get("content", ""))]))
        return gemini_contents
    return prompt
