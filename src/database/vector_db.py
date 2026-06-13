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
                            def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
                                return [[0.1] * 384 for _ in input]

                        self._func = MockEmbeddingFunction()
        return self._func(input)


embedding_func = LazySentenceTransformerEmbeddingFunction()

collection = chroma_client.get_or_create_collection(name="lecture_materials", embedding_function=embedding_func)


def chunk_text_by_page(text: str, page_number: int, chunk_size: int = 800, overlap: int = 150) -> list[dict]:
    """
    Chia nhỏ văn bản của một trang tài liệu dựa trên ranh giới câu (Sentence Boundary Chunking).
    Đảm bảo không cắt đôi câu giữa các chunks và duy trì overlap phù hợp.
    """
    if not text or not text.strip():
        return []

    # Chia trang thành các câu bằng regex đơn giản (nhận biết dấu chấm, hỏi, cảm và dấu xuống dòng)
    sentences = re.split(r"(?<=[.?!])\s+|\n+", text)
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


def add_document_vector(file_name: str, text_by_pages: list[str], user_id: int, course_id: int):
    """
    Nạp toàn bộ tài liệu đã trích xuất theo trang vào ChromaDB.
    Đính kèm metadata cô lập người dùng.
    """
    all_chunks = []

    # 1. Thực hiện chunking từng trang
    for idx, page_text in enumerate(text_by_pages):
        page_num = idx + 1  # Số trang bắt đầu từ 1
        page_chunks = chunk_text_by_page(page_text, page_num)
        all_chunks.extend(page_chunks)

    if not all_chunks:
        return

    # 2. Chuẩn bị dữ liệu nạp
    ids = [f"usr_{user_id}_crs_{course_id}_file_{file_name}_c{i}" for i in range(len(all_chunks))]
    documents = [c["text"] for c in all_chunks]
    metadatas = [
        {"user_id": user_id, "course_id": course_id, "file_name": file_name, "page_number": c["page_number"]}
        for c in all_chunks
    ]

    # 3. Nạp vào ChromaDB
    collection.add(documents=documents, metadatas=metadatas, ids=ids)
    print(f"[INFO] Da nap thanh cong {len(all_chunks)} vector chunks tu file '{file_name}' (Course: {course_id}).")


def search_rag_isolated(query: str, user_id: int, course_id: int, top_k: int = 4) -> list[dict]:
    """
    Truy vấn RAG cô lập tuyệt đối dựa trên Metadata filtering.
    """
    try:
        results = collection.query(
            query_texts=[query],
            n_results=top_k,
            where={"$and": [{"user_id": {"$eq": user_id}}, {"course_id": {"$eq": course_id}}]},
        )

        # Format lại kết quả trả về dạng danh sách dict dễ xử lý
        formatted_results = []
        if results and results["documents"] and len(results["documents"]) > 0:
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            distances = results["distances"][0] if "distances" in results else [0.0] * len(docs)

            for i in range(len(docs)):
                formatted_results.append(
                    {
                        "text": docs[i],
                        "file_name": metas[i].get("file_name", "N/A"),
                        "page_number": metas[i].get("page_number", 0),
                        "score": 1.0 - distances[i],  # Similarity Score
                    }
                )
        return formatted_results
    except Exception as e:
        print(f"[ERROR] Loi truy van RAG ChromaDB: {e}")
        return []


def delete_course_documents(user_id: int, course_id: int):
    """Xóa sạch toàn bộ tài liệu nguồn của môn học khỏi Vector DB."""
    try:
        collection.delete(where={"$and": [{"user_id": {"$eq": user_id}}, {"course_id": {"$eq": course_id}}]})
        print(f"[INFO] Da xoa toan bo tai lieu cua Course {course_id} thuoc User {user_id} khoi ChromaDB.")
    except Exception as e:
        print(f"Loi khi xoa tai lieu ChromaDB: {e}")
