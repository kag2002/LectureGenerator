'use client';

import React, { useState, useEffect } from 'react';
import { useResizablePanels } from '../hooks/useResizablePanels';
import { createPortal } from 'react-dom';
import client from '../api/client';
import FlowSteps from '../components/FlowSteps';
import LessonPlannerSidebar from '../components/LessonPlannerSidebar';
import AIProposalPanel from '../components/AIProposalPanel';
import EditorPanel from '../components/EditorPanel';
import PedagogicalConfigModal from '../components/PedagogicalConfigModal';
import { parseMarkdownToSlidesJS, THEMES } from '../utils/slideParser';
import { 
  ArrowLeft, BookOpen, ClipboardList, Plus, AlertTriangle, 
  Scissors, Loader2, Lightbulb, Search, Presentation, 
  Activity, Eye, X, ChevronUp, ChevronDown, Palette, 
  History, Save, Trash2, Download, FileText, Check, Printer, HelpCircle, Sparkles 
} from 'lucide-react';
import { Course, CLO, Chapter } from '@/types';
import '../styles/LessonPlanner.css';
import { useLessonPlannerState } from '../hooks/useLessonPlannerState';

export interface LessonPlannerProps {
  course: Course;
  initialChapterId: number | null;
  initialCloId: number | null;
  initialCloCode: string | null;
  initialBloomLevel: number | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: string, extra?: any) => void;
  onGoToQuestionBank?: () => void;
  onRecordAIUsage: (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
  isActive?: boolean;
}

