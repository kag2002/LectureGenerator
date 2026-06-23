import React from 'react';
import { FileText, Edit2, Loader2, AlertTriangle, Check, Eye, Download, Settings, Trash2 } from 'lucide-react';
import { Chapter } from '@/types';

export interface RAGDocumentListProps {
  documentsDetailed: any[];
  editingDocName: string | null;
  setEditingDocName: (name: string | null) => void;
  editingCategory: string;
  setEditingCategory: (category: string) => void;
  editingTags: string;
  setEditingTags: (tags: string) => void;
  editingChapterId: number | '';
  setEditingChapterId: (id: number | '') => void;
  chapters: Chapter[];
  newlyIngestedDocs: string[];
  handleSaveMetadata: (fileName: string) => void;
  handleStartEditMetadata: (doc: any) => void;
  handleDeleteDocument: (fileName: string) => void;
  handleViewDocument: (fileName: string) => void;
  handleDownloadDocumentText: (fileName: string) => void;
  handleInspectDocument: (fileName: string, pageNum: number) => void;
}

export default function RAGDocumentList({
  documentsDetailed,
  editingDocName,
  setEditingDocName,
  editingCategory,
  setEditingCategory,
  editingTags,
  setEditingTags,
  editingChapterId,
  setEditingChapterId,
  chapters,
  newlyIngestedDocs,
  handleSaveMetadata,
  handleStartEditMetadata,
  handleDeleteDocument,
  handleViewDocument,
  handleDownloadDocumentText,
  handleInspectDocument,
}: RAGDocumentListProps) {
  return (
    <div className="rag-list-panel">
      <h3 className="rag-section-title">Danh mục tài liệu RAG đã nạp ({documentsDetailed.length})</h3>
      {documentsDetailed.length === 0 ? (
        <div className="rag-empty-state">Chưa nạp tài liệu tham khảo nào cho môn học này.</div>
      ) : (
        <div className="rag-table-wrapper">
          <table className="rag-doc-table">
            <thead>
              <tr>
                <th>Tên tài liệu</th>
                <th>Phân loại & Nhãn</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {documentsDetailed.map((doc, idx) => {
                const isEditing = editingDocName === doc.file_name;
                if (isEditing) {
                  return (
                    <tr key={idx} className="rag-table-row-editing">
                      <td colSpan={4}>
                        <div className="rag-inline-edit-container">
                          <div className="rag-edit-title">
                            <Edit2 size={14} className="rag-doc-icon" /> Đang sửa: <strong>{doc.file_name}</strong>
                          </div>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSaveMetadata(doc.file_name);
                            }}
                            className="rag-inline-edit-form"
                          >
                            <div className="rag-inline-edit-fields">
                              <div className="rag-inline-edit-field">
                                <label>Phân loại:</label>
                                <select
                                  value={editingCategory}
                                  onChange={(e) => setEditingCategory(e.target.value)}
                                  className="rag-inline-edit-input"
                                >
                                  <option value="Textbook">Giáo trình</option>
                                  <option value="Slides">Bài giảng Slide</option>
                                  <option value="Syllabus">Đề cương chi tiết</option>
                                  <option value="Exam">Đề thi / Câu hỏi</option>
                                </select>
                              </div>
                              <div className="rag-inline-edit-field">
                                <label>Nhãn (Tags):</label>
                                <input
                                  type="text"
                                  value={editingTags}
                                  onChange={(e) => setEditingTags(e.target.value)}
                                  placeholder="Ví dụ: dsa, tree..."
                                  className="rag-inline-edit-input"
                                />
                              </div>
                              <div className="rag-inline-edit-field">
                                <label>Chương liên kết:</label>
                                <select
                                  value={editingChapterId}
                                  onChange={(e) => setEditingChapterId(e.target.value ? Number(e.target.value) : '')}
                                  className="rag-inline-edit-input"
                                >
                                  <option value="">Không liên kết</option>
                                  {chapters.map(ch => (
                                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="rag-inline-edit-actions">
                              <button
                                type="button"
                                onClick={() => setEditingDocName(null)}
                                className="doc-viewer-btn"
                                style={{ minHeight: '32px', padding: '4px 12px', fontSize: '12.5px' }}
                              >
                                Hủy
                              </button>
                              <button
                                type="submit"
                                className="doc-viewer-btn"
                                style={{
                                  minHeight: '32px',
                                  padding: '4px 12px',
                                  fontSize: '12.5px',
                                  background: 'var(--vinuni-navy)',
                                  color: '#fff',
                                  borderColor: 'var(--vinuni-navy)'
                                }}
                              >
                                Lưu
                              </button>
                            </div>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={idx} className={`rag-table-row ${newlyIngestedDocs.includes(doc.file_name) ? 'rag-table-row-new' : ''}`}>
                    <td className="rag-table-cell-name" title={doc.file_name}>
                      <div className="rag-doc-name-wrapper">
                        <FileText size={14} className="rag-doc-icon" />
                        <span className="rag-doc-name-text">{doc.file_name}</span>
                        {newlyIngestedDocs.includes(doc.file_name) && (
                          <span className="rag-new-badge">Mới</span>
                        )}
                      </div>
                    </td>
                    <td className="rag-table-cell-meta">
                      {doc.status === 'ready' && (
                        <div className="rag-doc-meta-container" style={{ marginTop: 0 }}>
                          <span className="rag-doc-meta-badge">
                            {doc.category || 'Giáo trình'}
                          </span>
                          {doc.tags && doc.tags.split(',').map((tag: string, tIdx: number) => (
                            <span key={tIdx} className="rag-doc-meta-badge" style={{ fontSize: '10px' }}>
                              #{tag.trim()}
                            </span>
                          ))}
                          {doc.chapter_id && (
                            <span className="rag-doc-meta-badge" style={{ fontSize: '10px', color: 'var(--vinuni-gold)' }}>
                              Chương: {chapters.find(ch => ch.id === doc.chapter_id)?.title || doc.chapter_id}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="rag-table-cell-status">
                      {doc.status === 'processing' && (
                        <span className="rag-doc-status-badge rag-doc-status-processing">
                          <Loader2 size={12} className="animate-spin" /> Đang xử lý...
                        </span>
                      )}
                      {doc.status === 'failed' && (
                        <span
                          className="rag-doc-status-badge rag-doc-status-failed"
                          title={doc.error_message || "Lỗi không xác định khi nạp dữ liệu"}
                        >
                          <AlertTriangle size={12} /> Thất bại
                        </span>
                      )}
                      {doc.status === 'ready' && (
                        <span className="rag-doc-status-badge rag-doc-status-ready">
                          <Check size={12} /> Sẵn sàng
                        </span>
                      )}
                    </td>
                    <td className="rag-table-cell-actions">
                      <div className="rag-doc-actions" style={{ justifyContent: 'flex-end' }}>
                        {doc.status === 'ready' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleViewDocument(doc.file_name)}
                              className="rag-action-btn-circle rag-action-btn-view"
                              title="Xem nội dung tài liệu"
                              aria-label="Xem nội dung tài liệu"
                            >
                              <Eye size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadDocumentText(doc.file_name)}
                              className="rag-action-btn-circle rag-action-btn-download"
                              title="Tải xuống file text bóc tách"
                              aria-label="Tải xuống file text bóc tách"
                            >
                              <Download size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditMetadata(doc)}
                              className="rag-action-btn-circle rag-action-btn-edit"
                              style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.3)' }}
                              title="Chỉnh sửa Phân loại & Nhãn"
                              aria-label="Chỉnh sửa Phân loại & Nhãn"
                            >
                              <Edit2 size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInspectDocument(doc.file_name, 1)}
                              className="rag-action-btn-circle rag-action-btn-inspect"
                              title="Kiểm tra Vector Chunks"
                              aria-label="Kiểm tra Vector Chunks"
                            >
                              <Settings size={14} aria-hidden="true" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.file_name)}
                          className="rag-action-btn-circle rag-action-btn-delete"
                          title="Xóa tài liệu"
                          aria-label="Xóa tài liệu"
                          disabled={doc.status === 'processing'}
                          style={{ opacity: doc.status === 'processing' ? 0.4 : 1 }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
