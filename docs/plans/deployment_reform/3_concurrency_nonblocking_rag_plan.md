# Task 3: Concurrency & Non-blocking RAG/SQL Reform

## 1. Problem Statement
* **FastAPI Event Loop blockage:** FastAPI is asynchronous and runs on a single thread. If an async route handler (like `/api/chatbot/chat-stream`) makes synchronous blocking calls, such as ChromaDB query searches, local SentenceTransformer embedding calculations, or SQLAlchemy SQLite database reads/writes, the event loop freezes. This means all other concurrent requests are blocked, causing severe response delays or timeouts for other users.
* **SQLite Database locking:** Under concurrent writes from 50 users, SQLite can throw `sqlite3.OperationalError: database is locked`. We need WAL mode and a high busy timeout to queue write operations safely.

---

## 2. Proposed Technical Changes
### A. Database Concurrency & Indexing
1. **Indexes:** Set `index=True` on foreign key columns (`user_id`, `course_id`, `chapter_id`, etc.) in [models.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/database/models.py) to prevent slow full table scans during concurrent queries.
2. **WAL mode & Busy Timeout:** In [session.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/database/session.py), enable WAL journal mode and normal synchronous writing, and configure the engine `connect_args={"timeout": database_timeout}` (where `database_timeout` is 15.0 seconds). This forces write operations to wait for other transactions to release locks instead of failing immediately.

### B. Offloading ChromaDB & Local Embeddings
* ChromaDB client queries and `SentenceTransformer` embed calculations are CPU-intensive and synchronous.
* Inside [vector_db.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/database/vector_db.py) (specifically within `search_rag_isolated`), we will wrap these calls in `asyncio.to_thread`. This runs the blocking RAG operations in FastAPI's built-in worker thread pool, keeping the main async event loop free.

### C. Offloading SQLAlchemy Synchronous Queries
* Standard SQLAlchemy database session operations (`db.query(...)`, `db.commit()`) block the thread they run on.
* Inside [chatbot_agent.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/services/chatbot_agent.py), [chatbot_tools.py](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/src/services/chatbot_tools.py), and related chatbot API handlers, we will wrap synchronous database calls inside async handlers with `asyncio.to_thread` or execute them in a thread-safe manner.

---

## 3. Expert Panel Debate

### 🧑‍💻 Concurrency Expert
> "FastAPI's event loop must NEVER be blocked by CPU or I/O intensive tasks. Local embedding generation with SentenceTransformer takes 0.5s - 1.5s of pure CPU computation. Under 50 users, if 5 users make RAG calls at the same time, the server will freeze for 5+ seconds! By wrapping ChromaDB queries and embedding generation in `asyncio.to_thread`, FastAPI delegates them to the loop's internal ThreadPoolExecutor. The event loop stays completely responsive to other network requests."

### 🔒 SQLite & Database Expert
> "SQLite is incredibly fast for concurrent reads, but it only allows one write transaction at a time. WAL mode is essential because it allows concurrent readers to read from the DB while a write transaction is in progress. However, concurrent writes will still clash. Setting `timeout=15.0` in the SQLite connection arguments ensures that instead of crashing with `database is locked`, FastAPI threads will wait up to 15 seconds for the current write transaction to complete. Since our database operations take less than 5ms, 15 seconds is more than enough to queue all concurrent writes without a single error."

---

## 4. Verification Plan
1. **Load Test Script:** Create `scratch/load_test.py` to simulate 50 concurrent client workers making chat and RAG requests.
2. **Verification run:** Execute the load test against the optimized server. Monitor terminal logs to verify there are no `database is locked` warnings or CPU event loop delay warnings.

---

## 5. User Feedback & Approval
* **Status:** Pending User Approval
* **User Comments:** [Please add comments here]
