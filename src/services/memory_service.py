import time
import chromadb
from src.database.vector_db import chroma_client, embedding_func

# Khởi tạo hoặc lấy collection cho bộ nhớ trải nghiệm slide
episodic_collection = chroma_client.get_or_create_collection(
    name="episodic_revisions",
    embedding_function=embedding_func,
    metadata={"hnsw:space": "cosine"}
)

def levenshtein_ratio(s1: str, s2: str) -> float:
    """Tính tỷ lệ khoảng cách Levenshtein (edit distance / max length)."""
    if not s1:
        return 1.0 if s2 else 0.0
    if not s2:
        return 1.0 if s1 else 0.0

    rows = len(s1) + 1
    cols = len(s2) + 1
    dist = [[0 for _ in range(cols)] for _ in range(rows)]

    for i in range(1, rows):
        dist[i][0] = i
    for j in range(1, cols):
        dist[0][j] = j

    for col in range(1, cols):
        for row in range(1, rows):
            if s1[row-1] == s2[col-1]:
                cost = 0
            else:
                cost = 1
            dist[row][col] = min(
                dist[row-1][col] + 1,      # deletion
                dist[row][col-1] + 1,      # insertion
                dist[row-1][col-1] + cost  # substitution
            )

    return dist[-1][-1] / max(len(s1), len(s2))

def store_episodic_revision(
    user_id: int,
    course_id: int,
    chapter_id: int,
    prompt: str,
    content_before: str,
    content_after: str,
    layout_before: str,
    layout_after: str
):
    """
    Đánh giá độ lớn thay đổi của slide revision và lưu vào bộ nhớ trải nghiệm (ChromaDB)
    nếu thay đổi layout hoặc nội dung sửa đổi > 20% Levenshtein ratio.
    """
    if not prompt:
        prompt = "Soạn nội dung slide bài giảng học trình"

    # 1. Điều kiện lưu: Thay đổi layout HOẶC khoảng cách chỉnh sửa > 20%
    layout_changed = layout_before != layout_after
    edit_ratio = levenshtein_ratio(content_before or "", content_after or "")

    if not layout_changed and edit_ratio <= 0.20:
        print(f"[EPISODIC MEMORY] Bỏ qua chỉnh sửa nhỏ (Levenshtein ratio = {edit_ratio:.2f})")
        return False

    # 2. Tạo ID và Metadata để lưu vào ChromaDB
    doc_id = f"ep_usr_{user_id}_crs_{course_id}_t_{int(time.time() * 1000)}"
    
    metadata = {
        "user_id": user_id,
        "course_id": course_id,
        "chapter_id": chapter_id if chapter_id else 0,
        "layout": layout_after,
        "revised_content": content_after
    }

    try:
        episodic_collection.add(
            documents=[prompt],
            metadatas=[metadata],
            ids=[doc_id]
        )
        print(f"[EPISODIC MEMORY] Đã lưu thành công episode mới cho User {user_id} (Layout: {layout_after})")
        return True
    except Exception as e:
        print(f"[EPISODIC MEMORY ERROR] Lỗi khi lưu bộ nhớ trải nghiệm: {e}")
        return False

def retrieve_episodes(user_id: int, course_id: int, query: str = "", limit: int = 5) -> list[dict]:
    """
    Truy xuất các episodes tương đồng từ ChromaDB dựa trên metadata cô lập.
    Đầu ra dùng để build dynamic few-shot prompt.
    """
    try:
        where_cond = {
            "$and": [
                {"user_id": {"$eq": user_id}},
                {"course_id": {"$eq": course_id}}
            ]
        }
        
        # Nếu không có query cụ thể, chúng ta query với chuỗi rỗng
        search_query = query if query else "Slide giảng dạy"
        
        results = episodic_collection.query(
            query_texts=[search_query],
            n_results=limit,
            where=where_cond
        )
        
        episodes = []
        if results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if results.get("metadatas") else []
            
            for i in range(len(docs)):
                meta = metas[i] if i < len(metas) else {}
                episodes.append({
                    "prompt": docs[i],
                    "layout": meta.get("layout", "standard_list"),
                    "content": meta.get("revised_content", "")
                })
        return episodes
    except Exception as e:
        print(f"[EPISODIC MEMORY ERROR] Lỗi khi truy xuất bộ nhớ trải nghiệm: {e}")
        return []
