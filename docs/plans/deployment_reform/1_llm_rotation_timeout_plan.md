# Task 1: LLM Key Rotation & Timeout Reform

## 1. Problem Statement
* **Weak local models timeout:** A hardcoded 15-second timeout in local LLM endpoints causes weak models (e.g. Qwen run on local hardware or low-speed tunnels) to fail prematurely, even when they could have completed successfully in 30-45 seconds. On the other hand, a 600-second timeout is too long, causing the connection to hang for other users.
* **API Rate limits on Free Tier:** Google Gemini free tier allows 15 RPM (Requests Per Minute) and 1500 RPD (Requests Per Day) per API Key. Under a concurrent load of 50 users (out of 200), a single key will hit `RESOURCE_EXHAUSTED` (HTTP 429) within minutes.
* **Single point of failure:** If the main API provider (Gemini) fails, we need a seamless, low-cost fallback route to OpenRouter or local models.

---

## 2. Proposed Technical Changes
### A. Dynamic Local LLM Timeout
* Read `llm_local_timeout` from `.env` via `Settings` in `src/config.py` (default: `30` or `45` seconds).
* Replace hardcoded timeout parameters (`15.0`, `600.0`) in [llm_providers.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/utils/llm_providers.py) and [graph.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/agents/graph.py) with `os.environ.get("LLM_LOCAL_TIMEOUT")`.

### B. Gemini API Key Rotation Pool
* Read `GEMINI_API_KEYS` from `.env` as a comma-separated string (e.g. `GEMINI_API_KEYS=key1,key2,key3`).
* Inside [llm_providers.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/utils/llm_providers.py), implement a key selection mechanism:
  1. Load all available keys from `GEMINI_API_KEYS` and `GEMINI_API_KEY`.
  2. Maintain a rotation cursor or index.
  3. When an API call returns HTTP 429 (`RESOURCE_EXHAUSTED`), catch the exception, black-list or rotate to the next key, and retry immediately.
  4. Only raise a final failure if *all* keys in the pool have been exhausted or returned errors.

### C. Multi-Provider Fallback Chain
* The orchestration chain inside [llm_client.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/utils/llm_client.py) will attempt calls in the following order:
  1. **Local LLM** (with user-configured timeout).
  2. **Google Gemini** (with multiple rotated keys).
  3. **OpenAI** (if configured).
  4. **OpenRouter Free Tier** (rotating free models).
  5. **Mock Response** (last resort, never crashes the app).

---

## 3. Expert Panel Debate

### 🧑‍💻 Concurrency & Performance Expert
> "Enforcing client timeouts using `timeout` arguments inside `OpenAI()` or `client.models.generate_content` is critical. If we try to enforce timeouts using `asyncio.wait_for`, the underlying TCP connection or the thread calling the API key might not close immediately, leading to a socket leak. Letting the HTTP clients handle their own socket timeouts is much cleaner. A default of `30s` is a solid balance for weak local models."

### 💰 API & Cost Optimizer
> "Rotating Gemini free keys is an absolute lifesaver. Each key gives 15 RPM. If the user registers 4 Google accounts and inputs 4 keys, we get 60 RPM. This supports 50 concurrent users asking questions every 4-5 seconds. By rotating them on HTTP 429, we guarantee zero cost for the 3-4 days of deployment. We must write a helper to parse `GEMINI_API_KEYS` robustly, ignoring whitespace."

### 🔒 Security & DevOps Expert
> "We must make sure that when a Gemini key fails and gets rotated, we do not print the API key in the logs. We should mask it (e.g., `AIzaSy...4xYz`). Also, OpenRouter free models have rate limits as well, so retaining the OpenRouter rotation logic as a tertiary fallback is excellent."

---

## 4. Verification Plan
1. **Timeout Test:** Set `LLM_LOCAL_TIMEOUT=3` in `.env` and verify that the local LLM times out quickly and transparently falls back to Gemini.
2. **Key Rotation Test:** Inject a fake/expired API key followed by a valid API key in `GEMINI_API_KEYS`. Verify that the system automatically handles the failure of the first key, logs the warning, rotates to the second key, and successfully returns a response.

---

## 5. User Feedback & Approval
* **Status:** Pending User Approval
* **User Comments:** [Please add comments here]
