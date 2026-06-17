import React from 'react';
import { Copy, Edit3, Trash2, Sparkles } from 'lucide-react';
import { CLO, Question } from '@/types';

export interface QuestionCardProps {
  q: Question;
  index: number;
  clos: CLO[];
  handleGenerateIsomorphic: (id: number) => void;
  handleEditClick: (q: Question) => void;
  handleDeleteQuestion: (id: number) => void;
  getBloomText: (level: number) => string;
}

export default function QuestionCard({
  q,
  index,
  clos,
  handleGenerateIsomorphic,
  handleEditClick,
  handleDeleteQuestion,
  getBloomText
}: QuestionCardProps) {
  let opts: string[] = [];
  if (q.options_json) {
    try {
      opts = JSON.parse(q.options_json);
    } catch(e) {
      opts = [];
    }
  }
  const linkedClo = clos.find(c => c.id === q.clo_id);
  const isAutopilot = q.created_by === 'odin_autopilot';
  
  return (
    <div 
      className="qb-question-card"
      style={isAutopilot ? {
        border: '2px dashed var(--vinuni-gold)',
        position: 'relative',
        boxShadow: '0 2px 8px rgba(212, 163, 89, 0.15)'
      } : undefined}
    >
      {isAutopilot && (
        <div style={{
          position: 'absolute',
          top: '-10px',
          right: '12px',
          background: 'var(--vinuni-gold)',
          color: '#000',
          fontSize: '9px',
          fontWeight: '800',
          padding: '2px 6px',
          borderRadius: '3px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <Sparkles size={8} />
          AI Autopilot
        </div>
      )}
      <div className="qb-question-card-header">
        <div className="qb-question-card-meta">
          <span className="qb-idx-badge">Câu {index + 1}</span>
          <span className="qb-bloom-tag">{getBloomText(q.bloom_level)}</span>
          {linkedClo && (
            <span className="qb-clo-tag">
              [{linkedClo.code}] {linkedClo.description.substring(0, 40)}…
            </span>
          )}
        </div>
        <div className="qb-action-buttons">
          <button 
            onClick={() => q.id && handleGenerateIsomorphic(q.id)}
            className="qb-action-btn-iso"
            title="Sinh câu hỏi tương tự đồng cấu"
          >
            <Copy size={13} aria-hidden="true" /> Clone
          </button>
          <button 
            onClick={() => handleEditClick(q)}
            className="qb-action-btn-edit"
          >
            <Edit3 size={13} aria-hidden="true" /> Sửa
          </button>
          <button 
            onClick={() => q.id && handleDeleteQuestion(q.id)}
            className="qb-action-btn-del"
          >
            <Trash2 size={13} aria-hidden="true" /> Xóa
          </button>
        </div>
      </div>

      <div className="qb-question-text">
        <strong>{q.question_text}</strong>
      </div>

      <div className="qb-options-grid">
        {opts.map((opt, oIdx) => {
          const isCorrect = opt === q.correct_answer;
          return (
            <div 
              key={oIdx} 
              className={isCorrect ? "qb-option-item-correct" : "qb-option-item"}
            >
              <span className={isCorrect ? "qb-option-label-correct" : "qb-option-label"}>
                {String.fromCharCode(65 + oIdx)}
              </span>
              <span>{opt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

