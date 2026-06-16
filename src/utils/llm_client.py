"""
LLM Client — Main entry point for all LLM interactions.

Public API (unchanged — backward compatible):
  - call_llm_json(...)     → dict
  - call_llm_stream(...)   → generator[str]
  - async_call_llm_json(...)  → dict
  - async_call_llm_stream(...)  → async generator[str]

Supporting utilities:
  - token_tracker, init_token_tracker(), get_token_usage()
  - calculate_cost(), log_generation_to_langfuse(), log_to_langfuse()
  - robust_parse_json()
  - format_openai_messages(), format_gemini_contents()
  - get_local_llm_config()
  - FREE_MODELS

Provider-specific implementations are in llm_providers.py.
Mock fallback data is in llm_mock.py.
"""

import contextvars
import datetime
import json
import os
import re

from google.genai import types
from langfuse import Langfuse

# ═══════════════════════════════════════════════════════════════════════
# Token Tracker (request/stream-scoped via contextvars)
# ═══════════════════════════════════════════════════════════════════════

token_tracker = contextvars.ContextVar("token_tracker", default=None)


def init_token_tracker():
    token_tracker.set({"input_tokens": 0, "output_tokens": 0, "total_cost": 0.0, "model_name": None})


def get_token_usage() -> dict | None:
    return token_tracker.get()


# ═══════════════════════════════════════════════════════════════════════
# Environment Loading
# ═══════════════════════════════════════════════════════════════════════

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env"))
if not os.path.exists(env_path):
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.env"))

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
    # 1. Calculate tokens and costs, then accumulate in tracker
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

# Danh sách các model free mạnh mẽ trên OpenRouter sắp xếp theo thứ tự ưu tiên
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


# ═══════════════════════════════════════════════════════════════════════
# PUBLIC API — Fallback Chain Orchestration with Mocking & Caching
# ═══════════════════════════════════════════════════════════════════════


def _execute_call_llm_json(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
) -> dict:
    from .llm_mock import get_mock_json_response
    from .llm_providers import (
        call_gemini_json,
        call_local_json,
        call_openai_json,
        call_openrouter_json,
    )

    args = (prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata)

    # 0. Local/Tunnel LLM
    try:
        return call_local_json(*args)
    except Exception:
        pass

    # 1. Gemini
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        try:
            return call_gemini_json(*args)
        except Exception as e:
            print(f"[ERROR] Loi khi goi Gemini API truc tiep: {e}")

    # 2. OpenAI
    if os.environ.get("OPENAI_API_KEY"):
        try:
            return call_openai_json(*args)
        except Exception as e:
            print(f"[ERROR] Loi khi goi OpenAI API truc tiep: {e}")

    # 3. OpenRouter
    if os.environ.get("OPENROUTER_API_KEY"):
        try:
            return call_openrouter_json(*args)
        except Exception:
            pass

    # 4. Fallback: Mock Data
    print("[WARNING] Khong co API key hop le hoac tat ca API deu gap loi. Dang su dung Mock Data.")
    start_time = datetime.datetime.now(datetime.UTC)
    mock_res = get_mock_json_response(prompt, system_instruction)
    end_time = datetime.datetime.now(datetime.UTC)
    mock_out = json.dumps(mock_res, ensure_ascii=False)
    log_generation_to_langfuse(
        model_name="mock-fallback",
        prompt=prompt,
        system_instruction=system_instruction,
        output=mock_out,
        usage_data={"input_tokens": 0, "output_tokens": 0},
        start_time=start_time,
        end_time=end_time,
        trace_or_span=trace_or_span,
        prompt_name=prompt_name,
        prompt_version=prompt_version,
        metadata={**(metadata or {}), "fallback": True},
        temperature=temperature,
    )
    return mock_res


