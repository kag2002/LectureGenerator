import React, { useState, useEffect } from 'react';
import { Check, Settings, Info, BookOpen, Laptop, MessageSquare, Users, Award } from 'lucide-react';

export interface PedagogicalConfigModalProps {
  showConfigModal: boolean;
  setShowConfigModal: (show: boolean) => void;
  classSize: number;
  setClassSize: (size: number) => void;
  hasWifi: boolean;
  setHasWifi: (wifi: boolean) => void;
  furnitureType: string;
  setFurnitureType: (type: string) => void;
  sessionDuration: number;
  setSessionDuration: (duration: number) => void;
  clos: any[];
  selectedClos: string[];
  setSelectedClos: (clos: string[]) => void;
  pedagogicalStyle: string;
  setPedagogicalStyle: (style: string) => void;
  learnerLevel: string;
  setLearnerLevel: (level: string) => void;
  handleGenerateMaterials: () => void;
}

const STYLES = [
  { id: 'interactive', name: 'Tương tác (Interactive)', desc: 'Thuyết giảng kết hợp tương tác ngắn' },
  { id: 'lab', name: 'Thực hành (Hands-on Lab)', desc: 'Hướng dẫn cài đặt & bài tập thực hành' },
  { id: 'case', name: 'Tình huống (Case-based)', desc: 'Dẫn dắt phân tích tình huống thực tế' },
  { id: 'flipped', name: 'Lớp học đảo ngược (Flipped)', desc: 'Dành cho SV đã tự chuẩn bị trước' },
  { id: 'presentation', name: 'Báo cáo & Đánh giá (Presentation)', desc: 'SV thuyết trình & nhận xét chéo' }
];

const LEVELS = [
  { id: 'beginner', label: 'Cơ bản (Beginner)' },
  { id: 'intermediate', label: 'Cân bằng (Intermediate)' },
  { id: 'advanced', label: 'Nâng cao (Advanced)' }
];

