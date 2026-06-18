import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import FlowSteps from '../components/FlowSteps';
import { ArrowLeft, ClipboardList, Image, Zap, AlertCircle, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Course, QueueItem } from '@/types';
import '../styles/MatrixDashboard.css';

export interface MatrixDashboardProps {
  course: Course;
  onBack: () => void;
  onNavigate: (view: string, extra?: any) => void;
  queue: QueueItem[];
  isQueueRunning: boolean;
  showQueuePanel: boolean;
  queueProgressMsg: string;
  setIsQueueRunning: (val: boolean) => void;
  setQueue: (queue: QueueItem[]) => void;
  setShowQueuePanel: (show: boolean) => void;
  setQueueProgressMsg: (msg: string) => void;
  setQueueMode: (mode: 'questions' | 'materials') => void;
  cancelRef: React.MutableRefObject<boolean>;
  runGlobalQueue: (queue: QueueItem[], mode: 'questions' | 'materials', courseId: number) => Promise<void>;
  isActive?: boolean;
}

export default function MatrixDashboard({ 
  course, 
  onBack, 
  onNavigate,
  queue,
  isQueueRunning,
  setIsQueueRunning,
  setQueue,
  setShowQueuePanel,
  setQueueProgressMsg,
  setQueueMode,
  runGlobalQueue,
  isActive
}: MatrixDashboardProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeMode, setActiveMode] = useState<'questions' | 'materials'>('questions');
  const [isBlindSpotsCollapsed, setIsBlindSpotsCollapsed] = useState(true);

  const [chapters, setChapters] = useState<any[]>([]);
  const prevSuccessCount = React.useRef(0);

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      const response = await client.get(`/api/courses/${course.id}/matrix-coverage`);
      setMatrixData(response.data.matrix);
    } catch (err) {
      console.error(err);
      setError('Không thể tải dữ liệu ma trận bao phủ.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMatrixSilent = async () => {
    try {
      const response = await client.get(`/api/courses/${course.id}/matrix-coverage`);
      setMatrixData(response.data.matrix);
    } catch (err) {
      console.error("fetchMatrixSilent error:", err);
    }
  };

  const fetchChapters = async () => {
    try {
      const response = await client.get(`/api/courses/${course.id}/chapters`);
      setChapters(response.data);
    } catch (err) {
      console.error("fetchChapters error:", err);
    }
  };

  useEffect(() => {
    fetchMatrix();
    fetchChapters();
  }, [course.id]);

  useEffect(() => {
    const handleDbChanged = () => {
      fetchMatrixSilent();
      fetchChapters();
    };
    window.addEventListener('db-state-changed', handleDbChanged);
    return () => {
      window.removeEventListener('db-state-changed', handleDbChanged);
    };
  }, [course.id]);

  useEffect(() => {
    if (queue && queue.length > 0) {
      const successCount = queue.filter(q => q.status === 'success').length;
      if (successCount !== prevSuccessCount.current) {
        prevSuccessCount.current = successCount;
        fetchMatrixSilent();
      }
    } else {
      prevSuccessCount.current = 0;
    }
  }, [queue]);

  const findChapterForClo = (cloCode: string) => {
    if (!chapters || chapters.length === 0) return undefined;
    const matched = chapters.find(ch => 
      (ch.title && ch.title.toLowerCase().includes(cloCode.toLowerCase())) ||
      (ch.description && ch.description.toLowerCase().includes(cloCode.toLowerCase()))
    );
    return matched ? matched.id : chapters[0].id;
  };

  const handleInitQueue = (autoStart = false, overrideMode?: 'questions' | 'materials') => {
    if (isQueueRunning) {
      if (!autoStart) alert('Hàng đợi đang chạy dưới nền. Vui lòng Tạm dừng (Pause) hoặc Đóng hàng đợi hiện tại trước khi khởi tạo hàng đợi mới');
      return;
    }
    if (!matrixData) return;
    const modeToUse = overrideMode || activeMode;
    const newQueue: QueueItem[] = [];
    const cloCodes = Object.keys(matrixData);
    
    cloCodes.forEach(code => {
      const clo = matrixData[code];
      const targetLvl = clo.target_bloom;
      const levels = modeToUse === 'questions' ? (clo.question_levels || clo.levels) : clo.material_levels;
      const count = levels[String(targetLvl)] || 0;
      
      if (count === 0) {
        newQueue.push({
          cloId: clo.clo_id,
          cloCode: code,
          bloomLevel: targetLvl,
          chapterId: findChapterForClo(code),
          status: 'pending',
          errorMsg: '',
          activeStageMessage: ''
        });
      }
    });
    
    if (newQueue.length === 0) {
      if (!autoStart) alert('Tuyệt vời! Hiện tại không có điểm mù nào cần khắc phục.');
      return;
    }
    
    setQueue(newQueue);
    setQueueMode(modeToUse);
    setShowQueuePanel(true);
    setIsQueueRunning(autoStart);
    setQueueProgressMsg(autoStart ? 'Đang tự động khởi chạy hàng đợi khắc phục điểm mù...' : 'Hàng đợi đã sẵn sàng. Hãy bấm "Bắt đầu" để khởi chạy.');

    if (autoStart) {
      setTimeout(() => {
        runGlobalQueue(newQueue, modeToUse, course.id);
      }, 500);
    }
  };

  useEffect(() => {
    const handleProgrammaticTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action, params } = customEvent.detail || {};
      if (action === 'run_remediation_queue') {
        const mode = params?.mode || 'questions';
        setActiveMode(mode);
        handleInitQueue(true, mode);
      }
    };
    window.addEventListener('matrix-dashboard-programmatic-trigger', handleProgrammaticTrigger);
    return () => window.removeEventListener('matrix-dashboard-programmatic-trigger', handleProgrammaticTrigger);
  }, [matrixData, activeMode, isQueueRunning]);

  if (loading) {
    return (
      <div className="matrix-loading-container">
        <div>Đang phân tích độ phủ ma trận CLO - Bloom...</div>
      </div>
    );
  }

  let totalQuestions = 0;
  let totalSlides = 0;
  let totalClos = 0;
  let coveredClosQ = 0;
  let coveredClosM = 0;
  let blindSpotsCountQ = 0;
  let blindSpotsCountM = 0;

  if (matrixData) {
    const cloCodes = Object.keys(matrixData);
    totalClos = cloCodes.length;

    cloCodes.forEach(code => {
      const clo = matrixData[code];
      const targetLvlStr = String(clo.target_bloom);
      
      const qLevels = clo.question_levels || clo.levels || {};
      let qCount = 0;
      Object.keys(qLevels).forEach(lvl => {
        qCount += qLevels[lvl] || 0;
      });
      totalQuestions += qCount;
      if (qCount > 0) coveredClosQ += 1;
      if ((qLevels[targetLvlStr] || 0) === 0) {
        blindSpotsCountQ += 1;
      }

      const mLevels = clo.material_levels || {};
      let mCount = 0;
      Object.keys(mLevels).forEach(lvl => {
        mCount += mLevels[lvl] || 0;
      });
      totalSlides += mCount;
      if (mCount > 0) coveredClosM += 1;
      if ((mLevels[targetLvlStr] || 0) === 0) {
        blindSpotsCountM += 1;
      }
    });
  }

  const blindSpotsCount = activeMode === 'questions' ? blindSpotsCountQ : blindSpotsCountM;

  const getBloomHeader = (lvl: number) => {
    const headers = ["Nhớ (B1)", "Hiểu (B2)", "Vận dụng (B3)", "Phân tích (B4)", "Đánh giá (B5)", "Sáng tạo (B6)"];
    return headers[lvl - 1];
  };

  return (
    <div className="matrix-container">
      {/* HEADER */}
      {!portalTarget && (
        <header className="matrix-header">
          <div className="matrix-header-left">
            <button onClick={onBack} className="matrix-back-btn">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div className="matrix-course-info">
              <h2 className="matrix-course-title">Báo Cáo Độ Phủ Ma Trận CLO - Bloom</h2>
            </div>
          </div>
        </header>
      )}

      {error && <div className="matrix-error-alert">{error}</div>}

      {matrixData && (
        <div className="matrix-content">
          {/* TAB MODE SELECTOR */}
          <div className="matrix-tab-container">
            <button 
              onClick={() => {
                if (isQueueRunning) {
                  alert('Hàng đợi đang chạy dưới nền. Vui lòng Tạm dừng (Pause) hoặc Đóng hàng đợi hiện tại trước khi chuyển đổi chế độ.');
                  return;
                }
                setActiveMode('questions');
              }} 
              className={activeMode === 'questions' ? "matrix-active-tab-btn" : "matrix-inactive-tab-btn"}
            >
              <span className="matrix-tab-btn-content">
                <ClipboardList size={16} /> Ma trận Đề thi (Câu hỏi)
              </span>
            </button>
            <button 
              onClick={() => {
                if (isQueueRunning) {
                  alert('Hàng đợi đang chạy dưới nền. Vui lòng Tạm dừng (Pause) hoặc Đóng hàng đợi hiện tại trước khi chuyển đổi chế độ.');
                  return;
                }
                setActiveMode('materials');
              }} 
              className={activeMode === 'materials' ? "matrix-active-tab-btn" : "matrix-inactive-tab-btn"}
            >
              <span className="matrix-tab-btn-content">
                <Image size={16} /> Ma trận Bài giảng (Nội dung)
              </span>
            </button>
          </div>

          {/* STATS OVERVIEW CARDS */}
          <div className="matrix-stats-row">
            <div className="matrix-stat-card">
              <div className="matrix-stat-label">{activeMode === 'questions' ? 'Tổng số Câu hỏi' : 'Tổng số Slide bài giảng'}</div>
              <div className="matrix-stat-value">{activeMode === 'questions' ? totalQuestions : totalSlides}</div>
              <div className="matrix-stat-sub">{activeMode === 'questions' ? 'Đã lưu trữ trong ngân hàng đề' : 'Đã thiết kế trong các chương học'}</div>
            </div>
            
            <div className="matrix-stat-card">
              <div className="matrix-stat-label">{activeMode === 'questions' ? 'Độ bao phủ CLOs (Câu hỏi)' : 'Độ bao phủ CLOs (Slide)'}</div>
              <div className="matrix-stat-value">
                {activeMode === 'questions' ? `${coveredClosQ}/${totalClos}` : `${coveredClosM}/${totalClos}`}
              </div>
              <div className="matrix-stat-sub">
                {totalClos > 0 ? `${(((activeMode === 'questions' ? coveredClosQ : coveredClosM)/totalClos)*100).toFixed(0)}%` : '0%'} chuẩn đầu ra đã được bao phủ
              </div>
            </div>

            <div className="matrix-stat-card-danger" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="matrix-stat-label">Điểm mù Chất lượng (Blind Spots)</div>
              <div className="matrix-stat-remedy-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', marginBottom: '6px' }}>
                <div className="matrix-stat-value matrix-stat-value-no-margin">{activeMode === 'questions' ? blindSpotsCountQ : blindSpotsCountM}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {blindSpotsCount > 0 && (
                    <button 
                      onClick={() => handleInitQueue()}
                      className="matrix-remedy-btn"
                      title="Tự động khởi chạy hàng đợi sửa chữa tất cả điểm mù chất lượng qua AI"
                    >
                      <Zap size={14} /> Khắc phục
                    </button>
                  )}
                  {blindSpotsCount > 0 && (
                    <button
                      onClick={() => setIsBlindSpotsCollapsed(!isBlindSpotsCollapsed)}
                      className="matrix-toggle-blind-spots-btn"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#f87171',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 700,
                        fontSize: '13px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                        minHeight: '38px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                      }}
                    >
                      {isBlindSpotsCollapsed ? 'Chi tiết' : 'Ẩn'}
                      {isBlindSpotsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                  )}
                </div>
              </div>
              <div className="matrix-stat-sub-danger" style={{ marginBottom: !isBlindSpotsCollapsed && blindSpotsCount > 0 ? '12px' : '0px' }}>
                {activeMode === 'questions' ? 'CLOs chưa có câu hỏi đúng mức Bloom quy định' : 'CLOs chưa có nội dung slide đúng mức Bloom quy định'}
              </div>

              {!isBlindSpotsCollapsed && blindSpotsCount > 0 && (
                <div className="matrix-blind-spots-inline-list" style={{ marginTop: '16px', borderTop: '1px dashed rgba(239, 68, 68, 0.3)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                  {Object.keys(matrixData).map(code => {
                    const clo = matrixData[code];
                    const targetLvl = clo.target_bloom;
                    const levels = activeMode === 'questions' ? (clo.question_levels || clo.levels) : clo.material_levels;
                    const count = levels[String(targetLvl)] || 0;
                    if (count === 0) {
                      return (
                        <div key={code} className="matrix-blind-spot-alert" style={{ margin: 0, padding: '10px 12px', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '8px', borderLeft: '3px solid rgba(239, 68, 68, 0.7)' }}>
                          <strong>Chuẩn đầu ra {code}:</strong> Chưa có {activeMode === 'questions' ? 'câu hỏi' : 'slide'} cho mức <strong>{getBloomHeader(targetLvl)}</strong>.
                          <p className="matrix-blind-spot-desc" style={{ marginTop: '4px', fontSize: '12px', opacity: 0.85 }}>
                            * Gợi ý: {activeMode === 'questions' ? `Mở Ngân hàng câu hỏi, chọn ${code} mức B${targetLvl} để sinh thêm.` : `Mở Soạn bài giảng, bổ sung slide B${targetLvl} cho chương học tương ứng.`}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          </div>

          {/* HEATMAP TABLE */}
          <section className="matrix-heatmap-card">
            <h3 className="matrix-section-title">Ma trận Phủ Chuẩn đầu ra (Bloom x CLO Heatmap) — {activeMode === 'questions' ? 'Góc nhìn Đánh giá' : 'Góc nhìn Giảng dạy'}</h3>
            <p className="matrix-section-sub">
              Màu tím đậm biểu thị mức độ phủ cao. Ô có đường viền nét đứt <strong className="matrix-heatmap-desc-warning-text">màu đỏ</strong> có biểu tượng cảnh báo (<span className="matrix-heatmap-desc-warning-icon-wrapper"><AlertTriangle size={14} /></span>) chính là <strong>Điểm mù (Blind Spot)</strong> cần bổ sung câu hỏi/nội dung giảng dạy gấp.
            </p>

            <div className="matrix-table-wrapper">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="matrix-th-label">Chuẩn Đầu Ra (CLOs)</th>
                    <th className="matrix-th-center">Mức Mục Tiêu</th>
                    {[1, 2, 3, 4, 5, 6].map(b => (
                      <th key={b} className="matrix-th">{getBloomHeader(b)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(matrixData).map(code => {
                    const clo = matrixData[code];
                    return (
                      <tr key={code} className="matrix-tr">
                        <td className="matrix-td-label">
                          <strong className="matrix-clo-code">{code}</strong>
                          <span className="matrix-clo-desc">{clo.description}</span>
                        </td>
                        <td className="matrix-td-target">
                          <span className="matrix-target-badge">B{clo.target_bloom}</span>
                        </td>
                        {[1, 2, 3, 4, 5, 6].map(b => {
                          const levels = activeMode === 'questions' ? (clo.question_levels || clo.levels) : clo.material_levels;
                          const count = levels[String(b)] || 0;
                          const isTarget = clo.target_bloom === b;
                          const isBlindSpot = isTarget && count === 0;
                          
                          let bg = 'rgba(15, 23, 42, 0.3)';
                          let border = '1px solid rgba(255, 255, 255, 0.04)';
                          
                          if (count > 0) {
                             const opacity = Math.min(0.9, 0.15 + count * 0.18);
                             const rgbColor = activeMode === 'questions' ? '99, 102, 241' : '20, 184, 166';
                             bg = `rgba(${rgbColor}, ${opacity})`;
                          } else if (isBlindSpot) {
                             bg = 'rgba(239, 68, 68, 0.08)';
                             border = '2px dashed rgba(239, 68, 68, 0.5)';
                          } else if (isTarget) {
                             bg = 'rgba(255, 255, 255, 0.02)';
                             border = '1px dashed rgba(255, 255, 255, 0.2)';
                          }

                          return (
                            <td 
                              key={b} 
                              className="matrix-td-cell"
                              style={{
                                backgroundColor: bg,
                                border: border
                              }}
                              onClick={() => {
                                onNavigate(activeMode === 'questions' ? 'question_bank' : 'lesson_planner', {
                                  cloId: clo.clo_id,
                                  cloCode: code,
                                  bloomLevel: b
                                });
                              }}
                              title={
                                isBlindSpot 
                                  ? `Nhấn để khắc phục điểm mù: Thêm ${activeMode === 'questions' ? 'câu hỏi' : 'bài giảng'} còn thiếu cho ${code} - Mức Bloom B${b}` 
                                  : `Thống kê ${code} - Bloom B${b}: có ${count} mục. Nhấn để chuyển đến trang chi tiết.`
                              }
                            >
                              <div className="matrix-cell-content">
                                <span className={count > 0 ? "matrix-cell-count-active" : "matrix-cell-count"}>
                                  {count}
                                </span>
                                {isBlindSpot && (
                                  <span className="matrix-blind-warning matrix-blind-warning-content">
                                    <AlertTriangle size={10} /> Thiếu
                                  </span>
                                )}
                                {isTarget && !isBlindSpot && count > 0 && (
                                  <span className="matrix-target-tick matrix-target-tick-content">
                                    <CheckCircle size={10} /> Đạt
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
