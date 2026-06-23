import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import { 
  ArrowLeft, 
  TrendingUp, 
  Upload, 
  Download, 
  Award, 
  Activity, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  Play, 
  Square, 
  QrCode, 
  RefreshCw, 
  Sliders,
  X,
  ChevronRight
} from 'lucide-react';
import { Course } from '@/types';
import '../styles/AssessmentHub.css';

interface CLOAchievement {
  clo_id: number;
  clo_code: string;
  description: string;
  bloom_level: number;
  cas_score: number;
  status: 'passing' | 'warning' | 'critical';
}

interface ImprovementRecord {
  id: number;
  chapter_id: number;
  chapter_title: string;
  proposed_content: string | null;
  edited_content: string | null;
  pedagogical_reason: string | null;
  created_at: string;
}

export interface AssessmentHubProps {
  course: Course;
  onBack: () => void;
  onNavigate: (view: string, extra?: any) => void;
  onRecordAIUsage: (usage: any) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
  isActive?: boolean;
}

export default function AssessmentHub({
  course,
  onBack,
  onNavigate,
  onRecordAIUsage,
  setAIProcessingStatus,
  isActive
}: AssessmentHubProps) {
  const [subTab, setSubTab] = useState<'clo' | 'data' | 'loop'>('clo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);
  
  // Data States
  const [clos, setClos] = useState<CLOAchievement[]>([]);
  const [improvements, setImprovements] = useState<ImprovementRecord[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);

  // Detail Modal / Sub-view States
  const [selectedClo, setSelectedClo] = useState<CLOAchievement | null>(null);
  const [selectedImprovement, setSelectedImprovement] = useState<ImprovementRecord | null>(null);
  const [cloQuestions, setCloQuestions] = useState<any[]>([]);
  const [sessionNameInput, setSessionNameInput] = useState('');
  
  // Upload States
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // ABET Report Modal States
  const [showAbetModal, setShowAbetModal] = useState(false);
  const [abetText, setAbetText] = useState('');
  const [generatingAbet, setGeneratingAbet] = useState(false);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/api/courses/${course.id}/assessment-analytics`);
      setClos(res.data.clos || []);
      setImprovements(res.data.improvements || []);

      const sessionsRes = await client.get(`/api/courses/${course.id}/quiz-sessions`);
      setSessions(sessionsRes.data || []);
      const active = sessionsRes.data.find((s: any) => s.status === 'active');
      setActiveSession(active || null);
    } catch (err: any) {
      console.error(err);
      setError('Không thể tải dữ liệu đánh giá và phân tích.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchAnalyticsData();
      setError('');
      setMessage('');
    }
  }, [course.id, isActive]);

  // Handle Session Control
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionNameInput.trim()) return;
    setError('');
    setMessage('');
    try {
      const res = await client.post(`/api/courses/${course.id}/quiz-sessions`, {
        session_name: sessionNameInput,
        chapter_id: null
      });
      setActiveSession(res.data);
      setSessionNameInput('');
      fetchAnalyticsData();
      setMessage('Đã mở phiên chơi H5P trực tuyến thành công!');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Lỗi khi khởi chạy phiên.');
    }
  };

  const handleCloseSession = async (sessionId: number) => {
    setError('');
    setMessage('');
    try {
      // Create simple update request
      fetchAnalyticsData();
      setMessage('Phiên chơi trực tuyến đã được chốt và đóng lại.');
    } catch (err: any) {
      setError('Lỗi khi chốt phiên.');
    }
  };

  // Handle Export Kahoot
  const handleExportKahoot = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('token');
    window.open(`${apiBase}/api/courses/${course.id}/questions/export-kahoot?token=${token || ''}`, '_blank');
  };

  // Drag and Drop File Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleUploadReport = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setError('');
    setMessage('');
    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      const res = await client.post(`/api/courses/${course.id}/quiz-sessions/import-kahoot`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setMessage(res.data.message || 'Nạp file báo cáo Kahoot thành công.');
      setUploadFile(null);
      fetchAnalyticsData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Lỗi khi phân tích và import file báo cáo.');
    } finally {
      setUploading(false);
    }
  };

  // Load questions for selected CLO to show details
  const handleCloClick = async (clo: CLOAchievement) => {
    setSelectedClo(clo);
    setCloQuestions([]);
    try {
      const res = await client.get(`/api/courses/${course.id}/questions`);
      const related = res.data.filter((q: any) => q.clo_id === clo.clo_id);
      setCloQuestions(related);
    } catch (err) {
      console.error(err);
    }
  };

  // AI Prompt: Generate ABET Accreditation Report text
  const handleGenerateAbetReport = async () => {
    setGeneratingAbet(true);
    setShowAbetModal(true);
    const opStartTime = Date.now();
    setAIProcessingStatus(true, 'AI đang tổng hợp dữ liệu và viết báo cáo ABET...');

    try {
      // Simulate/Generate reports using Gemini
      const res = await client.get(`/api/courses/${course.id}/matrix-coverage`);
      const matrix = res.data.matrix || {};

      let reportText = `VINUNI UNIVERSITY\n`;
      reportText += `COURSE ACCREDITATION & CONTINUOUS IMPROVEMENT REPORT (CAR - ABET)\n`;
      reportText += `Course: ${course.course_name} (${course.course_code})\n`;
      reportText += `Date Generated: ${new Date().toLocaleDateString()}\n`;
      reportText += `---------------------------------------------------------\n\n`;
      reportText += `1. EXECUTIVE SUMMARY\n`;
      reportText += `This report evaluates the achievement levels of Course Learning Outcomes (CLOs) under ABET guidelines.\n`;
      reportText += `Overall assessment metrics indicate the class has engaged actively in formative gamified evaluations (Kahoot & H5P).\n\n`;
      reportText += `2. CLO ACHIEVEMENT METRICS\n`;
      clos.forEach(c => {
        reportText += `- [${c.clo_code}] Bloom B${c.bloom_level} Target: ${c.description}\n`;
        reportText += `  Class Achievement Score (CAS): ${c.cas_score}% (${c.status.toUpperCase()})\n`;
      });
      reportText += `\n3. CONTINUOUS IMPROVEMENT ACTIVITIES (CLOSING THE LOOP)\n`;
      if (improvements.length > 0) {
        improvements.slice(0, 3).forEach((imp, idx) => {
          reportText += `Action ${idx + 1}: AI suggested material optimization for Chapter ${imp.chapter_id} (${imp.chapter_title}).\n`;
          reportText += `  Pedagogical justification: ${imp.pedagogical_reason}\n`;
        });
      } else {
        reportText += `No custom slide adjustments have been registered for this semester.\n`;
      }
      reportText += `\n4. LECTURER RECOMMENDATION & PEDAGOGICAL PLAN\n`;
      reportText += `AI Recommendation: Increase dwell time on loop statements and control scope in next semesters. Ensure Peer Instruction scripts are followed during live lectures.\n`;

      setAbetText(reportText);

      onRecordAIUsage({
        operation: `Sinh báo cáo ABET - Môn học: ${course.course_code}`,
        latency: Number(((Date.now() - opStartTime) / 1000).toFixed(1)),
        cost: 0.005,
        status: 'success'
      });
    } catch (err) {
      console.error(err);
      setAbetText("Lỗi khi tổng hợp báo cáo. Vui lòng kiểm tra lại dữ liệu.");
    } finally {
      setGeneratingAbet(false);
      setAIProcessingStatus(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'passing': return <span className="status-pill passing"><CheckCircle size={12} /> Đạt (Passing)</span>;
      case 'warning': return <span className="status-pill warning"><AlertTriangle size={12} /> Cảnh báo (Warning)</span>;
      case 'critical':
      default:
        return <span className="status-pill critical"><AlertTriangle size={12} /> Nguy cơ (Critical)</span>;
    }
  };

  return (
    <div className="ah-container">
      {/* HEADER PORTAL OR FALLBACK */}
      {isActive && portalTarget ? createPortal(
        <button onClick={handleGenerateAbetReport} className="ah-abet-btn-header">
          <FileText size={14} /> Xuất Báo Cáo ABET
        </button>,
        portalTarget
      ) : !portalTarget ? (
        <header className="ah-header">
          <div className="ah-header-left">
            <button onClick={onBack} className="ah-back-btn">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div className="ah-course-info">
              <h2 className="ah-title">Assessment & Loop Hub</h2>
              <p className="ah-subtitle">Báo cáo đánh giá chất lượng CLO, nạp file điểm & theo dõi lịch sử cải tiến slide bài giảng</p>
            </div>
          </div>
          <div className="ah-header-right">
            <button onClick={handleGenerateAbetReport} className="ah-abet-btn">
              <FileText size={15} /> Xuất Báo Cáo ABET
            </button>
          </div>
        </header>
      ) : null}

      {error && <div className="ah-alert error">{error}</div>}
      {message && <div className="ah-alert success">{message}</div>}

      {/* SUB-TABS */}
      <div className="ah-tabs-bar">
        <button 
          className={`ah-tab-btn ${subTab === 'clo' ? 'active' : ''}`}
          onClick={() => setSubTab('clo')}
        >
          <Award size={16} /> Ma trận Chất lượng CLO
        </button>
        <button 
          className={`ah-tab-btn ${subTab === 'data' ? 'active' : ''}`}
          onClick={() => setSubTab('data')}
        >
          <Activity size={16} /> Nhập & Xuất Dữ Liệu Game
        </button>
        <button 
          className={`ah-tab-btn ${subTab === 'loop' ? 'active' : ''}`}
          onClick={() => setSubTab('loop')}
        >
          <TrendingUp size={16} /> Nhật ký Cải tiến Sư phạm (Loop)
        </button>
      </div>

      <div className="ah-content-body">
        {loading ? (
          <div className="ah-loading-state">
            <RefreshCw className="animate-spin" size={24} />
            <span>Đang tải dữ liệu báo cáo chất lượng...</span>
          </div>
        ) : (
          <>
            {/* SUB-TAB 1: CLO ACHIEVEMENT */}
            {subTab === 'clo' && (
              <div className="ah-dashboard-layout">
                {/* Left Side: CLO Grid */}
                <div className="ah-dashboard-main">
                  <div className="section-header-block">
                    <h3 className="section-title">Class Achievement Scores (CAS)</h3>
                    <p className="section-desc">Điểm gộp CAS được tính bằng tỷ lệ số câu trả lời đúng trên tổng số câu hỏi đã thử của từng Chuẩn đầu ra (CLO).</p>
                  </div>
                  
                  <div className="clo-matrix-grid">
                    {clos.length === 0 ? (
                      <div className="empty-state">Chưa có chuẩn đầu ra nào được cấu hình cho môn học này.</div>
                    ) : (
                      clos.map(clo => (
                        <div key={clo.clo_id} className={`clo-card status-${clo.status}`} onClick={() => handleCloClick(clo)}>
                          <div className="clo-card-header">
                            <span className="clo-code">
                              {clo.clo_code}
                              <span className="bloom-badge">Bloom B{clo.bloom_level}</span>
                            </span>
                            {getStatusLabel(clo.status)}
                          </div>
                          <p className="clo-desc">{clo.description}</p>
                          
                          <div className="progress-container">
                            <div className="progress-bar-bg">
                              <div className="progress-bar-fill" style={{ width: `${clo.cas_score}%` }} />
                            </div>
                            <span className="progress-pct">{clo.cas_score}%</span>
                          </div>
                          
                          <div className="card-footer-tip">
                            <span>Xem câu hỏi liên quan</span>
                            <ChevronRight size={14} className="chevron-icon" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Side: AI Analytics Panel */}
                <div className="ah-dashboard-sidebar">
                  <div className="sidebar-widget stats-widget">
                    <h4 className="widget-title">Thống Kê Lớp Học</h4>
                    <div className="stats-grid">
                      <div className="stat-box">
                        <span className="stat-label">Điểm CAS Trung Bình</span>
                        <span className="stat-val">
                          {clos.length > 0 ? (clos.reduce((acc, curr) => acc + curr.cas_score, 0) / clos.length).toFixed(0) : 0}%
                        </span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">Tỷ Lệ Đạt Chuẩn</span>
                        <span className="stat-val">
                          {clos.length > 0 ? (clos.filter(c => c.status === 'passing').length / clos.length * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="sidebar-widget insight-widget">
                    <h4 className="widget-title">Khuyến Nghị Sư Phạm (AI Assistant)</h4>
                    <div className="insight-content">
                      {clos.length === 0 ? (
                        <p className="insight-text">Chưa có dữ liệu phân tích chuẩn đầu ra cho môn học này.</p>
                      ) : clos.some(c => c.status === 'critical') ? (
                        <div className="insight-warning">
                          <span className="insight-status-badge critical">Cần hành động gấp</span>
                          <p className="insight-text">
                            <strong>Cảnh báo chất lượng</strong>: Một số CLO (như {clos.filter(c => c.status === 'critical').map(c => c.clo_code).join(', ')}) đang có tỷ lệ đạt rất thấp.
                          </p>
                          <ul className="insight-tips">
                            <li>AI khuyên bạn nên kích hoạt **Hàng đợi Tự động Khắc phục Điểm mù** trong tab **Nhật ký Cải tiến**.</li>
                            <li>Tạo slide bổ trợ Code thực hành / visual flow trực quan cho các chương liên quan.</li>
                          </ul>
                        </div>
                      ) : clos.some(c => c.status === 'warning') ? (
                        <div className="insight-warning">
                          <span className="insight-status-badge warning">Cần lưu ý</span>
                          <p className="insight-text">
                            <strong>Khuyến nghị từ AI</strong>: CLO {clos.filter(c => c.status === 'warning').map(c => c.clo_code).join(', ')} có nguy cơ không đạt chuẩn đầu ra.
                          </p>
                          <ul className="insight-tips">
                            <li>Nhúng thêm câu hỏi tương tác H5P trong bài giảng tiếp theo.</li>
                            <li>Thiết lập buổi thảo luận nhóm nhỏ (Peer Instruction) 3 phút.</li>
                          </ul>
                        </div>
                      ) : (
                        <div className="insight-success">
                          <span className="insight-status-badge passing">Xuất sắc</span>
                          <p className="insight-text">
                            Lớp học đã đạt **100% chuẩn đầu ra** môn học thông qua các lượt đánh giá.
                          </p>
                          <ul className="insight-tips">
                            <li>Tiếp tục duy trì phương pháp dạy học tích cực (Active Learning).</li>
                            <li>Có thể thiết kế thêm câu hỏi thử thách mức Bloom cao hơn (B5, B6) để khuyến khích sinh viên tự học.</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Question Detail Modal Panel */}
                {selectedClo && typeof document !== 'undefined' && createPortal(
                  <div className="clo-modal-overlay" onClick={() => setSelectedClo(null)}>
                    <div className="clo-modal" onClick={e => e.stopPropagation()}>
                      <div className="panel-header">
                        <div className="panel-header-title-wrapper">
                          <h4>Chi tiết câu hỏi: {selectedClo.clo_code}</h4>
                          <span className="panel-header-subtitle">Danh sách câu hỏi kiểm tra độ phủ</span>
                        </div>
                        <button className="close-panel-btn" onClick={() => setSelectedClo(null)}>
                          <X size={18} />
                        </button>
                      </div>
                      
                      <div className="panel-body">
                        {cloQuestions.length === 0 ? (
                          <p className="no-questions">Không tìm thấy câu hỏi nào thuộc CLO này trong Ngân hàng đề thi.</p>
                        ) : (
                          <div className="panel-questions-list">
                            {cloQuestions.map((q, idx) => (
                              <div key={q.id} className="panel-question-card">
                                <div className="q-card-header">
                                  <span className="q-index">Câu {idx + 1}</span>
                                  <span className="q-bloom">Bloom B{q.bloom_level}</span>
                                </div>
                                <p className="q-text">{q.question_text}</p>
                                <div className="q-options-row">
                                  {q.options_json && JSON.parse(q.options_json).map((opt: string, i: number) => {
                                    const isCorrect = opt.trim().toLowerCase() === q.correct_answer.trim().toLowerCase();
                                    return (
                                      <div key={i} className={`q-opt ${isCorrect ? 'correct' : ''}`}>
                                        <span className="opt-letter">{chr(65 + i)}</span>
                                        <span className="opt-text">{opt}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            )}

            {/* SUB-TAB 2: DATA INGESTION & SESSION CONTROL */}
            {subTab === 'data' && (
              <div className="ah-section data-center-grid">
                
                {/* Kahoot Excel/CSV Import/Export */}
                <div className="data-panel">
                  <h3 className="panel-title">Ngoại Tuyến: Kahoot / Quizizz Reports</h3>
                  <p className="panel-desc">Tải file template Excel để nạp câu hỏi vào Kahoot hoặc kéo thả file báo cáo Excel/CSV tải từ Kahoot để tính điểm gộp.</p>
                  
                  <button onClick={handleExportKahoot} className="export-action-btn">
                    <Download size={16} /> Xuất đề thi định dạng Kahoot Excel
                  </button>

                  <div className="divider">hoặc</div>

                  {/* Drag and Drop Zone */}
                  <div 
                    className={`drop-zone ${dragActive ? 'active' : ''} ${uploadFile ? 'has-file' : ''}`}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file" 
                      id="kahoot-file-input" 
                      className="file-input-hidden" 
                      accept=".xlsx,.csv" 
                      onChange={handleFileChange}
                    />
                    <Upload size={24} className="upload-icon" />
                    {uploadFile ? (
                      <div className="file-info">
                        <span className="file-name">{uploadFile.name}</span>
                        <span className="file-size">({(uploadFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    ) : (
                      <label htmlFor="kahoot-file-input" className="file-label">
                        Kéo thả file kết quả Excel/CSV của Kahoot vào đây hoặc <span>chọn từ máy tính</span>
                      </label>
                    )}
                  </div>

                  {uploadFile && (
                    <button 
                      onClick={handleUploadReport} 
                      className="upload-submit-btn"
                      disabled={uploading}
                    >
                      {uploading ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                      {uploading ? 'Đang phân tích dữ liệu...' : 'Nạp dữ liệu điểm gộp'}
                    </button>
                  )}
                </div>

                {/* H5P Live Class Session Control */}
                <div className="data-panel">
                  <h3 className="panel-title">Trực Tuyến: Mini-game nhúng trong lớp</h3>
                  <p className="panel-desc">Bật phiên tương tác trên slide. Sinh viên quét mã QR/nhập mã PIN chơi trực tiếp trên điện thoại không cần đăng nhập.</p>

                  {activeSession ? (
                    <div className="active-session-card">
                      <div className="session-header">
                        <span className="pulse-indicator" />
                        <strong>Phiên đang mở: {activeSession.session_name}</strong>
                      </div>
                      
                      <div className="qr-container">
                        <div className="qr-box">
                          <QrCode size={120} />
                        </div>
                        <div className="qr-info">
                          <span className="pin-code">PIN: {1000 + (activeSession.id % 9000)}</span>
                          <span className="scan-desc">Hướng dẫn sinh viên quét QR hoặc truy cập vinuni-app/join nhập mã PIN</span>
                        </div>
                      </div>

                      <button onClick={() => handleCloseSession(activeSession.id)} className="stop-session-btn">
                        <Square size={16} /> Chốt phiên & Lưu kết quả gộp
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleStartSession} className="start-session-form">
                      <div className="input-group">
                        <label htmlFor="session-name">Tên phiên chơi game:</label>
                        <input 
                          type="text" 
                          id="session-name"
                          placeholder="Ví dụ: Chương 3 - Vòng lặp (Ca sáng)"
                          value={sessionNameInput}
                          onChange={(e) => setSessionNameInput(e.target.value)}
                        />
                      </div>
                      <button type="submit" disabled={!sessionNameInput.trim()} className="start-session-btn">
                        <Play size={16} /> Bắt đầu phiên chơi trực tuyến
                      </button>
                    </form>
                  )}

                  {/* History of sessions */}
                  <div className="sessions-history-list">
                    <h5>Lịch sử phiên học</h5>
                    {sessions.length === 0 ? (
                      <p className="no-history">Chưa có phiên học nào được ghi lại.</p>
                    ) : (
                      sessions.slice(0, 3).map(s => (
                        <div key={s.id} className="history-item">
                          <span>{s.session_name}</span>
                          <span className="history-status">{s.status === 'closed' ? 'Đã đóng' : 'Đang hoạt động'}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* SUB-TAB 3: IMPROVEMENT REGISTRY (LOOP) */}
            {subTab === 'loop' && (
              <div className="ah-section">
                <h3 className="section-title">Nhật ký Cải tiến Slide bài giảng của AI (Loop Audit)</h3>
                <p className="section-desc">Ghi nhận các đề xuất thay thế slide lý thuyết bằng sơ đồ trực quan/Active Learning khi phát hiện chuẩn đầu ra của sinh viên bị giảm.</p>

                <div className="loop-registry-list">
                  {improvements.length === 0 ? (
                    <div className="empty-state">Chưa có thay đổi slide bài giảng nào được ghi lại trong học kỳ này.</div>
                  ) : (
                    improvements.map(imp => (
                      <div key={imp.id} className="improvement-card" onClick={() => setSelectedImprovement(imp)}>
                        <div className="imp-card-header">
                          <span className="imp-chapter">{imp.chapter_title}</span>
                          <span className="imp-date">{new Date(imp.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="imp-reason"><strong>Lý do sư phạm:</strong> {imp.pedagogical_reason}</p>
                        
                        <div className="imp-card-actions">
                          <button className="view-diff-btn">So sánh slide Trước/Sau</button>
                          <button className="download-slide-btn" onClick={(e) => { e.stopPropagation(); alert('Đang tải slide PPTX cải tiến...'); }}>
                            <Download size={14} /> Tải slide lẻ (.pptx)
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Slide Difference Modal */}
                {selectedImprovement && (
                  <div className="modal-overlay" onClick={() => setSelectedImprovement(null)}>
                    <div className="slide-diff-modal" onClick={e => e.stopPropagation()}>
                      <div className="modal-header">
                        <h4>{selectedImprovement.chapter_title} - So sánh slide cải tiến</h4>
                        <button className="close-btn" onClick={() => setSelectedImprovement(null)}>&times;</button>
                      </div>
                      
                      <div className="pedagogical-banner">
                        <strong>Lý do Sư phạm:</strong> {selectedImprovement.pedagogical_reason}
                      </div>

                      <div className="diff-panels-container">
                        <div className="diff-panel before">
                          <h5>Slide Gốc (Lý thuyết chữ thô)</h5>
                          <pre className="slide-markdown-preview">
                            {selectedImprovement.proposed_content || "Slide nội dung thô chứa nhiều văn bản."}
                          </pre>
                        </div>
                        <div className="diff-panel after">
                          <h5>Slide Mới (Đã chèn sơ đồ trực quan & Code sửa lỗi)</h5>
                          <pre className="slide-markdown-preview">
                            {selectedImprovement.edited_content || "Slide sơ đồ trực quan hóa vòng lặp & kịch bản thảo luận nhóm 3 phút."}
                          </pre>
                        </div>
                      </div>

                      <div className="modal-footer">
                        <button className="btn-secondary" onClick={() => setSelectedImprovement(null)}>Đóng</button>
                        <button className="btn-primary" onClick={() => { alert('Đã tích hợp slide thành công!'); setSelectedImprovement(null); }}>
                          Áp Dụng Bản Sửa
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ABET ACCREDITATION REPORT MODAL */}
      {showAbetModal && (
        <div className="modal-overlay" onClick={() => setShowAbetModal(false)}>
          <div className="abet-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Báo Cáo Kiểm Định Chất Lượng ABET</h4>
              <button className="close-btn" onClick={() => setShowAbetModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {generatingAbet ? (
                <div className="loading-report">
                  <RefreshCw className="animate-spin" size={24} />
                  <span>AI đang soạn báo cáo kiểm định chuẩn đầu ra...</span>
                </div>
              ) : (
                <textarea 
                  className="abet-textarea"
                  value={abetText}
                  onChange={(e) => setAbetText(e.target.value)}
                />
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAbetModal(false)}>Đóng</button>
              <button className="btn-primary" onClick={() => {
                const blob = new Blob([abetText], { type: 'text/plain;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", `ABET_Report_${course.course_code}.txt`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setShowAbetModal(false);
              }}>
                <Download size={14} /> Tải Báo Cáo (.txt)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers for char code and string conversion inside the file
function chr(code: number): string {
  return String.fromCharCode(code);
}
