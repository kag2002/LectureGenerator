import os
import shutil
import time
from pathlib import Path
import pytest

from src.utils.llm_client import call_llm_json, call_llm_stream, async_call_llm_json, async_call_llm_stream
from src.utils.llm_cache import CACHE_DIR


@pytest.fixture(autouse=True)
def clean_cache():
    """Ensure a clean cache directory before and after tests."""
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
    yield
    if CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)


def test_llm_mock_mode_json():
    """Verify that LLM_MOCK_MODE returns mock JSON responses instantly without invoking APIs."""
    os.environ["LLM_MOCK_MODE"] = "true"
    os.environ["LLM_CACHE_ENABLED"] = "false"

    start_time = time.time()
    response = call_llm_json("Generate a storyboard for BST", system_instruction="test system")
    duration = time.time() - start_time

    assert isinstance(response, dict)
    assert "slides" in response or "slide_content" in response or len(response) > 0
    # Should be extremely fast (instantly returning local mock data)
    assert duration < 0.2


def test_llm_mock_mode_stream():
    """Verify that LLM_MOCK_MODE returns a generator stream instantly."""
    os.environ["LLM_MOCK_MODE"] = "true"
    os.environ["LLM_CACHE_ENABLED"] = "false"

    start_time = time.time()
    generator = call_llm_stream("Create outline", system_instruction="test stream")
    chunks = list(generator)
    duration = time.time() - start_time

    assert len(chunks) > 0
    assert any("Chương" in chunk or "Chapter" in chunk or "#" in chunk for chunk in chunks)


def test_llm_caching_json():
    """Verify that prompt caching works for call_llm_json."""
    os.environ["LLM_MOCK_MODE"] = "true"  # Force mock fallback output to prevent hitting live API
    os.environ["LLM_CACHE_ENABLED"] = "true"

    prompt = "Unique prompt for caching test"
    sys_inst = "Unique sys inst"

    # First call: Caches mock fallback output
    res1 = call_llm_json(prompt, system_instruction=sys_inst)
    
    # Check if cache file was created
    assert CACHE_DIR.exists()
    cache_files = list(CACHE_DIR.glob("*.json"))
    assert len(cache_files) > 0

    # Disable mock mode so that if it makes a real call it would fail (we have no valid API keys set in test env)
    # But since cache is enabled, it should hit cache instantly and return res1
    os.environ["LLM_MOCK_MODE"] = "false"
    
    start_time = time.time()
    res2 = call_llm_json(prompt, system_instruction=sys_inst)
    duration = time.time() - start_time

    assert res2 == res1
    assert duration < 0.05  # Cache hit must be extremely fast


@pytest.mark.asyncio
async def test_llm_caching_async_json():
    """Verify that async prompt caching works for async_call_llm_json."""
    os.environ["LLM_MOCK_MODE"] = "true"
    os.environ["LLM_CACHE_ENABLED"] = "true"

    prompt = "Unique async prompt for caching test"
    sys_inst = "Unique async sys inst"

    res1 = await async_call_llm_json(prompt, system_instruction=sys_inst)
    assert CACHE_DIR.exists()

    os.environ["LLM_MOCK_MODE"] = "false"
    start_time = time.time()
    res2 = await async_call_llm_json(prompt, system_instruction=sys_inst)
    duration = time.time() - start_time

    assert res2 == res1
    assert duration < 0.05
