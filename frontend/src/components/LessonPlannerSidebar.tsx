import React from 'react';
import { Chapter, CLO } from '@/types';
import { BookOpen, FileText, ClipboardList, HelpCircle, Sparkles, Upload, Search, Trash2, Check, X, RefreshCw, ChevronLeft, EyeOff, Library, ArrowRight, Pencil } from 'lucide-react';

export interface SearchResultType {
  accepted: Array<{ title: string; url: string }>;
  rejected: Array<{ title: string }>;
}

export interface LessonPlannerSidebarProps {
  chapters: Chapter[];
  selectedChapter: Chapter | null;
  activeLeftTab: 'outline' | 'documents' | 'compliance' | 'mcqs' | 'citations';
  setActiveLeftTab: (tab: 'outline' | 'documents' | 'compliance' | 'mcqs' | 'citations') => void;
  clos: CLO[];
  documents: string[];
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  loading: boolean;
  handleSelectChapter: (chapter: Chapter) => void;
  handleGenerateOutline: () => void;
  handleUploadDocument: (e: React.FormEvent) => void;
  handleDeleteDocument: (doc: string) => void;
  handleWebSearch: (e: React.FormEvent) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searching: boolean;
  showAdvancedSearch?: boolean;
  setShowAdvancedSearch?: (val: boolean) => void;
  maxResults?: number;
  setMaxResults?: (val: number) => void;
  credibilityThreshold?: number;
  setCredibilityThreshold?: (val: number) => void;
  suggestedQueries?: string[];
  searchResult: SearchResultType | null;
  expandedSearch?: any;
  toggleSearchDetail?: any;
  handleSummarizeContent?: any;
  summarizing?: Record<string, boolean>;
  summaries?: any;
  selectedRejected?: any;
  setSelectedRejected?: any;
  handleForceIngest?: any;
  isCloCovered: (code: string) => boolean;
  renderJustifications?: any;
  chapterMcqs: any[];
  loadingMcqs: boolean;
  onClose?: () => void;
  ragReferences?: Array<{ file_name: string; page_number: number; text: string }>;
  onCitationClick?: (citation: { file_name: string; page_number: number; text: string }) => void;
  generatingChapterId?: number | null;
  onEditChapter?: (chapter: Chapter) => void;
  onDeleteChapter?: (chapterId: number) => void;
}

