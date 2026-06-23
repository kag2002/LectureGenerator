"""
LLM Provider modules — each provider's call logic extracted from llm_client.py.

This module contains individual provider call functions for:
- Local/Tunnel LLM (e.g., Qwen2.5-14B via llama.cpp)
- Google Gemini (gemini-2.5-flash)
- OpenAI (gpt-4o-mini)
- OpenRouter (free models rotation)

Each function handles its own error handling and returns results or raises Exception.
Telemetry logging is done via log_generation_to_langfuse imported from llm_client.
"""

import asyncio
import datetime
import os

from google import genai
from google.genai import types
from openai import AsyncOpenAI, OpenAI

from .shared import (
    FREE_MODELS,
    format_gemini_contents,
    format_openai_messages,
    get_local_llm_config,
    log_generation_to_langfuse,
    robust_parse_json,
)


def _get_gemini_api_keys() -> list[str]:
    keys_str = os.environ.get("GEMINI_API_KEYS", "")
    keys = [k.strip() for k in keys_str.split(",") if k.strip()]
    single_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if single_key and single_key not in keys:
        keys.insert(0, single_key)
    return keys


def _get_local_llm_timeout() -> float:
    try:
        return float(os.environ.get("LLM_LOCAL_TIMEOUT", "30.0"))
    except ValueError:
        return 30.0


# ═══════════════════════════════════════════════════════════════════════
# Common helper: extract usage from OpenAI-compatible response
# ═══════════════════════════════════════════════════════════════════════


def _extract_openai_usage(response, prompt) -> dict:
    """Extract token usage from an OpenAI-compatible response object."""
    if response.usage:
        return {
            "input_tokens": response.usage.prompt_tokens,
            "output_tokens": response.usage.completion_tokens,
        }
    content = response.choices[0].message.content if response.choices else ""
    return {
        "input_tokens": len(str(prompt)) // 4,
        "output_tokens": len(content) // 4,
    }


def _extract_gemini_usage(response, prompt) -> dict:
    """Extract token usage from a Gemini response object."""
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        return {
            "input_tokens": response.usage_metadata.prompt_token_count,
            "output_tokens": response.usage_metadata.candidates_token_count,
        }
    return {
        "input_tokens": len(str(prompt)) // 4,
        "output_tokens": len(response.text) // 4,
    }


def _log_and_return(
    model_name,
    prompt,
    system_instruction,
    content,
    usage,
    start_time,
    end_time,
    trace_or_span,
    prompt_name,
    prompt_version,
    metadata,
    temperature,
    extra_meta=None,
):
    """Helper: log to Langfuse and return parsed result."""
    combined_meta = {**(metadata or {}), **(extra_meta or {})}
    log_generation_to_langfuse(
        model_name=model_name,
        prompt=prompt,
        system_instruction=system_instruction,
        output=content,
        usage_data=usage,
        start_time=start_time,
        end_time=end_time,
        trace_or_span=trace_or_span,
        prompt_name=prompt_name,
        prompt_version=prompt_version,
        metadata=combined_meta,
        temperature=temperature,
    )


# ═══════════════════════════════════════════════════════════════════════
# JSON providers (sync)
# ═══════════════════════════════════════════════════════════════════════


