import React from 'react';
import { BarChart2, Info, ChevronUp, ChevronDown, AlertTriangle, Settings, Lightbulb, Loader2, XCircle, Zap, Sparkles } from 'lucide-react';
import { Chapter } from '@/types';

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

export interface AcademicSearchPanelProps {
  chapters: Chapter[];
  selectedChapterId: number | '';
  setSelectedChapterId: (id: number | '') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleWebSearch: (e: React.FormEvent) => void;
  searching: boolean;
  loading: boolean;
  showAdvancedSearch: boolean;
  setShowAdvancedSearch: (val: boolean) => void;
  maxResults: number;
  setMaxResults: (val: number) => void;
  credibilityThreshold: number;
  setCredibilityThreshold: (val: number) => void;
  loadingSuggestions: boolean;
  suggestedQueries: string[];
  searchResult: WebSearchResult | null;
  expandedSearch: Record<string, boolean>;
  toggleSearchDetail: (key: string) => void;
  summarizing: Record<string, boolean>;
  summaries: Record<string, string>;
  toggleSummaryCollapse: (key: string) => void;
  handleSummarizeContent: (key: string, title: string, content: string) => void;
  collapsedSummaries: Record<string, boolean>;
  selectedRejected: Record<string, boolean>;
  setSelectedRejected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleForceIngest: () => void;
  showMetricGuide: boolean;
  setShowMetricGuide: (val: boolean) => void;
}

export default function AcademicSearchPanel({
  chapters,
  selectedChapterId,
  setSelectedChapterId,
  searchQuery,
  setSearchQuery,
  handleWebSearch,
  searching,
  loading,
  showAdvancedSearch,
  setShowAdvancedSearch,
  maxResults,
  setMaxResults,
  credibilityThreshold,
  setCredibilityThreshold,
  loadingSuggestions,
  suggestedQueries,
  searchResult,
  expandedSearch,
  toggleSearchDetail,
  summarizing,
  summaries,
  toggleSummaryCollapse,
  handleSummarizeContent,
  collapsedSummaries,
  selectedRejected,
  setSelectedRejected,
  handleForceIngest,
  showMetricGuide,
  setShowMetricGuide,
}: AcademicSearchPanelProps) {

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
                <label className="search-label">Mức uy tín tối thiểu:</label>
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
            {[...(searchResult.ingested || [])]
              .sort((a, b) => b.score - a.score)
              .map((src, i) => {
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
                        <span className="credibility-recommend-badge credibility-recommend-badge--forced" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Zap size={10} /> Đã ép nạp vào RAG
                        </span>
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
                          onClick={
                            summary
                              ? () => toggleSummaryCollapse(key)
                              : () => handleSummarizeContent(key, src.title, src.content)
                          }
                          disabled={isSummarizing}
                          className="credibility-btn-outline"
                        >
                          {isSummarizing ? (
                            <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang tóm tắt…</>
                          ) : summary ? (
                            collapsedSummaries[key] ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Xem tóm tắt</span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn tóm tắt</span>
                            )
                          ) : (
                            <><Sparkles size={12} aria-hidden="true" /> Tóm tắt (AI)</>
                          )}
                        </button>
                      )}
                    </div>

                    {isExpanded && src.content && (
                      <pre className="scraped-content-box">{src.content}</pre>
                    )}

                    {summary && !collapsedSummaries[key] && (
                      <div className="ai-summary-box animate-fade-in">
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
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Zap size={12} /> Nạp lại tài liệu ({Object.values(selectedRejected).filter(Boolean).length})
                    </button>
                  )}
                </div>

                <div className="search-rejected-list">
                  {[...(searchResult.rejected || [])]
                    .sort((a, b) => b.score - a.score)
                    .map((src, i) => {
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
                                <span className="credibility-score-badge credibility-score-badge-red">{(src.score * 100).toFixed(0)}% Uy tín</span>
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
                                    onClick={
                                      summary
                                        ? () => toggleSummaryCollapse(key)
                                        : () => handleSummarizeContent(key, src.title, src.content)
                                    }
                                    disabled={isSummarizing}
                                    className="credibility-btn-outline"
                                  >
                                    {isSummarizing ? (
                                      <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang tóm tắt…</>
                                    ) : summary ? (
                                      collapsedSummaries[key] ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Xem tóm tắt</span>
                                      ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn tóm tắt</span>
                                      )
                                    ) : (
                                      <><Sparkles size={12} aria-hidden="true" /> Tóm tắt (AI)</>
                                    )}
                                  </button>
                                )}
                              </div>

                              {isExpanded && src.content && (
                                <pre className="scraped-content-box">{src.content}</pre>
                              )}

                              {summary && !collapsedSummaries[key] && (
                                <div className="ai-summary-box animate-fade-in">
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
  );
}
