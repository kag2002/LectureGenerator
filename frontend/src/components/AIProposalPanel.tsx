import React from 'react';
import SlideProposalPreview from './SlideProposalPreview';
import { renderMarkdown } from '../utils/markdown';
import { Chapter } from '@/types';
import { 
  Sparkles, Loader2, Layers, Trash2, X, Plus, 
  Play, Presentation, Activity, Lightbulb, AlertTriangle, ArrowRight, ArrowUp, ArrowDown, Check, ChevronRight, EyeOff,
  Clock
} from 'lucide-react';

export interface AIProposalPanelProps {
  selectedChapter: Chapter | null;
  activeWorkTab: 'slides' | 'active_learning';
  aiSlideProposal: string;
  aiActiveLearningProposal: string;
  apiStatus: string;
  genLog: string;
  slideContent: string;
  setSlideContent: React.Dispatch<React.SetStateAction<string>> | ((val: string | ((prev: string) => string)) => void);
  activeLearningScript: string;
  setActiveLearningScript: React.Dispatch<React.SetStateAction<string>> | ((val: string) => void);
  selectedTheme: string;
  slideProposalViewMode: 'visual' | 'code';
  setSlideProposalViewMode: (mode: 'visual' | 'code') => void;
  handleCitationClick: (citation: string) => void;
  setShowConfigModal: (show: boolean) => void;
  currentStage: number;
  currentSlide?: number;
  totalSlides?: number;
  parseActiveLearningScript: (script: string) => { mainScript: string; rationale: string };
  storyboardDraft: any[] | null;
  setStoryboardDraft: (draft: any[] | null) => void;
  isGeneratingStoryboard: boolean;
  handleGenerateMaterialsFromStoryboard: (draft: any[]) => void;
  handleCancelMaterialsGeneration?: () => void;
  handleCancelStoryboardGeneration?: () => void;
  onClose?: () => void;
}