def call_local_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Call Local/Tunnel LLM and return parsed JSON dict."""
    if os.environ.get("DISABLE_LOCAL_LLM") == "true":
        raise RuntimeError("Local LLM is disabled by configuration")
    local_urls, local_model, local_api_key = get_local_llm_config()
    messages = format_openai_messages(prompt, system_instruction)
    local_timeout = _get_local_llm_timeout()

    for base_url in local_urls:
        try:
            print(f"[INFO] Dang thu goi Local/Tunnel LLM: {base_url} voi model {local_model}...")
            client = OpenAI(base_url=base_url, api_key=local_api_key, timeout=local_timeout)
            start_time = datetime.datetime.now(datetime.UTC)

            try:
                response = client.chat.completions.create(
                    model=local_model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                    timeout=local_timeout,
                )
            except Exception as format_err:
                fmt_msg = str(format_err).lower()
                if "400" in fmt_msg or "format" in fmt_msg or "bad request" in fmt_msg:
                    print("[INFO] Local LLM khong ho tro JSON mode. Thu lai khong co response_format...")
                    retry_messages = messages + [
                        {
                            "role": "user",
                            "content": "IMPORTANT: Return ONLY a valid JSON object. Do not include markdown formatting or explanation.",
                        }
                    ]
                    response = client.chat.completions.create(
                        model=local_model,
                        messages=retry_messages,
                        temperature=temperature,
                        timeout=local_timeout,
                    )
                else:
                    raise format_err

            end_time = datetime.datetime.now(datetime.UTC)
            content = response.choices[0].message.content
            res_dict = robust_parse_json(content)
            usage = _extract_openai_usage(response, prompt)
            _log_and_return(
                local_model,
                prompt,
                system_instruction,
                content,
                usage,
                start_time,
                end_time,
                trace_or_span,
                prompt_name,
                prompt_version,
                metadata,
                temperature,
                extra_meta={"local_endpoint": base_url},
            )
            print(f"[SUCCESS] Goi Local/Tunnel LLM thanh cong qua {base_url}!")
            return res_dict
        except Exception as e:
            print(f"[WARNING] Loi khi goi Local/Tunnel LLM ({base_url}): {e}")
    raise RuntimeError("All local LLM endpoints failed")


def call_gemini_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Call Google Gemini API with automatic model rotation and API key pool fallback to bypass daily limits."""
    api_keys = _get_gemini_api_keys()
    if not api_keys:
        raise RuntimeError("No Gemini API keys available")

    config = types.GenerateContentConfig(response_mime_type="application/json", temperature=temperature)
    if system_instruction:
        config.system_instruction = system_instruction

    gemini_contents = format_gemini_contents(prompt)

    models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"]

    import time

    last_err = None
    response = None
    res_dict = None
    chosen_model = None
    chosen_key = None
    start_time = None

    for api_key in api_keys:
        masked_key = api_key[:6] + "..." + api_key[-4:] if len(api_key) > 10 else "..."
        print(f"[INFO] Dang thu goi Gemini API voi key {masked_key}...")
        client = genai.Client(api_key=api_key)

        for model_name in models_to_try:
            chosen_model = model_name
            chosen_key = api_key
            success = False
            for attempt in range(2):
                try:
                    start_time = datetime.datetime.now(datetime.UTC)
                    response = client.models.generate_content(model=model_name, contents=gemini_contents, config=config)
                    res_dict = robust_parse_json(response.text)
                    success = True
                    break
                except Exception as e:
                    last_err = e
                    err_msg = str(e)
                    is_quota = "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg
                    is_json_err = isinstance(e, ValueError) and "parse json" in err_msg.lower()

                    if is_quota:
                        print(f"[WARNING] Key {masked_key} bi het quota hoac rate limit. Dang xoay key tiep theo...")
                        break

                    if "not found" in err_msg.lower() or "404" in err_msg:
                        print(
                            f"[WARNING] Model {model_name} khong kha dung cho key {masked_key}. Chuyen model tiep theo..."
                        )
                        break

                    if attempt < 1 and is_json_err:
                        print(
                            f"[WARNING] Model {model_name} tra ve JSON loi (attempt {attempt + 1}): {e}. Thu lai sau 2s..."
                        )
                        time.sleep(2.0)
                        continue
                    else:
                        break
            if success:
                break
        if res_dict is not None:
            break

    if res_dict is None:
        raise last_err or RuntimeError("All Gemini API keys and models failed")

    end_time = datetime.datetime.now(datetime.UTC)
    usage = _extract_gemini_usage(response, prompt)
    _log_and_return(
        chosen_model,
        prompt,
        system_instruction,
        response.text,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
        extra_meta={"gemini_key_used": chosen_key[:6] + "..."},
    )
    return res_dict


