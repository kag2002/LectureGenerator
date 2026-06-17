import os
import re

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.auth import get_current_user
from src.database.models import Course, RAGDocument, User
from src.database.session import get_db
from src.database.vector_db import add_document_vector
from src.services.web_search_mock_data import MOCK_SEARCH_RESULTS_AVL, MOCK_SEARCH_RESULTS_DEFAULT
from src.utils.llm_client import call_llm_json

router = APIRouter(prefix="/api/courses", tags=["web_search"])


# Pydantic Schemas
class WebSearchRequest(BaseModel):
    query: str = Field(..., json_schema_extra={"example": "Cây nhị phân AVL tự cân bằng"})
    max_results: int | None = 10
    threshold: float | None = 0.7
    chapter_id: int | None = None


# --- CORE SERVICES: WEB SEARCH & CREDIBILITY EVALUATION ---


def web_search_tavily(query: str, max_results: int = 10) -> list[dict]:
    """
    Gọi Tavily Web Search API. Fallback sang Mock Search nếu không có API Key.
    Tự động tối ưu hóa từ khóa truy vấn học thuật dưới nền.
    """
    # Tự động tăng cường truy vấn học thuật nếu không chứa từ khóa học thuật đặc trưng
    query_lower = query.lower()
    academic_keywords = [
        "syllabus",
        "lecture",
        "slide",
        "research",
        "paper",
        "journal",
        "complexity",
        "definition",
        "algorithm",
        "theory",
        "concept",
        "proof",
    ]
    augmented_query = query
    if not any(kw in query_lower for kw in academic_keywords):
        augmented_query = f"{query} academic lecture notes OR course material"

    tavily_key = os.environ.get("TAVILY_API_KEY")
    if tavily_key:
        try:
            url = "https://api.tavily.com/search"
            payload = {
                "api_key": tavily_key,
                "query": augmented_query,
                "search_depth": "basic",
                "max_results": max_results,
            }
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code == 200:
                results = response.json().get("results", [])
                items = []
                for r in results:
                    items.append(
                        {"title": r.get("title", "N/A"), "url": r.get("url", ""), "content": r.get("content", "")}
                    )
                return items
            else:
                print(f"[WARNING] Tavily API tra ve code {response.status_code}. Fallback sang Mock.")
        except Exception as e:
            print(f"[WARNING] Loi khi goi Tavily Search ({e}). Fallback sang Mock.")

    # Fallback Mock Search
    print("[INFO] Su dung Mock Web Search vi khong co API Key hoac gap loi.")
    query_lower = query.lower()

    if "avl" in query_lower:
        return MOCK_SEARCH_RESULTS_AVL
    else:
        return MOCK_SEARCH_RESULTS_DEFAULT


