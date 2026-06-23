'use client';

import React from 'react';
import { CLO } from '@/types';
import { Plus, Trash2, CheckCircle } from 'lucide-react';

interface CLOMatrixMapperProps {
  clos: CLO[];
  handleAddRow: () => void;
  handleRemoveRow: (index: number) => void;
  handleFieldChange: (index: number, field: keyof CLO, value: any) => void;
  handleSaveClos: () => Promise<void>;
  loading: boolean;
  saving: boolean;
  isDirty: boolean;
}

export default function CLOMatrixMapper({
  clos,
  handleAddRow,
  handleRemoveRow,
  handleFieldChange,
  handleSaveClos,
  loading,
  saving,
  isDirty
}: CLOMatrixMapperProps) {
  return (
    <>
      <div className="course-config-section-header">
        <h3 className="course-config-section-title">Ma Trận Chuẩn Đầu Ra (CLOs)</h3>
        <button onClick={handleAddRow} className="course-config-add-btn">
          <Plus size={14} /> Thêm CLO
        </button>
      </div>

      {clos.length === 0 && !loading ? (
        <div className="course-config-empty-state">
          <p>Chưa cấu hình Chuẩn đầu ra môn học.</p>
          <p className="course-config-empty-desc">Hãy upload Syllabus ở bên trái để AI tự động trích xuất.</p>

          {isDirty && (
            <div className="course-config-save-container" style={{ borderTop: 'none', paddingTop: 0, justifyContent: 'center', marginBottom: '20px' }}>
              <button onClick={handleSaveClos} disabled={saving} className="course-config-save-btn">
                {saving ? 'Đang lưu...' : (
                  <span className="course-config-inline-flex">
                    <CheckCircle size={16} /> Lưu & Đồng bộ CLOs
                  </span>
                )}
              </button>
            </div>
          )}

          <div className="empty-suggestions-box">
            <div className="empty-suggestions-title">
              <span>💡 Hướng dẫn & Gợi ý thực hiện:</span>
            </div>
            <ul className="empty-suggestions-list">
              <li className="empty-suggestions-item">Tải lên file đề cương môn học (Syllabus) dạng PDF, DOCX, TXT bằng cách kéo thả hoặc click chọn file trong khung <strong>"Nạp Tri Thức Đề Cương"</strong> bên trái.</li>
              <li className="empty-suggestions-item">Hoặc chọn tab <strong>"Dán Văn Bản Thô"</strong> để dán trực tiếp nội dung đề cương môn học.</li>
              <li className="empty-suggestions-item">Bấm <strong>"Bắt đầu phân tích Syllabus (AI)"</strong> để hệ thống tự động sinh chuẩn đầu ra CLOs & mức Bloom.</li>
              <li className="empty-suggestions-item">Bạn cũng có thể tự thêm thủ công bằng cách click nút <strong>"Thêm CLO"</strong> ở phía trên bên phải.</li>
            </ul>
          </div>
        </div>
      ) : clos.length === 0 && loading ? (
        <div className="course-config-loading-state">
          <div className="course-config-spinner" />
          <p className="course-config-loading-desc">AI đang khởi động phân tích đề cương...</p>
        </div>
      ) : (
        <div className="course-config-list">
          <div className="course-config-rows-container">
            {clos.map((clo, index) => (
              <div key={clo.id || index} className="course-config-row">
                <input
                  type="text"
                  value={clo.clo_code || clo.code || ''}
                  onChange={(e) => handleFieldChange(index, 'clo_code', e.target.value)}
                  className="course-config-clo-code-input"
                  placeholder="Mã CLO"
                  required
                />
                <input
                  type="text"
                  value={clo.description}
                  onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                  className="course-config-clo-desc-input"
                  placeholder="Mô tả chuẩn đầu ra môn học (động từ hành động Bloom)"
                  required
                />
                <select
                  value={clo.bloom_level}
                  onChange={(e) => handleFieldChange(index, 'bloom_level', parseInt(e.target.value))}
                  className="course-config-bloom-select"
                >
                  <option value={1}>Nhớ (B1)</option>
                  <option value={2}>Hiểu (B2)</option>
                  <option value={3}>Vận dụng (B3)</option>
                  <option value={4}>Phân tích (B4)</option>
                  <option value={5}>Đánh giá (B5)</option>
                  <option value={6}>Sáng tạo (B6)</option>
                </select>
                <button
                  onClick={() => handleRemoveRow(index)}
                  className="course-config-row-delete-btn"
                  title="Xóa CLO"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="course-config-save-container">
            <button onClick={handleSaveClos} disabled={saving} className="course-config-save-btn">
              {saving ? 'Đang lưu...' : (
                <span className="course-config-inline-flex">
                  <CheckCircle size={16} /> Lưu & Đồng bộ CLOs
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
