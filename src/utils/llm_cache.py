"""
Local File-Based Caching Utility for LLM Calls.
Supports caching JSON structures and simulating chunked streams.
"""

import asyncio
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Generator, List, Optional

CACHE_DIR = Path(os.environ.get("LLM_CACHE_DIR", ".llm_cache"))


def get_cache_key(
    prompt: Any,
    system_instruction: Optional[str] = None,
    temperature: float = 0.2,
    model_name: Optional[str] = None,
    schema: Optional[Any] = None,
) -> str:
    """Compute a SHA-256 hash representing the cache key for an LLM request."""
    # Serialize prompt if list or other type
    if isinstance(prompt, list):
        prompt_repr = json.dumps(prompt, sort_keys=True)
    else:
        prompt_repr = str(prompt)

    # Serialize schema if it has a dictionary representation
    schema_repr = ""
    if schema is not None:
        try:
            if hasattr(schema, "model_json_schema"):
                schema_repr = json.dumps(schema.model_json_schema(), sort_keys=True)
            elif hasattr(schema, "schema"):
                schema_repr = json.dumps(schema.schema(), sort_keys=True)
            else:
                schema_repr = str(schema)
        except Exception:
            schema_repr = str(schema)

    payload = {
        "prompt": prompt_repr,
        "system_instruction": system_instruction or "",
        "temperature": temperature,
        "model_name": model_name or "",
        "schema": schema_repr,
    }

    serialized = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def get_cached_json(cache_key: str) -> Optional[dict]:
    """Retrieve cached JSON response if exists, else None."""
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[WARNING] Error reading cache file {cache_file}: {e}")
    return None


def save_cached_json(cache_key: str, response_dict: dict) -> None:
    """Save a JSON response to the cache directory."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(response_dict, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARNING] Error writing cache file {cache_file}: {e}")


def get_cached_stream(cache_key: str, delay: float = 0.01) -> Generator[str, None, None]:
    """Retrieve cached stream chunks and yield them with simulated delay."""
    cache_file = CACHE_DIR / f"{cache_key}.stream.jsonl"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        chunk = json.loads(line)
                        yield chunk
                        if delay > 0:
                            time.sleep(delay)
        except Exception as e:
            print(f"[WARNING] Error reading cached stream {cache_file}: {e}")


async def async_get_cached_stream(cache_key: str, delay: float = 0.01) -> AsyncGenerator[str, None]:
    """Retrieve cached stream chunks asynchronously and yield them with simulated delay."""
    cache_file = CACHE_DIR / f"{cache_key}.stream.jsonl"
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        chunk = json.loads(line)
                        yield chunk
                        if delay > 0:
                            await asyncio.sleep(delay)
        except Exception as e:
            print(f"[WARNING] Error reading cached stream {cache_file}: {e}")


def save_cached_stream(cache_key: str, chunks: List[str]) -> None:
    """Save streamed chunks to a JSON lines cache file."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.stream.jsonl"
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            for chunk in chunks:
                f.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[WARNING] Error writing cached stream {cache_file}: {e}")
