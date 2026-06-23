import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import (
    CLO,
    AIGenerationTrace,
    Chapter,
    Course,
    Question,
    QuizAggregate,
    QuizSession,
    User,
)
from src.database.session import get_db
from src.models.schemas import (
    AssessmentAnalyticsResponse,
    CLOAchievement,
    ImprovementRecord,
    QuizResponseSubmit,
    QuizSessionCreate,
    QuizSessionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/courses", tags=["assessments"])


# --- API QUIZ SESSIONS ---

@router.post("/{course_id}/quiz-sessions", response_model=QuizSessionResponse, status_code=status.HTTP_201_CREATED)
def create_quiz_session(
    course_id: int,
    req: QuizSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tạo một phiên làm bài trắc nghiệm mới cho lớp học."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    if req.chapter_id is not None:
        chapter = db.query(Chapter).filter(Chapter.id == req.chapter_id, Chapter.course_id == course_id).first()
        if not chapter:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Chương học không hợp lệ.")

    # Đóng các session đang active trước đó của môn học này
    active_sessions = db.query(QuizSession).filter(
        QuizSession.course_id == course_id,
        QuizSession.status == "active"
    ).all()
    for s in active_sessions:
        s.status = "closed"

    new_session = QuizSession(
        course_id=course_id,
        chapter_id=req.chapter_id,
        session_name=req.session_name,
        status="active"
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.get("/{course_id}/quiz-sessions", response_model=list[QuizSessionResponse])
def get_quiz_sessions(
    course_id: int,
    status_filter: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lấy danh sách các phiên làm bài trắc nghiệm của môn học."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    query = db.query(QuizSession).filter(QuizSession.course_id == course_id)
    if status_filter:
        query = query.filter(QuizSession.status == status_filter)

    return query.order_by(QuizSession.created_at.desc()).all()


@router.post("/quiz-sessions/{session_id}/submit")
def submit_quiz_response(
    session_id: int,
    req: QuizResponseSubmit,
    db: Session = Depends(get_db),
):
    """Nhận kết quả câu trả lời đơn lẻ của học sinh khi làm bài gộp qua H5P Player (Không cần định danh)."""
    session = db.query(QuizSession).filter(QuizSession.id == session_id, QuizSession.status == "active").first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Phiên học không tồn tại hoặc đã đóng."
        )

    # Xác thực câu hỏi thuộc về môn học của phiên này
    question = db.query(Question).filter(Question.id == req.question_id, Question.course_id == session.course_id).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Câu hỏi không hợp lệ.")

    # Tìm hoặc tạo bản ghi Aggregate cho câu hỏi trong session này
    agg = db.query(QuizAggregate).filter(
        QuizAggregate.session_id == session_id,
        QuizAggregate.question_id == req.question_id
    ).first()

    if not agg:
        agg = QuizAggregate(
            session_id=session_id,
            question_id=req.question_id,
            total_responses=0,
            correct_responses=0,
            choices_distribution=json.dumps({"A": 0, "B": 0, "C": 0, "D": 0})
        )
        db.add(agg)
        db.flush()

    agg.total_responses += 1
    if req.is_correct:
        agg.correct_responses += 1

    # Cập nhật phân phối phương án chọn
    try:
        dist = json.loads(agg.choices_distribution) if agg.choices_distribution else {}
    except Exception:
        dist = {}

    opt = req.selected_option.upper().strip()
    if opt:
        dist[opt] = dist.get(opt, 0) + 1
    agg.choices_distribution = json.dumps(dist)

    db.commit()
    return {"status": "success", "message": "Ghi nhận kết quả gộp thành công."}


# --- API IMPORT & EXPORT KAHOOT ---

@router.get("/{course_id}/questions/export-kahoot")
def export_questions_to_kahoot(
    course_id: int,
    chapter_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Xuất ngân hàng câu hỏi thành file Excel (.xlsx) hoặc CSV tương thích với mẫu Import của Kahoot."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    query = db.query(Question).filter(Question.course_id == course_id, Question.is_active)
    if chapter_id:
        query = query.filter(Question.chapter_id == chapter_id)
    questions = query.all()

    import io

    from src.services.assessment_service import generate_kahoot_export

    file_bytes, ext, media_type = generate_kahoot_export(questions)

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=Kahoot_Export_Course_{course_id}.{ext}"}
    )


@router.post("/{course_id}/quiz-sessions/import-kahoot")
async def import_kahoot_results(
    course_id: int,
    file: UploadFile = File(...),
    chapter_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import file kết quả Excel hoặc CSV tải về từ Kahoot để tính điểm gộp (Fuzzy matching câu hỏi)."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 1. Tạo một QuizSession mới đại diện cho kết quả import này
    timestamp_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    session_name = f"Imported Kahoot - {timestamp_str}"

    # Close any other active sessions
    active_sessions = db.query(QuizSession).filter(
        QuizSession.course_id == course_id,
        QuizSession.status == "active"
    ).all()
    for s in active_sessions:
        s.status = "closed"

    new_session = QuizSession(
        course_id=course_id,
        chapter_id=chapter_id,
        session_name=session_name,
        status="closed"  # Imported sessions are closed by default
    )
    db.add(new_session)
    db.flush()

    # 2. Lấy tất cả câu hỏi của môn học trong DB để Fuzzy Match
    db_questions = db.query(Question).filter(Question.course_id == course_id, Question.is_active).all()

    # Read file content
    contents = await file.read()
    filename = file.filename.lower() if file.filename else ""

    from src.services.assessment_service import distribute_incorrect_choices, parse_kahoot_file

    try:
        parsed_rows = parse_kahoot_file(contents, filename, db_questions)
    except ValueError as ve:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )

    if not parsed_rows:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Không tìm thấy câu hỏi nào trùng khớp với Ngân hàng đề thi của môn học. Vui lòng kiểm tra lại file báo cáo."
        )

    # 3. Ghi nhận dữ liệu aggregates
    imported_count = 0
    for p in parsed_rows:
        q_id = p["question_id"]
        c_count = p["correct_count"]
        i_count = p["incorrect_count"]
        tot = c_count + i_count
        if tot == 0:
            continue

        db_q = db.query(Question).filter(Question.id == q_id).first()
        dist = {"A": 0, "B": 0, "C": 0, "D": 0}
        if db_q:
            dist = distribute_incorrect_choices(db_q.options_json, db_q.correct_answer, c_count, i_count)

        agg = QuizAggregate(
            session_id=new_session.id,
            question_id=q_id,
            total_responses=tot,
            correct_responses=c_count,
            choices_distribution=json.dumps(dist)
        )
        db.add(agg)
        imported_count += 1

    db.commit()
    db.refresh(new_session)

    return {
        "message": f"Nạp thành công file điểm Kahoot. Đã đồng bộ {imported_count} câu hỏi.",
        "session": {
            "id": new_session.id,
            "session_name": new_session.session_name,
            "created_at": new_session.created_at,
        }
    }


# --- API PEDAGOGICAL ANALYTICS ---

@router.get("/{course_id}/assessment-analytics", response_model=AssessmentAnalyticsResponse)
def get_assessment_analytics(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tính điểm gộp CAS cho từng CLO và trả về nhật ký lịch sử cải tiến slide bài giảng."""
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 1. Lấy tất cả CLOs
    clos = db.query(CLO).filter(CLO.course_id == course_id).all()

    # 2. Tính điểm CAS gộp cho từng CLO
    clo_achievements = []
    for c in clos:
        # Lấy tất cả câu hỏi thuộc CLO này
        questions = db.query(Question).filter(Question.clo_id == c.id, Question.is_active).all()
        q_ids = [q.id for q in questions]

        total_resp = 0
        correct_resp = 0

        if q_ids:
            # Query aggregates for these questions
            aggregates = db.query(QuizAggregate).filter(QuizAggregate.question_id.in_(q_ids)).all()
            for agg in aggregates:
                total_resp += agg.total_responses
                correct_resp += agg.correct_responses

        cas = (correct_resp / total_resp) * 100.0 if total_resp > 0 else 0.0

        # Classification
        if cas >= 70.0:
            status_val = "passing"
        elif cas >= 60.0:
            status_val = "warning"
        else:
            status_val = "critical"

        # If no attempts yet, default to passing/neutral or 100% depending on UI context, let's keep actual CAS
        if total_resp == 0:
            cas = 100.0  # Default to 100% or neutral
            status_val = "passing"

        clo_achievements.append(CLOAchievement(
            clo_id=c.id,
            clo_code=c.clo_code,
            description=c.description,
            bloom_level=c.bloom_level,
            cas_score=round(cas, 1),
            status=status_val
        ))

    # 3. Lấy Nhật ký Cải tiến Slide (AIGenerationTrace)
    traces = (
        db.query(AIGenerationTrace)
        .filter(AIGenerationTrace.course_id == course_id)
        .order_by(AIGenerationTrace.created_at.desc())
        .all()
    )

    improvements = []
    # Join with Chapter to get chapter title
    for t in traces:
        ch_title = "Slide bài giảng"
        if t.chapter_id:
            chapter = db.query(Chapter).filter(Chapter.id == t.chapter_id).first()
            if chapter:
                ch_title = chapter.title

        improvements.append(ImprovementRecord(
            id=t.id,
            chapter_id=t.chapter_id or 0,
            chapter_title=ch_title,
            proposed_content=t.proposed_content,
            edited_content=t.edited_content,
            pedagogical_reason=t.feedback or "AI cải tiến chất lượng bài giảng (CLO Audit)",
            created_at=t.created_at
        ))

    return AssessmentAnalyticsResponse(
        clos=clo_achievements,
        improvements=improvements
    )
