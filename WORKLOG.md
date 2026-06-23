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
| Lê Thiên Khang | Tích hợp Mascot Companion AI (retro style) vào AppShell | ✅ Done | Component ChatBot retro, tích hợp SSE streaming | 3h |
| Lê Thiên Khang | Admin Dashboard: nâng cấp với telemetry, SRE percentiles, SVG timelines, và alerting engine | ✅ Done | `AdminDashboard.tsx` + `MonitorDashboard.tsx` | 4h |
| Lê Thiên Khang | Xây dựng Canvas Slide Export (Option 1): tích hợp xuất Slide chất lượng cao sử dụng html2canvas & python-pptx | ✅ Done | Xuất slide PowerPoint chất lượng cao | 4h |
| Lê Thiên Khang | Tích hợp Slide Proposal Preview Modal hỗ trợ hiển thị ảnh markdown và căn chỉnh layout | ✅ Done | Preview slide đẹp mắt trước khi export | 2h |
| Lê Thiên Khang | Đồng bộ hóa đa ngôn ngữ (Tiếng Việt) cho các trạng thái của AI Agent và panel chatbot | ✅ Done | Giao diện tiếng Việt trực quan | 1h |
| Team 023 | Cập nhật docs: plans, architecture, configs | ✅ Done | 7 implementation plans trong `docs/plans/` | 2h |

**Tổng kết:** Hoàn thiện giao diện admin monitoring, mascot AI assistant, xuất PowerPoint chất lượng cao và tài liệu thiết kế.

---

## 2026-06-14 → 2026-06-15

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Thiên Khang | Xây dựng UI chỉnh sửa Storyboard và tích hợp drawer xác minh tài liệu trích dẫn | ✅ Done | Trực quan hóa storyboard, kiểm tra nguồn gốc tri thức | 3h |
| Lê Thiên Khang | Quản lý active learning sync states và luồng tạo slide 2 bước | ✅ Done | Đồng bộ hóa dữ liệu tạo đề cương và slide | 2h |
| Lê Thiên Khang | Triển khai Reconciliation tiến trình học chủ động và hệ thống hóa structured logs | ✅ Done | Loại bỏ emojis thừa khỏi prompt và chuẩn hóa log | 2h |
| Lê Thiên Khang | Triển khai LLM mock mode, disk prompt caching, và evaluation harness kiểm thử chất lượng LLM | ✅ Done | Giảm chi phí token và tăng tốc kiểm thử chất lượng sinh | 4h |
| Lê Thiên Khang | Tích hợp materials stream và nâng cấp giao diện LessonPlanner, AIProposalPanel | ✅ Done | Stream kết quả tạo tài liệu học tập theo thời gian thực | 3h |

**Tổng kết:** Hoàn thiện các tính năng cốt lõi về Storyboard editor, active learning sync, xuất PowerPoint, mock mode, và test harness đánh giá LLM.

---

## 2026-06-16 → 2026-06-17

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Refactor: modularize agent architecture, tách nodes thành modules riêng biệt | ✅ Done | Tách `graph.py` monolithic → node modules độc lập | 3h |
| Phạm Thành Nam | Database migrations: thiết lập Alembic setup, ghi nhận initial schema snapshot | ✅ Done | Thư mục `alembic/`, tự động hóa schema migrations | 2h |
| Phạm Thành Nam | Dockerize setup: viết Dockerfile, docker-compose.yml | ✅ Done | Đóng gói multi-stage build, vận hành toàn bộ stack bằng 1 lệnh | 1.5h |
| Phạm Thành Nam | Mở rộng kiểm thử: viết unit tests, API tests và tích hợp kiểm thử agent | ✅ Done | 241 tests passing | 3h |
| Phạm Thành Nam | Chuẩn hóa logging: dọn dẹp các câu lệnh print thô, thay bằng structured Python logging | ✅ Done | Hệ thống logging đồng bộ | 1h |
| Phạm Thành Nam | Database pagination: hỗ trợ offset + limit cho toàn bộ các endpoints trả về danh sách | ✅ Done | Tránh nghẽn băng thông với tập dữ liệu lớn | 1h |
| Lê Thiên Khang | Tích hợp lối tắt Admin direct access và tab giám sát bộ nhớ Agent memory tab | ✅ Done | Quản lý session admin, theo dõi bộ nhớ agent | 2h |

**Tổng kết:** Refactoring kỹ thuật sâu rộng. Thiết lập migration pipeline, Docker hóa, nâng độ phủ test đạt 241 test cases sạch.

---

