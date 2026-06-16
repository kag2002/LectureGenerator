# Task 2: Zero-Downtime Production & Development Isolation Reform

## 1. Problem Statement
* **Concurrent editing risk:** When 50 active users are testing the application on the production server, if the developer edits files in the active directory, uvicorn's `--reload` feature (if enabled) will restart the server, terminating active user connections (websocket, SSE streams) and causing errors.
* **Database & Collection locks:** If the development testing and production users share the same SQLite database (`lecture_generator.db`) and ChromaDB vector persist directory, write actions in dev (e.g. uploading a document, adding slides) can cause write-locks, throwing `database is locked` errors to production users.
* **Config clashes:** Dev and Prod need different API limits, logging levels, and ports.

---

## 2. Proposed Technical Changes
We will separate the codebase into two directories on the deployment server:

```
Documents/VinUni/CodeLab/
├── C2-App-023/       <-- Development Environment (Active editing)
│   ├── .env          <-- Port 8001, dev database (dev.db), chroma_dev
│   └── src/          <-- Developer edits here, runs with --reload
│
└── C2-App-023-prod/  <-- Production Environment (Stable users)
    ├── .env          <-- Port 8000, production database (prod.db), chroma_prod
    └── src/          <-- Copy of stable code, runs with --workers 4
```

### A. Environment Config Separation
* **Development `.env`:**
  ```ini
  APP_PORT=8001
  APP_ENV=development
  DATABASE_URL=sqlite:///./data/development.db
  CHROMA_PERSIST_DIR=./data/chroma_dev
  LOG_LEVEL=DEBUG
  ```
* **Production `.env` (located in `C2-App-023-prod/.env`):**
  ```ini
  APP_PORT=8000
  APP_ENV=production
  DATABASE_URL=sqlite:///./data/production.db
  CHROMA_PERSIST_DIR=./data/chroma_prod
  LOG_LEVEL=INFO
  ```

### B. Synchronization Script
We will provide a sync script [sync_to_prod.ps1](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/scripts/sync_to_prod.ps1) in the development workspace. This script will:
1. Ensure the destination directory `C2-App-023-prod/` exists.
2. Recursively copy the `src/`, `frontend/`, `requirements.txt`, etc.
3. Exclude `.env`, `.git/`, `.venv/`, `.llm_cache/`, `node_modules/`, database files (`*.db`, `*.db-wal`, `*.db-shm`), and uploaded media files.
4. Provide a quick command to restart the production uvicorn service gracefully during off-peak hours (e.g. midnight).

---

## 3. Expert Panel Debate

### 🧑‍💻 DevOps Expert
> "Separate folders is the standard industry approach for on-premise deployments without Docker Swarm or Kubernetes. If we run uvicorn on port 8000 in a separate directory (`C2-App-023-prod`) and without `--reload`, the memory space is fully isolated. Developers can edit, format, run linters, and break code in `C2-App-023` without production users seeing a single error. When the changes are verified, the sync script copies the files, and we can trigger a fast, controlled reload of the production workers."

### 🔒 Security & Database Expert
> "Isolating `development.db` from `production.db` is critical. If a developer runs a database migration, deletes testing rows, or inserts messy test data, production users are completely unaffected. Also, since SQLite WAL mode stores transaction state in shared memory files (`.db-shm`), having two separate sqlite databases completely avoids access conflicts."

### 🧑‍💻 Developer
> "This layout is super clean. I can keep my local dev server running on port 8001 in terminal window A, edit frontend/backend code, and see changes instantly. Production users continue their sessions on port 8000 in terminal window B. No risk of accidentally breaking live sessions."

---

## 4. Verification Plan
1. **Isolation Check:** Verify that running `uvicorn src.main:app --port 8001` in the development folder loads `development.db`, and running it in the prod folder loads `production.db`.
2. **Sync Script Check:** Run the sync script and verify that files in `C2-App-023-prod/src` match dev files, but `C2-App-023-prod/.env` and database files remain untouched.

---

## 5. User Feedback & Approval
* **Status:** Pending User Approval
* **User Comments:** [Please add comments here]