def call_openai_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Call OpenAI GPT-4o-mini and return parsed JSON dict."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenAI API key available")

    print("[INFO] Dang thu goi OpenAI API truc tiep...")
    client = OpenAI(api_key=api_key)
    messages = format_openai_messages(prompt, system_instruction)
    start_time = datetime.datetime.now(datetime.UTC)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=temperature,
        timeout=8.0,
    )
    end_time = datetime.datetime.now(datetime.UTC)
    content = response.choices[0].message.content
    res_dict = robust_parse_json(content)
    usage = _extract_openai_usage(response, prompt)
    _log_and_return(
        "gpt-4o-mini",
        prompt,
        system_instruction,
        content,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
    )
    return res_dict


def call_openrouter_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Call OpenRouter with free model rotation and return parsed JSON dict."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenRouter API key available")

    messages = format_openai_messages(prompt, system_instruction)
    extra_headers = {
        "HTTP-Referer": "https://github.com/kag2002/C2-App-023",
        "X-Title": "AI Lecture Assistant",
    }

    for model_name in FREE_MODELS:
        try:
            print(f"[INFO] Thu goi model OpenRouter: {model_name}...")
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
                timeout=8.0,
            )
            start_time = datetime.datetime.now(datetime.UTC)

            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                    timeout=8.0,
                    extra_headers=extra_headers,
                )
                end_time = datetime.datetime.now(datetime.UTC)
                content = response.choices[0].message.content
                res_dict = robust_parse_json(content)
                usage = _extract_openai_usage(response, prompt)
                _log_and_return(
                    model_name,
                    prompt,
                    system_instruction,
                    content,
                    usage,
                    start_time,
                    end_time,
                    trace_or_span,
                    prompt_name,
                    prompt_version,
                    metadata,
                    temperature,
                )
                return res_dict
            except Exception as e:
                error_msg = str(e).lower()
                status_code = getattr(e, "status_code", None)
                if hasattr(e, "response") and e.response is not None:
                    status_code = getattr(e.response, "status_code", status_code)

                if status_code == 429 or "429" in error_msg or "too many requests" in error_msg:
                    print(f"[WARNING] Model {model_name} bi rate limit (429). Chuyen model tiep theo.")
                    continue
                elif (
                    status_code == 402 or "402" in error_msg or "payment required" in error_msg or "credit" in error_msg
                ):
                    print(f"[WARNING] Model {model_name} out of quota (402). Chuyen model tiep theo.")
                    continue
                elif status_code == 401 or "401" in error_msg or "unauthorized" in error_msg:
                    print("[ERROR] Sai API Key OpenRouter (401). Huy xoay tua.")
                    break

                is_bad_request = (
                    status_code == 400
                    or "400" in error_msg
                    or "bad request" in error_msg
                    or "response_format" in error_msg
                )
                if is_bad_request:
                    print(f"[INFO] Model {model_name} khong ho tro JSON mode. Thu lai...")
                    try:
                        retry_messages = messages + [
                            {
                                "role": "user",
                                "content": "IMPORTANT: Return ONLY a valid JSON object. Do not include markdown formatting or explanation.",
                            }
                        ]
                        start_time = datetime.datetime.now(datetime.UTC)
                        response = client.chat.completions.create(
                            model=model_name,
                            messages=retry_messages,
                            temperature=temperature,
                            timeout=8.0,
                            extra_headers=extra_headers,
                        )
                        end_time = datetime.datetime.now(datetime.UTC)
                        content = response.choices[0].message.content
                        res_dict = robust_parse_json(content)
                        usage = _extract_openai_usage(response, prompt)
                        _log_and_return(
                            model_name,
                            prompt,
                            system_instruction,
                            content,
                            usage,
                            start_time,
                            end_time,
                            trace_or_span,
                            prompt_name,
                            prompt_version,
                            metadata,
                            temperature,
                        )
                        return res_dict
                    except Exception as retry_err:
                        print(f"[ERROR] Retry {model_name} that bai: {retry_err}. Chuyen model tiep theo.")
                        continue
                else:
                    print(f"[ERROR] Loi khong xac dinh voi {model_name}: {e}. Chuyen model tiep theo.")
                    continue
        except Exception as e:
            print(f"[ERROR] Loi khoi tao/ket noi {model_name}: {e}")
            continue

    raise RuntimeError("All OpenRouter models failed")


