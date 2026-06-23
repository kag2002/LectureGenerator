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

Provider-specific implementations are in providers.py.
Mock fallback data is in mock.py.
"""

import datetime
import json
import os

from .shared import (
    log_generation_to_langfuse,
)

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
    from .mock import get_mock_json_response
    from .providers import (
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
        from .cache import get_cache_key, get_cached_json

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
        from .mock import get_mock_json_response

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
            from .cache import save_cached_json

            save_cached_json(cache_key, mock_res)
        return mock_res

    res = _execute_call_llm_json(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    )

    if cache_enabled and cache_key:
        from .cache import save_cached_json

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
    from .mock import get_mock_stream_content, stream_mock_chunks
    from .providers import (
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
        from .cache import get_cache_key, get_cached_stream

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
        from .mock import get_mock_stream_content, stream_mock_chunks

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
            from .cache import save_cached_stream

            save_cached_stream(cache_key, chunks)
        return

    chunks = []
    for chunk in _execute_call_llm_stream(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    ):
        chunks.append(chunk)
        yield chunk

    if cache_enabled and cache_key and chunks:
        from .cache import save_cached_stream

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
    from .providers import (
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
        from .cache import get_cache_key, get_cached_json

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
        from .mock import get_mock_json_response

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
            from .cache import save_cached_json

            save_cached_json(cache_key, mock_res)
        return mock_res

    res = await _execute_async_call_llm_json(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    )

    if cache_enabled and cache_key:
        from .cache import save_cached_json

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
    from .providers import (
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
        from .cache import async_get_cached_stream, get_cache_key

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
        from .mock import get_mock_stream_content, stream_mock_chunks

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
            from .cache import save_cached_stream

            save_cached_stream(cache_key, chunks)
        return

    chunks = []
    async for chunk in _execute_async_call_llm_stream(
        prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
    ):
        chunks.append(chunk)
        yield chunk

    if cache_enabled and cache_key and chunks:
        from .cache import save_cached_stream

        save_cached_stream(cache_key, chunks)
