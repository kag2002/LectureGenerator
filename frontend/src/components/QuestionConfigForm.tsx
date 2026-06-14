import React from 'react';
import { 
  Zap, Search, Layers, Presentation, Activity, Shield, Save, Check, Loader2, Sparkles, AlertTriangle 
} from 'lucide-react';

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
import { CLO, Chapter } from '@/types';

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
}

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
  setIsFastMode
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

          {generating && (
            <div className="qb-gen-log-box" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getLogIcon(3, genLog)}
              <span className="qb-log-text">{cleanLogText(genLog)}</span>
            </div>
          )}
        </form>
      </section>

    </aside>
  );
}