# ═══════════════════════════════════════════════════════════════════════
# Stream providers (sync)
# ═══════════════════════════════════════════════════════════════════════


def call_local_stream(prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata):
    """Call Local/Tunnel LLM and yield tokens."""
    if os.environ.get("DISABLE_LOCAL_LLM") == "true":
        raise RuntimeError("Local LLM is disabled by configuration")
    local_urls, local_model, local_api_key = get_local_llm_config()
    messages = format_openai_messages(prompt, system_instruction)
    local_timeout = _get_local_llm_timeout()

    for base_url in local_urls:
        try:
            print(f"[INFO] [Stream] Dang thu goi Local/Tunnel LLM: {base_url}...")
            client = OpenAI(base_url=base_url, api_key=local_api_key, timeout=local_timeout)
            start_time = datetime.datetime.now(datetime.UTC)
            response = client.chat.completions.create(
                model=local_model,
                messages=messages,
                stream=True,
                temperature=temperature,
                timeout=local_timeout,
            )

            accumulated_text = ""
            for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    accumulated_text += token
                    yield token

            end_time = datetime.datetime.now(datetime.UTC)
            usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
            _log_and_return(
                local_model,
                prompt,
                system_instruction,
                accumulated_text,
                usage,
                start_time,
                end_time,
                trace_or_span,
                prompt_name,
                prompt_version,
                metadata,
                temperature,
                extra_meta={"local_endpoint": base_url},
            )
            print(f"[SUCCESS] [Stream] Goi Local/Tunnel LLM thanh cong qua {base_url}!")
            return
        except Exception as e:
            print(f"[WARNING] [Stream] Loi Local/Tunnel LLM ({base_url}): {e}")
    raise RuntimeError("All local LLM stream endpoints failed")


def call_gemini_stream(prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata):
    """Call Google Gemini API and yield tokens with key rotation."""
    api_keys = _get_gemini_api_keys()
    if not api_keys:
        raise RuntimeError("No Gemini API keys available")

    config = types.GenerateContentConfig(temperature=temperature)
    if system_instruction:
        config.system_instruction = system_instruction

    gemini_contents = format_gemini_contents(prompt)

    models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"]

    last_err = None
    stream_started = False
    chosen_model = None
    chosen_key = None
    accumulated_text = ""
    start_time = None

    for api_key in api_keys:
        masked_key = api_key[:6] + "..." + api_key[-4:] if len(api_key) > 10 else "..."
        client = genai.Client(api_key=api_key)

        for model_name in models_to_try:
            chosen_model = model_name
            chosen_key = api_key
            try:
                print(f"[INFO] [Stream] Dang thu goi Gemini API model {model_name} voi key {masked_key}...")
                start_time = datetime.datetime.now(datetime.UTC)
                response = client.models.generate_content_stream(
                    model=model_name, contents=gemini_contents, config=config
                )

                for chunk in response:
                    if chunk.text:
                        accumulated_text += chunk.text
                        yield chunk.text
                stream_started = True
                break
            except Exception as e:
                last_err = e
                err_msg = str(e)
                is_quota = "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg
                if is_quota:
                    print(f"[WARNING] [Stream] Key {masked_key} bi rate limit/het quota. Chuyen key...")
                    break
                if "not found" in err_msg.lower() or "404" in err_msg:
                    print(f"[WARNING] [Stream] Model {model_name} khong kha dung cho key {masked_key}.")
                    continue
                print(f"[WARNING] [Stream] Gap loi {e} tren key {masked_key}. Chuyen model/key...")
                break
        if stream_started:
            break

    if not stream_started:
        raise last_err or RuntimeError("All Gemini stream calls failed")

    end_time = datetime.datetime.now(datetime.UTC)
    usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
    _log_and_return(
        chosen_model,
        prompt,
        system_instruction,
        accumulated_text,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
        extra_meta={"gemini_key_used": chosen_key[:6] + "..."},
    )


