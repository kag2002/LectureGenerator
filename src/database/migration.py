import os
import sys

# Thêm backend vào path để import
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.models import CLO, Chapter, ChapterMaterial, Course, Question, User
from src.database.session import Base
from src.database.session import engine as sqlite_engine


def migrate_db():
    print("[MIGRATION] Khoi dong tien trinh kiem tra va di chuyen du lieu...")

    postgres_url = os.environ.get("DATABASE_URL")
    if not postgres_url or "postgresql" not in postgres_url:
        print("[MIGRATION] Khong tim thay bien moi truong DATABASE_URL dang PostgreSQL. Bo qua migrate thuc te.")
        return False

    print("[MIGRATION] Phat hien dich den PostgreSQL. Tien hanh ket noi...")

    try:
        # 1. Khoi tao engine va session cho PostgreSQL
        postgres_engine = create_engine(postgres_url)
        # Tao bang tren PostgreSQL
        Base.metadata.create_all(bind=postgres_engine)

        postgres_session_cls = sessionmaker(bind=postgres_engine)
        pg_db = postgres_session_cls()

        # Khoi tao session cho SQLite
        sqlite_session_cls = sessionmaker(bind=sqlite_engine)
        sq_db = sqlite_session_cls()

        print("[MIGRATION] Tao bang bieu thanh cong tren Postgres. Bat dau doc tu SQLite...")

        # 2. Migrate USERS
        users = sq_db.query(User).all()
        print(f"   - Tim thay {len(users)} nguoi dung tu SQLite.")
        for u in users:
            # Kiem tra xem da ton tai chua
            exists = pg_db.query(User).filter(User.id == u.id).first()
            if not exists:
                new_u = User(
                    id=u.id,
                    email=u.email,
                    password_hash=u.password_hash,
                    full_name=u.full_name,
                    created_at=u.created_at,
                )
                pg_db.add(new_u)
        pg_db.commit()
        print("   -> Di cu USERS hoan tat.")

        # 3. Migrate COURSES
        courses = sq_db.query(Course).all()
        print(f"   - Tim thay {len(courses)} mon hoc tu SQLite.")
        for c in courses:
            exists = pg_db.query(Course).filter(Course.id == c.id).first()
            if not exists:
                new_c = Course(
                    id=c.id,
                    user_id=c.user_id,
                    course_code=c.course_code,
                    course_name=c.course_name,
                    created_at=c.created_at,
                )
                pg_db.add(new_c)
        pg_db.commit()
        print("   -> Di cu COURSES hoan tat.")

        # 4. Migrate CLOS
        clos = sq_db.query(CLO).all()
        print(f"   - Tim thay {len(clos)} chuan dau ra (CLO) tu SQLite.")
        for clo in clos:
            exists = pg_db.query(CLO).filter(CLO.id == clo.id).first()
            if not exists:
                new_clo = CLO(
                    id=clo.id,
                    course_id=clo.course_id,
                    clo_code=clo.clo_code,
                    description=clo.description,
                    bloom_level=clo.bloom_level,
                )
                pg_db.add(new_clo)
        pg_db.commit()
        print("   -> Di cu CLOS hoan tat.")

        # 5. Migrate CHAPTERS
        chapters = sq_db.query(Chapter).all()
        print(f"   - Tim thay {len(chapters)} chuong hoc tu SQLite.")
        for ch in chapters:
            exists = pg_db.query(Chapter).filter(Chapter.id == ch.id).first()
            if not exists:
                new_ch = Chapter(
                    id=ch.id,
                    course_id=ch.course_id,
                    sort_order=ch.sort_order,
                    title=ch.title,
                    description=ch.description,
                    created_at=ch.created_at,
                )
                pg_db.add(new_ch)
        pg_db.commit()
        print("   -> Di cu CHAPTERS hoan tat.")

        # 6. Migrate CHAPTER MATERIALS
        materials = sq_db.query(ChapterMaterial).all()
        print(f"   - Tim thay {len(materials)} hoc lieu chuong hoc tu SQLite.")
        for mat in materials:
            exists = pg_db.query(ChapterMaterial).filter(ChapterMaterial.id == mat.id).first()
            if not exists:
                new_mat = ChapterMaterial(
                    id=mat.id,
                    chapter_id=mat.chapter_id,
                    slide_content=mat.slide_content,
                    active_learning_script=mat.active_learning_script,
                    updated_at=mat.updated_at,
                )
                pg_db.add(new_mat)
        pg_db.commit()
        print("   -> Di cu CHAPTER MATERIALS hoan tat.")

        # 7. Migrate QUESTIONS
        questions = sq_db.query(Question).all()
        print(f"   - Tim thay {len(questions)} cau hoi tu SQLite.")
        for q in questions:
            exists = pg_db.query(Question).filter(Question.id == q.id).first()
            if not exists:
                new_q = Question(
                    id=q.id,
                    course_id=q.course_id,
                    chapter_id=q.chapter_id,
                    question_text=q.question_text,
                    question_type=q.question_type,
                    options_json=q.options_json,
                    correct_answer=q.correct_answer,
                    bloom_level=q.bloom_level,
                    clo_id=q.clo_id,
                    is_active=q.is_active,
                    created_at=q.created_at,
                )
                pg_db.add(new_q)
        pg_db.commit()
        print("   -> Di cu QUESTIONS hoan tat.")

        # Dong ket noi
        sq_db.close()
        pg_db.close()

        print("[SUCCESS] TIEN TRINH DI CU DU LIEU SANG POSTGRESQL HOAN TAT THANH CONG!")
        return True

    except Exception as e:
        print(f"[ERROR] Loi trong qua trinh migrate sang PostgreSQL: {e}")
        return False


if __name__ == "__main__":
    migrate_db()
