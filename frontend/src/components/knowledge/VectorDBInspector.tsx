import React from 'react';
import { createPortal } from 'react-dom';
import { Library, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

export interface VectorDBInspectorProps {
  inspectDocName: string | null;
  setInspectDocName: (name: string | null) => void;
  inspectActiveTab: 'chunks' | 'playground';
  setInspectActiveTab: (tab: 'chunks' | 'playground') => void;
  chunksLoading: boolean;
  docChunks: any[];
  docChunksPage: number;
  totalChunks: number;
  handleInspectDocument: (fileName: string, pageNum: number) => void;
  handleSearchTest: (e: React.FormEvent) => void;
  testQuery: string;
  setTestQuery: (q: string) => void;
  testLoading: boolean;
  testResults: any[];
  highlightText: (text: string, query: string) => React.ReactNode;
}

export default function VectorDBInspector({
  inspectDocName,
  setInspectDocName,
  inspectActiveTab,
  setInspectActiveTab,
  chunksLoading,
  docChunks,
  docChunksPage,
  totalChunks,
  handleInspectDocument,
  handleSearchTest,
  testQuery,
  setTestQuery,
  testLoading,
  testResults,
  highlightText,
}: VectorDBInspectorProps) {
  if (!inspectDocName || typeof document === 'undefined') return null;

  return createPortal(
    <div className="doc-viewer-overlay">
      <div className="doc-viewer-modal" style={{ maxWidth: '900px', height: '85%' }}>
        <div className="doc-viewer-header">
          <div>
            <h4 className="doc-viewer-title">
              <Library size={18} className="doc-viewer-title-icon" />
              <span className="doc-viewer-title-text">Quản lý Vector DB: {inspectDocName}</span>
            </h4>
            <span className="doc-viewer-subtitle">Kiểm tra trực quan các vector chunks và kiểm nghiệm RAG</span>
          </div>
          <button
            type="button"
            onClick={() => setInspectDocName(null)}
            className="doc-viewer-close-btn"
            aria-label="Đóng"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="doc-viewer-body" style={{ display: 'flex', flexDirection: 'column', padding: '20px', gap: '16px' }}>
          <div className="chunks-tab-headers">
            <button
              type="button"
              onClick={() => setInspectActiveTab('chunks')}
              className={`chunks-tab-btn ${inspectActiveTab === 'chunks' ? 'chunks-tab-btn-active' : ''}`}
            >
              Chunks của tài liệu
            </button>
            <button
              type="button"
              onClick={() => setInspectActiveTab('playground')}
              className={`chunks-tab-btn ${inspectActiveTab === 'playground' ? 'chunks-tab-btn-active' : ''}`}
            >
              Thử nghiệm truy vấn (Playground)
            </button>
          </div>

          {inspectActiveTab === 'chunks' ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {chunksLoading ? (
                <div className="doc-viewer-loading">
                  <Loader2 className="animate-spin doc-viewer-loader-icon" size={24} aria-hidden="true" />
                  <span>Đang tải các vector chunks…</span>
                </div>
              ) : docChunks.length === 0 ? (
                <div className="rag-empty-state">Tài liệu không có vector chunks nào.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                    {docChunks.map((chunk, idx) => (
                      <div key={chunk.id || idx} className="chunk-card">
                        <div className="chunk-header">
                          <span style={{ fontWeight: 'bold' }}>Chunk #{((docChunksPage - 1) * 5) + idx + 1}</span>
                          <span>Trang: {chunk.page_number}</span>
                        </div>
                        <div className="chunk-meta-badges">
                          <span className="chunk-badge">Phân loại: {chunk.category || 'Chưa rõ'}</span>
                          {chunk.tags && (
                            <span className="chunk-badge">Tags: {chunk.tags}</span>
                          )}
                          {chunk.chapter_id && (
                            <span className="chunk-badge">Chương ID: {chunk.chapter_id}</span>
                          )}
                        </div>
                        <pre className="chunk-text">{chunk.text}</pre>
                      </div>
                    ))}
                  </div>

                  <div className="chunks-pagination">
                    <button
                      type="button"
                      disabled={docChunksPage <= 1 || chunksLoading}
                      onClick={() => handleInspectDocument(inspectDocName, docChunksPage - 1)}
                      className="rag-action-btn-circle"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="pagination-text">Trang {docChunksPage} / {Math.ceil(totalChunks / 5) || 1} ({totalChunks} chunks)</span>
                    <button
                      type="button"
                      disabled={docChunksPage >= Math.ceil(totalChunks / 5) || chunksLoading}
                      onClick={() => handleInspectDocument(inspectDocName, docChunksPage + 1)}
                      className="rag-action-btn-circle"
                      style={{ minHeight: '36px', minWidth: '36px' }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <form onSubmit={handleSearchTest} className="search-test-form">
                <input
                  type="text"
                  placeholder="Nhập câu truy vấn ngữ nghĩa để thử nghiệm tìm kiếm (ví dụ: AVL tree complexity)..."
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  className="search-input"
                  style={{ flex: 1, minHeight: '42px', padding: '10px 14px' }}
                  required
                />
                <button type="submit" disabled={testLoading} className="search-submit-btn" style={{ flex: 'none', width: '120px', minHeight: '42px' }}>
                  {testLoading ? 'Đang truy vấn…' : 'Tìm thử'}
                </button>
              </form>

              {testLoading ? (
                <div className="doc-viewer-loading">
                  <Loader2 className="animate-spin doc-viewer-loader-icon" size={24} aria-hidden="true" />
                  <span>Đang thực hiện tìm kiếm tương đồng trên Vector DB…</span>
                </div>
              ) : testResults.length === 0 ? (
                <div className="rag-empty-state">Nhập câu hỏi và nhấn 'Tìm thử' để xem các đoạn ngữ nghĩa tương đồng nhất.</div>
              ) : (
                <div className="search-test-results">
                  <div className="search-results-header">Các kết quả tương đồng nhất trong môn học:</div>
                  {testResults.map((hit, idx) => (
                    <div key={idx} className="search-test-hit">
                      <div className="search-test-header">
                        <span className="search-test-score">Score: {(hit.score * 100).toFixed(0)}%</span>
                        <span style={{ color: 'var(--text-muted)' }}>Nguồn: {hit.file_name} - Trang: {hit.page_number}</span>
                      </div>
                      <pre className="chunk-text" style={{ maxHeight: '100px', whiteSpace: 'pre-wrap' }}>{highlightText(hit.text, testQuery)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="doc-viewer-footer">
          <button
            type="button"
            onClick={() => setInspectDocName(null)}
            className="doc-viewer-btn"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