def call_llm_json(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
) -> dict:
    """Gọi LLM hỗ trợ định dạng JSON trả về, tích hợp Mock Mode và Prompt Caching."""
    cache_enabled = os.environ.get("LLM_CACHE_ENABLED", "true") == "true"
    cache_key = None
    if cache_enabled:
        from .llm_cache import get_cache_key, get_cached_json
        cache_key = get_cache_key(prompt, system_instruction, temperature, "fallback-chain")
        cached_res = get_cached_json(cache_key)
        if cached_res is not None:
            print(f"--- [Cache Hit] Returning cached JSON for: {cache_key} ---")
            start_time = datetime.datetime.now(datetime.UTC)
            end_time = datetime.datetime.now(datetime.UTC)
            log_generation_to_langfuse(
                model_name="cached-response",
                prompt=prompt,
                system_instruction=system_instruction,
                output=json.dumps(cached_res, ensure_ascii=False),
                usage_data={"input_tokens": 0, "output_tokens": 0},
                start_time=start_time,
                end_time=end_time,
                trace_or_span=trace_or_span,
                prompt_name=prompt_name,
                prompt_version=prompt_version,
                metadata={**(metadata or {}), "cache_hit": True},
                temperature=temperature,
            )
            return cached_res

    if os.environ.get("LLM_MOCK_MODE") == "true":
        from .llm_mock import get_mock_json_response
        print("[INFO] LLM Mock Mode is ENABLED. Returning mock JSON response.")
        start_time = datetime.datetime.now(datetime.UTC)
        mock_res = get_mock_json_response(prompt, system_instruction)
        end_time = datetime.datetime.now(datetime.UTC)
        mock_out = json.dumps(mock_res, ensure_ascii=False)
        log_generation_to_langfuse(
            model_name="mock-fallback",
            prompt=prompt,
            system_instruction=system_instruction,
            output=mock_out,
            usage_data={"input_tokens": 0, "output_tokens": 0},
            start_time=start_time,
            end_time=end_time,
            trace_or_span=trace_or_span,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            metadata={**(metadata or {}), "mock_mode": True},
            temperature=temperature,
        )
        if cache_enabled and cache_key:
            from .llm_cache import save_cached_json
            save_cached_json(cache_key, mock_res)
        return mock_res

    res = _execute_call_llm_json(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    )

    if cache_enabled and cache_key:
        from .llm_cache import save_cached_json
        save_cached_json(cache_key, res)

    return res


def _execute_call_llm_stream(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
):
    from .llm_mock import get_mock_stream_content, stream_mock_chunks
    from .llm_providers import (
        call_gemini_stream,
        call_local_stream,
        call_openai_stream,
        call_openrouter_stream,
    )

    args = (prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata)

    # 0. Local/Tunnel LLM
    try:
        yield from call_local_stream(*args)
        return
    except Exception:
        pass

    # 1. Gemini
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        try:
            yield from call_gemini_stream(*args)
            return
        except Exception as e:
            print(f"[ERROR] [Stream] Loi khi goi Gemini API: {e}")

    # 2. OpenAI
    if os.environ.get("OPENAI_API_KEY"):
        try:
            yield from call_openai_stream(*args)
            return
        except Exception as e:
            print(f"[ERROR] [Stream] Loi khi goi OpenAI API: {e}")

    # 3. OpenRouter
    if os.environ.get("OPENROUTER_API_KEY"):
        try:
            yield from call_openrouter_stream(*args)
            return
        except Exception:
            pass

    # 4. Fallback: Mock Stream
    print("[WARNING] [Stream] Khong co API key hop le hoac tat ca API deu loi. Dang su dung Mock Stream.")
    start_time = datetime.datetime.now(datetime.UTC)
    combined_mock = get_mock_stream_content()
    yield from stream_mock_chunks(combined_mock)
    end_time = datetime.datetime.now(datetime.UTC)
    log_generation_to_langfuse(
        model_name="mock-fallback-stream",
        prompt=prompt,
        system_instruction=system_instruction,
        output=combined_mock,
        usage_data={"input_tokens": 0, "output_tokens": 0},
        start_time=start_time,
        end_time=end_time,
        trace_or_span=trace_or_span,
        prompt_name=prompt_name,
        prompt_version=prompt_version,
        metadata={**(metadata or {}), "fallback": True},
        temperature=temperature,
    )


