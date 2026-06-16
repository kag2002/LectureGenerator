import os

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import re

import chromadb
from chromadb.utils import embedding_functions

# Khởi tạo ChromaDB persistent storage trong thư mục backend/data/chroma_db
DB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/chroma_db"))
os.makedirs(DB_DIR, exist_ok=True)

chroma_client = chromadb.PersistentClient(path=DB_DIR)


class LazySentenceTransformerEmbeddingFunction(chromadb.EmbeddingFunction):
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._func = None

    @staticmethod
    def name() -> str:
        return "sentence_transformer"

    def get_config(self) -> dict:
        return {
            "model_name": self.model_name,
            "device": "cpu",
            "normalize_embeddings": False,
            "kwargs": {},
        }

    @staticmethod
    def build_from_config(config: dict) -> "LazySentenceTransformerEmbeddingFunction":
        return LazySentenceTransformerEmbeddingFunction(model_name=config.get("model_name", "all-MiniLM-L6-v2"))

    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
        if self._func is None:
            if os.environ.get("TESTING") == "1":
                print("[INFO] Testing mode detected: Using Mock Embedding Function.")

                class MockEmbeddingFunction(chromadb.EmbeddingFunction):
                    def __init__(self):
                        pass

                    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
                        return [[0.1] * 384 for _ in input]

                self._func = MockEmbeddingFunction()
            else:
                try:
                    # Sử dụng SentenceTransformer cục bộ (384 dimensions, rất nhanh và nhẹ)
                    self._func = embedding_functions.SentenceTransformerEmbeddingFunction(model_name=self.model_name)
                    print("[SUCCESS] Da load SentenceTransformer embedding function thanh cong.")
                except Exception as e:
                    print(f"[WARNING] Khong the load SentenceTransformer ({e}). Dang kiem tra API Fallback...")

                    # Thử fallback sang OpenAI API nếu có key
                    if os.environ.get("OPENAI_API_KEY"):
                        try:
                            print("[INFO] Fallback: Su dung OpenAI text-embedding-3-small (dimensions=384).")

                            class OpenAIEmbeddingFunction(chromadb.EmbeddingFunction):
                                def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
                                    from openai import OpenAI

                                    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
                                    response = client.embeddings.create(
                                        input=input, model="text-embedding-3-small", dimensions=384
                                    )
                                    return [r.embedding for r in response.data]

                            self._func = OpenAIEmbeddingFunction()
                        except Exception as oai_err:
                            print(f"[WARNING] Fallback sang OpenAI Embeddings that bai: {oai_err}")

                    # Thử fallback sang Gemini API qua HTTP request nếu có key
                    if self._func is None and os.environ.get("GEMINI_API_KEY"):
                        try:
                            print("[INFO] Fallback: Su dung Gemini text-embedding-004 (outputDimensionality=384).")

                            class GeminiEmbeddingFunction(chromadb.EmbeddingFunction):
                                def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
                                    import requests

                                    api_key = os.environ.get("GEMINI_API_KEY")
                                    embeddings = []
                                    for doc in input:
                                        url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={api_key}"
                                        payload = {
                                            "model": "models/text-embedding-004",
                                            "content": {"parts": [{"text": doc}]},
                                            "outputDimensionality": 384,
                                        }
                                        res = requests.post(
                                            url, json=payload, headers={"Content-Type": "application/json"}, timeout=10
                                        )
                                        if res.status_code == 200:
                                            embeddings.append(res.json()["embedding"]["values"])
                                        else:
                                            raise Exception(f"Gemini API returned code {res.status_code}: {res.text}")
                                    return embeddings

                            self._func = GeminiEmbeddingFunction()
                        except Exception as gem_err:
                            print(f"[WARNING] Fallback sang Gemini Embeddings that bai: {gem_err}")

                    # Cuối cùng mới dùng Mock
                    if self._func is None:
                        print(
                            "[SEVERE WARNING] Khong the nap SentenceTransformers va khong co API key cho OpenAI/Gemini Embeddings. RAG search se dung mock data va mat tinh nang semantic search!"
                        )

                        class MockEmbeddingFunction(chromadb.EmbeddingFunction):
                            def __init__(self):
                                pass

                            def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
                                return [[0.1] * 384 for _ in input]

                        self._func = MockEmbeddingFunction()
        return self._func(input)


