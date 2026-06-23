# Worklog — Team 023

> [!NOTE]
> **Last updated:** 2026-06-23. Active development worklog.

> Ghi lại tất cả công việc đã làm theo ngày. Ai làm gì, kết quả gì.

---

## 2026-06-09

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Thiên Khang | Khởi tạo repo git sạch, kết nối remote và push lên GitHub | ✅ Done | [C2-App-023 Repo](https://github.com/AI20K-Build-Cohort-2/C2-App-023) | 1h |
| Lê Thiên Khang | Cài đặt môi trường ảo `.venv`, cài dependencies và cấu hình `.env` | ✅ Done | `.venv` và `.env` hoạt động ổn định | 1.5h |
| Phạm Thành Nam | Cấu hình Git pre-push hook và kiểm thử chạy mẫu dự án | ✅ Done | Đã cài hooks qua script, test pytest 5/5 PASSED, uvicorn chạy thành công | 1h |
| Team 023 | Tạo branch `docs` và cập nhật Worklog khởi đầu | ✅ Done | WORKLOG.md cập nhật | 0.5h |

**Tổng kết ngày:** Đã khởi tạo thành công dự án từ template, thiết lập xong môi trường ảo, kết nối git remote github, cài đặt logging hooks và kiểm tra chạy thử server/test. Dự án sẵn sàng cho bước tiếp theo.

---

## 2026-06-10 → 2026-06-11

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Xây dựng core backend: FastAPI routes, SQLAlchemy models, database session | ✅ Done | `src/api/` với courses, outline, materials, questions, export, chatbot, auth | 6h |
| Phạm Thành Nam | Implement LangGraph agent: state machine, nodes, edges, tools | ✅ Done | `src/agents/graph.py`, `state.py`, `nodes/`, `tools/` | 4h |
| Phạm Thành Nam | Frontend: Landing page, Login, Dashboard, core views | ✅ Done | 10+ React views trong `frontend/src/views/` | 5h |

**Tổng kết:** Xây dựng xong khung sườn backend + frontend + agent. Hệ thống có thể chạy end-to-end.

---

## 2026-06-12 → 2026-06-13

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Tích hợp Mascot Companion AI (retro style) vào AppShell | ✅ Done | Component ChatBot retro, tích hợp SSE streaming | 3h |
| Phạm Thành Nam | Admin Dashboard: telemetry, SRE percentiles, SVG timelines, alerting | ✅ Done | `AdminDashboard.tsx` + `MonitorDashboard.tsx` | 4h |
| Phạm Thành Nam | Fix empty state guides, align syllabus terminology, Python linting | ✅ Done | Linting clean, tests pass | 2h |
| Phạm Thành Nam | Thêm sample syllabus, download & quick load buttons | ✅ Done | `sample_syllabus.txt`, `CourseConfig.tsx` updated | 1h |
| Team 023 | Cập nhật docs: plans, architecture, configs | ✅ Done | 7 implementation plans trong `docs/plans/` | 2h |

**Tổng kết:** Hoàn thiện giao diện admin monitoring, mascot AI assistant, và documentation. ARCHITECTURE.md cập nhật lần cuối.

---

## 2026-06-14 → 2026-06-15

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Fix chatbot agent infinite loop bug | ✅ Done | Thêm max_iterations guard, 18+ agent workflow tests | 3h |
| Phạm Thành Nam | Fix isDirty state guard cho CLO deletions | ✅ Done | Custom `useDirtyState` hook | 1.5h |
| Phạm Thành Nam | Autopilot: sync mascot execution status, cancellation control | ✅ Done | SSE real-time sync với main UI panels | 2h |
| Phạm Thành Nam | Fix runtime TypeError cho course-specific sub-views | ✅ Done | Conditional guards trong App.tsx | 1h |
| Phạm Thành Nam | Admin direct access, agent memory monitoring tab | ✅ Done | Dashboard redirect, memory tab UI | 1.5h |

**Tổng kết:** Focus vào bug fixes và stability. Agent không còn infinite loop, isDirty state bảo vệ dữ liệu chưa lưu.

---

## 2026-06-16 → 2026-06-17

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Refactor: modularize agent architecture, tách nodes thành modules | ✅ Done | Tách `graph.py` monolithic → node modules riêng biệt | 3h |
| Phạm Thành Nam | Database migrations: Alembic setup, initial schema snapshot | ✅ Done | `alembic/` directory, migration scripts | 2h |
| Phạm Thành Nam | Dockerize setup: Dockerfile, docker-compose.yml | ✅ Done | Multi-stage build, full stack orchestration | 1.5h |
| Phạm Thành Nam | Expand test coverage: agent tests, API tests, integration tests | ✅ Done | 241 tests passing | 3h |
| Phạm Thành Nam | Structured logging: purge print statements | ✅ Done | Standardized Python logging | 1h |
| Phạm Thành Nam | Database pagination: offset + limit cho list endpoints | ✅ Done | Tất cả list routes hỗ trợ pagination | 1h |
| Phạm Thành Nam | Fix soft-delete columns missing trong auto-migrations | ✅ Done | `deleted_at`, `is_deleted` đồng bộ | 1h |

**Tổng kết:** Major refactoring sprint. Kiến trúc enterprise-grade với Alembic migrations, Docker, modular agents, và 241 tests.

---

## 2026-06-22

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Fix venv: restore pip, install psutil dependency | ✅ Done | Test suite chạy lại: 241 passed | 0.5h |
| Phạm Thành Nam | Cập nhật JOURNAL.md: ghi lại Week 1-2 chi tiết | ✅ Done | Mục tiêu, thành quả, khó khăn, bài học | 0.5h |
| Phạm Thành Nam | Cập nhật WORKLOG.md: bổ sung công việc 10/06 → 22/06 | ✅ Done | Worklog đầy đủ theo ngày | 0.5h |
| Phạm Thành Nam | Customize README.md cho Demo Day | ✅ Done | README mô tả dự án thực tế | 0.5h |
| Phạm Thành Nam | Cập nhật eval report với test results | ✅ Done | 241 tests, 51% coverage, metrics updated | 0.5h |

**Tổng kết:** Documentation day — cập nhật toàn bộ deliverables trước Demo Day.

---

## 2026-06-23

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Thiên Khang | Giải quyết Code Smells: Khử các inline imports trùng lặp, tách helper function `extract_layout` ra cấp module | ✅ Done | Code sạch hơn, giảm trùng lặp imports | 2h |
| Lê Thiên Khang | Tối ưu hóa cấu trúc thư mục backend và modular hóa tích hợp LLM | ✅ Done | `models` -> `schemas`, nhóm LLM vào `src/utils/llm`, bổ sung `__init__.py` | 3h |
| Lê Thiên Khang | Chạy kiểm thử toàn diện & cập nhật đánh giá | ✅ Done | 308/308 tests pass thành công, cập nhật `walkthrough.md` | 1h |

**Tổng kết:** Refactoring & Optimization day — chuẩn hóa cấu trúc thư mục, đóng gói module LLM và loại bỏ các code smells.

---

<!-- Format: copy block trên cho mỗi ngày làm việc -->