export default function PedagogicalConfigModal({
  showConfigModal,
  setShowConfigModal,
  classSize,
  setClassSize,
  hasWifi,
  setHasWifi,
  furnitureType,
  setFurnitureType,
  sessionDuration,
  setSessionDuration,
  clos,
  selectedClos,
  setSelectedClos,
  pedagogicalStyle,
  setPedagogicalStyle,
  learnerLevel,
  setLearnerLevel,
  handleGenerateMaterials
}: PedagogicalConfigModalProps) {
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Load defaults from localStorage if exists
  useEffect(() => {
    if (showConfigModal) {
      try {
        const stored = localStorage.getItem('vinuni_class_defaults');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.classSize !== undefined) setClassSize(parsed.classSize);
          if (parsed.hasWifi !== undefined) setHasWifi(parsed.hasWifi);
          if (parsed.furnitureType !== undefined) setFurnitureType(parsed.furnitureType);
          if (parsed.sessionDuration !== undefined) setSessionDuration(parsed.sessionDuration);
        }
      } catch (e) {
        console.warn("Failed to load class defaults from localStorage", e);
      }
    }
  }, [showConfigModal, setClassSize, setHasWifi, setFurnitureType, setSessionDuration]);

  if (!showConfigModal) return null;

  const handleConfirm = () => {
    if (saveAsDefault) {
      try {
        localStorage.setItem('vinuni_class_defaults', JSON.stringify({
          classSize,
          hasWifi,
          furnitureType,
          sessionDuration
        }));
      } catch (e) {
        console.warn("Failed to save class defaults to localStorage", e);
      }
    }
    handleGenerateMaterials();
    setShowConfigModal(false);
  };

  return (
    <div className="planner-modal-overlay">
      <div className="planner-modal-card" style={{ maxWidth: '820px', width: '90%', maxHeight: '95vh', overflowY: 'auto', padding: '24px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '8px' }}>
          <Settings size={22} style={{ color: 'var(--vinuni-gold)' }} />
          <h3 className="planner-modal-title" style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Cấu hình Sư phạm Lớp học</h3>
        </div>

        {/* Body Grid with 2 Columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '24px',
          marginTop: '10px'
        }}>
          
          {/* CỘT 1: ĐỊNH HƯỚNG SƯ PHẠM */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: 800, color: 'var(--vinuni-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🎯 Định hướng Sư phạm
            </h4>

            {/* Chọn CLO */}
            <div className="planner-modal-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="planner-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Chuẩn đầu ra trọng tâm (CLOs Focus)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (clos) {
                        setSelectedClos(clos.map(c => c.clo_code));
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--vinuni-gold)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Chọn tất cả
                  </button>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedClos([])}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>
              <p style={{ margin: '2px 0 8px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                AI sẽ tập trung thiết kế các slide bài giảng và hoạt động tương tác bám sát các CLO được tích chọn.
              </p>
              <div className="planner-modal-clos-list" style={{
                maxHeight: '130px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {clos && clos.length > 0 ? (
                  clos.map((clo) => {
                    const isChecked = selectedClos.includes(clo.clo_code);
                    return (
                      <label key={clo.id} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        fontSize: '12.5px',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '6px',
                        lineHeight: '1.4',
                        background: isChecked ? 'rgba(197, 168, 128, 0.05)' : 'transparent',
                        transition: 'background 0.2s'
                      }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedClos(selectedClos.filter(code => code !== clo.clo_code));
                            } else {
                              setSelectedClos([...selectedClos, clo.clo_code]);
                            }
                          }}
                          style={{ marginTop: '3px', accentColor: 'var(--vinuni-gold)', cursor: 'pointer' }}
                        />
                        <div>
                          <strong style={{ color: 'var(--vinuni-gold)' }}>[{clo.clo_code}]</strong> {clo.description}
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px', textAlign: 'center' }}>
                    Không tìm thấy CLO nào trong syllabus. AI sẽ tự động định hướng.
                  </div>
                )}
              </div>
            </div>

            {/* Phương pháp giảng dạy (Cards Grid) */}
            <div className="planner-modal-field">
              <label className="planner-modal-label">Phương pháp giảng dạy chủ đạo:</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                marginTop: '4px'
              }}>
                {STYLES.map((style) => {
                  const isSelected = pedagogicalStyle === style.id;
                  let IconComponent = BookOpen;
                  if (style.id === 'lab') IconComponent = Laptop;
                  else if (style.id === 'case') IconComponent = MessageSquare;
                  else if (style.id === 'flipped') IconComponent = Users;
                  else if (style.id === 'presentation') IconComponent = Award;

                  return (
                    <div
                      key={style.id}
                      onClick={() => setPedagogicalStyle(style.id)}
                      style={{
                        border: isSelected ? '2px solid var(--vinuni-gold)' : '1px solid var(--border-color)',
                        background: isSelected ? 'var(--accent-light, rgba(197, 168, 128, 0.08))' : 'var(--bg-tertiary)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        position: 'relative',
                        justifyContent: 'space-between',
                        minHeight: '82px',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <IconComponent size={16} style={{ color: isSelected ? 'var(--vinuni-gold)' : 'var(--text-muted)' }} />
                        {isSelected && <Check size={14} style={{ color: 'var(--vinuni-gold)', fontWeight: 'bold' }} />}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-primary)' }}>{style.name.split(' (')[0]}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.2' }}>{style.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trình độ người học */}
            <div className="planner-modal-field">
              <label className="planner-modal-label">Đặc điểm người học:</label>
              <div style={{
                display: 'flex',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '3px',
                gap: '3px'
              }}>
                {LEVELS.map((level) => {
                  const isSelected = learnerLevel === level.id;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setLearnerLevel(level.id)}
                      style={{
                        flex: 1,
                        background: isSelected ? 'var(--vinuni-navy)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: isSelected ? '#ffffff' : 'var(--text-muted)',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {level.label.split(' (')[0]}
                    </button>
                  );
                })}
              </div>
              
              {/* Dynamic Level description helper text */}
              <div style={{
                marginTop: '6px',
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderLeft: '3px solid var(--vinuni-gold)',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                lineHeight: '1.4',
                fontStyle: 'italic'
              }}>
                {learnerLevel === 'beginner' && "💡 AI sẽ tập trung giải nghĩa định nghĩa, thuật ngữ cơ bản kèm các ví dụ thực tế trực quan minh họa sinh động."}
                {learnerLevel === 'intermediate' && "💡 AI sử dụng thuật ngữ chuyên ngành tiêu chuẩn, diễn đạt súc tích, cân bằng giữa lý thuyết và ứng dụng thực hành."}
                {learnerLevel === 'advanced' && "💡 AI đi sâu vào kiến trúc hệ thống, bài toán tối ưu hóa thuật toán nâng cao, tradeoff thực tế và các câu hỏi tư duy phản biện."}
              </div>
            </div>
          </div>

          {/* CỘT 2: BỐI CẢNH LỚP HỌC THỰC TẾ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: 800, color: 'var(--vinuni-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🏫 Bối cảnh Lớp học thực tế
              </h4>

              <div className="planner-modal-field">
                <label className="planner-modal-label">Thời lượng tiết dạy:</label>
                <select
                  value={sessionDuration}
                  onChange={(e) => setSessionDuration(parseInt(e.target.value))}
                  className="planner-modal-select"
                  style={{ height: '42px', padding: '8px 12px' }}
                >
                  <option value={50}>50 phút (Tiết đơn)</option>
                  <option value={90}>90 phút (VinUni Block)</option>
                  <option value={120}>120 phút (Tiết đôi nâng cao)</option>
                  <option value={180}>180 phút (Seminars / Thực hành)</option>
                </select>
              </div>

              <div className="planner-modal-field">
                <label className="planner-modal-label">Sĩ số lớp (Sinh viên):</label>
                <input
                  type="number"
                  value={classSize}
                  onChange={(e) => setClassSize(parseInt(e.target.value))}
                  className="planner-modal-input"
                  style={{ height: '42px', padding: '8px 12px', boxSizing: 'border-box' }}
                />
              </div>

              <div className="planner-modal-field">
                <label className="planner-modal-label">Mạng Wifi lớp học:</label>
                <select
                  value={hasWifi ? 'yes' : 'no'}
                  onChange={(e) => setHasWifi(e.target.value === 'yes')}
                  className="planner-modal-select"
                  style={{ height: '42px', padding: '8px 12px' }}
                >
                  <option value="yes">Có Wifi kết nối</option>
                  <option value="no">Không có Wifi</option>
                </select>
              </div>

              <div className="planner-modal-field">
                <label className="planner-modal-label">Cách bố trí bàn ghế:</label>
                <select
                  value={furnitureType}
                  onChange={(e) => setFurnitureType(e.target.value)}
                  className="planner-modal-select"
                  style={{ height: '42px', padding: '8px 12px' }}
                >
                  <option value="movable">Di động (Movable - dễ xếp nhóm)</option>
                  <option value="fixed">Cố định (Fixed - chỉ thảo luận tại chỗ)</option>
                </select>
              </div>
            </div>

            {/* Checkbox Save Defaults */}
            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              marginTop: '10px'
            }} onClick={() => setSaveAsDefault(!saveAsDefault)}>
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: 'var(--vinuni-gold)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, userSelect: 'none' }}>
                Lưu bối cảnh lớp học này làm mặc định cho các chương khác
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="planner-modal-actions" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
          <button onClick={() => setShowConfigModal(false)} className="planner-modal-cancel-btn">Hủy</button>
          <button 
            onClick={handleConfirm} 
            className="planner-modal-confirm-btn"
          >
            Bắt đầu sinh học liệu
          </button>
        </div>
      </div>
    </div>
  );
}