embedding_func = LazySentenceTransformerEmbeddingFunction()

collection = chroma_client.get_or_create_collection(
    name="lecture_materials",
    embedding_function=embedding_func,
    metadata={"hnsw:space": "cosine"}
)


from src.database.session import engine, is_sqlite
from sqlalchemy import text

# Khởi tạo bảng ảo FTS5 trong SQLite nếu đang dùng SQLite làm cơ sở dữ liệu
if is_sqlite:
    try:
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_document_chunks USING fts5(
                    id,
                    user_id,
                    course_id,
                    chapter_id,
                    file_name,
                    page_number,
                    text
                )
            """))
            print("[SUCCESS] Da khoi tao virtual table FTS5 cho tai lieu trong SQLite.")
    except Exception as e:
        print(f"[WARNING] Khong the khoi tao virtual table FTS5: {e}")


def index_fts_chunks(user_id: int, course_id: int, file_name: str, chunks: list[dict], ids: list[str]):
    if not is_sqlite:
        return
    try:
        with engine.begin() as conn:
            # Delete old chunks for this file
            conn.execute(text("""
                DELETE FROM fts_document_chunks 
                WHERE user_id = :user_id AND course_id = :course_id AND file_name = :file_name
            """), {"user_id": user_id, "course_id": course_id, "file_name": file_name})
            
            # Insert new chunks
            for idx, c in enumerate(chunks):
                conn.execute(text("""
                    INSERT INTO fts_document_chunks (id, user_id, course_id, chapter_id, file_name, page_number, text)
                    VALUES (:id, :user_id, :course_id, :chapter_id, :file_name, :page_number, :text)
                """), {
                    "id": ids[idx],
                    "user_id": user_id,
                    "course_id": course_id,
                    "chapter_id": c.get("chapter_id", 0) or 0,
                    "file_name": file_name,
                    "page_number": c["page_number"],
                    "text": c["text"]
                })
    except Exception as e:
        print(f"[WARNING] Loi khi dong bo SQLite FTS5: {e}")


def delete_fts_chunks(user_id: int, course_id: int, file_name: str = None):
    if not is_sqlite:
        return
    try:
        with engine.begin() as conn:
            if file_name:
                conn.execute(text("""
                    DELETE FROM fts_document_chunks 
                    WHERE user_id = :user_id AND course_id = :course_id AND file_name = :file_name
                """), {"user_id": user_id, "course_id": course_id, "file_name": file_name})
            else:
                conn.execute(text("""
                    DELETE FROM fts_document_chunks 
                    WHERE user_id = :user_id AND course_id = :course_id
                """), {"user_id": user_id, "course_id": course_id})
    except Exception as e:
        print(f"[WARNING] Loi khi xoa SQLite FTS5: {e}")


def search_fts_chunks(query: str, user_id: int, course_id: int, top_k: int = 5, chapter_id: int | None = None) -> list[dict]:
    if not is_sqlite:
        return []
    try:
        cleaned_q = re.sub(r'[^\w\s]', ' ', query)
        words = [w.strip() for w in cleaned_q.split() if w.strip()]
        if not words:
            return []
        
        fts_query = " OR ".join(words)
        
        sql_str = """
            SELECT id, text, file_name, page_number, chapter_id
            FROM fts_document_chunks
            WHERE fts_document_chunks MATCH :match_q
              AND user_id = :user_id
              AND course_id = :course_id
        """
        params = {
            "match_q": f"text : ({fts_query})",
            "user_id": user_id,
            "course_id": course_id
        }
        
        if chapter_id is not None:
            sql_str += " AND chapter_id IN (0, :chapter_id)"
            params["chapter_id"] = int(chapter_id)
            
        sql_str += " LIMIT 20"
        
        results = []
        with engine.connect() as conn:
            res = conn.execute(text(sql_str), params)
            for row in res:
                results.append({
                    "id": row[0],
                    "text": row[1],
                    "file_name": row[2],
                    "page_number": row[3],
                    "chapter_id": row[4],
                    "score": 0.0
                })
        return results
    except Exception as e:
        print(f"[WARNING] Loi khi search SQLite FTS5: {e}")
        return []


def reciprocal_rank_fusion(dense_results: list[dict], sparse_results: list[dict], top_k: int = 4) -> list[dict]:
    rrf_scores = {}
    constant = 60
    
    def get_key(hit):
        return f"{hit['file_name']}_p{hit['page_number']}_{hash(hit['text'][:100])}"

    for rank, hit in enumerate(dense_results, 1):
        key = get_key(hit)
        if key not in rrf_scores:
            rrf_scores[key] = {"hit": hit, "score": 0.0}
        rrf_scores[key]["score"] += 1.0 / (constant + rank)

    for rank, hit in enumerate(sparse_results, 1):
        key = get_key(hit)
        if key not in rrf_scores:
            rrf_scores[key] = {"hit": hit, "score": 0.0}
        rrf_scores[key]["score"] += 1.0 / (constant + rank)

    merged_results = []
    for key, data in rrf_scores.items():
        hit = data["hit"]
        hit["score"] = round(data["score"], 4)
        merged_results.append(hit)
        
    merged_results.sort(key=lambda x: x["score"], reverse=True)
    return merged_results[:top_k]



def chunk_text_by_page(text: str, page_number: int, chunk_size: int = 800, overlap: int = 150) -> list[dict]:
    """
    Chia nhỏ văn bản của một trang tài liệu dựa trên ranh giới câu (Sentence Boundary Chunking).
    Đảm bảo không cắt đôi câu giữa các chunks và duy trì overlap phù hợp.
    """
    if not text or not text.strip():
        return []

    # Chia trang thành các câu bằng regex cải tiến (tránh băm nhỏ mã nguồn như node.left hoặc từ viết tắt)
    sentences = re.split(r"(?<=[.?!])\s+(?=[A-ZĐĂÂÊÔƠƯ])|\n+", text)
    chunks = []

    current_chunk = []
    current_length = 0
    chunk_index = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        sentence_length = len(sentence)

        # Nếu câu đơn lẻ dài hơn chunk_size, chia thô câu đó
        if sentence_length > chunk_size:
            if current_chunk:
                chunks.append({"text": " ".join(current_chunk), "page_number": page_number, "chunk_index": chunk_index})
                chunk_index += 1
                current_chunk = []
                current_length = 0

            # Chia nhỏ câu siêu dài này
            words = sentence.split()
            word_chunk_size = chunk_size // 6
            for w_idx in range(0, len(words), word_chunk_size):
                sub_chunk = " ".join(words[w_idx : w_idx + word_chunk_size])
                chunks.append({"text": sub_chunk, "page_number": page_number, "chunk_index": chunk_index})
                chunk_index += 1
            continue

        if current_length + sentence_length > chunk_size:
            # Lưu chunk hiện tại
            chunks.append({"text": " ".join(current_chunk), "page_number": page_number, "chunk_index": chunk_index})
            chunk_index += 1

            # Tạo overlap bằng cách lấy các câu cuối cùng của chunk cũ nếu có
            overlap_chunk = []
            overlap_len = 0
            for prev_s in reversed(current_chunk):
                if overlap_len + len(prev_s) < overlap:
                    overlap_chunk.insert(0, prev_s)
                    overlap_len += len(prev_s)
                else:
                    break

            current_chunk = overlap_chunk
            current_length = overlap_len

        current_chunk.append(sentence)
        current_length += sentence_length + 1  # +1 cho dấu cách

    if current_chunk:
        chunks.append({"text": " ".join(current_chunk), "page_number": page_number, "chunk_index": chunk_index})

    return chunks


def clean_and_truncate_references(text_by_pages: list[str]) -> list[str]:
    """
    Truncate references/bibliography from academic documents.
    Scans pages from back to front to find bibliography indicators.
    """
    total_pages = len(text_by_pages)
    if total_pages == 0:
        return text_by_pages

    # Define bibliography patterns
    ref_patterns = [
        r'^\s*#*\s*References\s*$',
        r'^\s*#*\s*REFERENCES\s*$',
        r'^\s*#*\s*Bibliography\s*$',
        r'^\s*#*\s*BIBLIOGRAPHY\s*$',
        r'^\s*#*\s*Tài liệu tham khảo\s*$',
        r'^\s*#*\s*TÀI LIỆU THAM KHẢO\s*$'
    ]

    # We only look for references in the last 20% of pages or at least the last 5 pages
    min_page_to_check = max(0, int(total_pages * 0.8))
    if total_pages <= 3:
        min_page_to_check = total_pages  # disable check for very short documents

    found_ref_page_idx = -1
    found_line_idx = -1

    for page_idx in range(total_pages - 1, min_page_to_check - 1, -1):
        page_text = text_by_pages[page_idx]
        lines = page_text.split('\n')
        for line_idx, line in enumerate(lines):
            for pattern in ref_patterns:
                if re.match(pattern, line.strip(), re.IGNORECASE):
                    found_ref_page_idx = page_idx
                    found_line_idx = line_idx
                    break
            if found_ref_page_idx != -1:
                break
        if found_ref_page_idx != -1:
            break

    if found_ref_page_idx != -1:
        print(f"[INFO] Phat hien References o trang {found_ref_page_idx + 1}. Dang tien hanh cat bo.")
        ref_page_lines = text_by_pages[found_ref_page_idx].split('\n')
        text_by_pages[found_ref_page_idx] = '\n'.join(ref_page_lines[:found_line_idx])
        return text_by_pages[:found_ref_page_idx + 1]

    return text_by_pages


def clean_single_text_references(text: str) -> str:
    """
    Truncates bibliography from a single large string if it's near the end.
    """
    if not text:
        return text

    min_char_idx = int(len(text) * 0.8)
    lines = text.split('\n')
    char_count = 0
    ref_line_idx = -1

    ref_patterns = [
        r'^\s*#*\s*References\s*$',
        r'^\s*#*\s*REFERENCES\s*$',
        r'^\s*#*\s*Bibliography\s*$',
        r'^\s*#*\s*BIBLIOGRAPHY\s*$',
        r'^\s*#*\s*Tài liệu tham khảo\s*$',
        r'^\s*#*\s*TÀI LIỆU THAM KHẢO\s*$'
    ]

    for idx, line in enumerate(lines):
        char_count += len(line) + 1
        if char_count > min_char_idx:
            for pattern in ref_patterns:
                if re.match(pattern, line.strip(), re.IGNORECASE):
                    ref_line_idx = idx
                    break
            if ref_line_idx != -1:
                break

    if ref_line_idx != -1:
        print(f"[INFO] Phat hien References o dong {ref_line_idx}. Dang tien hanh cat bo.")
        return '\n'.join(lines[:ref_line_idx])

    return text


def clean_noise(text: str) -> str:
    """
    Clean page headers, footers, consecutive page numbers, double spaces, and broken lines.
    """
    if not text:
        return ""

    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        trimmed = line.strip()
        # Remove lines containing only page numbers
        if re.match(r'^\d+$', trimmed):
            continue
        if re.match(r'^(page|trang)\s*\d+$', trimmed, re.IGNORECASE):
            continue
        if re.match(r'^(page|trang)\s*\d+\s*(of|trên|/)\s*\d+$', trimmed, re.IGNORECASE):
            continue
        cleaned_lines.append(line)
    text = '\n'.join(cleaned_lines)

    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def add_document_vector(
    file_name: str,
    text_by_pages: list[str],
    user_id: int,
    course_id: int,
    category: str | None = None,
    tags: str | None = None,
    chapter_id: int | None = None
):
    """
    Nạp toàn bộ tài liệu đã trích xuất theo trang vào ChromaDB.
    Đính kèm metadata cô lập người dùng và các nhãn phân cấp.
    """
    # 0. Giải quyết va chạm ID: Xóa các vector cũ của file này trước khi ghi đè
    try:
        collection.delete(
            where={
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"course_id": {"$eq": course_id}},
                    {"file_name": {"$eq": file_name}},
                ]
            }
        )
        delete_fts_chunks(user_id, course_id, file_name)
    except Exception as e:
        print(f"[WARNING] Loi khi xoa vector cu de chong va cham ID: {e}")

    # 1. Trích xuất và loại bỏ phần References/Bibliography thừa ở cuối
    if len(text_by_pages) > 1:
        text_by_pages = clean_and_truncate_references(text_by_pages)
    else:
        text_by_pages = [clean_single_text_references(text_by_pages[0])]

    all_chunks = []

    # 2. Làm sạch nhiễu và chia nhỏ văn bản theo trang
    for idx, page_text in enumerate(text_by_pages):
        page_num = idx + 1  # Số trang bắt đầu từ 1
        cleaned_text = clean_noise(page_text)
        page_chunks = chunk_text_by_page(cleaned_text, page_num)
        all_chunks.extend(page_chunks)

    if not all_chunks or all(not c["text"].strip() for c in all_chunks):
        raise ValueError("Tài liệu không chứa nội dung văn bản hợp lệ (Có thể là ảnh quét hoặc tài liệu rỗng). Vui lòng chuyển đổi OCR trước.")

    # 3. Chuẩn bị dữ liệu nạp và xây dựng Sentence Window Context
    for i, c in enumerate(all_chunks):
        # Trích xuất ngữ cảnh xung quanh (sliding window của 3 chunks kế cận: trước, hiện tại, sau)
        start_w = max(0, i - 1)
        end_w = min(len(all_chunks), i + 2)
        c["window_text"] = "\n\n".join([all_chunks[j]["text"] for j in range(start_w, end_w)])

    ids = [f"usr_{user_id}_crs_{course_id}_file_{file_name}_c{i}" for i in range(len(all_chunks))]
    documents = [c["text"] for c in all_chunks]

    metadatas = []
    for c in all_chunks:
        meta = {
            "user_id": user_id,
            "course_id": course_id,
            "file_name": file_name,
            "page_number": c["page_number"],
            "window_text": c["window_text"]
        }
        if category:
            meta["category"] = category
        if tags:
            meta["tags"] = tags
        meta["chapter_id"] = chapter_id if chapter_id is not None else 0
        metadatas.append(meta)

    # 4. Nạp vào ChromaDB
    collection.add(documents=documents, metadatas=metadatas, ids=ids)
    print(f"[INFO] Da nap thanh cong {len(all_chunks)} vector chunks tu file '{file_name}' (Course: {course_id}) kem metadata category={category}, tags={tags}, chapter_id={chapter_id}.")

    # Đồng bộ hóa sang SQLite FTS5
    try:
        for idx, c in enumerate(all_chunks):
            c["chapter_id"] = chapter_id
        index_fts_chunks(user_id, course_id, file_name, all_chunks, ids)
    except Exception as fts_err:
        print(f"[WARNING] Failed to index FTS5: {fts_err}")


def migrate_vector_db_metadata():
    """Bổ sung chapter_id: 0 cho các vector cũ chưa có chapter_id."""
    try:
        # Lấy tất cả tài liệu trong collection
        all_docs = collection.get(include=["metadatas"])
        if not all_docs or not all_docs["ids"]:
            return

        update_ids = []
        update_metas = []
        for i, meta in enumerate(all_docs["metadatas"]):
            if meta and "chapter_id" not in meta:
                meta["chapter_id"] = 0
                update_ids.append(all_docs["ids"][i])
                update_metas.append(meta)

        if update_ids:
            collection.update(ids=update_ids, metadatas=update_metas)
            print(f"[INFO] Da cap nhat chapter_id=0 cho {len(update_ids)} vector cu.")
    except Exception as e:
        print(f"[WARNING] Loi khi migrate ChromaDB metadata: {e}")


def search_rag_isolated(query: str, user_id: int, course_id: int, top_k: int = 4, chapter_id: int | None = None) -> list[dict]:
    """
    Truy vấn RAG cô lập tuyệt đối dựa trên Metadata filtering.
    Nếu chapter_id được cung cấp, lọc các tài liệu thuộc chương này HOẶC dùng chung (chapter_id = 0).
    Áp dụng mở rộng truy vấn (Multi-Query Expansion), truy vấn lô (batch), khử trùng lặp và Re-ranking lai.
    Hỗ trợ Sentence Window Retrieval (lấy window_text từ metadata).
    """
    try:
        where_cond = {
            "$and": [
                {"user_id": {"$eq": user_id}},
                {"course_id": {"$eq": course_id}}
            ]
        }
        if chapter_id is not None:
            where_cond["$and"].append({"chapter_id": {"$in": [0, int(chapter_id)]}})

        # 1. Mở rộng câu truy vấn (Query Expansion)
        queries = [query]

        # A. Mở rộng từ viết tắt chuyên ngành cục bộ (Rule-based Acronym Expansion)
        acronym_map = {
            "avl": ["cây avl", "cây tự cân bằng avl"],
            "bst": ["cây tìm kiếm nhị phân", "binary search tree"],
            "dsa": ["cấu trúc dữ liệu và giải thuật", "dsa"],
            "clo": ["chuẩn đầu ra môn học", "clo"],
        }
        query_lower = query.lower()
        for ac, expansions in acronym_map.items():
            if re.search(r'\b' + re.escape(ac) + r'\b', query_lower):
                for exp in expansions:
                    if exp not in queries:
                        queries.append(exp)

        # B. Mở rộng bằng LLM (chỉ chạy khi không ở chế độ test, có key và không bị tắt bởi config)
        if os.environ.get("TESTING") != "1" and os.environ.get("DISABLE_QUERY_EXPANSION") != "true":
            try:
                from src.utils.llm_client import call_llm_json
                expansion_prompt = (
                    "Bạn là trợ lý AI chuyên về RAG. Hãy phân tích câu hỏi/truy vấn của người dùng "
                    "và tạo ra đúng 2 biến thể truy vấn tìm kiếm khác bằng tiếng Việt nhằm tối ưu hóa việc tìm kiếm tài liệu học tập. "
                    "Hãy bao gồm từ đồng nghĩa, từ chuyên ngành tiếng Anh tương ứng hoặc làm rõ các từ viết tắt chuyên ngành. "
                    "Định dạng trả về là JSON hợp lệ có dạng:\n"
                    "{\n"
                    "  \"expanded_queries\": [\"biến thể 1\", \"biến thể 2\"]\n"
                    "}"
                )
                res = call_llm_json(
                    prompt=f"Truy vấn gốc: '{query}'",
                    system_instruction=expansion_prompt,
                    temperature=0.3
                )
                if res and "expanded_queries" in res:
                    for eq in res["expanded_queries"]:
                        if eq and eq.strip() and eq.strip() not in queries:
                            queries.append(eq.strip())
            except Exception as e:
                print(f"[WARNING] Loi khi mo rong truy van bang LLM: {e}")

        # 2. Tăng số lượng kết quả lấy ra từ Vector DB để Rerank (lấy top_k * 2 mỗi query)
        fetch_k = max(top_k * 2, 8)

        # Gọi ChromaDB query cho danh sách các truy vấn (batch query)
        results = collection.query(
            query_texts=queries,
            n_results=fetch_k,
            where=where_cond,
        )

        # 3. Gom nhóm và khử trùng lặp kết quả (Deduplication)
        unique_chunks = {}
        if results and results["documents"]:
            # results["documents"] là danh sách các danh sách kết quả (một danh sách cho mỗi query)
            for q_idx in range(len(results["documents"])):
                q_docs = results["documents"][q_idx]
                q_metas = results["metadatas"][q_idx] if results.get("metadatas") else [None] * len(q_docs)
                q_distances = results["distances"][q_idx] if results.get("distances") else [0.0] * len(q_docs)
                q_ids = results["ids"][q_idx] if results.get("ids") else []

                for i in range(len(q_docs)):
                    # Lấy ID của chunk
                    chunk_id = q_ids[i] if i < len(q_ids) else f"chunk_{q_idx}_{i}"
                    text = q_docs[i]
                    meta = q_metas[i] or {}
                    dist = q_distances[i]

                    # Tính điểm semantic gốc (0.0 -> 1.0) sử dụng chuẩn hóa tuyến tính khoảng cách Cosine [0, 2]
                    semantic_score = max(0.0, 1.0 - (dist / 2.0))

                    # Nếu chunk đã xuất hiện, giữ lại điểm tương đồng semantic lớn nhất
                    if chunk_id in unique_chunks:
                        if semantic_score > unique_chunks[chunk_id]["semantic_score"]:
                            unique_chunks[chunk_id]["semantic_score"] = semantic_score
                    else:
                        unique_chunks[chunk_id] = {
                            "text": text,
                            "meta": meta,
                            "semantic_score": semantic_score
                        }

        # 4. Tính toán điểm Rerank lai dựa trên truy vấn gốc của người dùng
        query_clean = query.lower().strip()
        query_tokens = [w for w in re.findall(r"\w+", query_clean) if len(w) > 1]
        uppercase_tokens = [w for w in re.findall(r"\b[A-Z0-9_]{3,}\b", query)]

        formatted_results = []
        for chunk_id, chunk_data in unique_chunks.items():
            text = chunk_data["text"]
            text_lower = text.lower()
            semantic_score = chunk_data["semantic_score"]
            meta = chunk_data["meta"]

            # Tính toán điểm bổ trợ Lexical Boost
            lexical_boost = 0.0

            # Khớp cụm từ chính xác
            if query_clean in text_lower:
                lexical_boost += 0.25
            else:
                # Khớp tỷ lệ từ khóa đơn lẻ
                if query_tokens:
                    match_count = sum(1 for token in query_tokens if token in text_lower)
                    lexical_boost += (match_count / len(query_tokens)) * 0.15

            # Khớp từ khóa chuyên ngành viết hoa (ví dụ: CLO1, AVL)
            if uppercase_tokens:
                uc_matches = sum(1 for token in uppercase_tokens if token in text)
                lexical_boost += (uc_matches / len(uppercase_tokens)) * 0.10

            final_score = min(1.0, semantic_score + lexical_boost)

            # 5. Sentence Window Retrieval: Lấy window_text nếu có trong metadata để làm ngữ cảnh mở rộng
            window_text = meta.get("window_text")
            text_to_return = window_text if window_text else text

            formatted_results.append(
                {
                    "text": text_to_return,
                    "file_name": meta.get("file_name", "N/A"),
                    "page_number": meta.get("page_number", 0),
                    "score": round(final_score, 4),
                    "semantic_score": round(semantic_score, 4)
                }
            )

        # Sắp xếp lại kết quả theo điểm số cuối cùng sau khi Rerank
        formatted_results.sort(key=lambda x: x["score"], reverse=True)

        # Thực hiện tìm kiếm Sparse qua SQLite FTS5
        sparse_results = search_fts_chunks(query, user_id, course_id, top_k=top_k * 2, chapter_id=chapter_id)

        # Trộn kết quả Dense và Sparse bằng RRF (Reciprocal Rank Fusion)
        hybrid_results = reciprocal_rank_fusion(formatted_results, sparse_results, top_k=top_k)

        return hybrid_results
    except Exception as e:
        print(f"[ERROR] Loi truy van RAG ChromaDB: {e}")
        return []


def delete_course_documents(user_id: int, course_id: int):
    """Xóa sạch toàn bộ tài liệu nguồn của môn học khỏi Vector DB."""
    try:
        collection.delete(where={"$and": [{"user_id": {"$eq": user_id}}, {"course_id": {"$eq": course_id}}]})
        print(f"[INFO] Da xoa toan bo tai lieu cua Course {course_id} thuoc User {user_id} khoi ChromaDB.")
        delete_fts_chunks(user_id, course_id)
    except Exception as e:
        print(f"Loi khi xoa tai lieu ChromaDB: {e}")
