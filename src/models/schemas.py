from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# --- CHATBOT SCHEMAS ---


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")


# --- AUTH SCHEMAS ---


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


# --- COURSE & CLO SCHEMAS ---


class CourseCreate(BaseModel):
    course_code: str = Field(..., json_schema_extra={"example": "COMP2010"})
    course_name: str = Field(..., json_schema_extra={"example": "Cấu trúc dữ liệu và Giải thuật"})


class CourseUpdate(BaseModel):
    course_code: str = Field(..., json_schema_extra={"example": "COMP2010"})
    course_name: str = Field(..., json_schema_extra={"example": "Cấu trúc dữ liệu và Giải thuật"})
    required_textbooks: str | None = None
    recommended_readings: str | None = None


class CourseResponse(BaseModel):
    id: int
    course_code: str
    course_name: str
    required_textbooks: str | None = None
    recommended_readings: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CLOCreate(BaseModel):
    clo_code: str = Field(..., json_schema_extra={"example": "CLO1"})
    description: str = Field(..., json_schema_extra={"example": "Giải thích được cơ chế hoạt động của cây BST."})
    bloom_level: int = Field(..., ge=1, le=6, json_schema_extra={"example": 2})


class CLOResponse(BaseModel):
    id: int
    course_id: int
    clo_code: str
    description: str
    bloom_level: int

    model_config = ConfigDict(from_attributes=True)


class DocumentMetadataUpdate(BaseModel):
    category: str | None = None
    tags: str | None = None
    chapter_id: int | None = None


# --- OUTLINE/CHAPTER SCHEMAS ---


class ChapterCreate(BaseModel):
    title: str = Field(..., json_schema_extra={"example": "Chương 1: Tổng quan về Cây BST"})
    description: str = Field(
        ...,
        json_schema_extra={"example": "Giới thiệu cấu trúc cây, định nghĩa và tính chất của cây nhị phân tìm kiếm."},
    )
    sort_order: int = Field(..., json_schema_extra={"example": 1})


class ChapterResponse(BaseModel):
    id: int
    course_id: int
    sort_order: int
    title: str
    description: str | None

    model_config = ConfigDict(from_attributes=True)


# --- MATERIALS SCHEMAS ---


class MaterialSave(BaseModel):
    slide_content: str = Field(..., description="Slide outline dạng Markdown")
    active_learning_script: str = Field(..., description="Kịch bản hoạt động active learning")
    diagram_layouts: str | None = Field(None, description="Tọa độ sắp xếp các node sơ đồ trực quan")


class MaterialResponse(BaseModel):
    id: int
    chapter_id: int
    slide_content: str | None
    active_learning_script: str | None
    diagram_layouts: str | None = None
    created_by: str | None = None
    status: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MaterialGenerateRequest(BaseModel):
    class_size: int = Field(40, description="Sĩ số lớp học để thiết kế nhóm")
    has_wifi: bool = Field(True, description="Wifi lớp học có khả dụng không")
    furniture_type: str = Field("movable", description="Bàn ghế: 'movable' (di chuyển) hoặc 'fixed' (cố định)")
    language: str = Field(
        "vi", description="Ngôn ngữ bài giảng: 'vi' (Tiếng Việt) hoặc 'en' (Tiếng Anh) hoặc 'bilingual' (Song ngữ)"
    )
    session_duration: int = Field(90, description="Tổng thời lượng tiết học (phút)")
    pedagogical_style: str = Field("interactive", description="Phong cách giảng dạy")
    learner_level: str = Field("intermediate", description="Trình độ người học")
    selected_clos: list[str] = Field([], description="Mã CLO trọng tâm")


class ReconcileActiveLearningRequest(BaseModel):
    slide_content: str = Field(..., description="Nội dung slide mới đã chỉnh sửa")
    class_size: int = Field(40, description="Sĩ số lớp")
    has_wifi: bool = Field(True, description="Có wifi không")
    furniture_type: str = Field("movable", description="Kiểu bàn ghế")
    language: str = Field("vi", description="Ngôn ngữ kịch bản")


class StoryboardSlide(BaseModel):
    slide_index: int
    title: str
    purpose: str
    target_clo: str
    bloom_level: int


class MaterialGenerateFromStoryboardRequest(BaseModel):
    class_size: int = Field(40, description="Sĩ số lớp học để thiết kế nhóm")
    has_wifi: bool = Field(True, description="Wifi lớp học có khả dụng không")
    furniture_type: str = Field("movable", description="Bàn ghế: 'movable' (di chuyển) hoặc 'fixed' (cố định)")
    language: str = Field(
        "vi", description="Ngôn ngữ bài giảng: 'vi' (Tiếng Việt) hoặc 'en' (Tiếng Anh) hoặc 'bilingual' (Song ngữ)"
    )
    session_duration: int = Field(90, description="Tổng thời lượng tiết học (phút)")
    storyboard: list[StoryboardSlide]
    pedagogical_style: str = Field("interactive", description="Phong cách giảng dạy")
    learner_level: str = Field("intermediate", description="Trình độ người học")
    selected_clos: list[str] = Field([], description="Mã CLO trọng tâm")


