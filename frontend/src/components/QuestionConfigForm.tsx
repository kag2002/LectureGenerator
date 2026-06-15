import React from 'react';
import { 
  Zap, Search, Layers, Presentation, Activity, Shield, Save, Check, Loader2, Sparkles, AlertTriangle, X, Copy, Cpu
} from 'lucide-react';
import { CLO, Chapter } from '@/types';

const cleanLogText = (text: string) => {
  if (!text) return '';
  return text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}️\s✅⚡⏳🛡️🎨🔍✍️🧩💾☁️⏱️]+/u, '').trim();
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

export interface AgentMonitorState {
  traceId?: string;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  latency?: number;
  stages: { stage: number; message: string; status: 'pending' | 'success' | 'error' | 'running' }[];
  questionAttempts: { [key: number]: { attempts: number; guardrail_ok: boolean } };
  status: 'idle' | 'running' | 'success' | 'error';
}

export interface QuestionConfigFormProps {
  selectedClo: string | number;
  setSelectedClo: (val: string) => void;
  clos: CLO[];
  selectedChapter: string | number;
  setSelectedChapter: (val: string) => void;
  chapters: Chapter[];
  bloomLevel: number;
  setBloomLevel: (val: number) => void;
  count: number | string;
  setCount: (val: string) => void;
  generating: boolean;
  loading: boolean;
  genLog: string;
  handleGenerateQuestions: (e: React.FormEvent) => void;
  isFastMode: boolean;
  setIsFastMode: (val: boolean) => void;
  agentMonitor?: AgentMonitorState;
}

const getStepStatusClass = (stepNum: number, monitor: AgentMonitorState) => {
  const activeStage = monitor.stages.find(s => s.stage === stepNum);
  if (activeStage) {
    return activeStage.status;
  }
  const maxStage = Math.max(...monitor.stages.map(s => s.stage), 0);
  if (maxStage > stepNum) return 'success';
  return 'pending';
};

const getStepIcon = (stepNum: number, monitor: AgentMonitorState) => {
  const status = getStepStatusClass(stepNum, monitor);
  if (status === 'success') return <Check size={12} />;
  if (status === 'running') return <Loader2 size={12} className="animate-spin" />;
  if (status === 'error') return <X size={12} />;
  
  switch (stepNum) {
    case 1: return <Search size={12} />;
    case 2: return <Sparkles size={12} />;
    case 3: return <Shield size={12} />;
    default: return <Sparkles size={12} />;
  }
};

const getStepDesc = (stepNum: number, monitor: AgentMonitorState, defaultDesc: string) => {
  const matched = monitor.stages.find(s => s.stage === stepNum);
  if (matched) return matched.message;
  
  const maxStage = Math.max(...monitor.stages.map(s => s.stage), 0);
  if (maxStage > stepNum) return 'Đã hoàn tất thành công.';
  return defaultDesc;
};

