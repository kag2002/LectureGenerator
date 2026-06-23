# Weekly Journal — Team 023

> [!NOTE]
> **Last updated:** 2026-06-22. Active development journal.

> Ghi lại mỗi tuần: học được gì, khó khăn gì, quyết định gì, kế hoạch tiếp.

---

## Week 1: 2026-06-09 – 2026-06-15

### Mục tiêu tuần này
- [x] Khởi tạo repo, kết nối remote GitHub, setup môi trường phát triển
- [x] Xây dựng kiến trúc backend: FastAPI routes, SQLAlchemy models, LangGraph agent
- [x] Xây dựng giao diện frontend: Landing page, Login, Dashboard, ChatBot, CourseConfig
- [x] Tích hợp AI agent pipeline: chatbot SSE streaming, course outline generation

### Đã hoàn thành
- Khởi tạo dự án từ starter-code-template, cài đặt `.venv`, cấu hình `.env`
- Thiết lập Git pre-push hooks và logging AI usage tự động
- Backend: Xây dựng toàn bộ API routes (courses, outline, materials, questions, export, chatbot, auth, admin)
- Frontend: Xây dựng 14 views (Landing, Login, Dashboard, ChatBot, CourseConfig, CourseRoadmap, KnowledgeBase, MatrixDashboard, LessonPlanner, QuestionBank, AdminDashboard, MonitorDashboard, Trash)
- Agent: LangGraph state machine với intent routing, guardrails, tool execution, RAG vector search
- Tích hợp SSE streaming cho chatbot và autopilot real-time notifications
- Mascot Companion AI assistant (retro style) tích hợp vào AppShell
- Admin panel với telemetry, SRE percentiles, SVG timelines, alerting engine
- Tạo sample syllabus cho testing, download & quick load buttons

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| Chatbot agent bị infinite loop khi tool execution | Thêm max_iterations guard và edge case tests | Agent dừng đúng lúc, 18+ test scenarios pass |
| Next.js build error do path alias `useDirtyState` | Sử dụng đúng path alias trong views | Build thành công |
| Runtime TypeError khi chưa chọn course | Wrap course-specific sub-views với conditional guards trong App.tsx | Không còn crash |
| isDirty state bị overwrite khi DB auto-refresh | Tạo custom `useDirtyState` hook để guard unsaved deletions | CLO deletions được bảo vệ |

### Bài học
- Cần thiết kế guard conditions cho state machine agent từ đầu để tránh infinite loop
- Custom hooks (useDirtyState) giúp bảo vệ dữ liệu chưa lưu khi có auto-refresh từ server
- Admin telemetry panel rất hữu ích để debug performance issues trong quá trình phát triển

### Kế hoạch tuần sau
- [x] Modularize agent architecture
- [x] Database migrations với Alembic
- [x] Mở rộng test coverage
- [x] Docker containerization

---

## Week 2: 2026-06-16 – 2026-06-22

### Mục tiêu tuần này
- [x] Refactor kiến trúc agent thành modular
- [x] Thiết lập database migration pipeline với Alembic
- [x] Dockerize toàn bộ setup
- [x] Mở rộng test coverage
- [x] Fix CI lint errors và stabilize test suite

### Đã hoàn thành
- **Refactor agent:** Tách monolithic `graph.py` thành các node modules riêng biệt (summarize_history, v.v.)
- **Structured logging:** Purge raw print statements, thay bằng standardized logging
- **Database pagination:** Thêm `offset` + `limit` cho tất cả list endpoints
- **Alembic migrations:** Generate initial schema snapshot, đảm bảo soft-delete mixins và bloom-level check constraints
- **Soft deletes:** Thêm missing columns `deleted_at`, `is_deleted` vào auto-migrations
- **Test suite:** Resolve db sharing, rate limiting, mock issues → 241 tests passing
- **CI/CD:** Fix lint errors, stabilize GitHub Actions pipeline
- **Venv maintenance:** Restore psutil dependency, rebuild pip in venv

### Khó khăn & Giải pháp
| Khó khăn | Giải pháp | Kết quả |
|----------|-----------|---------|
| DB sharing conflicts giữa các test modules | Isolate test databases, fix fixture scoping | Tests chạy độc lập, không conflict |
| Rate limiting gây fail tests | Mock slowapi middleware trong test environment | 241/241 tests pass |
| Venv bị mất pip binary | Chạy `ensurepip --default-pip` để restore | Venv hoạt động bình thường |
| Alembic migration không capture soft-delete columns | Update migration script thủ công, thêm `deleted_at`, `is_deleted` | Schema đồng bộ |

### Bài học
- Modular agent architecture giúp dễ test và maintain từng node riêng lẻ
- Alembic migration pipeline là enterprise-grade nhưng cần cẩn thận với custom mixins
- Test isolation là critical — mỗi test module cần DB riêng hoặc rollback transaction

### Kế hoạch tuần sau
- [ ] Customize README.md cho Demo Day
- [ ] Chuẩn bị video demo và pitch deck
- [ ] Deploy lên Render/Vercel (Live URL)
- [ ] Nâng test coverage > 60%
- [ ] Hoàn thiện evaluation report

---

<!-- Tiếp tục copy block trên cho Week 3, 4, 5, 6 -->