export default function LessonPlannerSidebar({
  chapters,
  selectedChapter,
  activeLeftTab,
  setActiveLeftTab,
  clos,
  documents,
  uploadFile,
  setUploadFile,
  loading,
  handleSelectChapter,
  handleGenerateOutline,
  handleUploadDocument,
  handleDeleteDocument,
  handleWebSearch,
  searchQuery,
  setSearchQuery,
  searching,
  searchResult,
  isCloCovered,
  chapterMcqs,
  loadingMcqs,
  onClose,
  ragReferences = [],
  onCitationClick,
  generatingChapterId = null,
  onEditChapter,
  onDeleteChapter
}: LessonPlannerSidebarProps) {
  return (
    <aside className="planner-sidebar">
      <div className="sidebar-tabs-group" style={{ alignItems: 'center' }}>
        <button 
          onClick={() => setActiveLeftTab('outline')}
          className={`sidebar-tab-btn ${activeLeftTab === 'outline' ? 'active' : 'inactive'}`}
        >
          <span className="sidebar-tab-btn-content"><BookOpen size={12} aria-hidden="true" /> Dàn ý</span>
        </button>
        <button 
          onClick={() => setActiveLeftTab('documents')}
          className={`sidebar-tab-btn ${activeLeftTab === 'documents' ? 'active' : 'inactive'}`}
        >
          <span className="sidebar-tab-btn-content"><FileText size={12} aria-hidden="true" /> Tài liệu RAG</span>
        </button>
        <button 
          onClick={() => setActiveLeftTab('compliance')}
          className={`sidebar-tab-btn ${activeLeftTab === 'compliance' ? 'active' : 'inactive'}`}
        >
          <span className="sidebar-tab-btn-content"><ClipboardList size={12} aria-hidden="true" /> Checklist CLO</span>
        </button>
        <button 
          onClick={() => setActiveLeftTab('mcqs')}
          className={`sidebar-tab-btn ${activeLeftTab === 'mcqs' ? 'active' : 'inactive'}`}
        >
          <span className="sidebar-tab-btn-content"><HelpCircle size={12} aria-hidden="true" /> Trắc nghiệm</span>
        </button>
        <button 
          onClick={() => setActiveLeftTab('citations')}
          className={`sidebar-tab-btn ${activeLeftTab === 'citations' ? 'active' : 'inactive'}`}
        >
          <span className="sidebar-tab-btn-content"><Library size={12} aria-hidden="true" /> Trích dẫn</span>
        </button>
        {onClose && (
          <button 
            type="button"
            onClick={onClose} 
            className="sidebar-close-btn"
            title="Ẩn mục lục (Ẩn cột trái)"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <EyeOff size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="planner-sidebar-content">
        {activeLeftTab === 'outline' && (
          <>
            <div className="planner-outline-actions">
              <button 
                onClick={handleGenerateOutline} 
                id="lp-generate-outline-btn"
                className="planner-ai-outline-btn"
                disabled={loading}
              >
                {loading ? (
                  <span className="sidebar-tab-btn-content">
                    <RefreshCw size={14} aria-hidden="true" style={{ animation: 'spin 1.5s linear infinite' }} /> Đang sinh dàn ý…
                  </span>
                ) : (
                  <span className="sidebar-tab-btn-content">
                    <Sparkles size={14} aria-hidden="true" /> Gợi ý Dàn ý chương học
                  </span>
                )}
              </button>
            </div>
            {loading && (
              <div className="sidebar-outline-alert">
                <span className="sidebar-outline-alert-dot" />
                AI đang sinh cấu trúc chương học...
              </div>
            )}
            {chapters.length === 0 && !loading ? (
              <div className="planner-empty-state">
                Chưa có dàn ý chương học. Bấm nút phía trên để AI gợi ý.
                <div className="empty-suggestions-box">
                  <div className="empty-suggestions-title">
                    <span>💡 Hướng dẫn & Gợi ý:</span>
                  </div>
                  <ul className="empty-suggestions-list">
                    <li className="empty-suggestions-item">Bấm nút <strong>"Gợi ý Dàn ý chương học"</strong> ở phía trên để AI gợi ý cấu trúc bài giảng.</li>
                    <li className="empty-suggestions-item">Hoặc quay lại trang <strong>Bóc tách Syllabus (Cấu hình môn học)</strong> để kiểm tra các chuẩn đầu ra đã nạp.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="planner-chapter-list" style={{ opacity: loading ? 0.6 : 1, pointerEvents: loading ? 'none' : 'auto' }}>
                {chapters.map((ch, idx) => (
                  <div 
                    key={ch.id} 
                    onClick={() => handleSelectChapter(ch)}
                    className={selectedChapter?.id === ch.id ? "planner-active-chapter-card" : "planner-chapter-card"}
                  >
                    <div className="planner-chapter-order-col">
                      <span className="planner-chapter-order">
                        {generatingChapterId === ch.id ? (
                          <RefreshCw size={12} className="planner-sidebar-spinner-pulse" style={{ color: 'var(--accent-color, #818cf8)', display: 'inline-block' }} aria-hidden="true" />
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <div className="chapter-action-btns">
                        {onEditChapter && (
                          <button
                            type="button"
                            className="chapter-action-btn"
                            title="Sửa chương học"
                            aria-label="Sửa chương học"
                            onClick={(e) => { e.stopPropagation(); onEditChapter(ch); }}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                        {onDeleteChapter && (
                          <button
                            type="button"
                            className="chapter-action-btn delete"
                            title="Xóa chương học"
                            aria-label="Xóa chương học"
                            onClick={(e) => { e.stopPropagation(); onDeleteChapter(ch.id); }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="sidebar-chapter-info">
                      <div className="planner-chapter-title">{ch.title}</div>
                      <div className="planner-chapter-desc">{ch.description || 'Chưa có mô tả.'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}


        {activeLeftTab === 'documents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h4 className="planner-sub-title sidebar-sub-header">
                <Upload size={16} aria-hidden="true" /> Nạp giáo trình / tài liệu nguồn (RAG)
              </h4>
              <form onSubmit={handleUploadDocument} className="planner-upload-form">
                <input 
                  type="file" 
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)} 
                  className="planner-file-input"
                  accept=".pdf,.docx,.txt"
                />
                <button type="submit" className="planner-upload-btn" disabled={loading || !uploadFile}>
                  {loading ? (
                    <span className="sidebar-tab-btn-content">
                      <RefreshCw size={12} aria-hidden="true" style={{ animation: 'spin 1.5s linear infinite' }} /> Đang tải lên…
                    </span>
                  ) : (
                    <span className="sidebar-tab-btn-content">
                      <Upload size={12} aria-hidden="true" /> Nạp tài liệu lên Vector DB
                    </span>
                  )}
                </button>
              </form>
              <div className="planner-doc-list sidebar-doc-scroll">
                {documents.length === 0 ? (
                  <div className="planner-empty-state">
                    Chưa có tài liệu nguồn.
                    <div className="empty-suggestions-box">
                      <div className="empty-suggestions-title">
                        <span>💡 Hướng dẫn & Gợi ý:</span>
                      </div>
                      <ul className="empty-suggestions-list">
                        <li className="empty-suggestions-item">Chọn file tài liệu học liệu (.pdf, .docx, .txt) và nhấn <strong>"Nạp tài liệu lên Vector DB"</strong>.</li>
                        <li className="empty-suggestions-item">Hoặc sử dụng ô tìm kiếm ở dưới để tìm kiếm và nạp RAG trực tuyến từ các nguồn uy tín.</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  documents.map((doc, idx) => (
                    <div key={idx} className="planner-doc-item">
                      <span className="planner-doc-name" title={doc}>
                        <FileText size={12} aria-hidden="true" className="sidebar-doc-icon" /> {doc}
                      </span>
                      <button type="button" onClick={() => handleDeleteDocument(doc)} className="planner-delete-doc-btn" title="Xóa tài liệu" aria-label="Xóa tài liệu">
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="sidebar-search-container">
              <h4 className="planner-sub-title sidebar-sub-header">
                <Search size={16} aria-hidden="true" /> Tìm kiếm học thuật trực tuyến
              </h4>
              <form onSubmit={handleWebSearch} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="Ví dụ: Cây nhị phân AVL tự cân bằng…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sidebar-search-input"
                  required
                />
                <button type="submit" className="planner-upload-btn" disabled={searching}>
                  {searching ? (
                    <span className="sidebar-tab-btn-content">
                      <RefreshCw size={12} aria-hidden="true" style={{ animation: 'spin 1.5s linear infinite' }} /> Đang tìm & nạp RAG…
                    </span>
                  ) : (
                    <span className="sidebar-tab-btn-content">
                      <Search size={12} aria-hidden="true" /> Tìm & Nạp RAG
                    </span>
                  )}
                </button>
              </form>
              
              {searching && (
                <div className="sidebar-search-status">
                  <RefreshCw size={11} aria-hidden="true" style={{ animation: 'spin 1.5s linear infinite', marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> Đang tìm kiếm, thu thập bài viết chất lượng cao và tự động nạp vào RAG…
                </div>
              )}
              
              {searchResult && (
                <div style={{ marginTop: '12px' }}>
                  <div className="sidebar-search-result-title">
                    <Check size={12} aria-hidden="true" /> Kết quả tìm & nạp:
                  </div>
                  <div className="sidebar-search-result-list">
                    {searchResult.accepted && searchResult.accepted.map((src, i) => (
                      <div key={i} className="sidebar-search-result-card accepted">
                        <div className="sidebar-search-result-card-title accepted">{src.title}</div>
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="sidebar-search-result-link">Link bài viết</a>
                      </div>
                    ))}
                    {searchResult.rejected && searchResult.rejected.map((src, i) => (
                      <div key={i} className="sidebar-search-result-card rejected">
                        <div className="sidebar-search-result-card-title rejected">{src.title}</div>
                        <span className="sidebar-search-result-rejected-msg">Từ chối (Độ tin cậy thấp)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeLeftTab === 'compliance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <h4 className="planner-sub-title sidebar-sub-header">
                <ClipboardList size={16} aria-hidden="true" /> Syllabus Compliance Checklist
              </h4>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 15px 0', lineHeight: '1.4' }}>
                Hệ thống tự động quét các tag chuẩn đầu ra <code>[CLO: CLO_CODE]</code> trong slide bài giảng để kiểm tra độ phủ.
              </p>
            </div>
            
            {clos.length === 0 ? (
              <div className="planner-empty-state">
                Môn học này chưa có danh sách chuẩn đầu ra CLO.
                <div className="empty-suggestions-box">
                  <div className="empty-suggestions-title">
                    <span>💡 Hướng dẫn & Gợi ý:</span>
                  </div>
                  <ul className="empty-suggestions-list">
                    <li className="empty-suggestions-item">Quay lại trang <strong>Bóc tách Syllabus (Cấu hình môn học)</strong> để nạp đề cương Syllabus môn học.</li>
                    <li className="empty-suggestions-item">Hệ thống sẽ tự động bóc tách chuẩn đầu ra CLO và ánh xạ mức độ Bloom tương ứng.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="sidebar-clo-list">
                {clos.map((clo) => {
                  const covered = isCloCovered(clo.code || clo.clo_code || '');
                  return (
                    <div 
                      key={clo.id}
                      className={`sidebar-clo-card ${covered ? 'covered' : 'uncovered'}`}
                    >
                      <div className="sidebar-clo-header">
                        <span className={`sidebar-clo-badge ${covered ? 'covered' : 'uncovered'}`}>
                          {clo.clo_code || clo.code}
                        </span>
                        <span className={`sidebar-clo-status ${covered ? 'covered' : 'uncovered'}`}>
                          {covered ? (
                            <span className="sidebar-tab-btn-content"><Check size={12} aria-hidden="true" /> Đã phủ</span>
                          ) : (
                            <span className="sidebar-tab-btn-content"><X size={12} aria-hidden="true" /> Chưa phủ</span>
                          )}
                        </span>
                      </div>
                      <div className="sidebar-clo-desc">
                        {clo.description}
                      </div>
                      <div className="sidebar-clo-footer">
                        <span>Thang Bloom mục tiêu: Mức {clo.bloom_level}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeLeftTab === 'mcqs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <h4 className="planner-sub-title sidebar-sub-header">
                <HelpCircle size={16} aria-hidden="true" /> Câu hỏi trắc nghiệm
              </h4>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 15px 0', lineHeight: '1.4' }}>
                Danh sách câu hỏi trắc nghiệm của chương này dùng để đối chiếu thiết kế CLO & Bloom.
              </p>
            </div>
            {loadingMcqs ? (
              <div className="sidebar-search-status">
                <RefreshCw size={14} aria-hidden="true" style={{ animation: 'spin 1.5s linear infinite', marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> Đang tải câu hỏi trắc nghiệm…
              </div>
            ) : !chapterMcqs || chapterMcqs.length === 0 ? (
              <div className="planner-empty-state">
                Chưa có câu hỏi trắc nghiệm cho chương này.
                <div className="empty-suggestions-box">
                  <div className="empty-suggestions-title">
                    <span>💡 Hướng dẫn & Gợi ý:</span>
                  </div>
                  <ul className="empty-suggestions-list">
                    <li className="empty-suggestions-item">Vào trang <strong>Ngân hàng đề thi</strong> từ trang chủ hoặc Roadmap để sinh câu hỏi trắc nghiệm.</li>
                    <li className="empty-suggestions-item">Khi sinh câu hỏi, nhớ chọn đúng chương học hiện tại để dữ liệu hiển thị đồng bộ ở đây.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="sidebar-mcq-list">
                {chapterMcqs.map((q, qIdx) => {
                  const associatedClo = clos.find(c => c.id === q.clo_id);
                  let optionsParsed: string[] = [];
                  if (typeof q.options === 'string') {
                     try {
                       optionsParsed = JSON.parse(q.options);
                     } catch (_) {
                       optionsParsed = [];
                     }
                  } else {
                    optionsParsed = q.options || [];
                  }

                  return (
                    <div key={q.id} className="sidebar-mcq-card">
                      <div className="sidebar-mcq-text">
                        <strong>Câu {qIdx + 1}:</strong> {q.question_text}
                      </div>
                      <div className="sidebar-mcq-options">
                        {optionsParsed.map((opt, oIdx) => {
                          const prefix = String.fromCharCode(65 + oIdx); // A, B, C, D
                          const isCorrect = opt === q.correct_answer;
                          return (
                            <div 
                              key={oIdx} 
                              className={`sidebar-mcq-option ${isCorrect ? 'correct' : 'incorrect'}`}
                            >
                              <span>{prefix}. {opt}</span>
                              {isCorrect && <Check size={10} style={{ color: 'var(--success-color)' }} aria-hidden="true" />}
                            </div>
                          );
                        })}
                      </div>
                      <div className="sidebar-mcq-tag-group">
                        {associatedClo && (
                          <span className="sidebar-mcq-tag clo">
                            {associatedClo.clo_code || associatedClo.code}
                          </span>
                        )}
                        <span className="sidebar-mcq-tag bloom">
                          Bloom: B{q.bloom_level}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeLeftTab === 'citations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <h4 className="planner-sub-title sidebar-sub-header">
                <Library size={16} aria-hidden="true" /> Trích dẫn học liệu
              </h4>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 15px 0', lineHeight: '1.4' }}>
                Danh sách các tài liệu tham chiếu RAG được sử dụng trực tiếp trong nội dung slide bài giảng của chương này.
              </p>
            </div>

            {!ragReferences || ragReferences.length === 0 ? (
              <div className="planner-empty-state">
                Chưa phát hiện trích dẫn nguồn RAG nào trong slide chương này.
                <div className="empty-suggestions-box">
                  <div className="empty-suggestions-title">
                    <span>💡 Hướng dẫn & Gợi ý:</span>
                  </div>
                  <ul className="empty-suggestions-list">
                    <li className="empty-suggestions-item">Hãy chèn thông tin trích dẫn dưới dạng tag hoặc nội dung RAG trong khi soạn slide.</li>
                    <li className="empty-suggestions-item">Hệ thống sẽ quét và hiển thị chi tiết các trích dẫn tài liệu tham chiếu ở đây.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="sidebar-clo-list">
                {ragReferences.map((ref, idx) => (
                  <div 
                    key={idx} 
                    className="sidebar-clo-card covered"
                    style={{ cursor: 'pointer', borderLeft: '3px solid var(--vinuni-gold)' }}
                    onClick={() => onCitationClick && onCitationClick(ref)}
                  >
                    <div className="sidebar-clo-header" style={{ marginBottom: '6px' }}>
                      <span className="sidebar-clo-badge covered" style={{ background: 'rgba(217, 119, 6, 0.15)', color: 'var(--vinuni-gold)', borderColor: 'var(--vinuni-gold-light)', fontSize: '11px' }}>
                        Nguồn: {ref.file_name}
                      </span>
                      <span className="sidebar-clo-status covered" style={{ fontSize: '11px' }}>
                        Trang: {ref.page_number}
                      </span>
                    </div>
                    <div className="sidebar-clo-desc" style={{ fontSize: '12px', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      "{ref.text}"
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '11px', color: 'var(--vinuni-gold)', fontWeight: 'bold' }}>
                      Xác minh nguồn trích dẫn <ArrowRight size={12} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
