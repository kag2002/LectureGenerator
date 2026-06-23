'use client';

import React from 'react';
import { Course } from '@/types';
import { Sparkles, RefreshCw, FileText, Copy } from 'lucide-react';

interface AISyllabusGeneratorTabProps {
  course: Course;
  aiCourseName: string;
  setAiCourseName: (val: string) => void;
  aiCourseCode: string;
  setAiCourseCode: (val: string) => void;
  aiDescription: string;
  setAiDescription: (val: string) => void;
  aiAudience: string;
  setAiAudience: (val: string) => void;
  aiDuration: number;
  setAiDuration: (val: number) => void;
  aiFocus: string;
  setAiFocus: (val: string) => void;
  aiLanguage: string;
  setAiLanguage: (val: string) => void;
  generatingSyllabus: boolean;
  generatedSyllabus: string;
  handleGenerateSyllabus: (e: React.FormEvent) => Promise<void>;
  handleUseGeneratedSyllabus: (parseImmediately: boolean) => void;
}

export default function AISyllabusGeneratorTab({
  course,
  aiCourseName,
  setAiCourseName,
  aiCourseCode,
  setAiCourseCode,
  aiDescription,
  setAiDescription,
  aiAudience,
  setAiAudience,
  aiDuration,
  setAiDuration,
  aiFocus,
  setAiFocus,
  aiLanguage,
  setAiLanguage,
  generatingSyllabus,
  generatedSyllabus,
  handleGenerateSyllabus,
  handleUseGeneratedSyllabus
}: AISyllabusGeneratorTabProps) {
  return (
    <div className="course-config-ai-form-container">
      <form onSubmit={handleGenerateSyllabus} className="course-config-ai-form">
        <div className="course-config-form-group">
          <label>Tên môn học</label>
          <input
            type="text"
            value={aiCourseName}
            onChange={(e) => setAiCourseName(e.target.value)}
            className="course-config-input"
            placeholder="Ví dụ: Lập trình Web nâng cao"
            required
          />
        </div>

        <div className="course-config-form-row">
          <div className="course-config-form-group">
            <label>Mã môn học</label>
            <input
              type="text"
              value={aiCourseCode}
              onChange={(e) => setAiCourseCode(e.target.value)}
              className="course-config-input"
              placeholder="Ví dụ: COMP3040"
            />
          </div>
          <div className="course-config-form-group">
            <label>Thời lượng (Tuần)</label>
            <select
              value={aiDuration}
              onChange={(e) => setAiDuration(parseInt(e.target.value))}
              className="course-config-input"
            >
              <option value={6}>6 tuần (Ngắn hạn)</option>
              <option value={10}>10 tuần (Kỳ phụ)</option>
              <option value={15}>15 tuần (Kỳ chuẩn)</option>
              <option value={20}>20 tuần</option>
            </select>
          </div>
        </div>

        <div className="course-config-form-row">
          <div className="course-config-form-group">
            <label>Trình độ / Đối tượng</label>
            <select
              value={aiAudience}
              onChange={(e) => setAiAudience(e.target.value)}
              className="course-config-input"
            >
              <option value="Undergraduate">Đại học (Undergrad)</option>
              <option value="Graduate">Sau đại học (Postgrad)</option>
              <option value="K12">Phổ thông (K-12)</option>
              <option value="Professional">Đào tạo nghề / Chuyên gia</option>
            </select>
          </div>
          <div className="course-config-form-group">
            <label>Ngôn ngữ</label>
            <select
              value={aiLanguage}
              onChange={(e) => setAiLanguage(e.target.value)}
              className="course-config-input"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">Tiếng Anh</option>
            </select>
          </div>
        </div>

        <div className="course-config-form-group">
          <label>Mô tả & Mục tiêu môn học</label>
          <textarea
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            className="course-config-textarea"
            placeholder="Mô tả tóm tắt nội dung môn học, các kiến thức cốt lõi sẽ truyền đạt cho sinh viên..."
            rows={4}
          />
        </div>

        <div className="course-config-form-group">
          <label>
            Định hướng Chuẩn đầu ra (CLO)
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Tùy chọn)</span>
          </label>
          <input
            type="text"
            value={aiFocus}
            onChange={(e) => setAiFocus(e.target.value)}
            className="course-config-input"
            placeholder="Ví dụ: Thiết kế cơ sở dữ liệu, tối ưu SQL, bảo mật Web..."
          />
        </div>

        <button type="submit" disabled={generatingSyllabus} className="course-config-spark-btn">
          {generatingSyllabus ? (
            <>
              <RefreshCw size={16} className="animate-spin" /> Đang soạn thảo...
            </>
          ) : (
            <>
              <Sparkles size={16} /> Tạo Đề Cương Bằng AI
            </>
          )}
        </button>
      </form>

      {(generatedSyllabus || generatingSyllabus) && (
        <div className="course-config-ai-preview-card">
          <div className="course-config-ai-preview-header">
            <span className="course-config-ai-preview-title">
              <FileText size={16} /> Kết quả đề cương được sinh:
            </span>
            {generatingSyllabus && <span className="course-config-pulse-dot" />}
          </div>
          <div className="course-config-ai-preview-body">
            {generatedSyllabus || "Đang chuẩn bị sinh nội dung..."}
          </div>
          
          {!generatingSyllabus && generatedSyllabus && (
            <div className="course-config-ai-preview-actions">
              <button
                onClick={() => handleUseGeneratedSyllabus(true)}
                className="course-config-action-btn course-config-action-btn-primary"
              >
                <Sparkles size={14} /> ⚡ Bóc tách CLO & Bloom ngay
              </button>
              <button
                onClick={() => handleUseGeneratedSyllabus(false)}
                className="course-config-action-btn"
              >
                <Copy size={14} /> Chuyển sang ô dán văn bản
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
