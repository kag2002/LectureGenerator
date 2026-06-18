import React, { useState, useMemo } from 'react';
import {
  BookOpen, FileText, HelpCircle, BarChart2, Settings, Upload, Zap,
  ChevronRight, ChevronLeft, Check, X, Loader2, Zap as ZapIcon, AlertCircle,
  Lock, ArrowRight,
} from 'lucide-react';
import {
  ACTION_REGISTRY,
  BLOOM_LEVELS,
  MascotAction,
} from '../../config/mascotActions';

// ─── CourseReadiness type ─────────────────────────────────────────────────────
export interface CourseReadiness {
  has_clos: boolean;
  clo_count: number;
  has_chapters: boolean;
  chapter_count: number;
  chapters: { id: number; title: string }[];
  chapters_with_materials: number[];
  chapters_without_materials: number[];
  has_any_questions: boolean;
  question_count: number;
}

// ─── Pipeline step definition ──────────────────────────────────────────────────
interface PipelineStep {
  /** Action ID from registry, or null for a locked placeholder */
  actionId: string | null;
  /** Label shown when locked (no action) */
  lockedLabel?: string;
  lockedReason?: string;
  /** Evaluate visibility: show only when true */
  isAvailable: (r: CourseReadiness | null, hasSelected: boolean) => boolean;
  /** Always show (navigation actions, etc.) */
  alwaysShow?: boolean;
}

// ─── Icon resolver ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.FC<any>> = {
  BookOpen, FileText, HelpCircle, BarChart2, Settings, Upload, Zap: ZapIcon,
};
function ActionIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? ZapIcon;
  return <Icon size={size} />;
}

