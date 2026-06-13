'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import FlowSteps from '../components/FlowSteps';
import { 
  ArrowLeft, 
  Library, 
  Globe, 
  Eye, 
  Trash2, 
  BarChart2, 
  Info, 
  AlertTriangle, 
  Settings, 
  Lightbulb, 
  BookOpen, 
  LogOut, 
  Upload,
  FileText,
  Loader2,
  XCircle,
  Sparkles,
  Check,
  X,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Course, Chapter } from '@/types';
import '../styles/KnowledgeBase.css';

export interface KnowledgeBaseProps {
  course: Course;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  activeView: string;
  isActive?: boolean;
}

interface WebSearchResultItem {
  url: string;
  title: string;
  content: string;
  score: number;
  justification: string;
  isForced?: boolean;
}

interface WebSearchResult {
  ingested: WebSearchResultItem[];
  rejected: WebSearchResultItem[];
}

export default function KnowledgeBase({ course, onBack, onLogout, onNavigate, activeView, isActive }: KnowledgeBaseProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);
  const [activeTab, setActiveTab] = useState<'documents' | 'academic_search'>('documents');
  
  // Data lists
  const [documents, setDocuments] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<number | ''>('');
  
  // RAG upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Academic Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<WebSearchResult | null>(null);
  const [expandedSearch, setExpandedSearch] = useState<Record<string, boolean>>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [maxResults, setMaxResults] = useState(10);
  const [credibilityThreshold, setCredibilityThreshold] = useState(0.7);
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const [showMetricGuide, setShowMetricGuide] = useState(false);
  const [selectedRejected, setSelectedRejected] = useState<Record<string, boolean>>({});
  
  // RAG Document Viewer states
  const [viewingDocName, setViewingDocName] = useState<string | null>(null);
  const [viewingDocContent, setViewingDocContent] = useState('');
  const [viewingDocLoading, setViewingDocLoading] = useState(false);
  
  // Global messages & loading
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleViewDocument = async (fileName: string) => {
    setViewingDocName(fileName);
    setViewingDocContent('');
    setViewingDocLoading(true);
    try {
      const response = await client.get(`/api/courses/${course.id}/documents/${fileName}`);
      setViewingDocContent(response.data.content || 'Không có nội dung.');
    } catch (err) {
      console.error(err);
      setViewingDocContent('Lỗi khi tải nội dung tài liệu nguồn RAG.');
    } finally {
      setViewingDocLoading(false);
    }
  };

  // Load documents and chapters on mount or when activeView changes to knowledge_base
  useEffect(() => {
    if (!course) return;
    if (activeView === 'knowledge_base') {
      loadDocuments();
      loadChapters();
    }
  }, [course.id, activeView]);

  const loadDocuments = async () => {
    try {
      const docResponse = await client.get(`/api/courses/${course.id}/documents`);
      setDocuments(docResponse.data.documents || []);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải danh sách tài liệu RAG.');
    }
  };

  const loadChapters = async () => {
    try {
      const response = await client.get(`/api/courses/${course.id}/chapters`);
      setChapters(response.data || []);
      if (response.data && response.data.length > 0) {
        setSelectedChapterId(response.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch suggested queries when selected chapter changes
  useEffect(() => {
    if (!selectedChapterId) return;
    fetchSuggestedQueries(selectedChapterId);
  }, [selectedChapterId]);

  const fetchSuggestedQueries = async (chapterId: number) => {
    setLoadingSuggestions(true);
    try {
      const suggestRes = await client.get(`/api/courses/chapters/${chapterId}/suggest-queries`);
      setSuggestedQueries(suggestRes.data.suggestions || []);
    } catch (err) {
      console.error("Error loading suggested queries:", err);
      setSuggestedQueries([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Upload RAG file
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    
    setError('');
    setMessage('');
    setLoading(true);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      await client.post(`/api/courses/${course.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocuments([uploadFile.name, ...documents]);
      setUploadFile(null);
      setMessage('Nạp tài liệu nguồn thành công! Vector DB đã được cập nhật.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải tài liệu lên Vector DB.');
    } finally {
      setLoading(false);
    }
  };

  // Delete RAG file
  const handleDeleteDocument = async (fileName: string) => {
    if (!window.confirm(`Bạn muốn xóa tài liệu tham chiếu '${fileName}' khỏi RAG?`)) return;
    setError('');
    setMessage('');
    
    try {
      await client.delete(`/api/courses/${course.id}/documents/${fileName}`);
      setDocuments(documents.filter(d => d !== fileName));
      setMessage('Đã xóa tài liệu khỏi Vector DB.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa tài liệu.');
    }
  };

  // Academic Search
  const handleWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setError('');
    setMessage('');
    setSearching(true);
    setSearchResult(null);
    setExpandedSearch({});
    setSummaries({});

    try {
      const response = await client.post(`/api/courses/${course.id}/web-search-ingest`, {
        query: searchQuery,
        max_results: maxResults,
        threshold: credibilityThreshold
      });
      setSearchResult(response.data);
      setMessage('Đã hoàn thành khảo sát độ uy tín và nạp RAG!');
      loadDocuments(); // Reload documents list to reflect changes
    } catch (err) {
      console.error(err);
      setError('Lỗi trong quá trình tìm kiếm học thuật.');
    } finally {
      setSearching(false);
    }
  };

  // Toggle detail view for scraped content
  const toggleSearchDetail = (key: string) => {
    setExpandedSearch(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Summarize content
  const handleSummarizeContent = async (key: string, title: string, content: string) => {
    if (summaries[key]) return;
    setSummarizing(prev => ({ ...prev, [key]: true }));
    try {
      const response = await client.post(`/api/courses/summarize-content`, {
        content: content,
        title: title
      });
      setSummaries(prev => ({
        ...prev,
        [key]: response.data.summary
      }));
    } catch (err) {
      console.error(err);
      setSummaries(prev => ({
        ...prev,
        [key]: 'Lỗi khi kết nối với máy chủ AI để tóm tắt.'
      }));
    } finally {
      setSummarizing(prev => ({ ...prev, [key]: false }));
    }
  };

  // Force Ingest of rejected sources
  const handleForceIngest = async () => {
    if (!searchResult) return;
    const selectedUrls = Object.keys(selectedRejected).filter(url => selectedRejected[url]);
    if (selectedUrls.length === 0) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    let successCount = 0;
    const ingestedList = [...(searchResult.ingested || [])];
    let rejectedList = [...(searchResult.rejected || [])];
    const targetChapter = chapters.find(c => c.id === selectedChapterId);

    try {
      for (const url of selectedUrls) {
        const item = rejectedList.find(r => r.url === url);
        if (!item) continue;
        
        await client.post(`/api/courses/${course.id}/force-ingest-url`, {
          url: item.url,
          title: item.title,
          content: item.content
        });
        
        successCount++;
        // Add to ingested with a forced flag
        ingestedList.push({
          ...item,
          isForced: true
        });
        // Remove from rejected
        rejectedList = rejectedList.filter(r => r.url !== url);
      }
      
      setSearchResult({
        ...searchResult,
        ingested: ingestedList,
        rejected: rejectedList
      });
      
      loadDocuments();
      setSelectedRejected({});
      setMessage(`⚡ Đã ép nạp thành công ${successCount} tài liệu vào RAG! Các tài liệu này đã được gán làm nguồn tham khảo trực tiếp cho chương học đang chọn: "${targetChapter ? targetChapter.title : 'Chương học tương ứng'}".`);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi nạp thủ công tài liệu vào RAG.');
    } finally {
      setLoading(false);
    }
  };

  // Recommendation builder
  const getRecommendation = (score: number) => {
    const pct = Math.round(score * 100);
    if (pct >= 80) {
      return {
        label: "Khuyên dùng (Highly Recommended)",
        level: "highly-recommended",
        desc: "Nguồn chính thống/độ tin cậy học thuật rất cao. Rất khuyên dùng để nạp vào RAG."
      };
    } else if (pct >= 60) {
      return {
        label: "Đáng tin cậy (Credible)",
        level: "credible",
        desc: "Tài liệu học thuật/tổ chức giáo dục hợp lệ. Rất phù hợp làm học liệu bổ trợ."
      };
    } else if (pct >= 40) {
      return {
        label: "Cần cân nhắc (Average)",
        level: "average",
        desc: "Nguồn tin phổ thông phi học thuật (.org, .com). Hãy cân nhắc kiểm duyệt trước khi nạp RAG."
      };
    } else {
      return {
        label: "Không khuyến nghị (Low Credibility)",
        level: "low-credibility",
        desc: "Blog cá nhân, diễn đàn hoặc mạng xã hội. Độ tin cậy thấp, không khuyến nghị nạp RAG."
      };
    }
  };

  const renderJustifications = (justification: string) => {
    if (!justification) return null;
    const items = justification.split('; ');
    return (
      <div className="justification-container">
        {items.map((item, idx) => {
          const isPositive = item.includes('+');
          const isNegative = item.includes('-');
          let badgeClass = "justification-badge-neutral";
          if (isPositive) badgeClass = "justification-badge-positive";
          if (isNegative) badgeClass = "justification-badge-negative";
          return (
            <span key={idx} className={`justification-badge ${badgeClass}`}>
              {item}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="rag-container">
      {/* HEADER */}
      {!portalTarget && (
        <header className="rag-header">
          <div className="rag-header-left">
            <button onClick={onBack} className="rag-back-btn">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div>
              <h2 className="rag-course-title">{course.course_name}</h2>
            </div>
          </div>
          <button className="rag-logout-btn" onClick={onLogout}>
            <LogOut size={14} /> Đăng Xuất
          </button>
        </header>
      )}

      {error && <div className="rag-error-alert">{error}</div>}
      {message && <div className="rag-success-alert">{message}</div>}

      <div className="rag-tab-section">
        <div className="rag-tab-header">
          <button 
            onClick={() => setActiveTab('documents')} 
            className={`rag-tab-btn ${activeTab === 'documents' ? 'rag-tab-btn-active' : ''}`}
          >
            <Library size={16} /> Thư viện tài liệu RAG
          </button>
          <button 
            onClick={() => setActiveTab('academic_search')} 
            className={`rag-tab-btn ${activeTab === 'academic_search' ? 'rag-tab-btn-active' : ''}`}
          >
            <Globe size={16} /> Tìm kiếm học thuật trực tuyến
          </button>
        </div>

        <div className="rag-tab-content">
          {activeTab === 'documents' ? (
            <div className="rag-split-layout">
              {/* CỘT TRÁI: Upload form */}
              <div className="rag-form-panel">
                <h3 className="rag-section-title">Nạp tài liệu mới vào Vector DB</h3>
                <p className="rag-section-desc">Hệ thống RAG sẽ bóc tách văn bản trong file và băm vector để cung cấp kiến thức thực tế cho AI lúc soạn giáo án.</p>
                <form onSubmit={handleUploadDocument} className="rag-upload-form">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                    className="rag-file-input"
                  />
                  <button type="submit" disabled={!uploadFile || loading} className="rag-upload-btn">
                    {loading ? 'Đang nạp Vector…' : (
                      <>
                        <Upload size={14} aria-hidden="true" /> Nạp Vào RAG (Vector DB)
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* CỘT PHẢI: Documents list */}
              <div className="rag-list-panel">
                <h3 className="rag-section-title">Danh mục tài liệu RAG đã nạp ({documents.length})</h3>
                {documents.length === 0 ? (
                  <div className="rag-empty-state">Chưa nạp tài liệu tham khảo nào cho môn học này.</div>
                ) : (
                  <div className="rag-doc-grid">
                    {documents.map((doc, idx) => (
                      <div key={idx} className="rag-doc-card">
                        <span className="rag-doc-name" title={doc}>
                          <FileText size={14} className="rag-doc-icon" /> {doc}
                        </span>
                        <div className="rag-doc-actions">
                          <button 
                            type="button"
                            onClick={() => handleViewDocument(doc)} 
                            className="rag-action-btn-circle rag-action-btn-view"
                            title="Xem nội dung tài liệu"
                            aria-label="Xem nội dung tài liệu"
                          >
                            <Eye size={14} aria-hidden="true" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeleteDocument(doc)} 
                            className="rag-action-btn-circle rag-action-btn-delete"
                            title="Xóa tài liệu"
                            aria-label="Xóa tài liệu"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="search-split-layout">
              {/* CỘT TRÁI: Tìm kiếm form */}
              <div className="search-form-panel">
                <h3 className="rag-section-title">Tìm kiếm & Thẩm định học thuật</h3>
                
                {/* Metric Guide */}
                <div className="metric-guide-box">
                  <div className="metric-guide-header" onClick={() => setShowMetricGuide(!showMetricGuide)}>
                    <span className="metric-guide-header-title">
                      <BarChart2 size={16} /> Cách tính điểm uy tín (%) <Info size={14} />
                    </span>
                    <span className="metric-guide-header-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {showMetricGuide ? 'Thu gọn' : 'Chi tiết'}
                      {showMetricGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                  {showMetricGuide && (
                    <div className="metric-guide-content">
                      <ul className="metric-list">
                        <li><strong>Domain Whitelist (Max 50%):</strong> .edu, .gov, các nhà xuất bản uy tín (IEEE, Springer, ScienceDirect...).</li>
                        <li><strong>DOI/ISSN (Max 20%):</strong> Chứa mã định danh nghiên cứu.</li>
                        <li><strong>Từ khóa học thuật (Max 15%):</strong> Mật độ thuật ngữ khoa học chuyên ngành.</li>
                        <li><strong>Độ mới (Max 15%):</strong> Xuất bản hoặc cập nhật trong giai đoạn 2020-2026.</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Chapter Context Selector */}
                {chapters.length > 0 ? (
                  <div className="search-select-group">
                    <label className="search-label">Lấy gợi ý từ khóa theo chương:</label>
                    <select
                      value={selectedChapterId}
                      onChange={(e) => setSelectedChapterId(e.target.value ? Number(e.target.value) : '')}
                      className="search-select"
                    >
                      {chapters.map(ch => (
                        <option key={ch.id} value={ch.id}>{ch.title}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="no-chapters-warning">
                    <AlertTriangle size={18} className="no-chapters-icon" />
                    Môn học này hiện chưa có chương học nào được thiết kế. Vui lòng quay lại Roadmap và sinh Dàn Ý để khởi tạo chương học.
                  </div>
                )}

                <form onSubmit={handleWebSearch} className="search-form">
                  <div className="search-input-group">
                    <label className="search-label">Từ khóa học thuật cần tìm kiếm</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: binary search tree worst case complexity…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="search-input"
                      required
                    />
                  </div>
                  
                  <div className="search-action-row">
                    <button type="submit" disabled={searching || loading} className="search-submit-btn">
                      {searching ? 'Đang quét học thuật…' : 'Tìm kiếm & Đánh giá'}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setShowAdvancedSearch(!showAdvancedSearch)} 
                      className="search-config-toggle"
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Settings size={14} /> Cấu hình {showAdvancedSearch ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                  </div>

                  {/* Advanced Settings */}
                  {showAdvancedSearch && (
                    <div className="search-advanced-panel">
                      <div className="search-advanced-row">
                        <label className="search-label">Số tài liệu tối đa:</label>
                        <select
                          value={maxResults}
                          onChange={(e) => setMaxResults(parseInt(e.target.value))}
                          className="search-select"
                        >
                          <option value={5}>5 tài liệu</option>
                          <option value={10}>10 tài liệu</option>
                          <option value={15}>15 tài liệu</option>
                        </select>
                      </div>
                      
                      <div className="search-advanced-row">
                        <label className="search-label">Mức uy tín tối thiểu (Threshold):</label>
                        <div className="search-slider-container">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(credibilityThreshold * 100)}
                            onChange={(e) => setCredibilityThreshold(parseFloat(e.target.value) / 100)}
                            className="search-slider"
                          />
                          <span className="search-slider-value">
                            {Math.round(credibilityThreshold * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Suggested Queries */}
                  {chapters.length > 0 && (
                    <div className="search-suggestions-section">
                      <div className="search-suggestions-title">
                        <Lightbulb size={14} className="search-suggestion-icon" /> Gợi ý từ khóa AI cho chương đang chọn:
                      </div>
                      {loadingSuggestions ? (
                        <div className="search-loading-suggestions"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Đang tải gợi ý từ khóa từ AI…</div>
                      ) : suggestedQueries.length > 0 ? (
                        <div className="search-suggestions-chips">
                          {suggestedQueries.map((query, idx) => (
                            <button 
                              key={idx} 
                              type="button"
                              onClick={() => setSearchQuery(query)}
                              className="search-suggestion-chip"
                            >
                              {query}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="search-loading-suggestions search-suggestions-error"><XCircle size={14} /> Không tải được gợi ý từ khóa cho chương học này.</div>
                      )}
                    </div>
                  )}
                </form>
              </div>

              {/* CỘT PHẢI: Kết quả tìm kiếm */}
              <div className="search-results-panel">
                <h3 className="rag-section-title">Kết quả khảo sát</h3>
                {searchResult ? (
                  <div className="search-results-wrapper">
                    <div className="search-results-header">
                      Đã lọc: {searchResult.ingested.length} Đã nạp | {searchResult.rejected.length} Bị lọc
                    </div>

                    {/* INGESTED (XANH) */}
                    {searchResult.ingested.map((src, i) => {
                      const key = `ing-${i}`;
                      const isExpanded = !!expandedSearch[key];
                      const isSummarizing = !!summarizing[key];
                      const summary = summaries[key];
                      const rec = getRecommendation(src.score);
                      return (
                        <div key={key} className="credibility-card credibility-card-green">
                          <div className="credibility-header">
                            <span className="credibility-score-badge credibility-score-badge-green">{(src.score * 100).toFixed(0)}% Uy tín</span>
                            <span className={`credibility-recommend-badge credibility-recommend-badge--${rec.level}`}>{rec.label}</span>
                            {src.isForced && (
                              <span className="credibility-recommend-badge credibility-recommend-badge--forced">⚡ Đã ép nạp vào RAG</span>
                            )}
                          </div>
                          <strong className="credibility-title">{src.title}</strong>
                          <a 
                            href={src.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="credibility-url credibility-link"
                            title={src.url}
                          >
                            {src.url}
                          </a>
                          {renderJustifications(src.justification)}
                          <div className="credibility-desc-text"><Lightbulb size={13} className="credibility-desc-icon" /> {rec.desc}</div>
                          
                          <div className="credibility-actions">
                            {src.content && (
                              <button
                                type="button"
                                onClick={() => toggleSearchDetail(key)}
                                className="credibility-btn-outline"
                              >
                                {isExpanded ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn</span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Đọc nội dung</span>
                                )}
                              </button>
                            )}
                            {src.content && (
                              <button
                                type="button"
                                onClick={() => handleSummarizeContent(key, src.title, src.content)}
                                disabled={isSummarizing || !!summary}
                                className="credibility-btn-outline"
                              >
                                {isSummarizing ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang tóm tắt…</> : <><Sparkles size={12} aria-hidden="true" /> {summary ? 'Đã tóm tắt' : 'Tóm tắt (AI)'}</>}
                              </button>
                            )}
                          </div>

                          {isExpanded && src.content && (
                            <pre className="scraped-content-box">{src.content}</pre>
                          )}

                          {summary && (
                            <div className="ai-summary-box">
                              <div className="ai-summary-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={14} /> Phân tích học thuật chuyên sâu (AI):</div>
                              <div>{summary}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* REJECTED (ĐỎ) */}
                    {searchResult.rejected && searchResult.rejected.length > 0 && (
                      <div className="search-rejected-container">
                        <div className="force-ingest-panel-header">
                          <span className="search-rejected-header"><AlertTriangle size={14} className="search-rejected-icon" /> Bị từ chối ({searchResult.rejected.length})</span>
                          {Object.values(selectedRejected).filter(Boolean).length > 0 && (
                            <button
                              type="button"
                              onClick={handleForceIngest}
                              className="force-ingest-btn"
                            >
                              ⚡ Force Nạp ({Object.values(selectedRejected).filter(Boolean).length})
                            </button>
                          )}
                        </div>
                        
                        {searchResult.rejected.map((src, i) => {
                          const key = `rej-${i}`;
                          const isExpanded = !!expandedSearch[key];
                          const isSummarizing = !!summarizing[key];
                          const summary = summaries[key];
                          const rec = getRecommendation(src.score);
                          const isChecked = !!selectedRejected[src.url];
                          return (
                            <div key={key} className="credibility-card credibility-card-red">
                              <div className="search-rejected-item-layout">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => setSelectedRejected(prev => ({ ...prev, [src.url]: !prev[src.url] }))}
                                  className="search-rejected-checkbox"
                                />
                                <div className="search-rejected-content-wrapper">
                                  <div className="credibility-header">
                                    <span className="credibility-score-badge credibility-score-badge-red">{(src.score * 100).toFixed(0)}% Uy uy tín</span>
                                    <span className={`credibility-recommend-badge credibility-recommend-badge--${rec.level}`}>{rec.label}</span>
                                  </div>
                                  <strong className="credibility-title">{src.title}</strong>
                                  <a 
                                    href={src.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="credibility-url credibility-link"
                                    title={src.url}
                                  >
                                    {src.url}
                                  </a>
                                  {renderJustifications(src.justification)}
                                  <div className="credibility-desc-text"><Lightbulb size={13} className="credibility-desc-icon" /> {rec.desc}</div>

                                  <div className="credibility-actions">
                                    {src.content && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSearchDetail(key)}
                                        className="credibility-btn-outline"
                                      >
                                         {isExpanded ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn</span>
                                  ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Đọc nội dung</span>
                                  )}
                                      </button>
                                    )}
                                    {src.content && (
                                      <button
                                        type="button"
                                        onClick={() => handleSummarizeContent(key, src.title, src.content)}
                                        disabled={isSummarizing || !!summary}
                                        className="credibility-btn-outline"
                                      >
                                        {isSummarizing ? <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang tóm tắt…</> : <><Sparkles size={12} aria-hidden="true" /> {summary ? 'Đã tóm tắt' : 'Tóm tắt (AI)'}</>}
                                      </button>
                                    )}
                                  </div>

                                  {isExpanded && src.content && (
                                    <pre className="scraped-content-box">{src.content}</pre>
                                  )}

                                  {summary && (
                                    <div className="ai-summary-box">
                                      <div className="ai-summary-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={14} /> Phân tích học thuật chuyên sâu (AI):</div>
                                      <div>{summary}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="search-empty-results">
                    Chưa thực hiện tìm kiếm học thuật trực tuyến.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* MODAL XEM NỘI DUNG TÀI LIỆU RAG */}
      {viewingDocName && (
        <div className="doc-viewer-overlay">
          <div className="doc-viewer-modal">
            <div className="doc-viewer-header">
              <div>
                <h4 className="doc-viewer-title">
                  📄 Đang xem: {viewingDocName}
                </h4>
                <span className="doc-viewer-subtitle">Dữ liệu bóc tách được lưu trữ trong RAG Vector DB</span>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingDocName(null)} 
                className="doc-viewer-close-btn" 
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="doc-viewer-body">
              {viewingDocLoading ? (
                <div className="doc-viewer-loading">
                  <Loader2 className="animate-spin doc-viewer-loader-icon" size={24} aria-hidden="true" />
                  <span>Đang tải nội dung văn bản bóc tách…</span>
                </div>
              ) : (
                viewingDocContent
              )}
            </div>
            <div className="doc-viewer-footer">
              <button 
                type="button"
                onClick={() => setViewingDocName(null)}
                className="doc-viewer-btn"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

