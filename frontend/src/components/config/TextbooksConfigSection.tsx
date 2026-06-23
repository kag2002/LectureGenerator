'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';

interface TextbooksConfigSectionProps {
  requiredTextbooks: string;
  setRequiredTextbooks: (text: string) => void;
  recommendedReadings: string;
  setRecommendedReadings: (text: string) => void;
  setIsDirty: (dirty: boolean) => void;
}

export default function TextbooksConfigSection({
  requiredTextbooks,
  setRequiredTextbooks,
  recommendedReadings,
  setRecommendedReadings,
  setIsDirty
}: TextbooksConfigSectionProps) {
  return (
    <div className="course-config-textbooks-container">
      <h4 className="course-config-section-title course-config-textbooks-title">
        <BookOpen size={16} className="course-config-textbooks-icon" /> Tài Liệu Tham Khảo Môn Học (Tự Động Trích Xuất)
      </h4>
      <div className="course-config-textbooks-fields">
        <div>
          <label className="course-config-textbooks-label">
            Giáo trình bắt buộc (Required Textbooks)
          </label>
          <textarea
            value={requiredTextbooks}
            onChange={(e) => {
              setRequiredTextbooks(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Ví dụ: Cấu trúc dữ liệu & Giải thuật - Nguyễn Văn A - NXB Đại Học Quốc Gia"
            className="course-config-textarea course-config-textbooks-textarea"
          />
        </div>
        <div>
          <label className="course-config-textbooks-label">
            Tài liệu đọc thêm (Recommended Readings)
          </label>
          <textarea
            value={recommendedReadings}
            onChange={(e) => {
              setRecommendedReadings(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Ví dụ: Introduction to Algorithms - Cormen et al."
            className="course-config-textarea course-config-textbooks-textarea"
          />
        </div>
      </div>
    </div>
  );
}
