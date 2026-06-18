from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, func, CheckConstraint, event
from sqlalchemy.orm import relationship, Session, with_loader_criteria, Query
from datetime import datetime, timezone

from src.database.session import Base


class SoftDeleteMixin:
    deleted_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, server_default="false")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    role = Column(String(50), default="user", nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    courses = relationship("Course", back_populates="user", cascade="all, delete-orphan")


class Course(Base, SoftDeleteMixin):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_code = Column(String(50), nullable=False)
    course_name = Column(String(255), nullable=False)
    required_textbooks = Column(Text, nullable=True)
    recommended_readings = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    user = relationship("User", back_populates="courses")
    clos = relationship("CLO", back_populates="course", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="course", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="course", cascade="all, delete-orphan")


class CLO(Base):
    __tablename__ = "clos"
    __table_args__ = (
        CheckConstraint("bloom_level BETWEEN 1 AND 6", name="check_bloom_level_range"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    clo_code = Column(String(20), nullable=False)  # ví dụ: CLO1, CLO2
    description = Column(Text, nullable=False)
    bloom_level = Column(Integer, nullable=False)  # 1 đến 6

    # Quan hệ
    course = relationship("Course", back_populates="clos")
    questions = relationship("Question", back_populates="clo")


class Chapter(Base, SoftDeleteMixin):
    __tablename__ = "chapters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    course = relationship("Course", back_populates="chapters")
    materials = relationship("ChapterMaterial", back_populates="chapter", uselist=False, cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="chapter")


class ChapterMaterial(Base):
    __tablename__ = "chapter_materials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)
    slide_content = Column(Text, nullable=True)  # Markdown text
    active_learning_script = Column(Text, nullable=True)  # Text guide
    is_active = Column(Boolean, default=True)
    status = Column(String(20), default="approved", nullable=True)
    created_by = Column(String(50), default="user", nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Quan hệ
    chapter = relationship("Chapter", back_populates="materials")


class Question(Base, SoftDeleteMixin):
    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("bloom_level BETWEEN 1 AND 6", name="check_bloom_level_range"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True, index=True)
    question_text = Column(Text, nullable=False)
    question_type = Column(String(20), default="MCQ")  # MCQ | Short Answer
    options_json = Column(Text, nullable=True)  # JSON array of options for MCQ
    correct_answer = Column(String(50), nullable=False)
    bloom_level = Column(Integer, nullable=False)
    clo_id = Column(Integer, ForeignKey("clos.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    status = Column(String(20), default="approved", nullable=True)
    created_by = Column(String(50), default="user", nullable=True)
    chat_message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Quan hệ
    course = relationship("Course", back_populates="questions")
    chapter = relationship("Chapter", back_populates="questions")
    clo = relationship("CLO", back_populates="questions")


class MaterialRevision(Base):
    """Lưu lịch sử chỉnh sửa nội dung bài giảng/kịch bản để hỗ trợ rollback."""

    __tablename__ = "material_revisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, index=True)

    field = Column(String(50), nullable=False)  # "slide_content" hoặc "active_learning_script"
    content_before = Column(Text, nullable=False)
    content_after = Column(Text, nullable=False)
    user_prompt = Column(Text, nullable=True)  # Yêu cầu sửa của giảng viên
    ai_consistency_note = Column(Text, nullable=True)  # Ghi chú AI kiểm tra xung đột

    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    chapter = relationship("Chapter")


class ChatSession(Base):
    """Lưu phiên trò chuyện của giảng viên."""

    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(255), default="Cuộc trò chuyện mới")
    active_leaf_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    course = relationship("Course")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    """Lưu tin nhắn chi tiết trong phiên chat kèm siêu dữ liệu token."""

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # "user", "assistant", "system"
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True, index=True)
    tool_calls = Column(Text, nullable=True)  # JSON string của tool calls
    tool_results = Column(Text, nullable=True)  # JSON string của kết quả tool

    # Token & Latency tracking
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    latency_ms = Column(Float, default=0.0)
    trace_id = Column(String(255), nullable=True)
    is_archived = Column(Boolean, default=False)

    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    session = relationship("ChatSession", back_populates="messages")


class ChatEvalRun(Base):
    """Lưu trữ lịch sử chạy đánh giá chất lượng tự động."""

    __tablename__ = "chat_eval_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    eval_run_id = Column(String(255), unique=True, nullable=False)
    provider = Column(String(100), nullable=False)
    model = Column(String(100), nullable=True)

    total_cases = Column(Integer, default=0)
    passed_cases = Column(Integer, default=0)
    accuracy = Column(Float, default=0.0)
    guardrail_violations_count = Column(Integer, default=0)
    results_json = Column(Text, nullable=True)  # JSON string lưu chi tiết kết quả từng ca kiểm thử

    run_at = Column(DateTime, server_default=func.now())


class RAGDocument(Base):
    """Lưu trữ thông tin siêu dữ liệu của tài liệu RAG đã tải lên."""

    __tablename__ = "rag_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    category = Column(String(100), default="Textbook")
    tags = Column(String(255), nullable=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(50), default="processing")  # processing | ready | failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    user = relationship("User")
    course = relationship("Course")
    chapter = relationship("Chapter")


class SystemRule(Base):
    """Lưu trữ các quy tắc/chỉ dẫn tự sinh của Reflection Agent."""

    __tablename__ = "system_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_text = Column(Text, nullable=False)
    rule_category = Column(String(100), nullable=False)  # ví dụ: "mcq_generation", "slide_style"
    status = Column(String(50), default="pending_approval")  # pending_approval | approved | rejected
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    course = relationship("Course")


class UserEvent(Base):
    """Lưu vết hành vi clickstream của người dùng."""

    __tablename__ = "user_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(50), nullable=False)  # click | edit | view | session
    element_id = Column(String(100), nullable=True)  # ví dụ: "btn-generate-slides"
    payload = Column(Text, nullable=True)  # JSON metadata (browser info, extra metrics)
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    user = relationship("User")
    course = relationship("Course")


class AIGenerationTrace(Base):
    """Lưu vết Prompt sư phạm, slide AI gợi ý và slide người dùng chỉnh sửa hoàn thiện (SFT Data)."""

    __tablename__ = "ai_generation_traces"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    chapter_id = Column(Integer, ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True, index=True)
    clo_id = Column(Integer, ForeignKey("clos.id", ondelete="SET NULL"), nullable=True, index=True)
    bloom_level = Column(Integer, nullable=True)
    
    prompt = Column(Text, nullable=False)
    proposed_content = Column(Text, nullable=True)  # Nội dung slide AI tạo ra ban đầu
    edited_content = Column(Text, nullable=True)  # Nội dung slide người dùng sửa lại
    
    rating = Column(Integer, nullable=True)  # 1-5 sao
    feedback = Column(Text, nullable=True)  # Lý do từ chối/góp ý
    
    created_at = Column(DateTime, server_default=func.now())

    # Quan hệ
    user = relationship("User")
    course = relationship("Course")
    chapter = relationship("Chapter")
    clo = relationship("CLO")


class OdinLock(Base):
    __tablename__ = "odin_locks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    context_key = Column(String(100), nullable=False, unique=True)
    locked_by = Column(String(50), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class OdinActionLog(Base):
    __tablename__ = "odin_action_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String(50), nullable=False)
    affected_ids = Column(Text, nullable=False)  # JSON string
    created_at = Column(DateTime, server_default=func.now())


# --- Soft-Delete Event Hooks & Monkeypatching ---

@event.listens_for(Session, "do_orm_execute")
def _add_soft_delete_filter(execute_state):
    # Automatically filter out soft-deleted records globally for SELECT queries
    if execute_state.is_select and not execute_state.execution_options.get("skip_filter", False):
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                SoftDeleteMixin,
                lambda cls: cls.is_deleted.is_(False),
                include_aliases=True,
            )
        )

@event.listens_for(Session, "before_flush")
def _intercept_deletes(session, flush_context, instances):
    # Support hard-delete if requested via session info flag
    if session.info.get("hard_delete", False):
        return
    # Intercept session.delete() and convert to soft-delete
    for obj in list(session.deleted):
        if isinstance(obj, SoftDeleteMixin):
            session.add(obj)  # Add back to session as persistent/dirty
            obj.is_deleted = True
            now_time = datetime.now(timezone.utc).replace(tzinfo=None)
            obj.deleted_at = now_time
            
            # Cascade soft-delete to child elements
            if isinstance(obj, Course):
                session.query(Chapter).filter(Chapter.course_id == obj.id).update(
                    {"is_deleted": True, "deleted_at": now_time},
                    synchronize_session="evaluate"
                )
                session.query(Question).filter(Question.course_id == obj.id).update(
                    {"is_deleted": True, "deleted_at": now_time},
                    synchronize_session="evaluate"
                )
            elif isinstance(obj, Chapter):
                session.query(Question).filter(Question.chapter_id == obj.id).update(
                    {"is_deleted": True, "deleted_at": now_time},
                    synchronize_session="evaluate"
                )

# Monkeypatch Query.delete to convert bulk deletes to bulk updates
_original_delete = Query.delete

def _soft_delete_query(self, synchronize_session="evaluate"):
    if self.column_descriptions:
        model = self.column_descriptions[0]["type"]
        if model and isinstance(model, type) and issubclass(model, SoftDeleteMixin):
            return self.update(
                {
                    "is_deleted": True,
                    "deleted_at": datetime.now(timezone.utc).replace(tzinfo=None),
                },
                synchronize_session=synchronize_session,
            )
    return _original_delete(self, synchronize_session=synchronize_session)

Query.delete = _soft_delete_query