export default function AIProposalPanel({
  selectedChapter,
  activeWorkTab,
  aiSlideProposal,
  aiActiveLearningProposal,
  apiStatus,
  genLog,
  slideContent,
  setSlideContent,
  activeLearningScript,
  setActiveLearningScript,
  selectedTheme,
  slideProposalViewMode,
  setSlideProposalViewMode,
  handleCitationClick,
  setShowConfigModal,
  currentStage,
  currentSlide = 0,
  totalSlides = 0,
  parseActiveLearningScript,
  storyboardDraft,
  setStoryboardDraft,
  isGeneratingStoryboard,
  handleGenerateMaterialsFromStoryboard,
  handleCancelMaterialsGeneration,
  handleCancelStoryboardGeneration,
  onClose
}: AIProposalPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (apiStatus === 'generating' || isGeneratingStoryboard) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [apiStatus, isGeneratingStoryboard]);

  // --- Ước lượng thời gian và Tiến trình Slide ---
  const [timeLeft, setTimeLeft] = React.useState<number>(120);

  // Tính toán thời gian dự kiến dựa trên Stage hiện tại
  const getInitialEstimate = (stage: number, totalSlidesCount: number, currentSlideIndex: number) => {
    switch (stage) {
      case 1:
        return 120; // Stage 1: RAG + Allocator (~2 mins remaining)
      case 2:
        return 110; // Stage 2: Allocator (~110s remaining)
      case 3:
        const slidesRemaining = totalSlidesCount > 0 ? Math.max(0, totalSlidesCount - currentSlideIndex) : 6;
        return slidesRemaining * 18 + 45; // ~18s per slide + 45s for AL & Auditor
      case 4:
        return 35; // Stage 4: Active Learning (~35s remaining)
      case 5:
        return 15; // Stage 5: Logic Auditor (~15s remaining)
      case 6:
        return 3;  // Stage 6: Done / Saving
      default:
        return 0;
    }
  };

  React.useEffect(() => {
    if (apiStatus !== 'generating') {
      setTimeLeft(0);
      return;
    }
    const targetEst = getInitialEstimate(currentStage, totalSlides, currentSlide);
    // Cập nhật khi có sự thay đổi lớn hoặc sang stage mới
    setTimeLeft(prev => {
      if (prev <= 0 || Math.abs(prev - targetEst) > 15 || (currentStage > 1 && prev > targetEst)) {
        return targetEst;
      }
      return prev;
    });
  }, [currentStage, apiStatus, currentSlide, totalSlides]);

  React.useEffect(() => {
    if (apiStatus !== 'generating' || timeLeft <= 1) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 1;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [apiStatus, timeLeft]);

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const renderStepper = () => {
    const steps = [
      { id: 1, name: "Tìm kiếm RAG", desc: "Tìm các đoạn trích từ tài liệu nguồn" },
      { id: 2, name: "Dàn ý & Phân bổ", desc: "AI phân chia nội dung các slide" },
      { id: 3, name: "Viết Slide", desc: "Slide Writer viết slide chi tiết" },
      { id: 4, name: "Kịch bản tương tác", desc: "Thiết kế hoạt động Active Learning" },
      { id: 5, name: "Kiểm định logic", desc: "Kiểm chéo chất lượng & nhất quán" },
      { id: 6, name: "Lưu & Hoàn tất", desc: "Lưu học liệu hoàn chỉnh vào DB" }
    ];

    return (
      <div className="planner-stepper-container">
        <div className="planner-stepper-title">
          <span className="planner-stepper-pulse-dot" />
          TIẾN TRÌNH AI SOẠN BÀI GIẢNG:
        </div>
        <div className="planner-stepper-steps-wrapper">
          <div className="planner-stepper-track" />
          <div 
            className="planner-stepper-progress" 
            style={{ width: `${currentStage <= 1 ? 0 : ((currentStage - 1) / 5) * 100}%` }} 
          />

          {steps.map((step) => {
            const isActive = currentStage === step.id;
            const isCompleted = currentStage > step.id;
            
            let circleClass = "planner-step-circle";
            if (isActive) circleClass += " active";
            if (isCompleted) circleClass += " completed";

            let labelClass = "planner-step-label";
            if (isActive) labelClass += " active";
            if (isCompleted) labelClass += " completed";

            const icon = isCompleted ? <Check size={14} /> : step.id;

            return (
              <div key={step.id} className="planner-step-item">
                <div className={circleClass}>
                  {icon}
                </div>
                <span className={labelClass}>
                  {step.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="planner-ai-proposal-panel">
      <div className="planner-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px 16px' }}>
        <h3 className="planner-section-title">AI Đề xuất nội dung</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedChapter && (
            <button onClick={() => setShowConfigModal(true)} className="planner-generate-btn">
              <Sparkles size={14} /> {aiSlideProposal ? 'Tạo lại Bài giảng' : 'Tạo Bài giảng'}
            </button>
          )}
          {onClose && (
            <button 
              type="button"
              onClick={onClose} 
              className="planner-ai-proposal-close-btn"
              title="Ẩn đề xuất AI (Ẩn cột phải)"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
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
      </div>

      <div ref={scrollRef} className="planner-proposal-scroll">
        {apiStatus === 'generating' && genLog && (
          <div className="planner-log-box planner-log-box-split">
            <div className="planner-log-box-content">
              <div className="planner-pulse-dot"></div>
              <span className="planner-log-text">{genLog}</span>
            </div>
            {handleCancelMaterialsGeneration && (
              <button
                type="button"
                onClick={handleCancelMaterialsGeneration}
                className="planner-btn-cancel-gen"
              >
                Hủy sinh
              </button>
            )}
          </div>
        )}
        
        {selectedChapter ? (
          isGeneratingStoryboard ? (
            <div className="planner-storyboard-loading">
              <span className="planner-storyboard-loading-spinner" />
              <div className="planner-storyboard-loading-title">
                Đang lập đề cương cấu trúc slide (Storyboard)...
              </div>
              <div className="planner-storyboard-loading-desc">
                AI đang lập đề cương cấu trúc slide (Storyboard)...
              </div>
              {handleCancelStoryboardGeneration && (
                <button
                  type="button"
                  onClick={handleCancelStoryboardGeneration}
                  className="planner-btn-cancel-gen"
                  style={{ marginTop: '8px' }}
                >
                  Hủy sinh
                </button>
              )}
            </div>
          ) : storyboardDraft ? (
            <div className="planner-storyboard-wrapper">
              <div className="planner-storyboard-banner">
                <h4 className="planner-storyboard-banner-title">
                  <Layers size={14} /> Giai đoạn 1: Phê duyệt Đề cương Slide (Storyboard)
                </h4>
                <p className="planner-storyboard-banner-desc">
                  Dưới đây là khung bài giảng do AI đề xuất. Bạn có thể chỉnh sửa tiêu đề, mục tiêu sư phạm, CLO và mức Bloom của từng slide trước khi bấm <strong>"Bắt đầu soạn bài giảng chi tiết"</strong>.
                </p>
              </div>

              <div className="planner-storyboard-list">
                {storyboardDraft.map((slide, index) => (
                  <div key={index} className="planner-storyboard-card">
                    <div className="planner-storyboard-card-header">
                      <span className="planner-storyboard-badge">
                        Slide {index + 1}
                      </span>
                      <div className="planner-storyboard-actions">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => {
                            const newDraft = [...storyboardDraft];
                            const temp = newDraft[index];
                            newDraft[index] = newDraft[index - 1];
                            newDraft[index - 1] = temp;
                            newDraft[index].slide_index = index + 1;
                            newDraft[index - 1].slide_index = index;
                            setStoryboardDraft(newDraft);
                          }}
                          className="planner-storyboard-btn"
                        >
                          <ArrowUp size={11} /> Lên
                        </button>
                        <button
                          type="button"
                          disabled={index === storyboardDraft.length - 1}
                          onClick={() => {
                            const newDraft = [...storyboardDraft];
                            const temp = newDraft[index];
                            newDraft[index] = newDraft[index + 1];
                            newDraft[index + 1] = temp;
                            newDraft[index].slide_index = index + 1;
                            newDraft[index + 1].slide_index = index + 2;
                            setStoryboardDraft(newDraft);
                          }}
                          className="planner-storyboard-btn"
                        >
                          <ArrowDown size={11} /> Xuống
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newDraft = storyboardDraft.filter((_, idx) => idx !== index);
                            newDraft.forEach((s, idx) => s.slide_index = idx + 1);
                            setStoryboardDraft(newDraft);
                          }}
                          className="planner-storyboard-btn planner-storyboard-btn-delete"
                        >
                          <Trash2 size={11} /> Xóa
                        </button>
                      </div>
                    </div>

                    <div className="planner-storyboard-field-group">
                      <label className="planner-storyboard-label">Tiêu đề slide</label>
                      <input 
                        type="text"
                        value={slide.title}
                        onChange={(e) => {
                          const newDraft = [...storyboardDraft];
                          newDraft[index].title = e.target.value;
                          setStoryboardDraft(newDraft);
                        }}
                        className="planner-storyboard-input"
                      />
                    </div>

                    <div className="planner-storyboard-field-group">
                      <label className="planner-storyboard-label">Mục tiêu sư phạm (Purpose)</label>
                      <textarea 
                        value={slide.purpose}
                        onChange={(e) => {
                          const newDraft = [...storyboardDraft];
                          newDraft[index].purpose = e.target.value;
                          setStoryboardDraft(newDraft);
                        }}
                        rows={2}
                        className="planner-storyboard-textarea"
                      />
                    </div>

                    <div className="planner-storyboard-row-fields">
                      <div className="planner-storyboard-field-group flex-1">
                        <label className="planner-storyboard-label">Chuẩn đầu ra (CLO)</label>
                        <input 
                          type="text"
                          value={slide.target_clo || ''}
                          onChange={(e) => {
                            const newDraft = [...storyboardDraft];
                            newDraft[index].target_clo = e.target.value;
                            setStoryboardDraft(newDraft);
                          }}
                          placeholder="Ví dụ: CLO1"
                          className="planner-storyboard-input"
                        />
                      </div>
                      <div className="planner-storyboard-field-group flex-1">
                        <label className="planner-storyboard-label">Mức Bloom</label>
                        <select 
                          value={slide.bloom_level}
                          onChange={(e) => {
                            const newDraft = [...storyboardDraft];
                            newDraft[index].bloom_level = parseInt(e.target.value);
                            setStoryboardDraft(newDraft);
                          }}
                          className="planner-storyboard-select"
                        >
                          <option value={1}>Nhớ (Bloom 1)</option>
                          <option value={2}>Hiểu (Bloom 2)</option>
                          <option value={3}>Vận dụng (Bloom 3)</option>
                          <option value={4}>Phân tích (Bloom 4)</option>
                          <option value={5}>Đánh giá (Bloom 5)</option>
                          <option value={6}>Sáng tạo (Bloom 6)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const newDraft = [...storyboardDraft, {
                      slide_index: storyboardDraft.length + 1,
                      title: 'Slide mới',
                      purpose: 'Mô tả mục tiêu của slide này',
                      target_clo: '',
                      bloom_level: 2
                    }];
                    setStoryboardDraft(newDraft);
                  }}
                  className="planner-storyboard-btn-add"
                >
                  <Plus size={14} /> Thêm slide mới
                </button>
              </div>

              <div className="planner-storyboard-footer">
                <button
                  type="button"
                  onClick={() => setStoryboardDraft(null)}
                  className="planner-storyboard-footer-btn planner-storyboard-footer-btn-cancel"
                >
                  <X size={14} /> Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateMaterialsFromStoryboard(storyboardDraft)}
                  className="planner-storyboard-footer-btn planner-storyboard-footer-btn-confirm"
                >
                  <Play size={14} /> Bắt đầu sinh học liệu chi tiết
                </button>
              </div>
            </div>
          ) : (!aiSlideProposal && !aiActiveLearningProposal && apiStatus !== 'generating') ? (
            <div className="planner-empty-state">
              <p>Chọn một chương ở cột bên trái và bấm <strong>Tạo bài giảng & Giáo án</strong> để AI trích xuất nội dung đề xuất.</p>
            </div>
          ) : (
            <>
              {apiStatus === 'generating' && renderStepper()}
              
              {apiStatus === 'generating' && (
                <div className="planner-progress-details-card">
                  <div className="planner-progress-details-row">
                    <div className="planner-progress-timer-section">
                      <Clock size={16} className="planner-progress-timer-icon animate-pulse" />
                      <span className="planner-progress-timer-label">Thời gian dự kiến còn lại:</span>
                      <span className="planner-progress-timer-value">
                        {timeLeft > 1 ? `~${formatTime(timeLeft)}` : 'Đang hoàn tất khâu cuối...'}
                      </span>
                    </div>
                    {currentStage === 3 && totalSlides > 0 && (
                      <div className="planner-progress-slide-status">
                        Đang viết slide <strong className="planner-accent-text">{currentSlide}/{totalSlides}</strong>
                      </div>
                    )}
                  </div>

                  {currentStage === 3 && totalSlides > 0 && (
                    <div className="planner-progress-bar-wrapper">
                      <div className="planner-progress-bar-background">
                        <div 
                          className="planner-progress-bar-fill planner-progress-bar-animated"
                          style={{ width: `${(currentSlide / totalSlides) * 100}%` }}
                        />
                      </div>
                      <div className="planner-progress-percentage">
                        {Math.round((currentSlide / totalSlides) * 100)}% Hoàn thành viết slide
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="planner-proposal-blocks">
                {activeWorkTab === 'slides' ? (
                  <div className="planner-proposal-block">
                    <div className="planner-block-header">
                      <span className="planner-block-title"><Presentation size={15} /> Đề xuất Slide Bài giảng</span>
                      <div className="planner-block-header-actions">
                        <div className="planner-tab-toggle-container">
                          <button 
                            onClick={() => setSlideProposalViewMode('visual')} 
                            className={slideProposalViewMode === 'visual' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                          >
                            Trực quan
                          </button>
                          <button 
                            onClick={() => setSlideProposalViewMode('code')} 
                            className={slideProposalViewMode === 'code' ? 'planner-tab-toggle-active' : 'planner-tab-toggle-inactive'}
                          >
                            Mã nguồn
                          </button>
                        </div>
                        <button 
                          onClick={() => {
                            if (window.confirm('Hành động này sẽ XÓA TOÀN BỘ slide hiện tại trong bản soạn thảo để thay thế bằng bản đề xuất từ AI. Bạn có chắc chắn không?')) {
                              setSlideContent(aiSlideProposal);
                            }
                          }}
                          disabled={apiStatus === 'generating'}
                          className="planner-btn-override"
                        >
                          Ghi đè bản thảo <AlertTriangle size={12} />
                        </button>
                        <button 
                          onClick={() => setSlideContent((prev: string) => prev ? (prev + '\n\n' + aiSlideProposal) : aiSlideProposal)}
                          disabled={apiStatus === 'generating'}
                          className="planner-insert-btn"
                        >
                          Nối tiếp cuối <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                    {slideProposalViewMode === 'code' ? (
                      apiStatus === 'generating' && !aiSlideProposal ? (
                        <div className="planner-loading-indicator">
                          <Loader2 size={16} className="animate-spin" /> Đang thiết kế slide...
                        </div>
                      ) : (
                        <pre className="planner-proposal-code">{aiSlideProposal}</pre>
                      )
                    ) : (
                      <SlideProposalPreview 
                        mdContent={aiSlideProposal} 
                        apiStatus={apiStatus} 
                        themeName={selectedTheme} 
                        onCitationClick={handleCitationClick} 
                        isFullscreen={false}
                        onInsertSlide={(slideMarkdown) => setSlideContent((prev: string) => prev ? (prev + '\n\n' + slideMarkdown) : slideMarkdown)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="planner-proposal-block">
                    <div className="planner-block-header">
                      <span className="planner-block-title"><Activity size={15} /> Kịch bản tương tác (Active Learning)</span>
                      <div className="planner-block-header-actions">
                        <button 
                          onClick={() => {
                            if (window.confirm('Hành động này sẽ XÓA TOÀN BỘ kịch bản hiện tại trong bản soạn thảo để thay thế bằng kịch bản tương tác từ AI. Bạn có chắc chắn không?')) {
                              setActiveLearningScript(aiActiveLearningProposal);
                            }
                          }}
                          disabled={apiStatus === 'generating'}
                          className="planner-btn-override"
                        >
                          Ghi đè kịch bản <AlertTriangle size={12} />
                        </button>
                        <button 
                          onClick={() => setActiveLearningScript(activeLearningScript ? (activeLearningScript + '\n\n' + aiActiveLearningProposal) : aiActiveLearningProposal)}
                          disabled={apiStatus === 'generating'}
                          className="planner-insert-btn"
                        >
                          Nối tiếp cuối <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="planner-proposal-content-wrapper">
                      {apiStatus === 'generating' && !aiActiveLearningProposal ? (
                        <div className="planner-loading-indicator">
                          <Loader2 size={16} className="animate-spin" /> Đang thiết kế kịch bản hoạt động...
                        </div>
                      ) : (
                        <div 
                          className="planner-proposal-text" 
                          dangerouslySetInnerHTML={{ 
                            __html: renderMarkdown(parseActiveLearningScript(aiActiveLearningProposal).mainScript) 
                          }}
                        />
                      )}
                      {parseActiveLearningScript(aiActiveLearningProposal).rationale && (
                        <div className="planner-rationale-box">
                          <div className="planner-rationale-title">
                            <span className="planner-rationale-icon-wrapper"><Lightbulb size={12} /></span>
                            <span>Giải trình Sư phạm của Trợ lý AI:</span>
                          </div>
                          <div className="planner-rationale-content">
                            {parseActiveLearningScript(aiActiveLearningProposal).rationale}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        ) : (
          <div className="planner-empty-state">Vui lòng chọn một môn học hoặc chương học.</div>
        )}
      </div>
    </section>
  );
}