export default function LessonPlanner({
  course,
  initialChapterId,
  initialCloId,
  initialCloCode,
  initialBloomLevel,
  onBack,
  onLogout,
  onNavigate,
  onGoToQuestionBank,
  onRecordAIUsage,
  setAIProcessingStatus,
  isActive
}: LessonPlannerProps) {
  const {
    chapters,
    selectedChapter,
    activeLeftTab,
    setActiveLeftTab,
    clos,
    ragReferences,
    selectedCitation,
    setSelectedCitation,
    citationTab,
    setCitationTab,
    viewingFullDocName,
    fullDocContent,
    setFullDocContent,
    fullDocLoading,
    activeWorkTab,
    setActiveWorkTab,
    isFullscreen,
    setIsFullscreen,
    showSidebar,
    setShowSidebar,
    showAIProposal,
    setShowAIProposal,
    isZenMode,
    setIsZenMode,
    slideContent,
    setSlideContent,
    activeLearningScript,
    setActiveLearningScript,
    savedSlideContent,
    savedScript,
    slideEditMode,
    setSlideEditMode,
    scriptEditMode,
    setScriptEditMode,
    slideProposalViewMode,
    setSlideProposalViewMode,
    selectedTheme,
    setSelectedTheme,
    documents,
    uploadFile,
    setUploadFile,
    showConfigModal,
    setShowConfigModal,
    classSize,
    setClassSize,
    hasWifi,
    setHasWifi,
    furnitureType,
    setFurnitureType,
    sessionDuration,
    setSessionDuration,
    error,
    setError,
    message,
    setMessage,
    loading,
    saving,
    exporting,
    revisions,
    loadRevisions,
    chapterMcqs,
    loadingMcqs,
    editorFontSize,
    setEditorFontSize,

    // Handlers
    handleSelectChapter,
    handleGenerateOutline,
    handleUploadDocument,
    handleDeleteDocument,
    handleSaveMaterials,
    handleResetMaterials,
    handleExportLessonPlan,
    handleAutoSplitSlide,
    handleExportPPTX,
    handleCitationClick,
    handleLoadFullDocument,
    parseActiveLearningScript,
    isCloCovered,

    // Sub-hooks
    stream,
    search
  } = useLessonPlannerState({
    course,
    initialChapterId,
    initialCloId,
    initialCloCode,
    initialBloomLevel,
    onBack,
    onLogout,
    onNavigate,
    onGoToQuestionBank,
    onRecordAIUsage,
    setAIProcessingStatus
  });

  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);

  const handleRevert = async (revId: number) => {
    if (!selectedChapter?.id) return;
    if (!window.confirm("Bạn muốn khôi phục về phiên bản này?")) return;
    setReverting(true);
    setError('');
    setMessage('');
    try {
      const response = await client.post(`/api/courses/chapters/${selectedChapter.id}/revert-revision/${revId}`);
      setSlideContent(response.data.slide_content || '');
      setActiveLearningScript(response.data.active_learning_script || '');
      setMessage(response.data.message);
      loadRevisions(selectedChapter.id);
    } catch (err) {
      console.error(err);
      setError('Không thể khôi phục phiên bản.');
    } finally {
      setReverting(false);
    }
  };

  const {
    apiStatus,
    genLog,
    currentStage,
    currentSlide,
    totalSlides,
    storyboardDraft,
    setStoryboardDraft,
    isGeneratingStoryboard,
    handleGenerateStoryboard,
    handleGenerateMaterialsFromStoryboard,
    handleCancelMaterialsGeneration,
    handleCancelStoryboardGeneration,
    aiSlideProposal,
    aiActiveLearningProposal,
    generatingChapterId,
    aiViewMode,
    setAiViewMode
  } = stream;

  const {
    searchQuery,
    setSearchQuery,
    searching,
    showAdvancedSearch,
    setShowAdvancedSearch,
    maxResults,
    setMaxResults,
    credibilityThreshold,
    setCredibilityThreshold,
    suggestedQueries,
    searchResult,
    expandedSearch,
    toggleSearchDetail,
    handleSummarizeContent,
    summarizing,
    summaries,
    selectedRejected,
    setSelectedRejected,
    handleForceIngest,
    handleWebSearch
  } = search;

  const renderJustifications = (justification: string) => {
    if (!justification) return null;
    const items = justification.split('; ');
    return (
      <div className="planner-badge-container">
        {items.map((item, idx) => {
          const isPositive = item.includes('+');
          const isNegative = item.includes('-');
          let badgeClass = "planner-badge-neutral";
          if (isPositive) badgeClass = "planner-badge-positive";
          if (isNegative) badgeClass = "planner-badge-negative";
          return (
            <span key={idx} className={badgeClass}>
              {item}
            </span>
          );
        })}
      </div>
    );
  };

  const getRecommendation = (score: number) => {
    const pct = Math.round(score * 100);
    if (pct >= 80) {
      return {
        label: "Khuyên dùng (Highly Recommended)",
        color: "#10b981",
        bgColor: "rgba(16, 185, 129, 0.15)",
        borderColor: "rgba(16, 185, 129, 0.4)",
        desc: "Nguồn chính thống/độ tin cậy học thuật rất cao. Rất khuyên dùng để nạp vào RAG."
      };
    } else if (pct >= 60) {
      return {
        label: "Đáng tin cậy (Credible)",
        color: "#3b82f6",
        bgColor: "rgba(59, 130, 246, 0.15)",
        borderColor: "rgba(59, 130, 246, 0.4)",
        desc: "Tài liệu học thuật/tổ chức giáo dục hợp lệ. Rất phù hợp làm học liệu bổ trợ."
      };
    } else if (pct >= 40) {
      return {
        label: "Cần cân nhắc (Average)",
        color: "#f59e0b",
        bgColor: "rgba(245, 158, 11, 0.15)",
        borderColor: "rgba(245, 158, 11, 0.4)",
        desc: "Nguồn tin phổ thông phi học thuật (.org, .com). Hãy cân nhắc kiểm duyệt trước khi nạp RAG."
      };
    } else {
      return {
        label: "Không khuyến nghị (Low Credibility)",
        color: "#ef4444",
        bgColor: "rgba(239, 68, 68, 0.15)",
        borderColor: "rgba(239, 68, 68, 0.4)",
        desc: "Blog cá nhân, diễn đàn hoặc mạng xã hội. Độ tin cậy thấp, không khuyến nghị nạp RAG."
      };
    }
  };

  const renderSlideCharCheckers = () => {
    const parsed = parseMarkdownToSlidesJS(slideContent);
    const warnings: Array<{ slideIndex: number; message: string }> = [];
    
    parsed.forEach((s, idx) => {
      const textItems = s.items.filter(item => item.type === 'text');
      let slideCharCount = 0;
      textItems.forEach(item => { slideCharCount += item.rawText?.length || 0; });
      
      if (slideCharCount > 600) {
        warnings.push({
          slideIndex: idx,
          message: `Slide ${idx + 1} ("${s.title}") có dung lượng lớn (${slideCharCount} kí tự). Hãy cân nhắc chia nhỏ.`
        });
      } else if (textItems.length > 5) {
        warnings.push({
          slideIndex: idx,
          message: `Slide ${idx + 1} ("${s.title}") chứa nhiều ý gạch đầu dòng (${textItems.length} ý). Slide có thể bị đè chữ.`
        });
      }
    });
    
    if (warnings.length === 0) return null;
    
    return (
      <div className="planner-slide-warnings-box">
        {warnings.map((w, wIdx) => (
          <div key={wIdx} className="planner-slide-warning-row">
            <span className="planner-slide-warning-text">
              <AlertTriangle size={14} aria-hidden="true" />
              {w.message}
            </span>
            <button
              onClick={() => handleAutoSplitSlide(w.slideIndex)}
              className="planner-split-slide-btn"
            >
              <Scissors size={10} aria-hidden="true" /> Tách slide
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderCitationDrawer = () => {
    if (!selectedCitation) return null;
    return (
      <div className="citation-drawer">
        <div className="citation-drawer-header">
          <div>
            <h4 className="citation-drawer-title"><BookOpen size={16} aria-hidden="true" /> Xác minh nguồn trích dẫn</h4>
            <span className="citation-drawer-subtitle">Xác minh độ chính xác của AI từ RAG</span>
          </div>
          <button 
            onClick={() => setSelectedCitation(null)}
            className="citation-drawer-close-btn"
            aria-label="Đóng bảng đối chiếu"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="citation-drawer-body">
          <div>
            <div className="citation-section-label">Tài liệu tham chiếu</div>
            <div className="citation-reference-box" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={14} style={{ color: 'var(--text-muted)' }} /> {selectedCitation.fileName} (Trang {selectedCitation.pageNumber})
            </div>
          </div>
          
          {citationTab === 'chunk' ? (
            <div className="citation-tab-content">
              <div className="citation-section-label">Đoạn văn bản gốc từ giáo trình</div>
              {selectedCitation.loading ? (
                <div className="citation-loading-box" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '24px', justifyContent: 'center', color: 'var(--text-muted)', background: 'var(--citation-box-bg, rgba(0,0,0,0.1))', borderRadius: '8px' }}>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Đang tải đoạn trích từ tài liệu gốc...</span>
                </div>
              ) : (
                <div className="citation-text-box">
                  {selectedCitation.text}
                </div>
              )}
              {selectedCitation.fileName !== "Không rõ tài liệu" && !selectedCitation.loading && (
                <button
                   onClick={() => handleLoadFullDocument(selectedCitation.fileName)}
                  className="citation-view-source-btn"
                >
                  <Search size={12} aria-hidden="true" /> Xem toàn bộ tài liệu nguồn
                </button>
              )}
            </div>
          ) : (
            <div className="citation-tab-content">
              <button 
                onClick={() => {
                  setFullDocContent('');
                  setCitationTab('chunk');
                }}
                className="citation-back-btn"
              >
                <span className="citation-back-btn-inner"><ArrowLeft size={12} aria-hidden="true" /> Quay lại đoạn trích</span>
              </button>
              <div className="citation-section-label">Nội dung toàn bộ tài liệu nguồn</div>
              {fullDocLoading ? (
                <div className="citation-loading-box">
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Đang tải toàn bộ tài liệu…
                </div>
              ) : (
                <div className="citation-text-box">
                  {fullDocContent}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="citation-drawer-footer">
          <Lightbulb size={13} aria-hidden="true" />
          <span>Hệ thống sử dụng tìm kiếm ngữ nghĩa (Vector RAG) để trích xuất ngữ cảnh liên quan nhất trước khi gửi cho mô hình ngôn ngữ lớn (LLM).</span>
        </div>
      </div>
    );
  };

  return (
    <div className="planner-container">
      {/* HEADER */}
      {isActive && portalTarget ? createPortal(
        <div className="header-merged-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="planner-work-tab-container-new" style={{ marginRight: '8px' }}>
            <button 
              onClick={() => setActiveWorkTab('slides')} 
              className={`planner-work-tab-btn ${activeWorkTab === 'slides' ? 'planner-work-tab-btn-active' : 'planner-work-tab-btn-inactive'}`}
            >
              <Presentation size={14} aria-hidden="true" /> Slide
            </button>
            <button 
              onClick={() => setActiveWorkTab('active_learning')} 
              className={`planner-work-tab-btn ${activeWorkTab === 'active_learning' ? 'planner-work-tab-btn-active' : 'planner-work-tab-btn-inactive'}`}
            >
              <Activity size={14} aria-hidden="true" /> Kịch bản
            </button>
          </div>



          {selectedChapter && slideContent && (
            <button 
              onClick={handleExportPPTX} 
              disabled={exporting || apiStatus === 'generating'} 
              className="planner-export-btn" 
              title={apiStatus === 'generating' ? "Đang sinh slide tự động, vui lòng đợi..." : "Xuất bài giảng sang định dạng PowerPoint (.pptx)"}
            >
              {exporting ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang Xuất…
                </>
              ) : (
                <>
                  <Download size={12} aria-hidden="true" /> Tải Slide (PPTX)
                </>
              )}
            </button>
          )}

          {selectedChapter && activeLearningScript && (
            <button 
              onClick={handleExportLessonPlan} 
              className="editor-header-btn-green-outline" 
              title="In giáo án bài giảng lớp học"
            >
              <FileText size={12} aria-hidden="true" /> In Giáo án
            </button>
          )}
        </div>,
        portalTarget
      ) : !portalTarget ? (
        <header className={`planner-header-merged ${isZenMode ? 'zen' : ''}`}>
          <div className="header-merged-left">
            <button onClick={onBack} className="planner-back-btn" title="Quay lại Sơ đồ">
              <ArrowLeft size={14} aria-hidden="true" /> Sơ đồ
            </button>
            
            <div className="planner-work-tab-container-new">
              <button 
                onClick={() => setActiveWorkTab('slides')} 
                className={`planner-work-tab-btn ${activeWorkTab === 'slides' ? 'planner-work-tab-btn-active' : 'planner-work-tab-btn-inactive'}`}
              >
                <Presentation size={14} aria-hidden="true" /> Slide
              </button>
              <button 
                onClick={() => setActiveWorkTab('active_learning')} 
                className={`planner-work-tab-btn ${activeWorkTab === 'active_learning' ? 'planner-work-tab-btn-active' : 'planner-work-tab-btn-inactive'}`}
              >
                <Activity size={14} aria-hidden="true" /> Kịch bản
              </button>
            </div>
          </div>

          {!isZenMode && onNavigate && (
            <div className="header-merged-center">
              <FlowSteps activeStep="slides" onNavigate={onNavigate} />
            </div>
          )}

        </header>
      ) : null}

      {error && <div className="planner-error-alert">{error}</div>}
      {message && <div className="planner-success-alert">{message}</div>}

      {initialCloCode && initialBloomLevel && !isZenMode && (
        <div className="planner-remedy-banner">
          <div className="planner-remedy-content-group">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Bổ sung chuẩn đầu ra còn thiếu:</strong> Hãy chọn chương học phù hợp ở cột trái, sau đó bổ sung nội dung slide có gắn thẻ chuẩn đầu ra <strong>[{initialCloCode}]</strong> và mức Bloom mục tiêu <strong>[Bloom: B{initialBloomLevel}]</strong>.
            </div>
          </div>
          {selectedChapter && (
            <button
              onClick={() => {
                const template = `\n# Slide bổ sung cho ${initialCloCode}\n* [CLO: ${initialCloCode}]\n* [Bloom: B${initialBloomLevel}]\n* Ý chính slide…\n`;
                setSlideContent(prev => prev + template);
                setActiveWorkTab('slides');
              }}
              className="planner-remedy-action-btn"
            >
              <Plus size={14} aria-hidden="true" /> Chèn mẫu Slide nháp
            </button>
          )}
        </div>
      )}

      {selectedChapter && slideContent && !isZenMode && (
        <div className="planner-whats-next-banner animate-fade-in">
          <div className="planner-whats-next-content" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="whats-next-sparkle" style={{ display: 'inline-flex', alignItems: 'center' }}><Sparkles size={16} /></span>
            <div style={{ textAlign: 'left' }}>
              <strong>Học liệu của chương đã sẵn sàng!</strong> Bạn có thể xuất bản slide PowerPoint, in giáo án hoạt động lớp học hoặc đi tiếp để tạo bộ câu hỏi:
            </div>
          </div>
          <div className="planner-whats-next-actions">
            <button 
              onClick={handleExportPPTX} 
              disabled={exporting || apiStatus === 'generating'} 
              className="whats-next-action-btn pptx"
              title={apiStatus === 'generating' ? "Đang sinh slide tự động, vui lòng đợi..." : "Xuất bài giảng sang định dạng PowerPoint (.pptx)"}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
            >
              {exporting ? 'Đang xuất...' : <><Download size={13} /> Tải Slide (PPTX)</>}
            </button>
            {activeLearningScript && (
              <button 
                onClick={handleExportLessonPlan} 
                className="whats-next-action-btn script"
                title="In hoặc lưu file PDF giáo án hoạt động"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
              >
                <Printer size={13} /> In Giáo án
              </button>
            )}
            <button 
              onClick={() => onNavigate('question_bank', selectedChapter.id)}
              className="whats-next-action-btn questions"
              title="Thiết kế bộ câu hỏi trắc nghiệm kiểm tra độ hiểu bài"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
            >
              <HelpCircle size={13} /> Tạo Đề kiểm tra MCQ
            </button>
          </div>
        </div>
      )}


      <ResizableLayout
        showSidebar={showSidebar}
        showAIProposal={showAIProposal}
      >
        <LessonPlannerSidebar
            chapters={chapters}
            selectedChapter={selectedChapter}
            activeLeftTab={activeLeftTab}
            setActiveLeftTab={setActiveLeftTab}
            clos={clos}
            documents={documents}
            uploadFile={uploadFile}
            setUploadFile={setUploadFile}
            loading={loading}
            handleSelectChapter={handleSelectChapter}
            handleGenerateOutline={handleGenerateOutline}
            handleUploadDocument={handleUploadDocument}
            handleDeleteDocument={handleDeleteDocument}
            handleWebSearch={handleWebSearch}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searching={searching}
            showAdvancedSearch={showAdvancedSearch}
            setShowAdvancedSearch={setShowAdvancedSearch}
            maxResults={maxResults}
            setMaxResults={setMaxResults}
            credibilityThreshold={credibilityThreshold}
            setCredibilityThreshold={setCredibilityThreshold}
            suggestedQueries={suggestedQueries}
            searchResult={searchResult}
            expandedSearch={expandedSearch}
            toggleSearchDetail={toggleSearchDetail}
            handleSummarizeContent={handleSummarizeContent}
            summarizing={summarizing}
            summaries={summaries}
            selectedRejected={selectedRejected}
            setSelectedRejected={setSelectedRejected}
            handleForceIngest={handleForceIngest}
            isCloCovered={isCloCovered}
            renderJustifications={renderJustifications}
            chapterMcqs={chapterMcqs}
            loadingMcqs={loadingMcqs}
            onClose={() => setShowSidebar(false)}
            ragReferences={ragReferences}
            onCitationClick={(ref) => handleCitationClick(`${ref.file_name} - Page: ${ref.page_number}`)}
            generatingChapterId={generatingChapterId}
          />

        <AIProposalPanel
            selectedChapter={selectedChapter}
            activeWorkTab={activeWorkTab}
            aiSlideProposal={aiSlideProposal}
            aiActiveLearningProposal={aiActiveLearningProposal}
            apiStatus={apiStatus}
            genLog={genLog}
            slideContent={slideContent}
            setSlideContent={setSlideContent}
            activeLearningScript={activeLearningScript}
            setActiveLearningScript={setActiveLearningScript}
            selectedTheme={selectedTheme}
            slideProposalViewMode={slideProposalViewMode}
            setSlideProposalViewMode={setSlideProposalViewMode}
            handleCitationClick={handleCitationClick}
            setShowConfigModal={setShowConfigModal}
            currentStage={currentStage}
            currentSlide={currentSlide}
            totalSlides={totalSlides}
            parseActiveLearningScript={parseActiveLearningScript}
            storyboardDraft={storyboardDraft}
            setStoryboardDraft={setStoryboardDraft}
            isGeneratingStoryboard={isGeneratingStoryboard}
            handleGenerateMaterialsFromStoryboard={handleGenerateMaterialsFromStoryboard}
            handleCancelMaterialsGeneration={handleCancelMaterialsGeneration}
            handleCancelStoryboardGeneration={handleCancelStoryboardGeneration}
            onClose={() => setShowAIProposal(false)}
            aiViewMode={aiViewMode}
            setAiViewMode={setAiViewMode}
            warnings={stream.warnings}
            ragReferences={ragReferences}
            activeAgent={stream.activeAgent}
            agentStatus={stream.agentStatus}
            selfCorrectionAttempt={stream.selfCorrectionAttempt}
            tokenUsage={stream.tokenUsage}
          />

        <EditorPanel
            selectedChapter={selectedChapter}
            activeWorkTab={activeWorkTab}
            slideContent={slideContent}
            setSlideContent={setSlideContent}
            savedSlideContent={savedSlideContent}
            activeLearningScript={activeLearningScript}
            setActiveLearningScript={setActiveLearningScript}
            savedScript={savedScript}
            slideEditMode={slideEditMode}
            setSlideEditMode={setSlideEditMode}
            scriptEditMode={scriptEditMode}
            setScriptEditMode={setScriptEditMode}
            selectedTheme={selectedTheme}
            setSelectedTheme={setSelectedTheme}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            handleCitationClick={handleCitationClick}
            parseActiveLearningScript={parseActiveLearningScript}
            editorFontSize={editorFontSize}
            setEditorFontSize={setEditorFontSize}
            onRecordAIUsage={onRecordAIUsage}
            setAIProcessingStatus={setAIProcessingStatus}
            saving={saving}
            handleSaveMaterials={handleSaveMaterials}
            handleResetMaterials={handleResetMaterials}
            setShowRevisionModal={setShowRevisionModal}
            loadRevisionsExternal={loadRevisions}
            isAIGenerating={apiStatus === 'generating' && selectedChapter?.id === generatingChapterId}
          />
      </ResizableLayout>

      <PedagogicalConfigModal
        showConfigModal={showConfigModal}
        setShowConfigModal={setShowConfigModal}
        classSize={classSize}
        setClassSize={setClassSize}
        hasWifi={hasWifi}
        setHasWifi={setHasWifi}
        furnitureType={furnitureType}
        setFurnitureType={setFurnitureType}
        sessionDuration={sessionDuration}
        setSessionDuration={setSessionDuration}
        handleGenerateMaterials={handleGenerateStoryboard}
      />
      {renderCitationDrawer()}

      {showRevisionModal && (
        <div className="history-modal-overlay">
          <div className="history-modal-card">
            <h3 className="history-modal-title"><History size={18} /> Lịch sử chỉnh sửa chương học</h3>
            <p className="history-modal-desc">
              Danh sách các phiên bản cũ đã được lưu hoặc chỉnh sửa bởi AI.
            </p>
            <div className="history-modal-list">
              {revisions.length === 0 ? (
                <div className="history-modal-empty">
                  Chưa có bản lưu lịch sử nào cho chương học này.
                </div>
              ) : (
                revisions.map((rev) => (
                  <div key={rev.id} className="history-modal-item">
                    <div className="history-modal-item-info">
                      <div className="history-modal-item-meta">
                        <span className={`history-modal-item-badge ${rev.field === 'slide_content' ? 'slide' : 'script'}`}>
                          {rev.field === 'slide_content' ? 'Slide' : 'Kịch bản'}
                        </span>
                        <span className="history-modal-item-time">
                          {new Date(rev.created_at).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="history-modal-item-prompt">
                        Yêu cầu: "{rev.user_prompt || 'Tự động lưu/Khởi tạo'}"
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleRevert(rev.id);
                        setShowRevisionModal(false);
                      }}
                      className="history-modal-revert-btn"
                    >
                      Khôi phục
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="planner-modal-actions">
              <button 
                type="button" 
                onClick={() => setShowRevisionModal(false)} 
                className="history-modal-close-btn"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating side handles when collapsed */}
      {!showSidebar && (
        <button 
          onClick={() => setShowSidebar(true)} 
          className="planner-sidebar-toggle-floating"
          title="Hiện mục lục (Cột trái)"
        >
          <Eye size={15} aria-hidden="true" />
        </button>
      )}

      {!showAIProposal && (
        <button 
          onClick={() => setShowAIProposal(true)} 
          className="planner-ai-toggle-floating"
          title="Hiện đề xuất AI (Cột phải)"
        >
          <Eye size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const styles: Record<string, any> = {
  container: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at 10% 20%, rgb(15, 23, 42) 0%, rgb(9, 13, 26) 90%)',
    fontFamily: '"Inter", sans-serif',
    color: '#f8fafc',
    padding: '25px 30px',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '15px',
    marginBottom: '20px',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  } as React.CSSProperties,
  backBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  } as React.CSSProperties,
  questionBankBtn: {
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#a5b4fc',
    borderRadius: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    marginLeft: '15px',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  badge: {
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#a5b4fc',
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    display: 'inline-block',
  } as React.CSSProperties,
  courseTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
  } as React.CSSProperties,
  monitorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '6px 15px',
    fontSize: '11px',
    color: '#94a3b8',
  } as React.CSSProperties,
  statusIndicator: (status: string) => ({
    color: status === 'generating' ? '#f59e0b' : status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#64748b',
    fontWeight: '700' as const,
  }),
  traceBtn: {
    background: 'none',
    border: 'none',
    color: '#6366f1',
    cursor: 'pointer',
    fontWeight: '600',
    textDecoration: 'underline',
    padding: 0,
  } as React.CSSProperties,
  layout: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr 1fr',
    gap: '20px',
    height: 'calc(100vh - 180px)',
  } as React.CSSProperties,
  workTabContainer: {
    display: 'flex',
    background: 'rgba(15, 23, 42, 0.45)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '4px',
    width: 'fit-content',
    margin: '0 0 15px 380px',
    gap: '4px',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(8px)',
  } as React.CSSProperties,
  activeWorkTabBtn: {
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#a5b4fc',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  inactiveWorkTabBtn: {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#64748b',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  sidebar: {
    background: 'rgba(30, 41, 59, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,
  sidebarHeader: {
    padding: '15px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    background: 'rgba(15, 23, 42, 0.2)',
  } as React.CSSProperties,
  sidebarContent: {
    padding: '20px',
    flex: 1,
    overflowY: 'auto',
  } as React.CSSProperties,
  outlineActions: {
    marginBottom: '15px',
  } as React.CSSProperties,
  aiOutlineBtn: {
    width: '100%',
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#a5b4fc',
    borderRadius: '8px',
    padding: '10px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  chapterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,
  chapterCard: {
    display: 'flex',
    gap: '10px',
    padding: '12px',
    borderRadius: '10px',
    background: 'rgba(15, 23, 42, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  activeChapterCard: {
    display: 'flex',
    gap: '10px',
    padding: '12px',
    borderRadius: '10px',
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.4)',
    cursor: 'pointer',
    boxShadow: '0 0 10px rgba(99, 102, 241, 0.1)',
  } as React.CSSProperties,
  chapterOrder: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#94a3b8',
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: '700',
  } as React.CSSProperties,
  chapterTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: '4px',
  } as React.CSSProperties,
  chapterDesc: {
    fontSize: '11px',
    color: '#64748b',
    lineHeight: '130%',
  } as React.CSSProperties,
  uploadForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '20px',
  } as React.CSSProperties,
  fileInput: {
    color: '#94a3b8',
    fontSize: '12px',
  } as React.CSSProperties,
  uploadBtn: {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  } as React.CSSProperties,
  docList: {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '15px',
  } as React.CSSProperties,
  subTitle: {
    fontSize: '12px',
    color: '#cbd5e1',
    margin: '0 0 10px 0',
  } as React.CSSProperties,
  docItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(15, 23, 42, 0.2)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '8px',
  } as React.CSSProperties,
  docName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '220px',
  } as React.CSSProperties,
  deleteDocBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
  } as React.CSSProperties,
  aiProposalPanel: {
    background: 'rgba(30, 41, 59, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    background: 'rgba(15, 23, 42, 0.2)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0,
  } as React.CSSProperties,
  generateBtn: {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  } as React.CSSProperties,
  proposalScroll: {
    padding: '20px',
    flex: 1,
    overflowY: 'auto',
  } as React.CSSProperties,
  proposalBlocks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  } as React.CSSProperties,
  proposalBlock: {
    background: 'rgba(15, 23, 42, 0.45)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    overflow: 'hidden',
  } as React.CSSProperties,
  blockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.02)',
    padding: '10px 15px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  } as React.CSSProperties,
  blockTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#cbd5e1',
  } as React.CSSProperties,
  insertBtn: {
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: '#a5b4fc',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  proposalCode: {
    padding: '15px',
    margin: 0,
    fontSize: '12px',
    fontFamily: 'Consolas, monospace',
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap',
    background: '#090d1a',
  } as React.CSSProperties,
  proposalText: {
    padding: '15px',
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: '145%',
    whiteSpace: 'pre-wrap',
  } as React.CSSProperties,
  editorPanel: {
    background: 'rgba(30, 41, 59, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as React.CSSProperties,
  saveBtn: {
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  } as React.CSSProperties,
  exportBtn: {
    background: 'linear-gradient(135deg, #00d2ff 0%, #0086ff 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  tabToggleContainer: {
    display: 'flex',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    padding: '2px',
  } as React.CSSProperties,
  tabToggleActive: {
    background: 'rgba(99, 102, 241, 0.2)',
    border: 'none',
    color: '#a5b4fc',
    borderRadius: '4px',
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  tabToggleInactive: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  editorContainer: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    flex: 1,
    overflowY: 'auto',
  } as React.CSSProperties,
  editorField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#cbd5e1',
  } as React.CSSProperties,
  textareaEditor: {
    width: '100%',
    background: '#0f172a',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '15px',
    color: '#f8fafc',
    fontSize: '13px',
    fontFamily: 'inherit',
    lineHeight: '145%',
    outline: 'none',
    resize: 'none',
    height: 'calc(100vh - 350px)',
  } as React.CSSProperties,
  emptyState: {
    color: '#64748b',
    textAlign: 'center',
    padding: '60px 20px',
    fontSize: '13px',
  } as React.CSSProperties,
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '12px',
    marginBottom: '15px',
  } as React.CSSProperties,
  successAlert: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#a7f3d0',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '12px',
    marginBottom: '15px',
  } as React.CSSProperties,
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  } as React.CSSProperties,
  modalCard: {
    background: '#1e293b',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '20px',
    padding: '30px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
  } as React.CSSProperties,
  modalTitle: {
    margin: '0 0 20px 0',
    fontSize: '18px',
    fontWeight: '700',
    textAlign: 'center',
  } as React.CSSProperties,
  modalField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '15px',
  } as React.CSSProperties,
  modalLabel: {
    fontSize: '12px',
    color: '#cbd5e1',
    fontWeight: '600',
  } as React.CSSProperties,
  modalInput: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '10px',
    color: '#f8fafc',
    fontSize: '13px',
    outline: 'none',
  } as React.CSSProperties,
  modalSelect: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '10px',
    color: '#f8fafc',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '25px',
  } as React.CSSProperties,
  modalCancelBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    padding: '10px 15px',
  } as React.CSSProperties,
  modalConfirmBtn: {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  } as React.CSSProperties,
  searchForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '15px',
  } as React.CSSProperties,
  searchFormGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    padding: '10px',
    color: '#f8fafc',
    fontSize: '13px',
    outline: 'none',
  } as React.CSSProperties,
  searchActionRow: {
    display: 'flex',
    gap: '10px',
  } as React.CSSProperties,
  searchSubmitBtn: {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    flex: 2,
    boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
  } as React.CSSProperties,
  filterToggleBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
  } as React.CSSProperties,
  advancedPanel: {
    background: 'rgba(15, 23, 42, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as React.CSSProperties,
  advancedRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  } as React.CSSProperties,
  advancedLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: '600',
  } as React.CSSProperties,
  advancedInput: {
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#f8fafc',
    fontSize: '12px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
  advancedSliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  } as React.CSSProperties,
  advancedSlider: {
    flex: 1,
    cursor: 'pointer',
  } as React.CSSProperties,
  advancedValue: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#a5b4fc',
    minWidth: '35px',
    textAlign: 'right',
  } as React.CSSProperties,
  suggestionSection: {
    marginTop: '6px',
  } as React.CSSProperties,
  suggestionTitle: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  suggestionChips: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'stretch',
  } as React.CSSProperties,
  suggestionChip: {
    background: 'rgba(99, 102, 241, 0.08)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    color: '#a5b4fc',
    fontSize: '11px',
    fontWeight: '500',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'block',
    textAlign: 'left',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'all 0.15s ease',
  } as React.CSSProperties,
  searchResults: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '15px',
    maxHeight: '400px',
    overflowY: 'auto',
  } as React.CSSProperties,
  searchResultHeader: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: '5px',
  } as React.CSSProperties,
  resultItemGreen: {
    background: 'rgba(16, 185, 129, 0.05)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  } as React.CSSProperties,
  resultItemRed: {
    background: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  } as React.CSSProperties,
  resultTitle: {
    fontSize: '12px',
    color: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  } as React.CSSProperties,
  scoreBadgeGreen: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399',
    fontSize: '10px',
    fontWeight: '700',
    padding: '1px 5px',
    borderRadius: '4px',
  } as React.CSSProperties,
  scoreBadgeRed: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    fontSize: '10px',
    fontWeight: '700',
    padding: '1px 5px',
    borderRadius: '4px',
  } as React.CSSProperties,
  resultUrl: {
    fontSize: '10px',
    color: '#64748b',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  actionBtnRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  } as React.CSSProperties,
  actionMiniBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer',
  } as React.CSSProperties,
  scrapedContentBox: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
    padding: '8px',
    fontSize: '10px',
    fontFamily: 'Consolas, monospace',
    color: '#cbd5e1',
    whiteSpace: 'pre-wrap',
    maxHeight: '150px',
    overflowY: 'auto',
    marginTop: '6px',
    margin: 0,
  } as React.CSSProperties,
  summaryBox: {
    background: 'rgba(99, 102, 241, 0.05)',
    border: '1px dashed rgba(99, 102, 241, 0.3)',
    borderRadius: '6px',
    padding: '10px',
    marginTop: '8px',
    fontSize: '11px',
    color: '#cbd5e1',
    lineHeight: '1.4',
  } as React.CSSProperties,
  summaryTitle: {
    fontWeight: '700',
    color: '#a5b4fc',
    marginBottom: '4px',
    fontSize: '11px',
  } as React.CSSProperties,
  badgeContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '6px',
  } as React.CSSProperties,
  badgePositive: {
    background: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '6px',
    display: 'inline-block',
  } as React.CSSProperties,
  badgeNegative: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '6px',
    display: 'inline-block',
  } as React.CSSProperties,
  badgeNeutral: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#cbd5e1',
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '6px',
    display: 'inline-block',
  } as React.CSSProperties,
  metricGuideBox: {
    background: 'rgba(15, 23, 42, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '15px',
  } as React.CSSProperties,
  metricGuideHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '700',
    color: '#cbd5e1',
  } as React.CSSProperties,
  metricGuideContent: {
    marginTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '8px',
  } as React.CSSProperties,
  recommendationBadge: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '1px 6px',
    borderRadius: '4px',
    marginLeft: '6px',
  } as React.CSSProperties,
  forceIngestBtn: {
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
  } as React.CSSProperties,
  genLogBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '8px',
    padding: '12px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    marginBottom: '15px',
  } as React.CSSProperties,
  pulseDot: {
    width: '8px',
    height: '8px',
    background: '#818cf8',
    borderRadius: '50%',
    animation: 'pulse 1.5s infinite',
  } as React.CSSProperties,
  logText: {
    fontSize: '12px',
    color: '#a5b4fc',
    lineHeight: '1.4',
  } as React.CSSProperties
};