def evaluate_source_credibility(title: str, url: str, content: str) -> dict:
    """
    Đánh giá độ uy tín học thuật của nguồn web (Academic Credibility Score).
    Trả về dict gồm: score (0.0 -> 1.0) và justification (lập luận).
    """
    url_lower = url.lower()
    content_lower = content.lower()
    title_lower = title.lower()

    score = 0.0
    reasons = []

    # 1. Domain & Publisher (Tối đa 0.5)
    env_domains = os.environ.get("HIGH_ACADEMIC_DOMAINS")
    if env_domains:
        high_academic_domains = [d.strip().lower() for d in env_domains.split(",") if d.strip()]
    else:
        high_academic_domains = [
            "ieee.org",
            "springer.com",
            "sciencedirect.com",
            "cambridge.org",
            "harvard.edu",
            "vinuni.edu.vn",
            "mit.edu",
            "nature.com",
            "stanford.edu",
            "arxiv.org",
            "oxfordjournals.org",
            "wiley.com",
            "researchgate.net",
            "acm.org",
            "scholar.google.com",
            "wikipedia.org",
            "geeksforgeeks.org",
            "github.com",
            "w3schools.com",
        ]

    is_high_domain = False
    for d in high_academic_domains:
        if d in url_lower:
            score += 0.5
            reasons.append(f"Domain thuoc danh sach hoc thuat: {d} (+0.50)")
            is_high_domain = True
            break

    if not is_high_domain:
        if ".edu" in url_lower or ".edu.vn" in url_lower:
            score += 0.4
            reasons.append("Ten mien to chuc giao duc (.edu) (+0.40)")
        elif ".gov" in url_lower or ".gov.vn" in url_lower:
            score += 0.35
            reasons.append("Ten mien co quan chinh phu (.gov) (+0.35)")
        elif ".org" in url_lower:
            score += 0.2
            reasons.append("Ten mien to chuc phi loi nhuan (.org) (+0.20)")
        elif any(bad in url_lower for bad in ["blogspot", "facebook.com", "twitter.com", "x.com", "reddit.com"]):
            score -= 0.3
            reasons.append("Nguon tin tu blog ca nhan hoac mang xa hoi kem uy tin (-0.30)")

    # 2. DOI / ISSN Identification (Tối đa 0.2)
    if re.search(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", content_lower, re.IGNORECASE) or "doi:" in content_lower:
        score += 0.2
        reasons.append("Phat hien ma chi so nghien cuu DOI hop le (+0.20)")
    elif "issn" in content_lower:
        score += 0.15
        reasons.append("Phat hien ma so chuan quoc te ISSN (+0.15)")

    # 3. Consensus & Academic keywords (Tối đa 0.15)
    academic_keywords = [
        "lecture notes",
        "course syllabus",
        "theorem",
        "lemma",
        "proof",
        "complexity analysis",
        "complexity proof",
        "citation",
        "bibliography",
    ]
    keyword_count = sum(1 for kw in academic_keywords if kw in content_lower or kw in title_lower)
    if keyword_count >= 2:
        score += 0.15
        reasons.append(f"Chua {keyword_count} tu khoa hoc thuat dac trung (+0.15)")
    elif keyword_count == 1:
        score += 0.08
        reasons.append("Chua 1 tu khoa hoc thuat dac trung (+0.08)")

    # 4. Recency (Tối đa 0.15)
    years = re.findall(r"\b(201[5-9]|202[0-9])\b", content_lower)
    if years:
        score += 0.15
        reasons.append(f"Xuat ban/cap nhat gan day: {years[0]} (+0.15)")
    else:
        score += 0.05
        reasons.append("Khong ro nam xuat ban gan day, mac dinh he so thap (+0.05)")

    # Chuẩn hóa score trong khoảng [0.0, 1.0]
    final_score = max(0.0, min(1.0, round(score, 2)))
    justification = "; ".join(reasons) if reasons else "Nguon tin pho thong, khong co dac diem hoc thuat."

    return {"score": final_score, "justification": justification}


# --- API ENDPOINTS ---


@router.post("/{course_id}/web-search-ingest")
def web_search_and_ingest(
    course_id: int, req: WebSearchRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # 1. Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Tìm kiếm trên web
    max_res = req.max_results if req.max_results is not None else 5
    search_results = web_search_tavily(req.query, max_results=max_res)

    # 3. Đánh giá độ uy tín học thuật của từng nguồn
    ingested_sources = []
    rejected_sources = []

    threshold = req.threshold if req.threshold is not None else 0.7

    for item in search_results:
        eval_res = evaluate_source_credibility(item["title"], item["url"], item["content"])
        score = eval_res["score"]
        justification = eval_res["justification"]

        source_data = {
            "title": item["title"],
            "url": item["url"],
            "score": score,
            "justification": justification,
            "content": item["content"],
        }

        # 4. Lọc độ uy tín học thuật >= threshold để nạp vào RAG
        if score >= threshold:
            try:
                domain_match = re.search(r"https?://(?:www\.)?([^/]+)", item["url"])
                domain_name = domain_match.group(1) if domain_match else "web_source"
                file_name = f"Web_{domain_name}_{score}.txt"

                # Nạp vector chunks kèm category và tags
                add_document_vector(
                    file_name=file_name,
                    text_by_pages=[item["content"]],
                    user_id=current_user.id,
                    course_id=course_id,
                    category="Web Research",
                    tags=f"web_search, {req.query}",
                    chapter_id=req.chapter_id,
                )

                # Cập nhật/Tạo RAGDocument trong SQLite
                db.query(RAGDocument).filter(
                    RAGDocument.course_id == course_id,
                    RAGDocument.user_id == current_user.id,
                    RAGDocument.file_name == file_name,
                ).delete()

                new_doc = RAGDocument(
                    user_id=current_user.id,
                    course_id=course_id,
                    file_name=file_name,
                    category="Web Research",
                    tags=f"web_search, {req.query}",
                    chapter_id=req.chapter_id,
                    status="ready",
                )
                db.add(new_doc)
                db.commit()

                ingested_sources.append({**source_data, "file_name": file_name})
            except Exception as e:
                print(f"[ERROR] Loi khi nap vector tu web source: {e}")
                rejected_sources.append({**source_data, "error": str(e)})
        else:
            rejected_sources.append(source_data)

    return {
        "message": f"Khao sat hoan tat. Da nap {len(ingested_sources)} nguon tin hoc thuat va tu choi {len(rejected_sources)} nguon kem tin cay.",
        "ingested": ingested_sources,
        "rejected": rejected_sources,
    }


# --- FORCE INGEST: Chấp nhận thủ công nguồn bị từ chối ---


class ForceIngestRequest(BaseModel):
    url: str = Field(..., json_schema_extra={"example": "https://example.com/article"})
    title: str = Field(..., json_schema_extra={"example": "Article Title"})
    content: str = Field(default="", json_schema_extra={"example": "Nội dung đã tải về từ tìm kiếm trước đó."})
    chapter_id: int | None = None


@router.post("/{course_id}/force-ingest-url")
def force_ingest_url(
    course_id: int,
    req: ForceIngestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cho phép giảng viên chấp nhận thủ công một nguồn đã bị từ chối
    (override credibility filter) và nạp thẳng vào RAG Vector DB.
    """
    # 1. Xác thực quyền sở hữu môn học
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == current_user.id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Môn học không tồn tại hoặc bạn không có quyền truy cập."
        )

    # 2. Dùng content có sẵn từ tìm kiếm (đã trả về trước đó), không cần crawl lại
    content_to_ingest = req.content.strip()
    if not content_to_ingest:
        content_to_ingest = f"[Nguồn thủ công] Tiêu đề: {req.title}\nURL: {req.url}\n(Nội dung không được cung cấp)"

    # 3. Tạo tên file từ domain
    domain_match = re.search(r"https?://(?:www\.)?([^/]+)", req.url)
    domain_name = domain_match.group(1) if domain_match else "manual_source"
    file_name = f"Manual_{domain_name}.txt"

    try:
        add_document_vector(
            file_name=file_name,
            text_by_pages=[content_to_ingest],
            user_id=current_user.id,
            course_id=course_id,
            category="Forced Ingest",
            tags="manual_ingest",
            chapter_id=req.chapter_id,
        )

        # Cập nhật/Tạo RAGDocument trong SQLite
        db.query(RAGDocument).filter(
            RAGDocument.course_id == course_id,
            RAGDocument.user_id == current_user.id,
            RAGDocument.file_name == file_name,
        ).delete()

        new_doc = RAGDocument(
            user_id=current_user.id,
            course_id=course_id,
            file_name=file_name,
            category="Forced Ingest",
            tags="manual_ingest",
            chapter_id=req.chapter_id,
            status="ready",
        )
        db.add(new_doc)
        db.commit()

        return {"message": f"Đã nạp thủ công nguồn '{req.title}' vào RAG thành công.", "file_name": file_name}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi nạp thủ công vào RAG: {str(e)}"
        )


class SummarizeRequest(BaseModel):
    content: str
    title: str | None = ""


@router.post("/summarize-content")
def summarize_content(req: SummarizeRequest, current_user: User = Depends(get_current_user)):
    """Gọi LLM để tóm tắt nội dung tài liệu tìm kiếm."""
    system_instruction = (
        "Bạn là chuyên gia phân tích tài liệu học thuật. Nhiệm vụ của bạn là lập bản phân tích chuyên sâu "
        "tài liệu sau đây để giảng viên đại học có thể đánh giá mức độ phù hợp để giảng dạy. "
        "Bản phân tích phải chi tiết, khoảng 400-500 từ, viết bằng tiếng Việt và có cấu trúc rõ ràng với các mục sau:\n"
        "1. Các khái niệm cốt lõi được trình bày.\n"
        "2. Phương pháp luận / Lập luận chính của tài liệu.\n"
        "3. Công thức / Thuật toán / Mô hình quan trọng (nếu có).\n"
        "4. Đánh giá mức độ phù hợp để đưa vào bài giảng đại học.\n"
        "5. Hạn chế / Lưu ý quan trọng của nguồn này.\n\n"
        "Trả về một JSON object chứa duy nhất một key 'summary' có giá trị là toàn bộ bản phân tích "
        "được định dạng bằng Markdown đẹp mắt."
    )
    prompt = (
        f"Tiêu đề tài liệu: {req.title}\nNội dung chi tiết:\n{req.content}\n\n"
        "Hãy viết bản phân tích chuyên sâu bằng tiếng Việt và trả về định dạng JSON với key duy nhất là 'summary'."
    )
    try:
        result = call_llm_json(prompt, system_instruction=system_instruction)
        return {"summary": result.get("summary", "Không thể tạo tóm tắt.")}
    except Exception:
        text = req.content[:300] + "..." if len(req.content) > 300 else req.content
        return {"summary": f"[Tóm tắt tự động] {text}"}