def call_openai_stream(prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata):
    """Call OpenAI GPT-4o-mini and yield tokens."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenAI API key available")

    print("[INFO] [Stream] Dang thu goi OpenAI API truc tiep...")
    client = OpenAI(api_key=api_key)
    messages = format_openai_messages(prompt, system_instruction)
    start_time = datetime.datetime.now(datetime.UTC)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        stream=True,
        temperature=temperature,
    )

    accumulated_text = ""
    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            token = chunk.choices[0].delta.content
            accumulated_text += token
            yield token

    end_time = datetime.datetime.now(datetime.UTC)
    usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
    _log_and_return(
        "gpt-4o-mini",
        prompt,
        system_instruction,
        accumulated_text,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
    )


def call_openrouter_stream(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
):
    """Call OpenRouter with free model rotation and yield tokens."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenRouter API key available")

    messages = format_openai_messages(prompt, system_instruction)
    extra_headers = {
        "HTTP-Referer": "https://github.com/kag2002/C2-App-023",
        "X-Title": "AI Lecture Assistant",
    }

    for model_name in FREE_MODELS:
        try:
            print(f"[INFO] [Stream] Thu goi model OpenRouter: {model_name}...")
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
            )
            start_time = datetime.datetime.now(datetime.UTC)
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True,
                temperature=temperature,
                extra_headers=extra_headers,
            )

            accumulated_text = ""
            for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    accumulated_text += token
                    yield token

            end_time = datetime.datetime.now(datetime.UTC)
            usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
            _log_and_return(
                model_name,
                prompt,
                system_instruction,
                accumulated_text,
                usage,
                start_time,
                end_time,
                trace_or_span,
                prompt_name,
                prompt_version,
                metadata,
                temperature,
            )
            return
        except Exception as e:
            print(f"[WARNING] [Stream] Loi model {model_name}: {e}. Chuyen model tiep theo.")
            continue
    raise RuntimeError("All OpenRouter stream models failed")


# ═══════════════════════════════════════════════════════════════════════
# JSON providers (async)
# ═══════════════════════════════════════════════════════════════════════


