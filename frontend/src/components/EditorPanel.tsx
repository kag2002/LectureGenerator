import React, { useState, useEffect } from 'react';
import client from '../api/client';
import SlideProposalPreview from './SlideProposalPreview';
import { MarkdownPreview } from '../utils/markdown';
import { trackAIFeedback, trackClick } from '../utils/telemetryHelper';
import { THEMES, parseMarkdownToSlidesJS } from '../utils/slideParser';
import { Chapter } from '@/types';
import { 
  Sparkles, AlertTriangle, Lightbulb, CheckCircle2, 
  Loader2, Download, FileText, History, Save, Trash2, 
  Maximize2, Minimize2, Check, Palette, Cpu, Minus, Plus, Undo2, Redo2 
} from 'lucide-react';

export interface RevisionType {
  id: number;
  user_prompt: string;
  field: string;
  created_at: string;
}

export interface ConsistencyIssueType {
  type: string;
  location: string;
  description: string;
  suggestion: string;
}

export interface EditorPanelProps {
  selectedChapter: Chapter | null;
  activeWorkTab: 'slides' | 'active_learning';
  slideContent: string;
  setSlideContent: React.Dispatch<React.SetStateAction<string>> | ((val: string) => void);
  savedSlideContent: string;
  activeLearningScript: string;
  setActiveLearningScript: React.Dispatch<React.SetStateAction<string>> | ((val: string) => void);
  savedScript: string;
  slideEditMode: 'edit' | 'split' | 'preview';
  setSlideEditMode: (mode: 'edit' | 'split' | 'preview') => void;
  scriptEditMode: 'edit' | 'preview';
  setScriptEditMode: (mode: 'edit' | 'preview') => void;
  selectedTheme: string;
  setSelectedTheme: (theme: string) => void;
  isFullscreen: boolean;
  setIsFullscreen: (full: boolean) => void;
  handleCitationClick: (citation: string) => void;
  parseActiveLearningScript: (script: string) => { mainScript: string; rationale: string };
  editorFontSize: 'sm' | 'md' | 'lg' | 'xl';
  setEditorFontSize: (size: 'sm' | 'md' | 'lg' | 'xl') => void;
  onRecordAIUsage: (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
  saving?: boolean;
  handleSaveMaterials?: () => void;
  handleResetMaterials?: () => void;
  setShowRevisionModal?: (show: boolean) => void;
  loadRevisionsExternal?: (chapterId: number) => void;
  isAIGenerating?: boolean;
  handleUndo?: () => void;
  handleRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export default function EditorPanel({
  selectedChapter,
  activeWorkTab,
  slideContent,
  setSlideContent,
  savedSlideContent,
  activeLearningScript,
  setActiveLearningScript,
  savedScript,
  slideEditMode,
  setSlideEditMode,
  scriptEditMode,
  setScriptEditMode,
  selectedTheme,
  setSelectedTheme,
  isFullscreen,
  setIsFullscreen,
  handleCitationClick,
  parseActiveLearningScript,
  editorFontSize,
  setEditorFontSize,
  onRecordAIUsage,
  setAIProcessingStatus,
  saving = false,
  handleSaveMaterials,
  handleResetMaterials,
  setShowRevisionModal,
  loadRevisionsExternal,
  isAIGenerating = false,
  handleUndo = () => {},
  handleRedo = () => {},
  canUndo = false,
  canRedo = false
}: EditorPanelProps) {
  const [revPrompt, setRevPrompt] = useState('');
  const [revisions, setRevisions] = useState<RevisionType[]>([]);
  const [revising, setRevising] = useState(false);
  const [revError, setRevError] = useState('');
  const [revSuccess, setRevSuccess] = useState('');
  const [showRevisions, setShowRevisions] = useState(false);
  
  const [aiProposal, setAiProposal] = useState<{
    prompt: string;
    proposed_content: string;
    type: 'slides' | 'script';
  } | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  
  // Warnings from last revision
  const [warnings, setWarnings] = useState<string[]>([]);
  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssueType[]>([]);

  const [localSlideContent, setLocalSlideContent] = useState(slideContent);
  const [debouncedSlideContent, setDebouncedSlideContent] = useState(slideContent);

  useEffect(() => {
    setLocalSlideContent(slideContent);
    setDebouncedSlideContent(slideContent);
  }, [slideContent]);

  const handleSlideTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalSlideContent(newVal);
    setSlideContent(newVal);
  };

  const handleSaveRevisedSlide = (slideIndex: number, newSlideMarkdown: string) => {
    const parsedSlides = parseMarkdownToSlidesJS(slideContent);
    if (slideIndex >= 0 && slideIndex < parsedSlides.length) {
      parsedSlides[slideIndex].rawMarkdown = newSlideMarkdown;
      const updatedContent = parsedSlides.map(s => s.rawMarkdown).join('\n\n');
      setSlideContent(updatedContent);
      setLocalSlideContent(updatedContent);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSlideContent(localSlideContent);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSlideContent]);

  useEffect(() => {
    if (selectedChapter?.id) {
      loadRevisions();
      setWarnings([]);
      setConsistencyIssues([]);
      setRevPrompt('');
      setRevSuccess('');
      setRevError('');
    }
  }, [selectedChapter?.id]);

  const loadRevisions = async () => {
    if (!selectedChapter?.id) return;
    try {
      const res = await client.get(`/api/courses/chapters/${selectedChapter.id}/revisions`);
      setRevisions(res.data || []);
    } catch (err) {
      console.error("Error loading revisions:", err);
    }
  };

  const handleReviseContent = async () => {
    if (!revPrompt.trim() || !selectedChapter?.id) return;
    setRevising(true);
    setRevError('');
    setRevSuccess('');
    setWarnings([]);
    setConsistencyIssues([]);
    
    const endpoint = activeWorkTab === 'slides' 
      ? `/api/courses/chapters/${selectedChapter.id}/revise-slides`
      : `/api/courses/chapters/${selectedChapter.id}/revise-active-learning`;
      
    const opStartTime = Date.now();
    setAIProcessingStatus(true, `AI đang chỉnh sửa ${activeWorkTab === 'slides' ? 'slide' : 'kịch bản'}…`);

    try {
      const response = await client.post(endpoint, { prompt: revPrompt });
      const data = response.data;
      
      if (activeWorkTab === 'slides') {
        setSlideContent(data.slide_content);
      } else {
        setActiveLearningScript(data.active_learning_script);
      }
      
      setRevSuccess(`Đã chỉnh sửa: ${data.changes_summary || 'AI đã cập nhật nội dung.'}`);
      setWarnings(data.consistency_warnings || []);
      
      if (data.consistency_check && data.consistency_check.issues) {
        setConsistencyIssues(data.consistency_check.issues);
      }
      
      setRevPrompt('');
      loadRevisions();

      setAIProcessingStatus(false);
      const opLatency = (Date.now() - opStartTime) / 1000;
      onRecordAIUsage({
        operation: `AI Chỉnh sửa - Yêu cầu: "${revPrompt}"`,
        latency: Number(opLatency.toFixed(1)),
        cost: data.usage?.total_cost !== undefined ? Number(data.usage.total_cost) : 0.01,
        tokens: data.usage ? {
          prompt: data.usage.prompt_tokens || 0,
          completion: data.usage.completion_tokens || 0
        } : undefined,
        model: data.usage?.model_name,
        status: 'success'
      });

      // Save AI proposal trace details
      setAiProposal({
        prompt: revPrompt,
        proposed_content: activeWorkTab === 'slides' ? data.slide_content : data.active_learning_script,
        type: activeWorkTab === 'slides' ? 'slides' : 'script'
      });
      setRating(null);
      setFeedbackText('');
    } catch (err: any) {
      console.error(err);
      setRevError(err.response?.data?.detail || 'Lỗi khi gửi yêu cầu chỉnh sửa đến AI.');

      setAIProcessingStatus(false);
      const opLatency = (Date.now() - opStartTime) / 1000;
      onRecordAIUsage({
        operation: `AI Chỉnh sửa - Yêu cầu: "${revPrompt}"`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    } finally {
      setRevising(false);
    }
  };

  const handleRevert = async (revId: number) => {
    if (!selectedChapter?.id) return;
    if (!window.confirm("Bạn muốn khôi phục về phiên bản này?")) return;
    setRevising(true);
    setRevError('');
    setRevSuccess('');
    try {
      const response = await client.post(`/api/courses/chapters/${selectedChapter.id}/revert-revision/${revId}`);
      setSlideContent(response.data.slide_content || '');
      setActiveLearningScript(response.data.active_learning_script || '');
      setRevSuccess(response.data.message);
      loadRevisions();
    } catch (err) {
      console.error(err);
      setRevError('Không thể khôi phục phiên bản.');
    } finally {
      setRevising(false);
    }
  };

  const handleRateProposal = async (selectedRating: number) => {
    setRating(selectedRating);
    if (selectedChapter) {
      trackClick('rate-ai-stars', selectedChapter.course_id, { rating: selectedRating });
    }
    // Gửi telemetry feedback tức thời khi bấm sao
    if (aiProposal && selectedChapter) {
      const currentContent = aiProposal.type === 'slides' ? slideContent : activeLearningScript;
      await trackAIFeedback({
        course_id: selectedChapter.course_id,
        chapter_id: selectedChapter.id,
        prompt: aiProposal.prompt,
        proposed_content: aiProposal.proposed_content,
        edited_content: currentContent,
        rating: selectedRating,
        feedback: feedbackText || undefined
      });
    }
  };

  const handleSubmitFeedback = async () => {
    if (aiProposal && selectedChapter && rating) {
      const currentContent = aiProposal.type === 'slides' ? slideContent : activeLearningScript;
      await trackAIFeedback({
        course_id: selectedChapter.course_id,
        chapter_id: selectedChapter.id,
        prompt: aiProposal.prompt,
        proposed_content: aiProposal.proposed_content,
        edited_content: currentContent,
        rating: rating,
        feedback: feedbackText
      });
      setAiProposal(null);
      setRating(null);
      setFeedbackText('');
      setRevSuccess('Cảm ơn bạn đã gửi phản hồi và đóng góp dữ liệu cải tiến AI!');
    }
  };

  const handleSaveWithTelemetry = async () => {
    if (selectedChapter) {
      trackClick('save-editor-materials', selectedChapter.course_id);
    }
    if (handleSaveMaterials) {
      handleSaveMaterials();
    }
    
    // Gửi trace telemetry thu thập DPO/SFT
    if (aiProposal && selectedChapter) {
      const currentContent = aiProposal.type === 'slides' ? slideContent : activeLearningScript;
      await trackAIFeedback({
        course_id: selectedChapter.course_id,
        chapter_id: selectedChapter.id,
        prompt: aiProposal.prompt,
        proposed_content: aiProposal.proposed_content,
        edited_content: currentContent,
        rating: rating || undefined,
        feedback: feedbackText || undefined
      });
      setAiProposal(null);
      setRating(null);
      setFeedbackText('');
    }
  };

  const renderRevisionUI = () => {
    return (
      <div className="editor-revision-widget">
        <div className="editor-revision-header">
          <span className="editor-revision-title">
            <Sparkles size={14} /> AI Chỉnh sửa & Kiểm tra đồng bộ
          </span>
          <button 
            type="button"
            onClick={() => {
              setShowRevisions(!showRevisions);
              if (!showRevisions) loadRevisions();
            }}
            className="editor-revision-history-toggle"
          >
            {showRevisions ? 'Ẩn lịch sử' : `Xem lịch sử (${revisions.length})`}
          </button>
        </div>

        <div className="editor-revision-input-group">
          <input
            type="text"
            placeholder={activeWorkTab === 'slides' 
              ? "Slide 3 bổ sung ví dụ AVL rotation…" 
              : "Hoạt động 1 chuyển sang Jigsaw…"
            }
            value={revPrompt}
            onChange={(e) => setRevPrompt(e.target.value)}
            disabled={revising || isAIGenerating}
            className="editor-revision-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleReviseContent();
            }}
          />
          <button
            type="button"
            onClick={handleReviseContent}
            disabled={revising || !revPrompt.trim() || isAIGenerating}
            className="editor-revision-submit-btn"
          >
            {revising ? 'Đang chỉnh sửa…' : 'Chỉnh sửa bằng AI'}
          </button>
        </div>

        {revError && <div className="editor-revision-message-error"><AlertTriangle size={12} /> {revError}</div>}
        {revSuccess && <div className="editor-revision-message-success"><Check size={12} /> {revSuccess}</div>}

        {revSuccess && aiProposal && (
          <div className="editor-revision-feedback-stars" style={{ 
            marginTop: '10px', 
            background: 'rgba(255,255,255,0.02)', 
            padding: '12px', 
            borderRadius: '8px', 
            border: '1px solid rgba(255,255,255,0.05)' 
          }}>
            <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Đánh giá chất lượng chỉnh sửa của AI:
            </span>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRateProposal(star)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    cursor: 'pointer', 
                    color: star <= (rating || 0) ? '#fbbf24' : '#475569', 
                    fontSize: '20px', 
                    padding: 0,
                    transition: 'transform 0.1s'
                  }}
                  title={`${star} sao`}
                >
                  ★
                </button>
              ))}
            </div>
            {rating !== null && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Góp ý thêm cho AI (không bắt buộc)..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  style={{ 
                    flex: 1, 
                    background: 'rgba(15, 23, 42, 0.6)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    color: '#f8fafc', 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={handleSubmitFeedback}
                  style={{ 
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                    border: 'none', 
                    color: '#fff', 
                    padding: '6px 12px', 
                    borderRadius: '6px', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    cursor: 'pointer' 
                  }}
                >
                  Gửi góp ý
                </button>
              </div>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="editor-revision-warnings">
            <strong>Cảnh báo (Revision Agent):</strong>
            <ul>
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {consistencyIssues.length > 0 && (
          <div className="editor-consistency-box">
            <strong className="editor-consistency-title"><AlertTriangle size={12} /> Rà soát tính nhất quán sư phạm:</strong>
            {consistencyIssues.map((issue, idx) => (
              <div key={idx} className="editor-consistency-issue-card">
                <div className="editor-consistency-issue-header">
                  [{issue.type}] tại {issue.location}
                </div>
                <div className="editor-consistency-issue-desc">{issue.description}</div>
                <div className="editor-consistency-issue-suggestion"><Lightbulb size={12} /> Gợi ý: {issue.suggestion}</div>
              </div>
            ))}
          </div>
        )}

        {showRevisions && (
          <div className="editor-revision-list-container">
            <span className="editor-revision-list-title">Lịch sử chỉnh sửa:</span>
            {revisions.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>Chưa có phiên bản chỉnh sửa nào.</span>
            ) : (
              revisions.map((rev) => (
                <div key={rev.id} className="editor-revision-list-item">
                  <div className="editor-revision-list-info">
                    <span className="editor-revision-list-prompt">"{rev.user_prompt}"</span>
                    <span className="editor-revision-list-meta">
                      {rev.field === 'slide_content' ? 'Slides' : 'Active Learning'} • {new Date(rev.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevert(rev.id)}
                    className="editor-revision-revert-btn"
                  >
                    Revert
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className={`planner-editor-panel ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="planner-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px 16px', width: '100%' }}>
        <div className="editor-header-left">
          <h3 className="planner-section-title">Bản soạn thảo chương học</h3>
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            className={`editor-header-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
            title={isFullscreen ? 'Thu nhỏ cửa sổ soạn thảo' : 'Phóng to soạn thảo toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {selectedChapter && (
          <div className="editor-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Undo / Redo Buttons */}
            <button 
              onClick={handleUndo} 
              disabled={!canUndo}
              className="editor-header-icon-btn"
              title="Hoàn tác (Ctrl+Z)"
            >
              <Undo2 size={14} aria-hidden="true" />
            </button>
            <button 
              onClick={handleRedo} 
              disabled={!canRedo}
              className="editor-header-icon-btn"
              title="Làm lại (Ctrl+Y)"
            >
              <Redo2 size={14} aria-hidden="true" />
            </button>

            {loadRevisionsExternal && setShowRevisionModal && (
              <button 
                onClick={() => {
                  loadRevisionsExternal(selectedChapter.id);
                  setShowRevisionModal(true);
                }}
                disabled={isAIGenerating}
                className="editor-header-icon-btn"
                title={isAIGenerating ? "Không thể xem lịch sử khi AI đang sinh slide" : "Xem lịch sử chỉnh sửa / khôi phục các phiên bản cũ"}
              >
                <History size={14} aria-hidden="true" />
              </button>
            )}

            {handleSaveMaterials && (
              <button 
                onClick={handleSaveWithTelemetry} 
                disabled={saving || isAIGenerating || (slideContent === savedSlideContent && activeLearningScript === savedScript)} 
                className="planner-save-btn" 
                title={isAIGenerating ? "Không thể lưu khi AI đang sinh slide" : saving ? "Đang lưu thay đổi…" : (slideContent === savedSlideContent && activeLearningScript === savedScript) ? "Tất cả thay đổi đã được tự động lưu" : "Lưu thay đổi bài soạn thảo hiện tại lên đám mây"}
              >
                {saving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang lưu…
                  </>
                ) : (slideContent === savedSlideContent && activeLearningScript === savedScript) ? (
                  <>
                    <Check size={12} aria-hidden="true" /> Đã lưu
                  </>
                ) : (
                  <>
                    <Save size={12} aria-hidden="true" /> Lưu
                  </>
                )}
              </button>
            )}

            {handleResetMaterials && (slideContent || activeLearningScript) && (
              <button 
                onClick={handleResetMaterials} 
                disabled={saving || isAIGenerating}
                className="editor-header-icon-btn btn-reset"
                title={isAIGenerating ? "Không thể reset khi AI đang sinh slide" : "Xóa/Reset toàn bộ học liệu (Slide và Kịch bản) của chương này"}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {selectedChapter ? (
        <div className="planner-editor-container">
          {activeWorkTab === 'slides' ? (
            <div className="planner-editor-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', marginBottom: '8px' }}>
                <label className="planner-field-label">Slide bài giảng (Markdown)</label>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' }}>
                  {/* Theme select inline inside editor toolbar */}
                  {selectedChapter && slideContent && (
                    <div className="editor-header-select-group">
                      <Palette size={13} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                      <select 
                        value={selectedTheme} 
                        onChange={(e) => setSelectedTheme(e.target.value)} 
                        className="editor-header-select"
                        title="Theme slide"
                      >
                        {Object.keys(THEMES).map(t => (
                          <option key={t} value={t} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{THEMES[t].name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {/* Font Adjuster tool */}
                  <div className="font-adjuster-bar">
                    <button
                      type="button"
                      onClick={() => {
                        const fontSizes: ('sm' | 'md' | 'lg' | 'xl')[] = ['sm', 'md', 'lg', 'xl'];
                        const idx = fontSizes.indexOf(editorFontSize);
                        if (idx > 0) setEditorFontSize(fontSizes[idx - 1]);
                      }}
                      disabled={editorFontSize === 'sm'}
                      className="font-adjuster-btn"
                      title="Thu nhỏ chữ (-)"
                    >
                      <Minus size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const fontSizes: ('sm' | 'md' | 'lg' | 'xl')[] = ['sm', 'md', 'lg', 'xl'];
                        const idx = fontSizes.indexOf(editorFontSize);
                        if (idx < fontSizes.length - 1) setEditorFontSize(fontSizes[idx + 1]);
                      }}
                      disabled={editorFontSize === 'xl'}
                      className="font-adjuster-btn"
                      title="Phóng to chữ (+)"
                    >
                      <Plus size={13} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="planner-tab-toggle-container">
                    <button 
                      onClick={() => setSlideEditMode('edit')} 
                      className={slideEditMode === 'edit' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                    >
                      Sửa
                    </button>
                    <button 
                      onClick={() => setSlideEditMode('split')} 
                      className={slideEditMode === 'split' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                    >
                      Song song
                    </button>
                    <button 
                      onClick={() => setSlideEditMode('preview')} 
                      className={slideEditMode === 'preview' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                    >
                      Xem trước
                    </button>
                  </div>
                </div>
              </div>
              {slideEditMode === 'split' ? (
                <div className="editor-split-grid">
                  <div className="editor-split-left-pane">
                    <textarea
                      value={localSlideContent}
                      onChange={handleSlideTextChange}
                      placeholder={isAIGenerating ? "Đang tải đề xuất slide từ AI, vui lòng đợi..." : "Viết slide của bạn ở đây… (Hoặc chèn đề xuất từ AI bên trái sang)"}
                      className={`textarea-editor editor-font-${editorFontSize}`}
                      disabled={isAIGenerating}
                      style={{
                        resize: 'none',
                        flex: 1,
                      }}
                    />
                    {renderRevisionUI()}
                  </div>
                  <div className="editor-split-right-pane">
                    <SlideProposalPreview 
                      mdContent={debouncedSlideContent} 
                      apiStatus="idle" 
                      themeName={selectedTheme} 
                      onCitationClick={handleCitationClick} 
                      isFullscreen={isFullscreen} 
                      chapterId={selectedChapter?.id}
                      onSaveRevisedSlide={handleSaveRevisedSlide}
                    />
                  </div>
                </div>
              ) : slideEditMode === 'edit' ? (
                <>
                  <textarea
                    value={slideContent}
                    onChange={(e) => setSlideContent(e.target.value)}
                    placeholder={isAIGenerating ? "Đang tải đề xuất slide từ AI, vui lòng đợi..." : "Viết slide của bạn ở đây… (Hoặc chèn đề xuất từ AI bên trái sang)"}
                    className={`textarea-editor editor-font-${editorFontSize}`}
                    disabled={isAIGenerating}
                    style={{
                      resize: 'none',
                      flex: 1,
                      minHeight: '300px',
                    }}
                  />
                  {renderRevisionUI()}
                </>
              ) : (
                <>
                  <SlideProposalPreview 
                    mdContent={slideContent} 
                    apiStatus="idle" 
                    themeName={selectedTheme} 
                    onCitationClick={handleCitationClick} 
                    isFullscreen={isFullscreen} 
                    chapterId={selectedChapter?.id}
                    onSaveRevisedSlide={handleSaveRevisedSlide}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="planner-editor-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', marginBottom: '8px' }}>
                <label className="planner-field-label">Kịch bản giảng dạy (Active Learning)</label>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' }}>
                  {/* Font Adjuster tool */}
                  <div className="font-adjuster-bar">
                    <button
                      type="button"
                      onClick={() => {
                        const fontSizes: ('sm' | 'md' | 'lg' | 'xl')[] = ['sm', 'md', 'lg', 'xl'];
                        const idx = fontSizes.indexOf(editorFontSize);
                        if (idx > 0) setEditorFontSize(fontSizes[idx - 1]);
                      }}
                      disabled={editorFontSize === 'sm'}
                      className="font-adjuster-btn"
                      title="Thu nhỏ chữ (-)"
                    >
                      <Minus size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const fontSizes: ('sm' | 'md' | 'lg' | 'xl')[] = ['sm', 'md', 'lg', 'xl'];
                        const idx = fontSizes.indexOf(editorFontSize);
                        if (idx < fontSizes.length - 1) setEditorFontSize(fontSizes[idx + 1]);
                      }}
                      disabled={editorFontSize === 'xl'}
                      className="font-adjuster-btn"
                      title="Phóng to chữ (+)"
                    >
                      <Plus size={13} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="planner-tab-toggle-container">
                    <button 
                      onClick={() => setScriptEditMode('edit')} 
                      className={scriptEditMode === 'edit' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                    >
                      Sửa
                    </button>
                    <button 
                      onClick={() => setScriptEditMode('preview')} 
                      className={scriptEditMode === 'preview' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                    >
                      Xem trước
                    </button>
                  </div>
                </div>
              </div>
              {scriptEditMode === 'edit' ? (
                <>
                  <textarea
                    value={activeLearningScript}
                    onChange={(e) => setActiveLearningScript(e.target.value)}
                    placeholder={isAIGenerating ? "Đang sinh kịch bản giáo án tương tác, vui lòng đợi..." : "Lịch trình giảng dạy, câu hỏi tương tác trên lớp…"}
                    className={`textarea-editor editor-font-${editorFontSize}`}
                    disabled={isAIGenerating}
                    style={{
                      resize: 'none',
                      flex: 1,
                      minHeight: '300px',
                    }}
                  />
                  {renderRevisionUI()}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                  <MarkdownPreview 
                    content={parseActiveLearningScript(activeLearningScript).mainScript} 
                    style={{ flex: 1, minHeight: '300px', overflowY: 'auto' }} 
                  />
                  {parseActiveLearningScript(activeLearningScript).rationale && (
                    <div className="editor-pedagogical-rationale">
                      <div className="editor-pedagogical-rationale-title">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Lightbulb size={13} /> Giải trình Sư phạm (Pedagogical Rationale):</span>
                      </div>
                      <div className="editor-pedagogical-rationale-content">
                        {parseActiveLearningScript(activeLearningScript).rationale}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="planner-empty-state">Chọn chương để soạn giáo án.</div>
      )}

    </section>
  );
}