// ─── Resizable Layout ────────────────────────────────────────────────────────

interface ResizableLayoutProps {
  showSidebar: boolean;
  showAIProposal: boolean;
  children: React.ReactNode;
}

function ResizableLayout({ showSidebar, showAIProposal, children }: ResizableLayoutProps) {
  const { containerRef, onMouseDownSidebar, onMouseDownAI, sidebarWidth, aiRatio, isDragging } =
    useResizablePanels(showSidebar, showAIProposal);
  const childrenArr = React.Children.toArray(children);

  return (
    <div
      ref={containerRef}
      className={`planner-layout-flex ${isDragging ? 'is-resizing' : ''}`}
    >
      {/* ── Sidebar ── */}
      <div
        className={`planner-sidebar-wrapper ${showSidebar ? 'expanded' : 'collapsed'}`}
        style={{
          width: showSidebar ? sidebarWidth : 0,
          minWidth: showSidebar ? sidebarWidth : 0,
          maxWidth: showSidebar ? sidebarWidth : 0,
          flexShrink: 0,
          opacity: showSidebar ? 1 : 0,
          visibility: showSidebar ? 'visible' : 'hidden',
          transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), max-width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, visibility 0.3s ease',
          overflow: 'hidden'
        }}
      >
        {childrenArr[0]}
      </div>

      {/* Drag handle: sidebar ↔ next panel */}
      <div
        className="planner-resize-handle"
        onMouseDown={onMouseDownSidebar}
        title="Kéo để thay đổi chiều rộng cột"
        style={{
          opacity: showSidebar ? 1 : 0,
          pointerEvents: showSidebar ? 'auto' : 'none',
          width: showSidebar ? '4px' : '0px',
          cursor: showSidebar ? 'col-resize' : 'default',
          transition: isDragging ? 'none' : 'opacity 0.3s ease, width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden'
        }}
      >
        <div className="planner-resize-handle-bar" />
      </div>

      {/* ── AI Proposal panel ── */}
      <div
        className={`planner-ai-wrapper ${showAIProposal ? 'expanded' : 'collapsed'}`}
        style={{
          flex: showAIProposal ? `${aiRatio} 1 0` : '0 0 0px',
          width: showAIProposal ? 'auto' : '0px',
          minWidth: showAIProposal ? '0px' : '0px',
          maxWidth: showAIProposal ? '100%' : '0px',
          opacity: showAIProposal ? 1 : 0,
          visibility: showAIProposal ? 'visible' : 'hidden',
          transition: isDragging ? 'none' : 'flex 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, visibility 0.3s ease, width 0.3s cubic-bezier(0.16, 1, 0.3, 1), max-width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden'
        }}
      >
        {childrenArr[1]}
      </div>

      {/* Drag handle: AI ↔ Editor */}
      <div
        className="planner-resize-handle"
        onMouseDown={onMouseDownAI}
        title="Kéo để thay đổi chiều rộng cột"
        style={{
          opacity: showAIProposal ? 1 : 0,
          pointerEvents: showAIProposal ? 'auto' : 'none',
          width: showAIProposal ? '4px' : '0px',
          cursor: showAIProposal ? 'col-resize' : 'default',
          transition: isDragging ? 'none' : 'opacity 0.3s ease, width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          overflow: 'hidden'
        }}
      >
        <div className="planner-resize-handle-bar" />
      </div>

      {/* ── Editor panel ── always visible */}
      <div
        className="planner-editor-wrapper"
        style={{
          flex: showAIProposal ? `${1 - aiRatio} 1 0` : '1 1 0',
          minWidth: 0,
          transition: isDragging ? 'none' : 'flex 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {childrenArr[2]}
      </div>
    </div>
  );
}