async def async_call_local_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Async call Local/Tunnel LLM and return parsed JSON dict."""
    if os.environ.get("DISABLE_LOCAL_LLM") == "true":
        raise RuntimeError("Local LLM is disabled by configuration")
    local_urls, local_model, local_api_key = get_local_llm_config()
    messages = format_openai_messages(prompt, system_instruction)
    local_timeout = _get_local_llm_timeout()

    for base_url in local_urls:
        try:
            print(f"[INFO] [Async] Dang thu goi Local/Tunnel LLM: {base_url} voi model {local_model}...")
            client = AsyncOpenAI(base_url=base_url, api_key=local_api_key, timeout=local_timeout)
            start_time = datetime.datetime.now(datetime.UTC)

            try:
                response = await client.chat.completions.create(
                    model=local_model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                    timeout=local_timeout,
                )
            except Exception as format_err:
                fmt_msg = str(format_err).lower()
                if "400" in fmt_msg or "format" in fmt_msg or "bad request" in fmt_msg:
                    print("[INFO] [Async] Local LLM khong ho tro JSON mode. Thu lai...")
                    retry_messages = messages + [
                        {
                            "role": "user",
                            "content": "IMPORTANT: Return ONLY a valid JSON object. Do not include markdown formatting or explanation.",
                        }
                    ]
                    response = await client.chat.completions.create(
                        model=local_model,
                        messages=retry_messages,
                        temperature=temperature,
                        timeout=local_timeout,
                    )
                else:
                    raise format_err

            end_time = datetime.datetime.now(datetime.UTC)
            content = response.choices[0].message.content
            res_dict = robust_parse_json(content)
            usage = _extract_openai_usage(response, prompt)
            _log_and_return(
                local_model,
                prompt,
                system_instruction,
                content,
                usage,
                start_time,
                end_time,
                trace_or_span,
                prompt_name,
                prompt_version,
                metadata,
                temperature,
                extra_meta={"local_endpoint": base_url, "async": True},
            )
            print(f"[SUCCESS] [Async] Goi Local/Tunnel LLM thanh cong qua {base_url}!")
            return res_dict
        except Exception as e:
            print(f"[WARNING] [Async] Loi Local/Tunnel LLM ({base_url}): {e}")
    raise RuntimeError("All local async LLM endpoints failed")


async def async_call_gemini_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Async call Google Gemini API by running the synchronous call in a thread.
    This prevents async HTTP client hangs in Windows environments.
    """
    print("[INFO] [Async -> Sync Thread] Chuyen tiep cuoc goi Gemini qua thread dong bo de tranh loi treo cuoc goi...")
    return await asyncio.to_thread(
        call_gemini_json,
        prompt,
        system_instruction,
        temperature,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
    )


async def async_call_openai_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Async call OpenAI GPT-4o-mini and return parsed JSON dict."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenAI API key available")

    print("[INFO] [Async] Dang thu goi OpenAI API truc tiep...")
    client = AsyncOpenAI(api_key=api_key)
    messages = format_openai_messages(prompt, system_instruction)
    start_time = datetime.datetime.now(datetime.UTC)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=temperature,
        timeout=8.0,
    )
    end_time = datetime.datetime.now(datetime.UTC)
    content = response.choices[0].message.content
    res_dict = robust_parse_json(content)
    usage = _extract_openai_usage(response, prompt)
    _log_and_return(
        "gpt-4o-mini",
        prompt,
        system_instruction,
        content,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
        extra_meta={"async": True},
    )
    return res_dict


