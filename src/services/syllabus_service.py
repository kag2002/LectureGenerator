import json
import os
from collections.abc import Generator

from src.database.models import CLO, Course
from src.database.session import SessionLocal
from src.services.syllabus_analyser import analyse_syllabus
from src.utils.parser import parse_document, safe_parse_bloom_level


def generate_syllabus_parse_events(temp_file_path: str, course_id: int) -> Generator[str, None, None]:
    """
    Generator function that runs the syllabus parsing pipeline, saves
    extracted CLOs to the database, and yields SSE event strings.
    """

    def send(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    new_db = SessionLocal()
    try:
        # Stage 1: Đọc tài liệu
        yield send("stage", {"stage": 1, "message": "📄 Đang trích xuất văn bản từ tài liệu đề cương..."})

        text_content = parse_document(temp_file_path)
        if not text_content or not text_content.strip():
            yield send(
                "error",
                {
                    "message": "Không thể đọc nội dung văn bản từ tài liệu tải lên. Tài liệu có thể là ảnh quét (scanned PDF), tài liệu rỗng, hoặc không có văn bản chọn được. Vui lòng chuyển đổi OCR hoặc sử dụng tệp đề cương định dạng văn bản (text-based) trước khi tải lên."
                },
            )
            return

        # Stage 2: AI phân tích
        yield send(
            "stage", {"stage": 2, "message": "🤖 AI đang bóc tách cấu trúc và chuẩn hóa các chuẩn đầu ra CLO..."}
        )
        analysis_result = analyse_syllabus(text_content)

        # Stage 3: Phân cấp mức Bloom
        yield send("stage", {"stage": 3, "message": "📊 Đang chuẩn hóa động từ hành động và phân cấp mức Bloom..."})

        # Khôi phục môn học trong session mới
        new_course = new_db.query(Course).filter(Course.id == course_id).first()
        if "course_code" in analysis_result and analysis_result["course_code"]:
            new_course.course_code = analysis_result["course_code"]
        if "course_name" in analysis_result and analysis_result["course_name"]:
            new_course.course_name = analysis_result["course_name"]
        if "required_textbooks" in analysis_result:
            books = analysis_result["required_textbooks"]
            new_course.required_textbooks = "\n".join(books) if isinstance(books, list) else str(books)
        if "recommended_readings" in analysis_result:
            readings = analysis_result["recommended_readings"]
            new_course.recommended_readings = "\n".join(readings) if isinstance(readings, list) else str(readings)

        # Stage 4: Lưu trữ vào DB
        yield send("stage", {"stage": 4, "message": "💾 Đang lưu trữ và đồng bộ hóa danh sách CLOs..."})

        # Xóa các CLOs cũ của môn này
        new_db.query(CLO).filter(CLO.course_id == course_id).delete()
        new_db.commit()

        raw_clos = analysis_result.get("clos", [])
        if not raw_clos:
            yield send(
                "error",
                {
                    "message": "Không tìm thấy chuẩn đầu ra (CLO) nào trong tài liệu. Vui lòng kiểm tra lại file tải lên có đúng là đề cương môn học (Syllabus) chứa các mục CLO1, CLO2... không."
                },
            )
            return

        created_clos = []

        for idx, clo_item in enumerate(raw_clos):
            new_clo = CLO(
                course_id=course_id,
                clo_code=clo_item.get("clo_code", f"CLO{idx + 1}"),
                description=clo_item.get("description", ""),
                bloom_level=safe_parse_bloom_level(clo_item.get("bloom_level", 2), 2),
            )
            new_db.add(new_clo)
            new_db.commit()
            new_db.refresh(new_clo)
            created_clos.append(new_clo)

            # Gửi từng CLO vừa lưu xong về client
            yield send(
                "clo",
                {
                    "index": idx + 1,
                    "total": len(raw_clos),
                    "clo": {
                        "id": new_clo.id,
                        "course_id": new_clo.course_id,
                        "clo_code": new_clo.clo_code,
                        "description": new_clo.description,
                        "bloom_level": new_clo.bloom_level,
                    },
                },
            )

        yield send(
            "done",
            {
                "message": "✅ Đã phân tích và chuẩn hóa CLOs thành công!",
                "course": {
                    "id": new_course.id,
                    "course_code": new_course.course_code,
                    "course_name": new_course.course_name,
                    "required_textbooks": new_course.required_textbooks,
                    "recommended_readings": new_course.recommended_readings,
                },
                "clos": [
                    {
                        "id": c.id,
                        "course_id": c.course_id,
                        "clo_code": c.clo_code,
                        "description": c.description,
                        "bloom_level": c.bloom_level,
                    }
                    for c in created_clos
                ],
            },
        )

    except Exception as e:
        new_db.rollback()
        yield send("error", {"message": f"Lỗi hệ thống khi phân tích Syllabus: {str(e)}"})
    finally:
        new_db.close()
        # Xóa file tạm
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
