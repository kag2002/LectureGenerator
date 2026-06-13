import React from 'react';

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
  handleGenerateMaterials: () => void;
}

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
  handleGenerateMaterials
}: PedagogicalConfigModalProps) {
  if (!showConfigModal) return null;

  return (
    <div className="planner-modal-overlay">
      <div className="planner-modal-card">
        <h3 className="planner-modal-title">Cấu hình Sư phạm Lớp học</h3>
        
        <div className="planner-modal-field">
          <label className="planner-modal-label">Thời lượng tiết dạy:</label>
          <select
            value={sessionDuration}
            onChange={(e) => setSessionDuration(parseInt(e.target.value))}
            className="planner-modal-select"
          >
            <option value={50}>50 phút (Tiết đơn)</option>
            <option value={90}>90 phút (Tiết đôi)</option>
            <option value={120}>120 phút (Tiết rưỡi)</option>
            <option value={180}>180 phút (Tiết Lab/Seminar)</option>
          </select>
        </div>

        <div className="planner-modal-field">
          <label className="planner-modal-label">Sĩ số lớp (Sinh viên):</label>
          <input
            type="number"
            value={classSize}
            onChange={(e) => setClassSize(parseInt(e.target.value))}
            className="planner-modal-input"
          />
        </div>

        <div className="planner-modal-field">
          <label className="planner-modal-label">Mạng Wifi lớp học:</label>
          <select
            value={hasWifi ? 'yes' : 'no'}
            onChange={(e) => setHasWifi(e.target.value === 'yes')}
            className="planner-modal-select"
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
          >
            <option value="movable">Di động (Movable - dễ xếp nhóm)</option>
            <option value="fixed">Cố định (Fixed - chỉ thảo luận tại chỗ)</option>
          </select>
        </div>

        <div className="planner-modal-actions">
          <button onClick={() => setShowConfigModal(false)} className="planner-modal-cancel-btn">Hủy</button>
          <button 
            onClick={() => {
              handleGenerateMaterials();
              setShowConfigModal(false);
            }} 
            className="planner-modal-confirm-btn"
          >
            Bắt đầu sinh học liệu
          </button>
        </div>
      </div>
    </div>
  );
}