## 2026-06-18

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Thiên Khang | Khắc phục bug infinite loop của chatbot agent và bổ sung 18+ agent workflow scenario & edge case tests | ✅ Done | Agent tự kết thúc đúng điều kiện biên | 3h |
| Lê Thiên Khang | Giải quyết xung đột kiểm thử: sửa lỗi chia sẻ DB, rate limit (slowapi) trong môi trường test | ✅ Done | Tách biệt cơ sở dữ liệu test, mock middleware rate limit | 2h |
| Lê Thiên Khang | Sửa lỗi build frontend: sửa đường dẫn path alias `useDirtyState` gây lỗi Next.js build | ✅ Done | Dự án build ổn định | 1h |
| Lê Thiên Khang | Đồng bộ hóa trạng thái Mascot Autopilot: đồng bộ tiến độ và hỗ trợ hủy tác vụ từ giao diện chính | ✅ Done | Hủy tiến trình AI trực tiếp từ màn hình | 2.5h |
| Lê Thiên Khang | Bổ sung cột soft-delete `deleted_at`, `is_deleted` còn thiếu trong migrations tự động của Alembic | ✅ Done | Đồng bộ database schema trọn vẹn | 1h |
| Lê Thiên Khang | Thiết lập isDirty state guard bảo vệ CLO deletions khỏi bị ghi đè khi DB tự động làm mới | ✅ Done | Tránh mất mát dữ liệu CLO chưa lưu của người dùng | 2h |

**Tổng kết:** Khắc phục lỗi nghiệm trọng liên quan đến vòng lặp AI, bảo vệ dữ liệu CLO, sửa lỗi build Next.js, và chuẩn hóa test suite.

---

## 2026-06-22

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Phạm Thành Nam | Fix venv: restore pip, install psutil dependency | ✅ Done | Test suite chạy lại bình thường | 0.5h |
| Phạm Thành Nam | Cập nhật JOURNAL.md: ghi lại Week 1-2 chi tiết | ✅ Done | Mục tiêu, thành quả, khó khăn, bài học | 0.5h |
| Phạm Thành Nam | Cập nhật WORKLOG.md: bổ sung công việc từ 10/06 → 22/06 | ✅ Done | Khớp nối nhật ký tiến độ | 0.5h |
| Phạm Thành Nam | Customize README.md cho Demo Day | ✅ Done | README mô tả dự án thực tế sinh động | 0.5h |
| Phạm Thành Nam | Cập nhật eval report với test kết quả kiểm thử | ✅ Done | 241 tests, 51% coverage, metrics updated | 0.5h |

**Tổng kết:** Tài liệu hóa chuẩn bị cho Demo Day — cập nhật toàn bộ báo cáo, hướng dẫn chạy và tổng kết tuần.

---

## 2026-06-23

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Lê Thiên Khang | Tái cấu trúc frontend: phân tách monolithic views (KnowledgeBase, CourseConfig), tách MarkdownChatRenderer từ ChatBot, trích xuất global contexts, modals, drawers | ✅ Done | Frontend modular, dễ bảo trì hơn | 4h |
| Lê Thiên Khang | Tái cấu trúc backend: modular hóa main app, trích xuất core services, tích hợp assessments API | ✅ Done | Tổ chức backend code khoa học, sạch sẽ | 3h |
| Lê Thiên Khang | Cập nhật tài liệu: bổ sung pedagogical analytics specs và visual editor UX review | ✅ Done | Specs và docs hoàn thiện | 1h |
| Phạm Thành Nam | Bổ sung unit tests cho `material_orchestrator`, `slide_renderer`, và `syllabus_service` | ✅ Done | Tăng độ bao phủ kiểm thử (tests từ 241 -> 307) | 2h |
| Lê Thiên Khang | Giải quyết Code Smells: Khử các inline imports trùng lặp, tách helper function `extract_layout` ra cấp module | ✅ Done | Loại bỏ 27+ inline imports trùng lặp | 2h |
| Lê Thiên Khang | Tối ưu hóa cấu trúc thư mục backend và modular hóa tích hợp LLM | ✅ Done | `models` -> `schemas`, đóng gói LLM vào `src/utils/llm`, thêm package initializers | 3h |
| Lê Thiên Khang | Chạy kiểm thử toàn diện & cập nhật đánh giá | ✅ Done | 308/308 tests pass thành công, cập nhật `walkthrough.md` | 1h |
| Lê Thiên Khang | Khắc phục lỗi overlap giao diện: Sử dụng React Portal để đưa ReactFlowEditorModal ra body level | ✅ Done | Modal hiển thị đè lên top header/sidebar đúng z-index | 0.5h |

**Tổng kết:** Refactoring & Optimization Day — Đại tu cấu trúc thư mục backend/frontend, loại bỏ code smells, mở rộng kiểm thử toàn diện đạt 308 tests pass, khắc phục lỗi chồng lấp giao diện của React Flow editor.

---

<!-- Format: copy block trên cho mỗi ngày làm việc -->
