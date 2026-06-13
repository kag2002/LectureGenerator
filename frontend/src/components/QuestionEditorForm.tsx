import React from 'react';
import { Plus, Edit3 } from 'lucide-react';
import { CLO } from '@/types';

export interface EditingQuestionType {
  id: number | 'new';
  question_text: string;
  options: string[];
  correct_answer: string;
  bloom_level: number;
  clo_id: number | null;
}

export interface QuestionEditorFormProps {
  editingQuestion: EditingQuestionType | null;
  setEditingQuestion: (q: EditingQuestionType | null) => void;
  clos: CLO[];
  handleUpdateQuestion: (e: React.FormEvent) => void;
}

export default function QuestionEditorForm({
  editingQuestion,
  setEditingQuestion,
  clos,
  handleUpdateQuestion
}: QuestionEditorFormProps) {
  if (!editingQuestion) return null;

  return (
    <section className="qb-editor-card">
      <h3 className="qb-editor-title">
        {editingQuestion.id === 'new' ? (
          <>
            <Plus size={16} aria-hidden="true" /> Thêm Câu Hỏi Mới
          </>
        ) : (
          <>
            <Edit3 size={16} aria-hidden="true" /> Chỉnh sửa Câu hỏi
          </>
        )}
      </h3>
      <form onSubmit={handleUpdateQuestion} className="qb-form">
        <div className="qb-form-group">
          <label className="qb-label">Nội dung câu hỏi</label>
          <textarea
            value={editingQuestion.question_text}
            onChange={(e) => setEditingQuestion({...editingQuestion, question_text: e.target.value})}
            className="qb-textarea"
            rows={3}
            required
          />
        </div>

        <div className="qb-form-row">
          <div className="qb-form-group">
            <label className="qb-label">Lựa chọn A</label>
            <input
              type="text"
              value={editingQuestion.options[0] || ''}
              onChange={(e) => {
                const newOpts = [...editingQuestion.options];
                newOpts[0] = e.target.value;
                setEditingQuestion({...editingQuestion, options: newOpts});
              }}
              className="qb-input"
              required
            />
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Lựa chọn B</label>
            <input
              type="text"
              value={editingQuestion.options[1] || ''}
              onChange={(e) => {
                const newOpts = [...editingQuestion.options];
                newOpts[1] = e.target.value;
                setEditingQuestion({...editingQuestion, options: newOpts});
              }}
              className="qb-input"
              required
            />
          </div>
        </div>

        <div className="qb-form-row">
          <div className="qb-form-group">
            <label className="qb-label">Lựa chọn C</label>
            <input
              type="text"
              value={editingQuestion.options[2] || ''}
              onChange={(e) => {
                const newOpts = [...editingQuestion.options];
                newOpts[2] = e.target.value;
                setEditingQuestion({...editingQuestion, options: newOpts});
              }}
              className="qb-input"
              required
            />
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Lựa chọn D</label>
            <input
              type="text"
              value={editingQuestion.options[3] || ''}
              onChange={(e) => {
                const newOpts = [...editingQuestion.options];
                newOpts[3] = e.target.value;
                setEditingQuestion({...editingQuestion, options: newOpts});
              }}
              className="qb-input"
              required
            />
          </div>
        </div>

        <div className="qb-form-row">
          <div className="qb-form-group">
            <label className="qb-label">Đáp án đúng (chọn trùng khớp)</label>
            <select
              value={editingQuestion.correct_answer}
              onChange={(e) => setEditingQuestion({...editingQuestion, correct_answer: e.target.value})}
              className="qb-select"
            >
              {editingQuestion.options.map((opt, i) => (
                <option key={i} value={opt}>{opt || `Lựa chọn ${String.fromCharCode(65 + i)}`}</option>
              ))}
            </select>
          </div>
          <div className="qb-form-group">
            <label className="qb-label">Mức Bloom</label>
            <select
              value={editingQuestion.bloom_level}
              onChange={(e) => setEditingQuestion({...editingQuestion, bloom_level: parseInt(e.target.value)})}
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
        </div>

        <div className="qb-form-group">
          <label className="qb-label">Chuẩn đầu ra (CLO)</label>
          <select
            value={editingQuestion.clo_id || ''}
            onChange={(e) => setEditingQuestion({...editingQuestion, clo_id: e.target.value ? parseInt(e.target.value) : null})}
            className="qb-select"
          >
            <option value="">Không liên kết</option>
            {clos.map(c => (
              <option key={c.id} value={c.id}>[{c.clo_code || c.code || ''}] {c.description}</option>
            ))}
          </select>
        </div>

        <div className="qb-editor-action-row">
          <button type="submit" className="qb-save-editor-btn">{editingQuestion.id === 'new' ? 'Tạo câu hỏi' : 'Lưu cập nhật'}</button>
          <button type="button" onClick={() => setEditingQuestion(null)} className="qb-cancel-editor-btn">Hủy</button>
        </div>
      </form>
    </section>
  );
}

