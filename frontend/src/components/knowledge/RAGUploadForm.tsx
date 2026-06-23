import React from 'react';
import { Upload } from 'lucide-react';
import { Chapter } from '@/types';

export interface RAGUploadFormProps {
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  uploadCategory: string;
  setUploadCategory: (category: string) => void;
  uploadTags: string;
  setUploadTags: (tags: string) => void;
  selectedChapterIdForUpload: number | '';
  setSelectedChapterIdForUpload: (id: number | '') => void;
  chapters: Chapter[];
  isDragOver: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent) => void;
  handleUploadDocument: (e: React.FormEvent) => void;
  loading: boolean;
}

export default function RAGUploadForm({
  uploadFile,
  setUploadFile,
  uploadCategory,
  setUploadCategory,
  uploadTags,
  setUploadTags,
  selectedChapterIdForUpload,
  setSelectedChapterIdForUpload,
  chapters,
  isDragOver,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleUploadDocument,
  loading,
}: RAGUploadFormProps) {
  return (
    <div className="rag-form-panel">
      <h3 className="rag-section-title">Nạp tài liệu mới vào Vector DB</h3>
      <p className="rag-section-desc">
        Hệ thống RAG sẽ bóc tách văn bản trong file và băm vector để cung cấp kiến thức thực tế cho AI lúc soạn giáo án.
      </p>
      <form onSubmit={handleUploadDocument} className="rag-upload-form">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Chọn hoặc Kéo thả tệp:
          </label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('drag-file-input')?.click()}
            style={{
              border: isDragOver ? '2px dashed var(--vinuni-gold)' : '2px dashed var(--border-color)',
              borderRadius: '10px',
              padding: '24px 16px',
              background: isDragOver ? 'rgba(217, 119, 6, 0.05)' : 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Upload size={24} style={{ color: isDragOver ? 'var(--vinuni-gold)' : 'var(--text-muted)' }} />
            {uploadFile ? (
              <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '13.5px' }}>
                {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
              </span>
            ) : (
              <span style={{ fontSize: '13px' }}>Kéo thả file PDF, DOCX, TXT vào đây hoặc nhấp để chọn</span>
            )}
            <input
              id="drag-file-input"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Phân loại tài liệu:
          </label>
          <select
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value)}
            className="search-select"
          >
            <option value="Textbook">Giáo trình / Sách giáo khoa (Textbook)</option>
            <option value="Slides">Bài giảng Slide (Slides)</option>
            <option value="Syllabus">Đề cương chi tiết (Syllabus)</option>
            <option value="Exam">Đề thi / Câu hỏi (Exam)</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Nhãn (Tags - Phân tách bằng dấu phẩy):
          </label>
          <input
            type="text"
            placeholder="Ví dụ: dsa, avl tree, midterm..."
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            className="search-input"
            style={{ minHeight: '42px', padding: '10px 14px', fontSize: '14px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Liên kết Chương học (Tùy chọn):
          </label>
          <select
            value={selectedChapterIdForUpload}
            onChange={(e) => setSelectedChapterIdForUpload(e.target.value ? Number(e.target.value) : '')}
            className="search-select"
          >
            <option value="">Không liên kết</option>
            {chapters.map(ch => (
              <option key={ch.id} value={ch.id}>{ch.title}</option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={!uploadFile || loading} className="rag-upload-btn">
          {loading ? 'Đang nạp Vector…' : (
            <>
              <Upload size={14} aria-hidden="true" /> Nạp Vào RAG (Vector DB)
            </>
          )}
        </button>
      </form>
    </div>
  );
}
