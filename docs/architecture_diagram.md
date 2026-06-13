# Architecture Diagram

> [!NOTE]
> **Last updated:** 2026-06-09. This document is a simplified version; please refer to [ARCHITECTURE.md](file:///c:/Users/Admin/Documents/VinUni/CodeLab/C2-App-023/ARCHITECTURE.md) for the active, detailed system architecture.

## System Overview

```mermaid
graph TB
    User([User]) --> UI[Frontend<br/>React/Next.js]
    UI -->|REST API| API[FastAPI Backend]
    API --> Agent[LangGraph Agent]
    Agent --> LLM[LLM Service<br/>GPT-4o / Gemini]
    Agent --> Tools[Agent Tools]
    Tools --> DB[(Database)]
    Agent --> VS[Vector Store<br/>ChromaDB]
```

## Agent Flow

```mermaid
graph LR
    START((Start)) --> Input[Parse Input]
    Input --> Analyze[Analyze Query]
    Analyze --> Decide{Need Tool?}
    Decide -->|Yes| CallTool[Call Tool]
    CallTool --> Analyze
    Decide -->|No| Generate[Generate Response]
    Generate --> END((End))
```

## Component Details

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React/Next.js | User interface |
| Backend | FastAPI | API server |
| Agent | LangGraph | AI agent orchestration |
| LLM | OpenAI/Gemini | Language model |
| Database | PostgreSQL/SQLite | Data persistence |
| Vector Store | ChromaDB | RAG / embeddings |
