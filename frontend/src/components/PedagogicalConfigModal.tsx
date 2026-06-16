import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Check, Settings, Info, BookOpen, Laptop, MessageSquare, Users, Award,
  GraduationCap, School, Sparkles, Wifi, WifiOff, Move, Lock, Clock, User, ArrowRight
} from 'lucide-react';

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

  const modalContent = (
    <div className="planner-modal-overlay">
      <div className="planner-modal-card" style={{ maxWidth: '840px', width: '95%', maxHeight: '92vh', overflowY: 'auto', padding: '28px', borderRadius: '16px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '12px' }}>
          <Settings size={22} style={{ color: 'var(--vinuni-gold)' }} />
          <h3 className="planner-modal-title" style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Cấu hình Sư phạm Lớp học</h3>
        </div>

        {/* Body Grid with 2 Columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '28px',
          marginTop: '10px'
        }}>
          
          {/* CỘT 1: ĐỊNH HƯỚNG SƯ PHẠM */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 800, color: 'var(--vinuni-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GraduationCap size={18} style={{ color: 'var(--vinuni-gold)' }} />
              Định hướng Sư phạm
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
              <p style={{ margin: '2px 0 8px 0', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                AI sẽ thiết kế bài giảng bám sát các CLO được chọn. <strong>Để trống hoặc chọn tất cả</strong> để tự động bao phủ toàn diện mọi chuẩn đầu ra trong chương.
              </p>
              <div className="planner-modal-clos-list custom-scrollbar" style={{
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
                        padding: '8px',
                        borderRadius: '6px',
                        lineHeight: '1.4',
                        background: isChecked ? 'rgba(197, 168, 128, 0.05)' : 'transparent',
                        border: isChecked ? '1px solid rgba(197, 168, 128, 0.2)' : '1px solid transparent',
                        transition: 'all 0.2s ease'
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
                gap: '10px',
                marginTop: '4px'
              }}>
                {STYLES.map((style, idx) => {
                  const isSelected = pedagogicalStyle === style.id;
                  const isLastItem = idx === STYLES.length - 1;
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
                        padding: '12px 14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        position: 'relative',
                        justifyContent: 'space-between',
                        minHeight: '86px',
                        boxSizing: 'border-box',
                        gridColumn: isLastItem ? 'span 2' : 'auto',
                        boxShadow: isSelected ? '0 4px 12px rgba(197, 168, 128, 0.12)' : 'none'
                      }}
                      className="pedagogical-style-card"
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
          </div>

          {/* CỘT 2: BỐI CẢNH LỚP HỌC THỰC TẾ & NGƯỜI HỌC */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 800, color: 'var(--vinuni-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <School size={18} style={{ color: 'var(--vinuni-gold)' }} />
                Bối cảnh & Người học
              </h4>

              {/* Sub-grid 1: Thời lượng & Sĩ số */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="planner-modal-field">
                  <label className="planner-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                    Thời lượng tiết dạy
                  </label>
                  <select
                    value={sessionDuration}
                    onChange={(e) => setSessionDuration(parseInt(e.target.value))}
                    className="planner-modal-select"
                    style={{ height: '42px', padding: '8px 12px' }}
                  >
                    <option value={50}>50 phút (Tiết đơn)</option>
                    <option value={90}>90 phút (VinUni Block)</option>
                    <option value={120}>120 phút (Tiết đôi)</option>
                    <option value={180}>180 phút (Seminars)</option>
                  </select>
                </div>

                <div className="planner-modal-field">
                  <label className="planner-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} style={{ color: 'var(--text-muted)' }} />
                    Sĩ số (Sinh viên)
                  </label>
                  <input
                    type="number"
                    value={classSize}
                    onChange={(e) => setClassSize(parseInt(e.target.value) || 0)}
                    className="planner-modal-input"
                    style={{ height: '42px', padding: '8px 12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Sub-grid 2: Wifi & Cách bố trí bàn ghế (Segmented Controls) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="planner-modal-field">
                  <label className="planner-modal-label">Mạng Wifi lớp học</label>
                  <div style={{
                    display: 'flex',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '3px',
                    height: '42px',
                    boxSizing: 'border-box'
                  }}>
                    <button
                      type="button"
                      onClick={() => setHasWifi(true)}
                      style={{
                        flex: 1,
                        background: hasWifi ? 'var(--vinuni-navy)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: hasWifi ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      className="planner-segmented-btn"
                    >
                      <Wifi size={12} /> Có Wifi
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasWifi(false)}
                      style={{
                        flex: 1,
                        background: !hasWifi ? 'var(--vinuni-navy)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: !hasWifi ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      className="planner-segmented-btn"
                    >
                      <WifiOff size={12} /> Không Wifi
                    </button>
                  </div>
                </div>

                <div className="planner-modal-field">
                  <label className="planner-modal-label">Cách bố trí bàn ghế</label>
                  <div style={{
                    display: 'flex',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '3px',
                    height: '42px',
                    boxSizing: 'border-box'
                  }}>
                    <button
                      type="button"
                      onClick={() => setFurnitureType('movable')}
                      style={{
                        flex: 1,
                        background: furnitureType === 'movable' ? 'var(--vinuni-navy)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: furnitureType === 'movable' ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      className="planner-segmented-btn"
                    >
                      <Move size={12} /> Di động
                    </button>
                    <button
                      type="button"
                      onClick={() => setFurnitureType('fixed')}
                      style={{
                        flex: 1,
                        background: furnitureType === 'fixed' ? 'var(--vinuni-navy)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: furnitureType === 'fixed' ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      className="planner-segmented-btn"
                    >
                      <Lock size={12} /> Cố định
                    </button>
                  </div>
                </div>
              </div>

              {/* Trình độ người học */}
              <div className="planner-modal-field" style={{ marginTop: '4px' }}>
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
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        className="planner-segmented-btn"
                      >
                        {level.label.split(' (')[0]}
                      </button>
                    );
                  })}
                </div>
                
                {/* Dynamic Level description helper text */}
                <div style={{
                  marginTop: '10px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'var(--bg-tertiary)',
                  borderLeft: '4px solid var(--vinuni-gold)',
                  border: '1px solid var(--border-color)',
                  borderLeftColor: 'var(--vinuni-gold)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.45',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                }}>
                  <Sparkles size={14} style={{ color: 'var(--vinuni-gold)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    {learnerLevel === 'beginner' && "AI sẽ tập trung giải nghĩa định nghĩa, thuật ngữ cơ bản kèm các ví dụ thực tế trực quan minh họa sinh động."}
                    {learnerLevel === 'intermediate' && "AI sử dụng thuật ngữ chuyên ngành tiêu chuẩn, diễn đạt súc tích, cân bằng giữa lý thuyết và ứng dụng thực hành."}
                    {learnerLevel === 'advanced' && "AI đi sâu vào kiến trúc hệ thống, bài toán tối ưu hóa thuật toán nâng cao, tradeoff thực tế và các câu hỏi tư duy phản biện."}
                  </div>
                </div>
              </div>
            </div>

            {/* Checkbox Save Defaults Card */}
            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              marginTop: '14px',
              transition: 'border-color 0.2s'
            }} 
            onClick={() => setSaveAsDefault(!saveAsDefault)}
            className="planner-save-default-card"
            >
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
        <div className="planner-modal-actions" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '24px' }}>
          <button onClick={() => setShowConfigModal(false)} className="planner-modal-cancel-btn">Hủy</button>
          <button 
            onClick={handleConfirm} 
            id="lp-pedagogical-confirm-btn"
            className="planner-modal-confirm-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'center',
              paddingLeft: '22px',
              paddingRight: '22px'
            }}
          >
            Bắt đầu sinh học liệu
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
