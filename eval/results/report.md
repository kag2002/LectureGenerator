# Evaluation Report

> Báo cáo đánh giá chất lượng sản phẩm VinUni AI Lecture Assistant theo tiêu chí BTC.
>
> **Last updated:** 2026-06-23

---

## 1. Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Response accuracy | >80% | 66.7% | ⏳ |
| Response latency | <3s | 9.03s | ⏳ |
| User satisfaction | >4/5 | — | ⏳ Chưa khảo sát |
| Test coverage | >60% | 51% | ⏳ Đang nâng lên |
| Tests passing | 100% | 100% (308/308) | ✅ Đạt |

## 2. Test Results

### Unit Tests
```
$ python -m pytest tests/ --tb=short -q
308 passed, 219 warnings in 63.79s
```

### Coverage Report
```
$ python -m pytest tests/ --cov=src --cov-report=term-missing -q
TOTAL    7332   3623    51%
308 passed, 219 warnings in 74.52s
```

### Coverage Breakdown (Top modules)

| Module | Coverage | Notes |
|--------|----------|-------|
| `src/api/` | ~60-80% | Routes được test tốt |
| `src/agents/` | ~50-70% | Graph nodes, tools tested |
| `src/database/` | 80%+ | Models, session tested |
| `src/services/chatbot_agent.py` | 57% | Core chatbot logic |
| `src/services/chatbot_guardrails.py` | 85% | Input/output guardrails |
| `src/services/memory_service.py` | 85% | Agent memory management |
| `src/services/document_service.py` | 92% | Document parsing |
| `src/services/image_service.py` | 82% | Image processing |
| `src/utils/telemetry.py` | 80% | System metrics |
| `src/services/material_orchestrator.py` | 12% | Needs improvement |
| `src/services/slide_renderer.py` | 39% | Needs improvement |
| `src/utils/llm/` | 28% | Needs improvement |

### Test Categories

| API endpoint tests | ~130 | CRUD, auth, pagination |
| Service layer tests | ~90 | Business logic, slide/mermaid rendering |
| Agent/graph tests | ~30 | State machine, nodes, tools |
| Parser format tests | ~20 | PDF, DOCX, TXT parsing |
| Auth & Soft delete tests | ~20 | Login, registration, delete/restore |
| Memory & Integration tests | ~18 | Agent memory, E2E workflow |
| **Total** | **308** | **All passing** |

### Integration Tests
- End-to-end flow: Login → Create Course → Upload Syllabus → Generate Outline → Generate Questions → Export
- Chatbot SSE streaming with RAG context
- Autopilot execution with locking mechanism
- Soft delete and restore operations

## 3. User Feedback

| User | Feedback | Rating |
|------|----------|--------|
| Internal testing | Chatbot phản hồi nhanh, outline generation mượt mà | 4/5 |
| Internal testing | Export PPTX cần thêm template đẹp hơn | 3/5 |

## 4. Demo Results

- Ngày demo: Chưa diễn ra (đang chuẩn bị)
- Người tham gia: —
- Feedback chung: —
- Issues phát hiện: —

## 5. Known Issues & Limitations

- Response accuracy 66.7% — cần fine-tune prompts và mở rộng RAG context
- Test coverage 51% — cần bổ sung tests cho `material_orchestrator`, `slide_renderer`, `llm_client`
- `psutil` dependency cần được khai báo rõ trong venv setup guide
- Evaluation harness dataset nhỏ (chỉ có vài test cases)

## 6. Action Items

- [ ] Nâng response accuracy > 80% (cải thiện prompts, RAG retrieval)
- [ ] Nâng test coverage > 60% (thêm tests cho services layer)
- [ ] Mở rộng evaluation dataset (thêm diverse test cases)
- [ ] Khảo sát user satisfaction với giảng viên thực tế
- [ ] Chuẩn bị demo video và pitch deck
