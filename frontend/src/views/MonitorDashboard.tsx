import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Course } from '@/types';
import { 
  ArrowLeft, 
  Cpu, 
  DollarSign, 
  Clock, 
  Activity, 
  Database,
  CheckCircle2, 
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import '../styles/MonitorDashboard.css';

export interface MonitorLog {
  id: string;
  timestamp: string;
  operation: string;
  model: string;
  latency: number;
  cost: number;
  tokens: number;
  status: 'success' | 'error';
}

export interface MonitorStats {
  totalCost: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  averageLatency: number;
  modelName: string;
  logs: MonitorLog[];
}

export interface MonitorDashboardProps {
  course: Course;
  monitorStats: MonitorStats;
  onClearStats: () => void;
  onBack: () => void;
  isActive?: boolean;
}

export default function MonitorDashboard({ 
  course, 
  monitorStats, 
  onClearStats, 
  onBack,
  isActive
}: MonitorDashboardProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);
  
  const totalTokens = monitorStats.totalPromptTokens + monitorStats.totalCompletionTokens;
  const promptPct = totalTokens > 0 ? (monitorStats.totalPromptTokens / totalTokens) * 100 : 0;
  const completionPct = totalTokens > 0 ? (monitorStats.totalCompletionTokens / totalTokens) * 100 : 0;

  const handleResetClick = () => {
    if (window.confirm('Bạn có chắc chắn muốn đặt lại tất cả thông số giám sát? Hành động này sẽ xóa sạch nhật ký hiện tại.')) {
      onClearStats();
    }
  };

  return (
    <div className="monitor-container">
      {isActive && portalTarget ? createPortal(
        <button onClick={handleResetClick} className="monitor-reset-btn" title="Đặt lại thông số">
          <RotateCcw size={14} /> Đặt lại dữ liệu
        </button>,
        portalTarget
      ) : !portalTarget ? (
        <header className="monitor-header">
          <div className="monitor-header-left">
            <button onClick={onBack} className="monitor-back-btn" title="Quay lại Lộ trình">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div className="monitor-course-info">
              <h2 className="monitor-course-title">Bảng Giám Sát Tài Nguyên AI</h2>
            </div>
          </div>
          <button onClick={handleResetClick} className="monitor-reset-btn" title="Đặt lại thông số">
            <RotateCcw size={14} /> Đặt lại dữ liệu
          </button>
        </header>
      ) : null}

      {/* KPI METRICS GRID */}
      <div className="monitor-grid">
        {/* Card 1: Active Model */}
        <div className="monitor-card">
          <div className="monitor-card-header-icon bg-blue">
            <Cpu size={20} />
          </div>
          <div className="monitor-card-body">
            <span className="monitor-card-label">Mô hình hoạt động</span>
            <h3 className="monitor-card-value">{monitorStats.modelName}</h3>
            <span className="monitor-card-sub text-green">Đang chạy ổn định (Online)</span>
          </div>
        </div>

        {/* Card 2: Cumulative Cost */}
        <div className="monitor-card">
          <div className="monitor-card-header-icon bg-gold">
            <DollarSign size={20} />
          </div>
          <div className="monitor-card-body">
            <span className="monitor-card-label">Chi phí tích lũy</span>
            <h3 className="monitor-card-value">${monitorStats.totalCost.toFixed(4)}</h3>
            <span className="monitor-card-sub">Quy đổi ước tính (USD)</span>
          </div>
        </div>

        {/* Card 3: Avg Latency */}
        <div className="monitor-card">
          <div className="monitor-card-header-icon bg-purple">
            <Clock size={20} />
          </div>
          <div className="monitor-card-body">
            <span className="monitor-card-label">Độ trễ trung bình</span>
            <h3 className="monitor-card-value">{monitorStats.averageLatency}s</h3>
            <span className="monitor-card-sub">Thời gian phản hồi LLM</span>
          </div>
        </div>

        {/* Card 4: Total Requests */}
        <div className="monitor-card">
          <div className="monitor-card-header-icon bg-indigo">
            <Activity size={20} />
          </div>
          <div className="monitor-card-body">
            <span className="monitor-card-label">Tổng số yêu cầu</span>
            <h3 className="monitor-card-value">{monitorStats.totalRequests}</h3>
            <span className="monitor-card-sub">Số lượt API gọi thành công</span>
          </div>
        </div>
      </div>

      {/* TOKEN AND PERFORMANCE DETAILS */}
      <div className="monitor-details-row">
        {/* Token consumption breakdown */}
        <div className="monitor-details-card token-breakdown-card">
          <h4 className="monitor-section-title">
            <Database size={16} /> Phân Tích Lượng Token Tiêu Thụ
          </h4>
          <div className="token-counter-wrap">
            <div className="token-stat">
              <span className="token-stat-value">{totalTokens.toLocaleString()}</span>
              <span className="token-stat-label">Tổng số Token</span>
            </div>
            <div className="token-stat-split">
              <div>
                <span className="dot dot-prompt"></span>
                <span>Đầu vào (Prompt): <strong>{monitorStats.totalPromptTokens.toLocaleString()}</strong></span>
              </div>
              <div>
                <span className="dot dot-completion"></span>
                <span>Đầu ra (Completion): <strong>{monitorStats.totalCompletionTokens.toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          {totalTokens > 0 ? (
            <div className="token-bar-container">
              <div className="token-progress-track">
                <div 
                  className="token-progress-prompt" 
                  style={{ width: `${promptPct}%` }} 
                  title={`Prompt: ${promptPct.toFixed(1)}%`}
                />
                <div 
                  className="token-progress-completion" 
                  style={{ width: `${completionPct}%` }} 
                  title={`Completion: ${completionPct.toFixed(1)}%`}
                />
              </div>
              <div className="token-legend">
                <span>Prompt ({promptPct.toFixed(1)}%)</span>
                <span>Completion ({completionPct.toFixed(1)}%)</span>
              </div>
            </div>
          ) : (
            <div className="monitor-empty-sub">
              Chưa có dữ liệu Token tiêu thụ trong phiên làm việc này.
            </div>
          )}
        </div>
      </div>

      {/* HISTORICAL LOGS */}
      <div className="monitor-logs-card">
        <h4 className="monitor-section-title">
          <Activity size={16} /> Nhật Ký Hoạt Động API Hệ Thống
        </h4>
        <div className="monitor-table-wrapper">
          {monitorStats.logs.length === 0 ? (
            <div className="monitor-logs-empty">
              Chưa có hoạt động AI nào được ghi nhận. Hãy thử phân tích Syllabus, sinh slide hoặc tạo câu hỏi kiểm tra.
            </div>
          ) : (
            <table className="monitor-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Loại nghiệp vụ</th>
                  <th>Mô hình AI</th>
                  <th>Độ trễ</th>
                  <th>Lượng Token</th>
                  <th>Chi phí</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {monitorStats.logs.map(log => (
                  <tr key={log.id}>
                    <td className="log-time">{log.timestamp}</td>
                    <td className="log-operation">{log.operation}</td>
                    <td className="log-model">{log.model}</td>
                    <td>{log.latency}s</td>
                    <td>{log.tokens > 0 ? log.tokens.toLocaleString() : 'N/A'}</td>
                    <td className="log-cost">${log.cost.toFixed(4)}</td>
                    <td>
                      {log.status === 'success' ? (
                        <span className="log-status status-success-badge">
                          <CheckCircle2 size={12} /> Thành công
                        </span>
                      ) : (
                        <span className="log-status status-error-badge">
                          <AlertTriangle size={12} /> Lỗi
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
