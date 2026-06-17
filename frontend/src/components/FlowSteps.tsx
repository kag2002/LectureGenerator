import React from 'react';
import { ClipboardList, Library, BookOpen, HelpCircle, BarChart2, Check, ChevronRight } from 'lucide-react';

const STEPS = [
  { id: 'syllabus', label: 'Cấu hình CLOs', view: 'course_config', icon: <ClipboardList size={14} aria-hidden="true" /> },
  { id: 'rag', label: 'Thư viện RAG', view: 'knowledge_base', icon: <Library size={14} aria-hidden="true" /> },
  { id: 'slides', label: 'Soạn Bài giảng', view: 'lesson_planner', icon: <BookOpen size={14} aria-hidden="true" /> },
  { id: 'questions', label: 'Ngân hàng Đề thi', view: 'question_bank', icon: <HelpCircle size={14} aria-hidden="true" /> },
  { id: 'matrix', label: 'Ma trận Bloom', view: 'matrix_dashboard', icon: <BarChart2 size={14} aria-hidden="true" /> }
];

export interface FlowStepsProps {
  activeStep: 'syllabus' | 'rag' | 'slides' | 'questions' | 'matrix' | null | string;
  onNavigate: (view: string) => void;
}

export default function FlowSteps({ activeStep, onNavigate }: FlowStepsProps) {
  const activeIdx = STEPS.findIndex(s => s.id === activeStep);

  return (
    <div className="flow-steps-container">
      {STEPS.map((step, idx) => {
        const isActive = step.id === activeStep;
        const isPast = activeIdx > idx;
        
        return (
          <React.Fragment key={step.id}>
            <div 
              onClick={() => onNavigate(step.view)}
              className={`flow-step-item ${isActive ? 'active' : (isPast ? 'past' : 'future')}`}
              title={`Chuyển nhanh sang: ${step.label}`}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>{step.icon}</span>
              <span className="flow-step-label">{step.label}</span>
              {isPast && (
                <span className="flow-step-check-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={10} aria-hidden="true" />
                </span>
              )}
            </div>
            {idx < STEPS.length - 1 && (
              <span className={`flow-step-arrow ${isPast ? 'past' : 'future'}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <ChevronRight size={12} aria-hidden="true" />
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