def call_llm_stream(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
):
    """Gọi LLM và yield từng token, hỗ trợ Mock Mode và Caching."""
    cache_enabled = os.environ.get("LLM_CACHE_ENABLED", "true") == "true"
    cache_key = None
    if cache_enabled:
        from .llm_cache import get_cache_key, get_cached_stream
        cache_key = get_cache_key(prompt, system_instruction, temperature, "fallback-chain-stream")
        from pathlib import Path
        cache_dir = Path(os.environ.get("LLM_CACHE_DIR", ".llm_cache"))
        if (cache_dir / f"{cache_key}.stream.jsonl").exists():
            print(f"--- [Cache Hit] Returning cached stream for: {cache_key} ---")
            start_time = datetime.datetime.now(datetime.UTC)
            chunks = []
            for chunk in get_cached_stream(cache_key):
                chunks.append(chunk)
                yield chunk
            end_time = datetime.datetime.now(datetime.UTC)
            log_generation_to_langfuse(
                model_name="cached-response-stream",
                prompt=prompt,
                system_instruction=system_instruction,
                output="".join(chunks),
                usage_data={"input_tokens": 0, "output_tokens": 0},
                start_time=start_time,
                end_time=end_time,
                trace_or_span=trace_or_span,
                prompt_name=prompt_name,
                prompt_version=prompt_version,
                metadata={**(metadata or {}), "cache_hit": True},
                temperature=temperature,
            )
            return

    if os.environ.get("LLM_MOCK_MODE") == "true":
        from .llm_mock import get_mock_stream_content, stream_mock_chunks
        print("[INFO] LLM Mock Mode is ENABLED. Returning mock stream.")
        start_time = datetime.datetime.now(datetime.UTC)
        combined_mock = get_mock_stream_content()
        chunks = []
        for chunk in stream_mock_chunks(combined_mock):
            chunks.append(chunk)
            yield chunk
        end_time = datetime.datetime.now(datetime.UTC)
        log_generation_to_langfuse(
            model_name="mock-fallback-stream",
            prompt=prompt,
            system_instruction=system_instruction,
            output=combined_mock,
            usage_data={"input_tokens": 0, "output_tokens": 0},
            start_time=start_time,
            end_time=end_time,
            trace_or_span=trace_or_span,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            metadata={**(metadata or {}), "mock_mode": True},
            temperature=temperature,
        )
        if cache_enabled and cache_key and chunks:
            from .llm_cache import save_cached_stream
            save_cached_stream(cache_key, chunks)
        return

    chunks = []
    for chunk in _execute_call_llm_stream(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    ):
        chunks.append(chunk)
        yield chunk

    if cache_enabled and cache_key and chunks:
        from .llm_cache import save_cached_stream
        save_cached_stream(cache_key, chunks)


async def _execute_async_call_llm_json(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
) -> dict:
    from .llm_providers import (
        async_call_gemini_json,
        async_call_local_json,
        async_call_openai_json,
        async_call_openrouter_json,
    )

    args = (prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata)

    # 0. Local/Tunnel LLM
    try:
        return await async_call_local_json(*args)
    except Exception:
        pass

    # 1. Gemini
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        try:
            return await async_call_gemini_json(*args)
        except Exception as e:
            print(f"[ERROR] [Async] Loi khi goi Gemini API: {e}")

    # 2. OpenAI
    if os.environ.get("OPENAI_API_KEY"):
        try:
            return await async_call_openai_json(*args)
        except Exception as e:
            print(f"[ERROR] [Async] Loi khi goi OpenAI API: {e}")

    # 3. OpenRouter
    if os.environ.get("OPENROUTER_API_KEY"):
        try:
            return await async_call_openrouter_json(*args)
        except Exception:
            pass

    # 4. Fallback: use sync call_llm_json (which has its own mock fallback)
    print("[WARNING] [Async] Su dung Mock Data fallback...")
    return call_llm_json(prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata)


async def async_call_llm_json(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
) -> dict:
    """Gọi LLM bất đồng bộ hỗ trợ định dạng JSON trả về, tích hợp Mock Mode và Caching."""
    cache_enabled = os.environ.get("LLM_CACHE_ENABLED", "true") == "true"
    cache_key = None
    if cache_enabled:
        from .llm_cache import get_cache_key, get_cached_json
        cache_key = get_cache_key(prompt, system_instruction, temperature, "fallback-chain-async")
        cached_res = get_cached_json(cache_key)
        if cached_res is not None:
            print(f"--- [Cache Hit] Returning cached async JSON for: {cache_key} ---")
            start_time = datetime.datetime.now(datetime.UTC)
            end_time = datetime.datetime.now(datetime.UTC)
            log_generation_to_langfuse(
                model_name="cached-response-async",
                prompt=prompt,
                system_instruction=system_instruction,
                output=json.dumps(cached_res, ensure_ascii=False),
                usage_data={"input_tokens": 0, "output_tokens": 0},
                start_time=start_time,
                end_time=end_time,
                trace_or_span=trace_or_span,
                prompt_name=prompt_name,
                prompt_version=prompt_version,
                metadata={**(metadata or {}), "cache_hit": True},
                temperature=temperature,
            )
            return cached_res

    if os.environ.get("LLM_MOCK_MODE") == "true":
        from .llm_mock import get_mock_json_response
        print("[INFO] LLM Mock Mode is ENABLED. Returning mock JSON.")
        start_time = datetime.datetime.now(datetime.UTC)
        mock_res = get_mock_json_response(prompt, system_instruction)
        end_time = datetime.datetime.now(datetime.UTC)
        mock_out = json.dumps(mock_res, ensure_ascii=False)
        log_generation_to_langfuse(
            model_name="mock-fallback",
            prompt=prompt,
            system_instruction=system_instruction,
            output=mock_out,
            usage_data={"input_tokens": 0, "output_tokens": 0},
            start_time=start_time,
            end_time=end_time,
            trace_or_span=trace_or_span,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            metadata={**(metadata or {}), "mock_mode": True},
            temperature=temperature,
        )
        if cache_enabled and cache_key:
            from .llm_cache import save_cached_json
            save_cached_json(cache_key, mock_res)
        return mock_res

    res = await _execute_async_call_llm_json(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    )

    if cache_enabled and cache_key:
        from .llm_cache import save_cached_json
        save_cached_json(cache_key, res)

    return res


