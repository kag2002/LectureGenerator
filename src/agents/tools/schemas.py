CHATBOT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_course_knowledge",
            "description": "Tìm kiếm tài liệu học trình, giáo trình, slide hoặc bài đọc bằng RAG (Vector DB) theo khóa học.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Từ khóa hoặc câu hỏi cần tìm kiếm trong tài liệu học trình.",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_course_clos",
            "description": "Xem danh sách các Chuẩn đầu ra (CLOs) hiện tại của môn học cùng với mức độ Bloom tối thiểu.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_matrix_coverage",
            "description": "Lấy ma trận phân bổ độ bao phủ CLO x Bloom cho cả slide bài giảng và câu hỏi thi trắc nghiệm.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clarify",
            "description": "Gọi công cụ này khi câu hỏi của người dùng còn quá mơ hồ, thiếu thông tin và cần hỏi thêm để làm rõ.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "Câu hỏi đặt lại cho giảng viên để làm rõ ý."}
                },
                "required": ["question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_course_chapters",
            "description": "Xem danh sách các chương học (đề cương/outline) của môn học hiện tại.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_course_outline_action",
            "description": "Tạo tự động cấu trúc chương học (đề cương) của khóa học dựa trên danh sách CLOs hiện có và lưu vào cơ sở dữ liệu.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_storyboard_action",
            "description": "Lên khung slide nháp (storyboard outline) cho một chương học cụ thể (gồm tiêu đề slide, mục đích, CLO liên kết, Bloom level). Nếu người dùng không chỉ rõ chương, hãy dùng get_course_chapters trước rồi hỏi người dùng chọn theo TÊN chương, KHÔNG hỏi ID số.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học (lấy từ kết quả get_course_chapters). Nếu không truyền, hệ thống sẽ tự chọn chương đầu tiên.",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["vi", "en", "bilingual"],
                        "description": "Ngôn ngữ của bài giảng ('vi': Tiếng Việt, 'en': Tiếng Anh, 'bilingual': Song ngữ). Mặc định là 'vi'.",
                    },
                    "session_duration": {
                        "type": "integer",
                        "description": "Thời lượng tiết học tính bằng phút. Mặc định là 90.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_materials_action",
            "description": "Sinh chi tiết nội dung slide bài giảng (Markdown) và kịch bản active learning cho một chương học, sau đó lưu trực tiếp vào CSDL. Nếu người dùng không chỉ rõ chương, hãy dùng get_course_chapters trước rồi hỏi người dùng chọn theo TÊN chương, KHÔNG hỏi ID số.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học (lấy từ kết quả get_course_chapters). Nếu không truyền, hệ thống sẽ tự chọn chương đầu tiên.",
                    },
                    "class_size": {
                        "type": "integer",
                        "description": "Sĩ số lớp học để thiết kế các hoạt động active learning nhóm. Mặc định là 40.",
                    },
                    "has_wifi": {"type": "boolean", "description": "Wifi lớp học có khả dụng không. Mặc định là true."},
                    "furniture_type": {
                        "type": "string",
                        "enum": ["movable", "fixed"],
                        "description": "Loại bàn ghế lớp học: 'movable' (di chuyển được) hoặc 'fixed' (cố định). Mặc định là 'movable'.",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["vi", "en", "bilingual"],
                        "description": "Ngôn ngữ của bài giảng: 'vi' (Tiếng Việt), 'en' (Tiếng Anh), 'bilingual' (Song ngữ). Mặc định là 'vi'.",
                    },
                    "session_duration": {
                        "type": "integer",
                        "description": "Thời lượng tiết học tính bằng phút. Mặc định là 90.",
                    },
                    "storyboard": {
                        "type": "array",
                        "description": "Danh sách các slide cấu trúc nháp để sinh chi tiết (nếu có).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "slide_index": {"type": "integer"},
                                "title": {"type": "string"},
                                "purpose": {"type": "string"},
                                "target_clo": {"type": "string"},
                                "bloom_level": {"type": "integer"},
                            },
                            "required": ["slide_index", "title", "purpose", "target_clo", "bloom_level"],
                        },
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_chapter_questions_action",
            "description": "Sinh câu hỏi trắc nghiệm MCQ dựa trên CLO, chương học và mức độ Bloom, chạy kiểm duyệt tự sửa lỗi (Self-Correction) và lưu trực tiếp vào CSDL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học (lấy từ kết quả get_course_chapters). Nếu không truyền, hệ thống sẽ tự chọn chương đầu tiên.",
                    },
                    "clo_id": {"type": "integer", "description": "ID của CLO mục tiêu cần sinh câu hỏi (Tùy chọn)."},
                    "bloom_level": {"type": "integer", "description": "Mức độ Bloom từ 1 đến 6. Mặc định là 3."},
                    "count": {"type": "integer", "description": "Số lượng câu hỏi cần sinh (1-10). Mặc định là 5."},
                    "fast_mode": {
                        "type": "boolean",
                        "description": "Bỏ qua bước Self-Correction của Solver để sinh nhanh hơn. Mặc định là false.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_course_info",
            "description": "Xem thông tin chung của môn học bao gồm giáo trình bắt buộc (required_textbooks) và tài liệu đọc thêm (recommended_readings).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chapter_materials",
            "description": "Xem nội dung slide bài giảng chi tiết (Markdown) và kịch bản active learning của một chương học đã được soạn thảo trong hệ thống.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học cần xem học liệu. Nếu không truyền, hệ thống tự động lấy chương đầu tiên.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chapter_questions",
            "description": "Xem danh sách các câu hỏi trắc nghiệm MCQ chi tiết (nội dung câu hỏi, các lựa chọn, đáp án đúng, CLO, Bloom) đã sinh cho một chương học cụ thể hoặc toàn khóa học.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "integer",
                        "description": "ID của chương học cần xem câu hỏi. Nếu không truyền, hệ thống sẽ lấy tất cả câu hỏi của môn học.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_uploaded_documents",
            "description": "Xem danh sách các tài liệu RAG nguồn (giáo án, slide PDF, tài liệu tham khảo) đã được giảng viên tải lên cho môn học này.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_rules",
            "description": "Xem danh sách các quy tắc phản tư sư phạm tự học (System Rules) đã được giảng viên phê duyệt để áp dụng cho môn học này.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]