export default function QuestionConfigForm({
  selectedClo,
  setSelectedClo,
  clos,
  selectedChapter,
  setSelectedChapter,
  chapters,
  bloomLevel,
  setBloomLevel,
  count,
  setCount,
  generating,
  loading,
  genLog,
  handleGenerateQuestions,
  isFastMode,
  setIsFastMode,
  agentMonitor
}: QuestionConfigFormProps) {
  return (
    <aside className="qb-sidebar">
      
      {/* SECTION 1: AI GENERATOR */}
      <section className="qb-card">
        <h3 className="qb-card-title">Tạo câu hỏi trắc nghiệm bằng AI</h3>
        <form onSubmit={handleGenerateQuestions} className="qb-form">
          <div className="qb-form-group">
            <label className="qb-label">Chuẩn đầu ra (CLO)</label>
            <select 
              value={selectedClo} 
              onChange={(e) => setSelectedClo(e.target.value)}
              className="qb-select"
              required
            >
              {clos.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.clo_code || c.code || ''}] {c.description.substring(0, 35)}…
                </option>
              ))}
            </select>
          </div>

          <div className="qb-form-group">
            <label className="qb-label">Chương học liên quan</label>
            <select 
              value={selectedChapter} 
              onChange={(e) => setSelectedChapter(e.target.value)}
              className="qb-select"
            >
              <option value="">Không bắt buộc</option>
              {chapters.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div className="qb-form-row">
            <div className="qb-form-group">
              <label className="qb-label">Mức Bloom</label>
              <select 
                value={bloomLevel} 
                onChange={(e) => setBloomLevel(parseInt(e.target.value))}
                className="qb-select"
              >
                <option value={1}>Nhớ (B1)</option>
                <option value={2}>Hiểu (B2)</option>
                <option value={3}>Vận dụng (B3)</option>
                <option value={4}>Phân tích (B4)</option>
                <option value={5}>Đánh giá (B5)</option>
                <option value={6}>Sáng tạo (B6)</option>
              </select>
            </div>
            <div className="qb-form-group">
              <label className="qb-label">Số lượng</label>
              <input 
                type="number" 
                min="1" 
                max="5"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="qb-input"
              />
            </div>
          </div>

          {/* Fast Mode Checkbox */}
          <div className="qb-checkbox-wrapper">
            <input 
              type="checkbox" 
              id="config-fast-mode-checkbox"
              checked={isFastMode} 
              onChange={(e) => setIsFastMode(e.target.checked)}
              className="qb-checkbox-input"
            />
            <label htmlFor="config-fast-mode-checkbox" className="qb-checkbox-label" title="Bỏ qua bước giải đề thử của Solver giúp rút ngắn thời gian sinh">
              <Zap size={14} aria-hidden="true" /> Chế độ tạo nhanh (Fast Mode)
            </label>
          </div>

          <button type="submit" disabled={generating || loading} className="qb-submit-btn">
            {generating ? 'AI Đang tạo câu hỏi…' : 'Bắt đầu tạo câu hỏi'}
          </button>

          {generating && !agentMonitor && (
            <div className="qb-gen-log-box" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getLogIcon(3, genLog)}
              <span className="qb-log-text">{cleanLogText(genLog)}</span>
            </div>
          )}

          {agentMonitor && agentMonitor.status !== 'idle' && (
            <div className="qb-monitor-panel">
              <div className="qb-monitor-header">
                <h4 className="qb-monitor-title">
                  <Cpu size={15} className={agentMonitor.status === 'running' ? 'animate-pulse text-indigo-400' : ''} />
                  AI Agent Monitor
                </h4>
                <div className={`qb-monitor-status-badge ${agentMonitor.status}`}>
                  <span className={`qb-monitor-led ${agentMonitor.status}`} />
                  {agentMonitor.status === 'running' ? 'Đang chạy' : agentMonitor.status === 'success' ? 'Hoàn tất' : 'Lỗi'}
                </div>
              </div>

              {/* STEPS TIMELINE */}
              <div className="qb-monitor-steps">
                {/* Step 1: RAG Retrieval */}
                <div className={`qb-monitor-step ${getStepStatusClass(1, agentMonitor)}`}>
                  <div className="qb-monitor-step-icon-wrapper">
                    {getStepIcon(1, agentMonitor)}
                  </div>
                  <div className="qb-monitor-step-info">
                    <span className="qb-monitor-step-title">Bước 1: Tìm kiếm & Nạp RAG Context</span>
                    <span className="qb-monitor-step-desc">
                      {getStepDesc(1, agentMonitor, 'Tìm kiếm tài liệu học trình và CLO liên quan')}
                    </span>
                  </div>
                </div>

                {/* Step 2: Draft MCQ Generation */}
                <div className={`qb-monitor-step ${getStepStatusClass(2, agentMonitor)}`}>
                  <div className="qb-monitor-step-icon-wrapper">
                    {getStepIcon(2, agentMonitor)}
                  </div>
                  <div className="qb-monitor-step-info">
                    <span className="qb-monitor-step-title">Bước 2: Gọi LLM Sinh câu hỏi nháp</span>
                    <span className="qb-monitor-step-desc">
                      {getStepDesc(2, agentMonitor, 'Gửi prompt tới LLM sinh danh sách câu hỏi trắc nghiệm thô')}
                    </span>
                  </div>
                </div>

                {/* Step 3: Safety Verification */}
                <div className={`qb-monitor-step ${getStepStatusClass(3, agentMonitor)}`}>
                  <div className="qb-monitor-step-icon-wrapper">
                    {getStepIcon(3, agentMonitor)}
                  </div>
                  <div className="qb-monitor-step-info">
                    <span className="qb-monitor-step-title">Bước 3: Kiểm duyệt logic (Solver Loop)</span>
                    <span className="qb-monitor-step-desc">
                      {isFastMode ? '⚡ Bỏ qua bước xác minh (Chế độ tạo nhanh)' : getStepDesc(3, agentMonitor, 'Gọi Agent đóng vai Solver giải thử đề thi và tự động sửa lỗi logic')}
                    </span>
                  </div>
                </div>
              </div>

              {/* SELF CORRECTION LOGS */}
              {!isFastMode && Object.keys(agentMonitor.questionAttempts).length > 0 && (
                <div className="qb-monitor-validation-log">
                  {Object.entries(agentMonitor.questionAttempts).map(([idx, info]: [string, any]) => (
                    <div key={idx} className="qb-monitor-val-item">
                      <span className="qb-monitor-val-name">Câu hỏi {idx}</span>
                      <span className={`qb-monitor-val-badge ${info.guardrail_ok ? 'passed' : 'corrected'}`}>
                        {info.guardrail_ok ? 'Đạt kiểm duyệt lần 1 🛡️' : `Đã sửa đổi (${info.attempts} lần thử) 🔄`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* PERFORMANCE METRICS */}
              <div className="qb-monitor-metrics-grid">
                <div className="qb-monitor-metric-card">
                  <span className="qb-monitor-metric-label">Độ trễ xử lý</span>
                  <span className="qb-monitor-metric-value">{(agentMonitor.latency || 0).toFixed(1)}s</span>
                </div>
                <div className="qb-monitor-metric-card">
                  <span className="qb-monitor-metric-label">Mô hình AI</span>
                  <span className="qb-monitor-metric-value" title={agentMonitor.modelName}>
                    {agentMonitor.modelName ? agentMonitor.modelName.split('/').pop() : 'Qwen/Gemini'}
                  </span>
                </div>
                <div className="qb-monitor-metric-card">
                  <span className="qb-monitor-metric-label">Token tiêu thụ</span>
                  <span className="qb-monitor-metric-value">
                    {agentMonitor.promptTokens !== undefined && agentMonitor.completionTokens !== undefined ? `${agentMonitor.promptTokens + agentMonitor.completionTokens} tkn` : 'N/A'}
                  </span>
                </div>
                <div className="qb-monitor-metric-card">
                  <span className="qb-monitor-metric-label">Ước lượng chi phí</span>
                  <span className="qb-monitor-metric-value cost">
                    {agentMonitor.totalCost !== undefined ? `$${agentMonitor.totalCost.toFixed(4)}` : 'N/A'}
                  </span>
                </div>
                <div className="qb-monitor-metric-card span-2">
                  <span className="qb-monitor-metric-label">Langfuse Trace ID</span>
                  <div className="qb-monitor-trace-row">
                    <code className="qb-monitor-trace-code">{agentMonitor.traceId || 'N/A'}</code>
                    {agentMonitor.traceId && (
                      <button 
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(agentMonitor.traceId || '');
                          alert('Đã sao chép mã Trace ID!');
                        }}
                        className="qb-monitor-copy-btn"
                        title="Sao chép Trace ID"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </section>

    </aside>
  );
}