async def async_call_openrouter_json(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
) -> dict:
    """Async call OpenRouter with free model rotation and return parsed JSON dict."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenRouter API key available")

    messages = format_openai_messages(prompt, system_instruction)
    extra_headers = {
        "HTTP-Referer": "https://github.com/kag2002/C2-App-023",
        "X-Title": "AI Lecture Assistant",
    }

    for model_name in FREE_MODELS:
        try:
            print(f"[INFO] [Async] Thu goi model OpenRouter: {model_name}...")
            client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
                timeout=8.0,
            )
            start_time = datetime.datetime.now(datetime.UTC)

            try:
                response = await client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                    timeout=8.0,
                    extra_headers=extra_headers,
                )
                end_time = datetime.datetime.now(datetime.UTC)
                content = response.choices[0].message.content
                res_dict = robust_parse_json(content)
                usage = _extract_openai_usage(response, prompt)
                _log_and_return(
                    model_name,
                    prompt,
                    system_instruction,
                    content,
                    usage,
                    start_time,
                    end_time,
                    trace_or_span,
                    prompt_name,
                    prompt_version,
                    metadata,
                    temperature,
                    extra_meta={"async": True},
                )
                return res_dict
            except Exception as e:
                error_msg = str(e).lower()
                status_code = getattr(e, "status_code", None)
                if hasattr(e, "response") and e.response is not None:
                    status_code = getattr(e.response, "status_code", status_code)

                if (
                    status_code in (429, 402)
                    or "429" in error_msg
                    or "too many requests" in error_msg
                    or "payment required" in error_msg
                ):
                    continue
                elif status_code == 401 or "401" in error_msg:
                    break

                is_bad_request = status_code == 400 or "400" in error_msg or "bad request" in error_msg
                if is_bad_request:
                    retry_messages = messages + [
                        {
                            "role": "user",
                            "content": "IMPORTANT: Return ONLY a valid JSON object. Do not include markdown formatting or explanation.",
                        }
                    ]
                    start_time = datetime.datetime.now(datetime.UTC)
                    response = await client.chat.completions.create(
                        model=model_name,
                        messages=retry_messages,
                        temperature=temperature,
                        timeout=8.0,
                        extra_headers=extra_headers,
                    )
                    end_time = datetime.datetime.now(datetime.UTC)
                    content = response.choices[0].message.content
                    res_dict = robust_parse_json(content)
                    usage = _extract_openai_usage(response, prompt)
                    _log_and_return(
                        model_name,
                        prompt,
                        system_instruction,
                        content,
                        usage,
                        start_time,
                        end_time,
                        trace_or_span,
                        prompt_name,
                        prompt_version,
                        metadata,
                        temperature,
                        extra_meta={"async": True},
                    )
                    return res_dict
                else:
                    continue
        except Exception as e:
            print(f"[ERROR] [Async] Loi ket noi model {model_name}: {e}")
            continue

    raise RuntimeError("All async OpenRouter models failed")


# ═══════════════════════════════════════════════════════════════════════
# Stream providers (async)
# ═══════════════════════════════════════════════════════════════════════


async def async_call_local_stream(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
):
    """Async call Local/Tunnel LLM and yield tokens."""
    if os.environ.get("DISABLE_LOCAL_LLM") == "true":
        raise RuntimeError("Local LLM is disabled by configuration")
    local_urls, local_model, local_api_key = get_local_llm_config()
    messages = format_openai_messages(prompt, system_instruction)
    local_timeout = _get_local_llm_timeout()

    for base_url in local_urls:
        try:
            print(f"[INFO] [AsyncStream] Dang thu goi Local/Tunnel LLM: {base_url}...")
            client = AsyncOpenAI(base_url=base_url, api_key=local_api_key, timeout=local_timeout)
            start_time = datetime.datetime.now(datetime.UTC)
            response = await client.chat.completions.create(
                model=local_model,
                messages=messages,
                stream=True,
                temperature=temperature,
                timeout=local_timeout,
            )

            accumulated_text = ""
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    accumulated_text += token
                    yield token

            end_time = datetime.datetime.now(datetime.UTC)
            usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
            _log_and_return(
                local_model,
                prompt,
                system_instruction,
                accumulated_text,
                usage,
                start_time,
                end_time,
                trace_or_span,
                prompt_name,
                prompt_version,
                metadata,
                temperature,
                extra_meta={"local_endpoint": base_url, "async": True},
            )
            print(f"[SUCCESS] [AsyncStream] Goi Local LLM thanh cong qua {base_url}!")
            return
        except Exception as e:
            print(f"[WARNING] [AsyncStream] Loi Local LLM ({base_url}): {e}")
    raise RuntimeError("All async local LLM stream endpoints failed")


async def async_call_gemini_stream(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
):
    """Async call Google Gemini API and yield tokens with key rotation."""
    api_keys = _get_gemini_api_keys()
    if not api_keys:
        raise RuntimeError("No Gemini API keys available")

    config = types.GenerateContentConfig(temperature=temperature)
    if system_instruction:
        config.system_instruction = system_instruction

    gemini_contents = format_gemini_contents(prompt)

    models_to_try = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"]

    last_err = None
    stream_started = False
    chosen_model = None
    chosen_key = None
    accumulated_text = ""
    start_time = None

    for api_key in api_keys:
        masked_key = api_key[:6] + "..." + api_key[-4:] if len(api_key) > 10 else "..."
        client = genai.Client(api_key=api_key)

        for model_name in models_to_try:
            chosen_model = model_name
            chosen_key = api_key
            try:
                print(f"[INFO] [AsyncStream] Dang thu goi Gemini API model {model_name} voi key {masked_key}...")
                start_time = datetime.datetime.now(datetime.UTC)
                response = await client.aio.models.generate_content_stream(
                    model=model_name, contents=gemini_contents, config=config
                )

                async for chunk in response:
                    if chunk.text:
                        accumulated_text += chunk.text
                        yield chunk.text
                stream_started = True
                break
            except Exception as e:
                last_err = e
                err_msg = str(e)
                is_quota = "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg
                if is_quota:
                    print(f"[WARNING] [AsyncStream] Key {masked_key} bi rate limit/het quota. Chuyen key...")
                    break
                if "not found" in err_msg.lower() or "404" in err_msg:
                    print(f"[WARNING] [AsyncStream] Model {model_name} khong kha dung cho key {masked_key}.")
                    continue
                print(f"[WARNING] [AsyncStream] Gap loi {e} tren key {masked_key}. Chuyen model/key...")
                break
        if stream_started:
            break

    if not stream_started:
        raise last_err or RuntimeError("All async Gemini stream calls failed")

    end_time = datetime.datetime.now(datetime.UTC)
    usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
    _log_and_return(
        chosen_model,
        prompt,
        system_instruction,
        accumulated_text,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
        extra_meta={"gemini_key_used": chosen_key[:6] + "...", "async": True, "stream": True},
    )


async def async_call_openai_stream(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
):
    """Async call OpenAI GPT-4o-mini and yield tokens."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenAI API key available")

    print("[INFO] [AsyncStream] Dang thu goi OpenAI API truc tiep...")
    client = AsyncOpenAI(api_key=api_key)
    messages = format_openai_messages(prompt, system_instruction)
    start_time = datetime.datetime.now(datetime.UTC)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        stream=True,
        temperature=temperature,
    )

    accumulated_text = ""
    async for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            token = chunk.choices[0].delta.content
            accumulated_text += token
            yield token

    end_time = datetime.datetime.now(datetime.UTC)
    usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
    _log_and_return(
        "gpt-4o-mini",
        prompt,
        system_instruction,
        accumulated_text,
        usage,
        start_time,
        end_time,
        trace_or_span,
        prompt_name,
        prompt_version,
        metadata,
        temperature,
        extra_meta={"async": True},
    )