// ─── Badge color map ──────────────────────────────────────────────────────────
const BADGE_CLASS: Record<string, string> = {
  'Nhanh': 'exec-badge exec-badge--fast',
  'Cần cấu hình': 'exec-badge exec-badge--config',
  'Nâng cao': 'exec-badge exec-badge--advanced',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface WizardParams {
  [key: string]: any;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  navigateTo?: string;
}

interface Props {
  selectedCourse: any;
  /** Full course readiness snapshot — refreshed reactively */
  courseReadiness: CourseReadiness | null;
  readinessLoading?: boolean;
  /** course CLOs list – passed from parent */
  clos: { id: number; clo_code: string; description: string }[];
  isOffline: boolean;
  /** Called when action resolved — parent handles API call + SSE */
  onExecuteAction: (action: MascotAction, params: WizardParams) => void;
  onNavigateAction: (view: string, triggerEvent?: string) => void;
  /** Context from Mode 1 chat (for pre-filling wizard) */
  mascotContext?: { chapterId?: number; cloId?: number };
}

// ─── Pipeline layout: theo đúng thứ tự luồng công việc ───────────────────────
// Mỗi bước chỉ hiện khi điều kiện tiên quyết đã đủ.
// Navigation actions (Syllabus, Pedagogical) luôn hiện.
function buildPipelineSteps(
  readiness: CourseReadiness | null,
  hasCourse: boolean
): Array<{ action: MascotAction; show: boolean; isNav: boolean }> {
  const r = readiness;
  const hasClos = !!r?.has_clos;
  const hasChapters = !!r?.has_chapters;

  // Lấy action từ registry theo id
  const get = (id: string) => ACTION_REGISTRY.find(a => a.id === id)!;

  return [
    // ── Bước 0: Nạp Syllabus (luôn hiện — bước đầu tiên của pipeline) ──
    { action: get('open_syllabus'), show: true, isNav: true },

    // ── Bước 1: Cấu hình sư phạm (chỉ khi đã có Chapters — cấu hình để soạn bài giảng) ──
    { action: get('open_pedagogical'), show: hasChapters, isNav: true },

    // ── Bước 2: Xem Ma Trận CLO×Bloom (chỉ khi có CLOs) ──
    { action: get('open_matrix'), show: hasClos, isNav: true },

    // ── Bước 3: Soạn Storyboard (chỉ khi có CLOs + Chapters) ──
    { action: get('generate_storyboard'), show: hasClos && hasChapters, isNav: false },

    // ── Bước 4: Soạn Materials (chỉ khi có CLOs + Chapters) ──
    { action: get('generate_materials'), show: hasClos && hasChapters, isNav: false },

    // ── Bước 5: Tạo MCQ (chỉ khi có CLOs + Chapters) ──
    { action: get('generate_questions'), show: hasClos && hasChapters, isNav: false },

    // ── Bước 6: Autopilot (chỉ khi có CLOs + Chapters) ──
    { action: get('autopilot_storyboard'), show: hasClos && hasChapters, isNav: false },
  ].filter(s => s.action !== undefined);
}

// ─── Next step hint: hiển thị gợi ý bước tiếp theo ──────────────────────────
function getNextHint(readiness: CourseReadiness | null): string | null {
  if (!readiness) return null;
  if (!readiness.has_clos) return 'Nạp Syllabus để trích xuất CLOs — bước khởi đầu bắt buộc';
  if (!readiness.has_chapters) return 'Vào Roadmap để sinh Đề cương Chương học, sau đó ODIN sẽ mở khoá các bước tiếp theo';
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExecutionView({
  selectedCourse,
  courseReadiness,
  readinessLoading,
  clos,
  isOffline,
  onExecuteAction,
  onNavigateAction,
  mascotContext,
}: Props) {
  const chapters = courseReadiness?.chapters ?? [];

  const [selectedAction, setSelectedAction] = useState<MascotAction | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [params, setParams] = useState<WizardParams>({});

  // Pre-fill params from mascot context when action selected
  const handleSelectAction = (action: MascotAction) => {
    if (action.type === 'navigation') {
      onNavigateAction(action.navigateTo!, action.triggerEvent);
      return;
    }
    const preParams: WizardParams = {};
    if (mascotContext?.chapterId) preParams['chapter_id'] = mascotContext.chapterId;
    action.wizard.forEach(step => {
      if (step.default !== undefined && preParams[step.key] === undefined) {
        preParams[step.key] = step.default;
      }
    });
    setParams(preParams);
    setSelectedAction(action);
    setWizardStep(0);
  };

  const handleBack = () => {
    if (wizardStep > 0) setWizardStep(s => s - 1);
    else { setSelectedAction(null); setParams({}); setWizardStep(0); }
  };

  const handleNext = () => {
    if (!selectedAction) return;
    if (wizardStep < selectedAction.wizard.length) {
      setWizardStep(s => s + 1);
    }
  };

  const handleConfirm = () => {
    if (!selectedAction) return;
    onExecuteAction(selectedAction, params);
    setSelectedAction(null);
    setParams({});
    setWizardStep(0);
  };

  const currentStep = selectedAction ? selectedAction.wizard[wizardStep] : null;
  const isLastStep = selectedAction ? wizardStep >= selectedAction.wizard.length : false;
  const canProceed = useMemo(() => {
    if (!currentStep) return true;
    if (!currentStep.required) return true;
    const val = params[currentStep.key];
    if (Array.isArray(val)) return val.length > 0;
    return val !== undefined && val !== '' && val !== null;
  }, [currentStep, params]);

  // ── Wizard Mode ──────────────────────────────────────────
  if (selectedAction) {
    return (
      <div className="exec-wizard">
        {/* Step indicator */}
        <div className="exec-wizard-header">
          <div className="exec-wizard-title">
            <ActionIcon name={selectedAction.icon} size={15} />
            <span>{selectedAction.label}</span>
          </div>
          {selectedAction.wizard.length > 0 && (
            <div className="exec-wizard-steps">
              {selectedAction.wizard.map((_, i) => (
                <span
                  key={i}
                  className={`exec-wizard-dot ${i < wizardStep ? 'done' : i === wizardStep ? 'active' : 'pending'}`}
                />
              ))}
              <span className={`exec-wizard-dot ${isLastStep ? 'active' : 'pending'}`} title="Xác nhận" />
            </div>
          )}
        </div>

        {/* Step Form or Confirm Summary */}
        <div className="exec-wizard-body">
          {isLastStep ? (
            // Confirm step
            <div className="exec-wizard-confirm">
              <div className="exec-wizard-confirm-title">
                <Check size={14} /> Xác nhận thực thi
              </div>
              <div className="exec-wizard-confirm-params">
                {selectedAction.wizard.map(step => {
                  const val = params[step.key];
                  if (val === undefined || val === null || val === '') return null;
                  let display = String(val);
                  if (step.type === 'chapter_select') {
                    const ch = chapters.find(c => c.id === Number(val));
                    display = ch ? ch.title : display;
                  }
                  if (step.type === 'clo_multiselect' && Array.isArray(val)) {
                    display = val.map((id: number) => {
                      const clo = clos.find(c => c.id === id);
                      return clo ? clo.clo_code : id;
                    }).join(', ');
                  }
                  if (step.type === 'bloom_select') {
                    const b = BLOOM_LEVELS.find(b => b.value === Number(val));
                    display = b ? b.label : display;
                  }
                  return (
                    <div key={step.key} className="exec-confirm-row">
                      <span className="exec-confirm-label">{step.label}</span>
                      <span className="exec-confirm-value">{display}</span>
                    </div>
                  );
                })}
              </div>
              <p className="exec-wizard-confirm-desc">
                ODIN sẽ bắt đầu thực thi ngay sau khi Thầy/Cô xác nhận.
              </p>
            </div>
          ) : currentStep ? (
            // Step form
            <div className="exec-step-form">
              <label className="exec-step-label">
                {currentStep.label}
                {currentStep.required && <span className="exec-required">*</span>}
              </label>

              {/* chapter_select — lấy từ courseReadiness */}
              {currentStep.type === 'chapter_select' && (
                <select
                  className="exec-select"
                  value={params[currentStep.key] ?? ''}
                  onChange={e => setParams(p => ({ ...p, [currentStep.key]: Number(e.target.value) }))}
                >
                  <option value="">— Chọn chương —</option>
                  {chapters.length === 0 ? (
                    <option disabled value="">Chưa có chương học</option>
                  ) : chapters.map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </select>
              )}

              {/* clo_multiselect */}
              {currentStep.type === 'clo_multiselect' && (
                <div className="exec-clo-list">
                  {clos.length === 0 ? (
                    <p className="exec-empty-hint">Môn học chưa có CLO. Bỏ qua hoặc nạp Syllabus trước.</p>
                  ) : clos.map(clo => {
                    const selected: number[] = params[currentStep.key] ?? [];
                    const isChecked = selected.includes(clo.id);
                    return (
                      <label key={clo.id} className={`exec-clo-item ${isChecked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setParams(p => {
                              const prev: number[] = p[currentStep.key] ?? [];
                              const next = isChecked
                                ? prev.filter(id => id !== clo.id)
                                : [...prev, clo.id];
                              return { ...p, [currentStep.key]: next };
                            });
                          }}
                        />
                        <span className="exec-clo-code">{clo.clo_code}</span>
                        <span className="exec-clo-desc">{clo.description.slice(0, 40)}…</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* bloom_select */}
              {currentStep.type === 'bloom_select' && (
                <div className="exec-bloom-grid">
                  {BLOOM_LEVELS.map(b => {
                    const isSelected = params[currentStep.key] === b.value;
                    return (
                      <button
                        key={b.value}
                        className={`exec-bloom-btn ${isSelected ? 'selected' : ''}`}
                        onClick={() => setParams(p => ({ ...p, [currentStep.key]: b.value }))}
                      >
                        <span className="exec-bloom-num">B{b.value}</span>
                        <span className="exec-bloom-name">{b.label.split(' — ')[1]}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* number_input */}
              {currentStep.type === 'number_input' && (
                <div className="exec-number-row">
                  <button
                    className="exec-num-btn"
                    onClick={() => setParams(p => ({ ...p, [currentStep.key]: Math.max(currentStep.min ?? 1, (p[currentStep.key] ?? currentStep.default ?? 5) - 1) }))}
                  >−</button>
                  <span className="exec-num-val">{params[currentStep.key] ?? currentStep.default ?? 5}</span>
                  <button
                    className="exec-num-btn"
                    onClick={() => setParams(p => ({ ...p, [currentStep.key]: Math.min(currentStep.max ?? 30, (p[currentStep.key] ?? currentStep.default ?? 5) + 1) }))}
                  >+</button>
                  <span className="exec-num-unit">câu hỏi</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Wizard footer nav */}
        <div className="exec-wizard-footer">
          <button className="exec-btn-back" onClick={handleBack}>
            <ChevronLeft size={14} /> {wizardStep === 0 ? 'Quay lại' : 'Trước'}
          </button>
          {isLastStep ? (
            <button className="exec-btn-confirm" onClick={handleConfirm}>
              <Check size={14} /> Thực thi ngay
            </button>
          ) : (
            <button
              className="exec-btn-next"
              onClick={handleNext}
              disabled={!canProceed}
            >
              Tiếp theo <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Pipeline Action List Mode ─────────────────────────────
  const pipeline = buildPipelineSteps(courseReadiness, !!selectedCourse);
  const visibleSteps = pipeline.filter(s => s.show);
  const nextHint = getNextHint(courseReadiness);

  return (
    <div className="exec-view">
      {/* Readiness status chips */}
      {courseReadiness && selectedCourse && (
        <div className="exec-readiness-bar">
          <span className={`exec-readiness-chip ${courseReadiness.has_clos ? 'ok' : 'missing'}`}>
            CLOs: {courseReadiness.has_clos ? `${courseReadiness.clo_count} (đã lưu)` : '✕'}
          </span>
          <span className={`exec-readiness-chip ${courseReadiness.has_chapters ? 'ok' : 'missing'}`}>
            Chương: {courseReadiness.has_chapters ? courseReadiness.chapter_count : '✕'}
          </span>
          <span className={`exec-readiness-chip ${courseReadiness.has_any_questions ? 'ok' : 'neutral'}`}>
            MCQ: {courseReadiness.has_any_questions ? courseReadiness.question_count : '0'}
          </span>
          {readinessLoading && (
            <span className="exec-readiness-loading">
              <Loader2 size={10} className="animate-spin" />
            </span>
          )}
        </div>
      )}

      {!selectedCourse && (
        <div className="exec-no-course">
          <AlertCircle size={14} /> Vui lòng chọn một môn học trước khi thực thi
        </div>
      )}

      {/* Next step hint — chỉ hiện khi còn bước cần làm */}
      {selectedCourse && nextHint && (
        <div className="exec-next-hint">
          <ArrowRight size={12} />
          <span>{nextHint}</span>
        </div>
      )}

      {/* Pipeline action list — theo thứ tự luồng, chỉ hiện available */}
      {selectedCourse && (
        <div className="exec-pipeline-list">
          {visibleSteps.map(({ action, isNav }, idx) => (
            <button
              key={action.id}
              className={`exec-action-card ${isNav ? 'nav' : 'exec'}`}
              onClick={() => handleSelectAction(action)}
            >
              <span className="exec-card-icon">
                <ActionIcon name={action.icon} size={16} />
              </span>
              <span className="exec-card-content">
                <span className="exec-card-label">{action.label}</span>
                <span className="exec-card-desc">{action.description}</span>
              </span>
              <span className={BADGE_CLASS[action.badge] ?? 'exec-badge'}>
                {action.badge}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