class AppendSlideRequest(BaseModel):
    clo_id: int = Field(..., description="ID của CLO mục tiêu")
    bloom_level: int = Field(..., ge=1, le=6, description="Mức Bloom")


class RevisionRequest(BaseModel):
    prompt: str = Field(..., description="Yêu cầu chỉnh sửa của giảng viên")


class SingleSlideRevisionRequest(BaseModel):
    current_slide_content: str = Field(..., description="Nội dung Markdown thô của slide hiện tại cần sửa")
    prompt: str = Field(..., description="Yêu cầu chỉnh sửa của giảng viên")


# --- QUESTIONS SCHEMAS ---


class QuestionGenerateRequest(BaseModel):
    clo_id: int | None = Field(None, description="ID của CLO mục tiêu")
    chapter_id: int | None = Field(None, description="ID của chương học")
    bloom_level: int = Field(3, ge=1, le=6, description="Mức độ Bloom từ 1 đến 6")
    count: int = Field(5, ge=1, le=10, description="Số lượng câu hỏi cần sinh")
    fast_mode: bool = Field(False, description="Nếu True, bỏ qua bước Self-Correction để sinh câu hỏi nhanh chóng")


class QuestionCreateRequest(BaseModel):
    chapter_id: int | None = Field(None, description="ID của chương học")
    question_text: str = Field(..., description="Nội dung câu hỏi")
    options_json: str = Field(..., description="Mảng các lựa chọn dưới dạng JSON string")
    correct_answer: str = Field(..., description="Đáp án đúng")
    bloom_level: int = Field(..., ge=1, le=6, description="Mức Bloom")
    clo_id: int | None = Field(None, description="ID CLO liên kết")


class QuestionUpdateRequest(BaseModel):
    question_text: str = Field(..., description="Nội dung câu hỏi")
    options_json: str = Field(..., description="Mảng các lựa chọn dưới dạng JSON string")
    correct_answer: str = Field(..., description="Đáp án đúng")
    bloom_level: int = Field(..., ge=1, le=6, description="Mức Bloom")
    clo_id: int | None = Field(None, description="ID CLO liên kết")


class QuestionResponse(BaseModel):
    id: int
    course_id: int
    chapter_id: int | None
    question_text: str
    question_type: str
    options_json: str | None
    correct_answer: str
    bloom_level: int
    clo_id: int | None
    is_active: bool
    created_by: str | None = None
    status: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SearchTestRequest(BaseModel):
    query: str
    top_k: int = 5


class SyllabusGenerateRequest(BaseModel):
    course_name: str = Field(..., description="Tên môn học")
    course_code: str | None = Field(None, description="Mã môn học")
    course_description: str | None = Field(None, description="Mô tả hoặc mục tiêu môn học")
    audience: str | None = Field("Undergraduate", description="Đối tượng/Trình độ học viên")
    duration_weeks: int = Field(15, description="Số tuần học (thời lượng)")
    learning_outcomes_focus: str | None = Field(None, description="Định hướng chuẩn đầu ra mong muốn")
    language: str = Field("vi", description="Ngôn ngữ sinh syllabus ('vi' hoặc 'en')")


# --- ASSESSMENT & LOOP HUB SCHEMAS ---

class QuizSessionCreate(BaseModel):
    chapter_id: int | None = Field(None, description="ID của chương học")
    session_name: str = Field(..., description="Tên phiên chơi game")


class QuizSessionResponse(BaseModel):
    id: int
    course_id: int
    chapter_id: int | None
    session_name: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuizResponseSubmit(BaseModel):
    question_id: int = Field(..., description="ID của câu hỏi")
    selected_option: str = Field(..., description="Đáp án được chọn (A, B, C, D...)")
    is_correct: bool = Field(..., description="Trạng thái trả lời đúng/sai")


class CLOAchievement(BaseModel):
    clo_id: int
    clo_code: str
    description: str
    bloom_level: int
    cas_score: float
    status: str  # "passing" | "warning" | "critical"


class ImprovementRecord(BaseModel):
    id: int
    chapter_id: int
    chapter_title: str
    proposed_content: str | None
    edited_content: str | None
    pedagogical_reason: str | None
    created_at: datetime


class AssessmentAnalyticsResponse(BaseModel):
    clos: list[CLOAchievement]
    improvements: list[ImprovementRecord]