async def _execute_async_call_llm_stream(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
):
    from .llm_providers import (
        async_call_gemini_stream,
        async_call_local_stream,
        async_call_openai_stream,
        async_call_openrouter_stream,
    )

    args = (prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata)

    # 0. Local/Tunnel LLM
    try:
        async for token in async_call_local_stream(*args):
            yield token
        return
    except Exception:
        pass

    # 1. Gemini
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        try:
            async for token in async_call_gemini_stream(*args):
                yield token
            return
        except Exception as e:
            print(f"[ERROR] [AsyncStream] Loi Gemini: {e}")

    # 2. OpenAI
    if os.environ.get("OPENAI_API_KEY"):
        try:
            async for token in async_call_openai_stream(*args):
                yield token
            return
        except Exception as e:
            print(f"[ERROR] [AsyncStream] Loi OpenAI: {e}")

    # 3. OpenRouter
    if os.environ.get("OPENROUTER_API_KEY"):
        try:
            async for token in async_call_openrouter_stream(*args):
                yield token
            return
        except Exception:
            pass

    # 4. Fallback: sync mock stream
    print("[WARNING] [AsyncStream] Su dung Mock Stream fallback...")
    for token in call_llm_stream(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    ):
        yield token


async def async_call_llm_stream(
    prompt,
    system_instruction: str = None,
    temperature: float = 0.2,
    trace_or_span=None,
    prompt_name: str = None,
    prompt_version: str = None,
    metadata: dict = None,
):
    """Gọi LLM bất đồng bộ và yield từng token, hỗ trợ Mock Mode và Caching."""
    cache_enabled = os.environ.get("LLM_CACHE_ENABLED", "true") == "true"
    cache_key = None
    if cache_enabled:
        from .llm_cache import get_cache_key, async_get_cached_stream
        cache_key = get_cache_key(prompt, system_instruction, temperature, "fallback-chain-async-stream")
        from pathlib import Path
        cache_dir = Path(os.environ.get("LLM_CACHE_DIR", ".llm_cache"))
        if (cache_dir / f"{cache_key}.stream.jsonl").exists():
            print(f"--- [Cache Hit] Returning cached async stream for: {cache_key} ---")
            start_time = datetime.datetime.now(datetime.UTC)
            chunks = []
            async for chunk in async_get_cached_stream(cache_key):
                chunks.append(chunk)
                yield chunk
            end_time = datetime.datetime.now(datetime.UTC)
            log_generation_to_langfuse(
                model_name="cached-response-async-stream",
                prompt=prompt,
                system_instruction=system_instruction,
                output="".join(chunks),
                usage_data={"input_tokens": 0, "output_tokens": 0},
                start_time=start_time,
                end_time=end_time,
                trace_or_span=trace_or_span,
                prompt_name=prompt_name,
                prompt_version=prompt_version,
                metadata={**(metadata or {}), "cache_hit": True},
                temperature=temperature,
            )
            return

    if os.environ.get("LLM_MOCK_MODE") == "true":
        from .llm_mock import get_mock_stream_content, stream_mock_chunks
        print("[INFO] LLM Mock Mode is ENABLED. Returning async mock stream.")
        start_time = datetime.datetime.now(datetime.UTC)
        combined_mock = get_mock_stream_content()
        chunks = []
        for chunk in stream_mock_chunks(combined_mock):
            chunks.append(chunk)
            yield chunk
        end_time = datetime.datetime.now(datetime.UTC)
        log_generation_to_langfuse(
            model_name="mock-fallback-stream",
            prompt=prompt,
            system_instruction=system_instruction,
            output=combined_mock,
            usage_data={"input_tokens": 0, "output_tokens": 0},
            start_time=start_time,
            end_time=end_time,
            trace_or_span=trace_or_span,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            metadata={**(metadata or {}), "mock_mode": True},
            temperature=temperature,
        )
        if cache_enabled and cache_key and chunks:
            from .llm_cache import save_cached_stream
            save_cached_stream(cache_key, chunks)
        return

    chunks = []
    async for chunk in _execute_async_call_llm_stream(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    ):
        chunks.append(chunk)
        yield chunk

    if cache_enabled and cache_key and chunks:
        from .llm_cache import save_cached_stream
        save_cached_stream(cache_key, chunks)

