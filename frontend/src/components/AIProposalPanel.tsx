import React from 'react';
import SlideProposalPreview from './SlideProposalPreview';
import { renderMarkdown } from '../utils/markdown';
import { parseMarkdownToSlidesJS, parseSlideForVisualEdit } from '../utils/slideParser';
import { Chapter } from '@/types';
import { 
  Sparkles, Loader2, Layers, Trash2, X, Plus, 
  Play, Presentation, Activity, Lightbulb, AlertTriangle, ArrowRight, ArrowUp, ArrowDown, Check, ChevronRight, EyeOff,
  Clock, Search, Shield, Save, ChevronDown, ChevronUp, MapPin, RefreshCw
} from 'lucide-react';

const cleanLogText = (text: string) => {
  if (!text) return '';
  return text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}️\s✅⚡⏳🛡️🎨🔍✍️🧩💾☁️⏱️❌🎉⚠️]+/u, '').trim();
};

const getLogIcon = (stage: number, text: string) => {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('hoàn tất') || lowerText.includes('thành công') || lowerText.includes('xong')) {
    return <Check className="text-emerald-400" size={16} style={{ flexShrink: 0 }} />;
  }
  if (lowerText.includes('lỗi') || lowerText.includes('thất bại')) {
    return <AlertTriangle className="text-rose-400" size={16} style={{ flexShrink: 0 }} />;
  }
  
  switch (stage) {
    case 1:
      return <Search className="text-sky-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
    case 2:
      return <Layers className="text-indigo-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
    case 3:
      return <Presentation className="text-teal-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
    case 4:
      return <Activity className="text-amber-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
    case 5:
      return <Shield className="text-rose-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
    case 6:
      return <Save className="text-emerald-400" size={16} style={{ flexShrink: 0 }} />;
    default:
      if (lowerText.includes('truy xuất') || lowerText.includes('rag') || lowerText.includes('tìm kiếm')) {
        return <Search className="text-sky-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
      }
      if (lowerText.includes('gọi mô hình') || lowerText.includes('khởi động')) {
        return <Loader2 className="text-indigo-400 animate-spin" size={16} style={{ flexShrink: 0 }} />;
      }
      return <Sparkles className="text-violet-400 animate-pulse" size={16} style={{ flexShrink: 0 }} />;
  }
};

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
  aiViewMode?: 'storyboard' | 'slides';
  setAiViewMode?: (mode: 'storyboard' | 'slides') => void;
  warnings?: string[];
  ragReferences?: any[];
  onClose?: () => void;
  activeAgent?: string | null;
  agentStatus?: string | null;
  selfCorrectionAttempt?: number | null;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_cost: number;
    model_name: string;
  } | null;
  onInsertContent?: (content: string, type: 'slides' | 'script', mode: 'cursor' | 'end' | 'replace') => void;
  classSize?: number;
  hasWifi?: boolean;
  furnitureType?: string;
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
  onClose,
  aiViewMode = 'storyboard',
  setAiViewMode,
  warnings = [],
  ragReferences = [],
  activeAgent = null,
  agentStatus = null,
  selfCorrectionAttempt = null,
  tokenUsage = null,
  onInsertContent,
  classSize = 40,
  hasWifi = true,
  furnitureType = 'movable'
}: AIProposalPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [showAgentMonitor, setShowAgentMonitor] = React.useState<boolean>(false);
  const [shouldAnimate, setShouldAnimate] = React.useState(false);
  const [isAIRationaleExpanded, setIsAIRationaleExpanded] = React.useState(false);
  const [isInsertDropdownOpen, setIsInsertDropdownOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  React.useEffect(() => {
    if (selectedChapter) {
      setShouldAnimate(true);
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 7000); // 2 cycles (3.5s each)
      return () => clearTimeout(timer);
    }
  }, [selectedChapter]);

  const getExpectedReferences = (slideTitle: string, targetClo: string) => {
    if (!ragReferences || ragReferences.length === 0) return [];
    const queryWords = `${slideTitle || ''} ${targetClo || ''}`
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !['và', 'của', 'là', 'để', 'trong', 'với', 'cho', 'tại'].includes(w));
    if (queryWords.length === 0) return [];
    
    const scoredItems = ragReferences
      .map(ref => {
        const textLower = (ref.text || '').toLowerCase();
        const filenameLower = (ref.file_name || '').toLowerCase();
        let matchCount = 0;
        queryWords.forEach(word => {
          if (textLower.includes(word) || filenameLower.includes(word)) {
            matchCount++;
          }
        });
        return { ref, score: matchCount };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // Deduplicate on file_name + page_number to avoid visual duplication
    const seen = new Set<string>();
    const uniqueRefs: typeof ragReferences = [];
    
    for (const item of scoredItems) {
      const key = `${item.ref.file_name}_p${item.ref.page_number}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRefs.push(item.ref);
      }
    }
    
    return uniqueRefs.slice(0, 2);
  };

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
      { id: 5, name: "Rà soát tính nhất quán", desc: "Kiểm chéo chất lượng & nhất quán" },
      { id: 6, name: "Lưu & Hoàn tất", desc: "Lưu học liệu hoàn chỉnh vào DB" }
    ];

    return (
      <div className="planner-stepper-container">
        <div className="planner-stepper-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="planner-stepper-pulse-dot" />
            TIẾN TRÌNH AI SOẠN BÀI GIẢNG:
          </div>
          {!showAgentMonitor && (
            <button
              type="button"
              onClick={() => setShowAgentMonitor(true)}
              className="planner-storyboard-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                padding: '4px 10px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#818cf8',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#6366f1';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = '#6366f1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                e.currentTarget.style.color = '#818cf8';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
              }}
            >
              <Activity size={12} /> Giám sát luồng AI
            </button>
          )}
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

  const renderAgentVisualizer = () => {
    if (apiStatus !== 'generating' && !isGeneratingStoryboard) return null;
    if (!showAgentMonitor) return null;

    const nodes = [
      { id: 'storyboard_architect', name: 'Storyboard Architect', desc: 'Thiết kế cấu trúc', x: 60, y: 35 },
      { id: 'content_allocator', name: 'Content Allocator', desc: 'Phân phối thông tin', x: 210, y: 35 },
      { id: 'slide_writer', name: 'Slide Writer', desc: 'Soạn thảo nội dung', x: 360, y: 35 },
      { id: 'active_learning_scheduler', name: 'AL Scheduler', desc: 'Thiết kế kịch bản', x: 360, y: 135 },
      { id: 'logic_auditor', name: 'Logic Auditor', desc: 'Kiểm toán sư phạm', x: 210, y: 135 },
      { id: 'saver', name: 'DB Saver', desc: 'Lưu trữ học liệu', x: 60, y: 135 }
    ];

    const getNodeStatus = (nodeId: string): 'inactive' | 'running' | 'completed' | 'correcting' | 'error' => {
      if (apiStatus === 'error' && activeAgent === nodeId) return 'error';
      if (activeAgent === nodeId) {
        if (agentStatus === 'correcting') return 'correcting';
        if (agentStatus === 'completed') return 'completed';
        return 'running';
      }
      const order = ['storyboard_architect', 'content_allocator', 'slide_writer', 'active_learning_scheduler', 'logic_auditor', 'saver'];
      const activeIdx = order.indexOf(activeAgent || '');
      const nodeIdx = order.indexOf(nodeId);
      if (activeIdx > nodeIdx && activeIdx !== -1) {
        return 'completed';
      }
      if (apiStatus === 'success' && activeIdx === -1) {
        return 'completed';
      }
      return 'inactive';
    };

    const isConnectionActive = (fromNodeId: string, toNodeId: string): 'inactive' | 'active' | 'completed' => {
      const order = ['storyboard_architect', 'content_allocator', 'slide_writer', 'active_learning_scheduler', 'logic_auditor', 'saver'];
      const activeIdx = order.indexOf(activeAgent || '');
      const fromIdx = order.indexOf(fromNodeId);
      const toIdx = order.indexOf(toNodeId);
      
      if (apiStatus === 'success') return 'completed';
      if (activeIdx > fromIdx) return 'completed';
      if (activeIdx === fromIdx && (agentStatus === 'running' || agentStatus === 'correcting')) return 'active';
      return 'inactive';
    };

    const formattedCost = tokenUsage && tokenUsage.total_cost !== undefined
      ? `$${Number(tokenUsage.total_cost).toFixed(4)}`
      : '$0.0000';

    return (
      <div className="agent-flow-container">
        <div className="agent-flow-header">
          <div className="agent-flow-title">
            <span className="planner-stepper-pulse-dot" />
            <span>Multi-Agent Flow Monitor</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {tokenUsage && (
              <div className="agent-flow-telemetry" title={`Model: ${tokenUsage.model_name || 'N/A'}`}>
                <div className="telemetry-item">
                  <span>Prompt:</span>
                  <strong>{tokenUsage.prompt_tokens} tkn</strong>
                </div>
                <div className="telemetry-item">
                  <span>Completion:</span>
                  <strong>{tokenUsage.completion_tokens} tkn</strong>
                </div>
                <div className="telemetry-item">
                  <span>Cost:</span>
                  <span className="telemetry-cost">{formattedCost}</span>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowAgentMonitor(false)}
              className="agent-flow-close-btn"
              title="Đóng giám sát tiến trình"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <svg width="100%" height="180" viewBox="0 0 420 180" className="agent-flow-svg">
          <defs>
            <marker id="arrow-inactive" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 2 L 8 5 L 0 8 z" fill="rgba(71, 85, 105, 0.4)" />
            </marker>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 2 L 8 5 L 0 8 z" fill="#3b82f6" />
            </marker>
            <marker id="arrow-completed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 2 L 8 5 L 0 8 z" fill="#10b981" />
            </marker>
          </defs>

          {/* Paths / Connections */}
          <path 
            d="M 78 35 L 192 35" 
            className={`connection-line ${isConnectionActive('storyboard_architect', 'content_allocator')}`}
            markerEnd={`url(#arrow-${isConnectionActive('storyboard_architect', 'content_allocator')})`}
          />
          <path 
            d="M 228 35 L 342 35" 
            className={`connection-line ${isConnectionActive('content_allocator', 'slide_writer')}`}
            markerEnd={`url(#arrow-${isConnectionActive('content_allocator', 'slide_writer')})`}
          />
          <path 
            d="M 360 53 L 360 117" 
            className={`connection-line ${isConnectionActive('slide_writer', 'active_learning_scheduler')}`}
            markerEnd={`url(#arrow-${isConnectionActive('slide_writer', 'active_learning_scheduler')})`}
          />
          <path 
            d="M 342 135 L 228 135" 
            className={`connection-line ${isConnectionActive('active_learning_scheduler', 'logic_auditor')}`}
            markerEnd={`url(#arrow-${isConnectionActive('active_learning_scheduler', 'logic_auditor')})`}
          />
          <path 
            d="M 192 135 L 78 135" 
            className={`connection-line ${isConnectionActive('logic_auditor', 'saver')}`}
            markerEnd={`url(#arrow-${isConnectionActive('logic_auditor', 'saver')})`}
          />

          {/* Nodes */}
          {nodes.map((node) => {
            const status = getNodeStatus(node.id);
            return (
              <g key={node.id} className={`agent-node ${status}`} transform={`translate(${node.x}, ${node.y})`}>
                <circle cx="0" cy="0" r="18" className="agent-node-circle" />
                <text x="0" y="3" className="agent-node-text">
                  {node.id === 'storyboard_architect' ? 'STR' :
                   node.id === 'content_allocator' ? 'ALC' :
                   node.id === 'slide_writer' ? 'WRT' :
                   node.id === 'active_learning_scheduler' ? 'ACT' :
                   node.id === 'logic_auditor' ? 'AUD' : 'SAV'}
                </text>
                <text x="0" y="30" className="agent-node-desc">{node.name}</text>
              </g>
            );
          })}
        </svg>

        {activeAgent === 'slide_writer' && agentStatus === 'correcting' && selfCorrectionAttempt && (
          <div className="agent-flow-correction-alert animate-pulse">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>
              Đang tự động hiệu chỉnh độ dài Slide {currentSlide} (Lần thử {selfCorrectionAttempt}/2)...
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="planner-ai-proposal-panel">
      <div className="planner-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px 16px' }}>
        <h3 className="planner-section-title">AI Đề xuất nội dung</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedChapter && (
            <button 
              onClick={() => {
                setShouldAnimate(false);
                setShowConfigModal(true);
              }} 
              id="lp-generate-materials-btn" 
              className={`planner-generate-btn ${shouldAnimate ? 'glow-bounce-hint' : ''}`}
            >
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

      {storyboardDraft && setAiViewMode && (
        <div className="planner-ai-subtabs">
          <button
            type="button"
            className={`planner-ai-subtab-btn ${aiViewMode === 'storyboard' ? 'active' : ''}`}
            onClick={() => setAiViewMode('storyboard')}
          >
            <Layers size={14} /> Đề cương (Storyboard)
          </button>
          <button
            type="button"
            className={`planner-ai-subtab-btn ${aiViewMode === 'slides' ? 'active' : ''}`}
            onClick={() => setAiViewMode('slides')}
          >
            <Presentation size={14} /> Nội dung Slide
          </button>
        </div>
      )}

      <div ref={scrollRef} className="planner-proposal-scroll">
        {renderAgentVisualizer()}
        {apiStatus === 'generating' && genLog && (
          <div className="planner-log-box planner-log-box-split">
            <div className="planner-log-box-content" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getLogIcon(currentStage, genLog)}
              <span className="planner-log-text">{cleanLogText(genLog)}</span>
            </div>
            {handleCancelMaterialsGeneration && (
              <button
                type="button"
                onClick={handleCancelMaterialsGeneration}
                className="planner-btn-cancel-gen"
              >
                Dừng tạo
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
                Dừng tạo
              </button>
              )}
            </div>
          ) : (storyboardDraft && aiViewMode === 'storyboard') ? (
            <div className="planner-storyboard-wrapper">
              <div className="planner-storyboard-banner">
                {apiStatus === 'generating' && (
                  <div className="planner-storyboard-locked-banner" style={{ margin: '0 0 16px 0' }}>
                    <AlertTriangle size={16} className="planner-storyboard-locked-banner-icon" />
                    <p className="planner-storyboard-locked-banner-text">
                      AI đang sinh slide chi tiết dựa trên dàn ý này. Bản thiết kế đề cương tạm thời được khóa để đảm bảo tính nhất quán.
                    </p>
                  </div>
                )}
                <h4 className="planner-storyboard-banner-title" style={{ margin: 0, fontSize: '15px' }}>
                  <Layers size={14} /> Giai đoạn 1: Phê duyệt Đề cương Slide (Storyboard)
                </h4>
                <p className="planner-storyboard-banner-desc" style={{ marginTop: '8px', marginBottom: '14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Dưới đây là khung bài giảng do AI đề xuất. Bạn có thể chỉnh sửa tiêu đề, mục tiêu sư phạm, CLO và mức Bloom của từng slide trước khi bấm <strong>"Bắt đầu soạn bài giảng chi tiết"</strong>.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    disabled={apiStatus === 'generating'}
                    onClick={() => setStoryboardDraft(null)}
                    className="planner-storyboard-footer-btn planner-storyboard-footer-btn-cancel"
                    style={{ flex: 1, minHeight: '38px', height: '38px', padding: '6px 12px', fontSize: '12.5px', borderRadius: '8px' }}
                  >
                    <X size={12} /> Hủy bỏ
                  </button>
                  <button
                    type="button"
                    disabled={apiStatus === 'generating'}
                    onClick={() => handleGenerateMaterialsFromStoryboard(storyboardDraft)}
                    id="ai-generate-materials-confirm-btn"
                    className={`planner-storyboard-footer-btn planner-storyboard-footer-btn-confirm ${apiStatus !== 'generating' ? 'glow-bounce-hint' : ''}`}
                    style={{ flex: 2, minHeight: '38px', height: '38px', padding: '6px 12px', fontSize: '12.5px', borderRadius: '8px', boxShadow: 'none' }}
                  >
                    <Play size={12} /> Bắt đầu sinh học liệu chi tiết
                  </button>
                </div>
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
                          disabled={index === 0 || apiStatus === 'generating'}
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
                          disabled={index === storyboardDraft.length - 1 || apiStatus === 'generating'}
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
                          disabled={apiStatus === 'generating'}
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
                        disabled={apiStatus === 'generating'}
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
                        disabled={apiStatus === 'generating'}
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
                          disabled={apiStatus === 'generating'}
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
                          disabled={apiStatus === 'generating'}
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

                    {/* Dự kiến tham chiếu RAG */}
                    {ragReferences && ragReferences.length > 0 && (
                      <div className="planner-storyboard-field-group" style={{ marginTop: '10px' }}>
                        <label className="planner-storyboard-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Search size={10} /> Tài liệu tham chiếu dự kiến:
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                          {getExpectedReferences(slide.title, slide.target_clo).length > 0 ? (
                            getExpectedReferences(slide.title, slide.target_clo).map((ref, rIdx) => (
                              <div key={rIdx} style={{ fontSize: '11px', color: 'var(--warning-color)', background: 'var(--warning-bg)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--warning-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${ref.file_name} - Trang ${ref.page_number}`}>
                                {ref.file_name} (Trang {ref.page_number})
                              </div>
                            ))
                          ) : (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Dựa trên tri thức chung (Không có tài liệu RAG trùng khớp)
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  disabled={apiStatus === 'generating'}
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


            </div>
          ) : (!aiSlideProposal && !aiActiveLearningProposal && apiStatus !== 'generating') ? (
            <div className="planner-empty-state">
              {storyboardDraft ? (
                <p>Đề cương bài giảng đã sẵn sàng. Vui lòng chuyển sang tab <strong>Đề cương (Storyboard)</strong> để duyệt và bắt đầu sinh slide chi tiết.</p>
              ) : (
                <p>Chọn một chương ở cột bên trái và bấm <strong>Tạo bài giảng & Giáo án</strong> để AI trích xuất nội dung đề xuất.</p>
              )}
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
              {warnings && warnings.length > 0 && (
                <div className="planner-warnings-card" style={{
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-color)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  marginBottom: '18px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger-color)', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>
                    <AlertTriangle size={16} />
                    <span>Cảnh báo Kiểm toán Sư phạm (Logic Auditor)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-primary)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {warnings.map((w, idx) => (
                      <li key={idx} style={{ lineHeight: '1.5' }}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="planner-proposal-blocks">
                {activeWorkTab === 'slides' ? (
                  <div className="planner-proposal-block">
                    {toast && (
                      <div className="planner-toast" style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999, background: 'rgba(16, 185, 129, 0.95)', color: '#ffffff', padding: '12px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', animation: 'slideUp 0.3s ease-out' }}>
                        <Check size={16} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{toast}</span>
                      </div>
                    )}
                    <div className="planner-block-header">
                      <span className="planner-block-title"><Presentation size={15} /> Đề xuất Slide Bài giảng</span>
                      <div className="planner-block-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                            title="Hiển thị dạng cấu trúc văn bản dễ đọc"
                          >
                            Dạng văn bản
                          </button>
                        </div>
                        
                        <div className="planner-insertion-wrapper" style={{ display: 'inline-flex', position: 'relative', alignItems: 'stretch' }}>
                          <button 
                            onClick={() => {
                              if (window.confirm('Hành động này sẽ XÓA TOÀN BỘ slide hiện tại để thay thế bằng bản đề xuất từ AI. Bạn có chắc chắn không?')) {
                                if (onInsertContent) {
                                  onInsertContent(aiSlideProposal, 'slides', 'replace');
                                } else {
                                  setSlideContent(aiSlideProposal);
                                }
                                showToast('Đã thay thế toàn bộ slides bằng bản đề xuất AI!');
                              }
                            }}
                            disabled={apiStatus === 'generating'}
                            className="planner-btn-override primary-apply-btn"
                            title="Thay thế toàn bộ bài giảng hiện tại"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', borderTopRightRadius: 0, borderBottomRightRadius: 0, paddingRight: '12px' }}
                          >
                            <RefreshCw size={12} /> Áp dụng đề xuất
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsInsertDropdownOpen(!isInsertDropdownOpen)}
                            disabled={apiStatus === 'generating'}
                            className="planner-dropdown-toggle-btn"
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              padding: '0 8px', 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              border: '1px solid rgba(255, 255, 255, 0.1)', 
                              borderLeft: 'none', 
                              borderTopRightRadius: '6px', 
                              borderBottomRightRadius: '6px', 
                              cursor: 'pointer',
                              color: 'var(--text-secondary)'
                            }}
                            title="Tùy chọn chèn khác"
                          >
                            <ChevronDown size={12} />
                          </button>
                          
                          {isInsertDropdownOpen && (
                            <div className="planner-insertion-dropdown-menu" style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 100, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)', padding: '6px', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onInsertContent) {
                                    onInsertContent(aiSlideProposal, 'slides', 'cursor');
                                  } else {
                                    setSlideContent((prev: string) => prev ? (prev + '\n\n' + aiSlideProposal) : aiSlideProposal);
                                  }
                                  setIsInsertDropdownOpen(false);
                                  showToast('Đã chèn đề xuất tại con trỏ!');
                                }}
                                className="planner-dropdown-item"
                                style={{ background: 'none', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px' }}
                              >
                                <MapPin size={12} /> Chèn tại con trỏ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onInsertContent) {
                                    onInsertContent(aiSlideProposal, 'slides', 'end');
                                  } else {
                                    setSlideContent((prev: string) => prev ? (prev + '\n\n' + aiSlideProposal) : aiSlideProposal);
                                  }
                                  setIsInsertDropdownOpen(false);
                                  showToast('Đã chèn đề xuất vào cuối!');
                                }}
                                className="planner-dropdown-item"
                                style={{ background: 'none', border: 'none', padding: '8px 12px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '12px' }}
                              >
                                <ArrowDown size={12} /> Chèn cuối
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {slideProposalViewMode === 'code' ? (
                      apiStatus === 'generating' && !aiSlideProposal ? (
                        <div className="planner-loading-indicator">
                          <Loader2 size={16} className="animate-spin" /> Đang thiết kế slide...
                        </div>
                      ) : (
                        <div className="proposal-slide-cards-deck">
                          {parseMarkdownToSlidesJS(aiSlideProposal).map((s, idx) => {
                            const vs = parseSlideForVisualEdit(s);
                            const currentLayout = s.layout || 'standard_list';
                            
                            return (
                              <div key={idx} className="proposal-slide-card">
                                <div className="proposal-slide-card-header">
                                  <span className="proposal-slide-card-number">Slide {idx + 1} (Đề xuất)</span>
                                  <span className="proposal-slide-card-layout-badge">{currentLayout}</span>
                                </div>
                                <div className="proposal-slide-card-body">
                                  <div className="proposal-slide-field-group">
                                    <div className="proposal-slide-field-label">Tiêu đề slide:</div>
                                    <div className="proposal-slide-field-value">{vs.title || "Không có tiêu đề"}</div>
                                  </div>
                                  <div className="proposal-slide-field-group">
                                    <div className="proposal-slide-field-label">Nội dung đề xuất:</div>
                                    <div className="proposal-slide-field-value-body">
                                      <pre className="proposal-slide-body-pre">{vs.body || "Không có nội dung"}</pre>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      <SlideProposalPreview 
                        mdContent={aiSlideProposal} 
                        apiStatus={apiStatus} 
                        themeName={selectedTheme} 
                        onCitationClick={handleCitationClick} 
                        isFullscreen={false}
                        onInsertSlide={(slideMarkdown) => {
                          if (onInsertContent) {
                            onInsertContent(slideMarkdown, 'slides', 'cursor');
                          } else {
                            setSlideContent((prev: string) => prev ? (prev + '\n\n' + slideMarkdown) : slideMarkdown);
                          }
                          showToast('Đã chèn slide được chọn vào con trỏ!');
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="planner-proposal-block">
                    <div className="planner-block-header">
                      <span className="planner-block-title"><Activity size={15} /> Kịch bản tương tác (Active Learning)</span>
                      <div className="planner-block-header-actions" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => onInsertContent ? onInsertContent(aiActiveLearningProposal, 'script', 'cursor') : setActiveLearningScript(activeLearningScript ? (activeLearningScript + '\n\n' + aiActiveLearningProposal) : aiActiveLearningProposal)}
                          disabled={apiStatus === 'generating'}
                          className="planner-insert-btn cursor-insert"
                          title="Chèn kịch bản tương tác tại vị trí con trỏ chuột"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <MapPin size={12} /> Chèn tại con trỏ
                        </button>
                        <button 
                          onClick={() => onInsertContent ? onInsertContent(aiActiveLearningProposal, 'script', 'end') : setActiveLearningScript(activeLearningScript ? (activeLearningScript + '\n\n' + aiActiveLearningProposal) : aiActiveLearningProposal)}
                          disabled={apiStatus === 'generating'}
                          className="planner-insert-btn end-insert"
                          title="Chèn kịch bản tương tác vào cuối bài giảng"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <ArrowDown size={12} /> Chèn cuối
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm('Hành động này sẽ XÓA TOÀN BỘ kịch bản hiện tại để thay thế bằng kịch bản tương tác từ AI. Bạn có chắc chắn không?')) {
                              if (onInsertContent) {
                                onInsertContent(aiActiveLearningProposal, 'script', 'replace');
                              } else {
                                setActiveLearningScript(aiActiveLearningProposal);
                              }
                            }
                          }}
                          disabled={apiStatus === 'generating'}
                          className="planner-btn-override"
                          title="Thay thế toàn bộ kịch bản hiện tại"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <RefreshCw size={12} /> Thay thế
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
                        <div className={`planner-rationale-box ${isAIRationaleExpanded ? 'expanded' : 'collapsed'}`}>
                          <button
                            type="button"
                            className="planner-rationale-header-toggle"
                            onClick={() => setIsAIRationaleExpanded(!isAIRationaleExpanded)}
                            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          >
                            <span className="planner-rationale-title" style={{ margin: 0 }}>
                              <span className="planner-rationale-icon-wrapper"><Lightbulb size={12} /></span>
                              <span>Giải trình Sư phạm của Trợ lý AI</span>
                            </span>
                            <div className="planner-rationale-badges" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="rationale-badge size-badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--text-secondary)' }}>Sĩ số: {classSize}</span>
                              <span className="rationale-badge wifi-badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--text-secondary)' }}>Wifi: {hasWifi ? 'Khỏe' : 'Yếu'}</span>
                              <span className="rationale-badge furniture-badge" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--text-secondary)' }}>Bàn ghế: {furnitureType === 'movable' ? 'Di động' : 'Cố định'}</span>
                              <span className="rationale-chevron-icon" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                                {isAIRationaleExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </span>
                            </div>
                          </button>
                          {isAIRationaleExpanded && (
                            <div className="planner-rationale-content-wrapper" style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                              <div className="planner-rationale-content">
                                {parseActiveLearningScript(aiActiveLearningProposal).rationale}
                              </div>
                            </div>
                          )}
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