async def async_call_openrouter_stream(
    prompt, system_instruction, temperature, trace_or_span, prompt_name, prompt_version, metadata
):
    """Async call OpenRouter with free model rotation and yield tokens."""
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("No OpenRouter API key available")

    messages = format_openai_messages(prompt, system_instruction)
    extra_headers = {
        "HTTP-Referer": "https://github.com/kag2002/C2-App-023",
        "X-Title": "AI Lecture Assistant",
    }

    for model_name in FREE_MODELS:
        try:
            print(f"[INFO] [AsyncStream] Thu goi model OpenRouter: {model_name}...")
            client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key,
            )
            start_time = datetime.datetime.now(datetime.UTC)
            response = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True,
                temperature=temperature,
                extra_headers=extra_headers,
            )

            accumulated_text = ""
            async for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    accumulated_text += token
                    yield token

            end_time = datetime.datetime.now(datetime.UTC)
            usage = {"input_tokens": len(str(prompt)) // 4, "output_tokens": len(accumulated_text) // 4}
            _log_and_return(
                model_name,
                prompt,
                system_instruction,
                accumulated_text,
                usage,
                start_time,
                end_time,
                trace_or_span,
                prompt_name,
                prompt_version,
                metadata,
                temperature,
                extra_meta={"async": True},
            )
            return
        except Exception as e:
            print(f"[WARNING] [AsyncStream] Loi model {model_name}: {e}")
            continue
    raise RuntimeError("All async OpenRouter stream models failed")
