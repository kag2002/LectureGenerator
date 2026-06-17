"""
Shared pytest fixtures for the AI Lecture Assistant test suite.

Provides an in-memory SQLite database, pre-seeded test data,
authenticated HTTP clients, and common mocks for external services.
"""

import json
import os
os.environ["TESTING"] = "1"

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Force test environment BEFORE importing app modules
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["OPENAI_API_KEY"] = "test-key"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest"

from src.auth import create_access_token, get_password_hash
from src.database.models import CLO, Chapter, ChapterMaterial, Course, Question, User
from src.database.session import Base, get_db
from src.main import app

# ---------------------------------------------------------------------------
# In-memory SQLite engine (shared across all tests in a session)
# ---------------------------------------------------------------------------

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(TEST_ENGINE, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test, drop them after."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture()
def db():
    """Provide a clean database session for direct ORM usage in tests."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _override_get_db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = _override_get_db

# ---------------------------------------------------------------------------
# Async HTTP client
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    """Async HTTP client hitting the real FastAPI app with test DB."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Pre-seeded data helpers
# ---------------------------------------------------------------------------

TEST_USER_EMAIL = "lecturer@vinuni.edu.vn"
TEST_USER_PASSWORD = "SecurePass123!"
TEST_USER_NAME = "Dr. Nguyen Van A"


@pytest.fixture()
def test_user(db) -> User:
    """Create and return a persisted User in the test DB."""
    user = User(
        email=TEST_USER_EMAIL,
        password_hash=get_password_hash(TEST_USER_PASSWORD),
        full_name=TEST_USER_NAME,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def auth_token(test_user) -> str:
    """Return a valid JWT bearer token for the test user."""
    return create_access_token(data={"sub": test_user.email})


@pytest.fixture()
def auth_headers(auth_token) -> dict:
    """Convenience dict for Authorization header."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture()
def test_course(db, test_user) -> Course:
    """Create and return a Course owned by test_user."""
    course = Course(
        user_id=test_user.id,
        course_code="COMP2010",
        course_name="Data Structures and Algorithms",
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@pytest.fixture()
def test_clo(db, test_course) -> CLO:
    """Create and return a CLO linked to test_course."""
    clo = CLO(
        course_id=test_course.id,
        clo_code="CLO1",
        description="Explain the fundamentals of binary search trees.",
        bloom_level=2,
    )
    db.add(clo)
    db.commit()
    db.refresh(clo)
    return clo


@pytest.fixture()
def test_chapter(db, test_course) -> Chapter:
    """Create and return a Chapter linked to test_course."""
    chapter = Chapter(
        course_id=test_course.id,
        sort_order=1,
        title="Chapter 1: Introduction to BST",
        description="Covers basics of binary search tree structures.",
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@pytest.fixture()
def test_material(db, test_chapter) -> ChapterMaterial:
    """Create and return ChapterMaterial for test_chapter."""
    material = ChapterMaterial(
        chapter_id=test_chapter.id,
        slide_content="# Slide 1\n* Introduction to BST\n[CLO: CLO1] [Bloom: B2]",
        active_learning_script="## Activity 1\nDiscuss BST properties in pairs.",
    )
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


@pytest.fixture()
def test_question(db, test_course, test_chapter, test_clo) -> Question:
    """Create and return a Question linked to test_course."""
    q = Question(
        course_id=test_course.id,
        chapter_id=test_chapter.id,
        question_text="What is the time complexity of BST search?",
        question_type="MCQ",
        options_json=json.dumps(["O(n)", "O(log n)", "O(1)", "O(n log n)"]),
        correct_answer="O(log n)",
        bloom_level=3,
        clo_id=test_clo.id,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_llm():
    """Mock LLM to avoid calling OpenAI/Gemini during tests."""
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock


@pytest.fixture()
def mock_call_llm_json():
    """Patch call_llm_json to return a controllable dict."""
    with patch("src.utils.llm_client.call_llm_json") as m:
        m.return_value = {"chapters": []}
        yield m


@pytest.fixture()
def mock_search_rag():
    """Patch search_rag_isolated to avoid hitting ChromaDB."""
    with patch("src.database.vector_db.search_rag_isolated") as m:
        m.return_value = []
        yield m
