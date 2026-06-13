'use client';

import React, { useState, useEffect, useRef } from 'react';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import CourseRoadmap from './views/CourseRoadmap';
import CourseConfig from './views/CourseConfig';
import LessonPlanner from './views/LessonPlanner';
import QuestionBank from './views/QuestionBank';
import MatrixDashboard from './views/MatrixDashboard';
import KnowledgeBase from './views/KnowledgeBase';
import ChatBot from './views/ChatBot';
import MonitorDashboard from './views/MonitorDashboard';
import AppShell from './components/AppShell';
import { User, Course, QueueItem } from '@/types';
import { Zap, X, Play, Pause, Check, Loader2, Maximize2, Minimize2, Cpu } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<string>('login'); // 'login' | 'dashboard' | 'course_roadmap' | 'course_config' | 'lesson_planner' | 'question_bank' | 'matrix_dashboard' | 'knowledge_base' | 'chatbot'
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [activeCloId, setActiveCloId] = useState<number | null>(null);
  const [activeCloCode, setActiveCloCode] = useState<string | null>(null);
  const [activeBloomLevel, setActiveBloomLevel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // --- States cho Giám sát AI và Trạng thái AI toàn cục ---
  const [monitorStats, setMonitorStats] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_monitor_stats');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Lỗi khi parse ai_monitor_stats:', e);
        }
      }
    }
    return {
      totalCost: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      averageLatency: 0,
      modelName: 'gpt-4o',
      logs: []
    };
  });

  const [globalAIStatus, setGlobalAIStatus] = useState({
    isProcessing: false,
    message: ''
  });

  // Lưu monitorStats vào localStorage khi thay đổi
  useEffect(() => {
    localStorage.setItem('ai_monitor_stats', JSON.stringify(monitorStats));
  }, [monitorStats]);

  const onRecordAIUsage = (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => {
    setMonitorStats(prev => {
      const promptTokens = usage.tokens?.prompt || 0;
      const completionTokens = usage.tokens?.completion || 0;
      const cost = usage.cost || 0;
      const currentModel = usage.model || prev.modelName;

      const newLog = {
        id: Date.now().toString() + Math.random().toString().slice(2, 6),
        timestamp: new Date().toLocaleTimeString(),
        operation: usage.operation,
        model: currentModel,
        latency: Number(usage.latency),
        cost: cost,
        tokens: promptTokens + completionTokens,
        status: usage.status
      };

      const newLogs = [newLog, ...prev.logs].slice(0, 50);
      const newTotalRequests = prev.totalRequests + 1;
      const newAverageLatency = Number(
        ((prev.averageLatency * prev.totalRequests + Number(usage.latency)) / newTotalRequests).toFixed(2)
      );

      return {
        totalCost: Number((prev.totalCost + cost).toFixed(4)),
        totalPromptTokens: prev.totalPromptTokens + promptTokens,
        totalCompletionTokens: prev.totalCompletionTokens + completionTokens,
        totalRequests: newTotalRequests,
        averageLatency: newAverageLatency,
        modelName: currentModel,
        logs: newLogs
      };
    });
  };

  const onClearMonitorStats = () => {
    setMonitorStats({
      totalCost: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalRequests: 0,
      averageLatency: 0,
      modelName: 'gpt-4o',
      logs: []
    });
  };

  const setAIProcessingStatus = (isProcessing: boolean, message: string = '') => {
    setGlobalAIStatus({ isProcessing, message });
  };

  // --- States và Refs cho Hàng đợi Tự động Khắc phục Điểm mù Toàn cục ---
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [queueProgressMsg, setQueueProgressMsg] = useState('');
  const [queueMode, setQueueMode] = useState<'questions' | 'materials'>('questions'); // 'questions' | 'materials'
  const [isQueueMinimized, setIsQueueMinimized] = useState(false);
  const [queuePosition, setQueuePosition] = useState<{ x: number; y: number } | null>(null); // { x, y }
  const [isFastMode, setIsFastMode] = useState(false); // Chế độ sinh nhanh

  const cancelRef = useRef(false);
  const dragRef = useRef<HTMLDivElement | null>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const resetQueueState = () => {
    setQueue([]);
    setIsQueueRunning(false);
    setShowQueuePanel(false);
    setIsQueueMinimized(false);
    setQueuePosition(null);
    setIsFastMode(false);
    cancelRef.current = true;
  };

  // Draggable handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;
    const panel = dragRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragStartOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const newX = e.clientX - dragStartOffset.current.x;
    const newY = e.clientY - dragStartOffset.current.y;
    // Giới hạn panel nằm trong cửa sổ trình duyệt
    const boundedX = Math.max(10, Math.min(window.innerWidth - (isQueueMinimized ? 250 : 420), newX));
    const boundedY = Math.max(10, Math.min(window.innerHeight - (isQueueMinimized ? 80 : 530), newY));
    setQueuePosition({ x: boundedX, y: boundedY });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Chạy hàng đợi tuần tự để tránh quá tải cho Local LLM bằng SSE Streams
  const runGlobalQueue = async (currentQueue: QueueItem[], mode: 'questions' | 'materials', courseId: number) => {
    setIsQueueRunning(true);
    setQueueMode(mode);
    const updatedQueue = [...currentQueue];
    const token = localStorage.getItem('token');

    for (let i = 0; i < updatedQueue.length; i++) {
      if (updatedQueue[i].status === 'success') continue;

      if (cancelRef.current) {
        setIsQueueRunning(false);
        setQueueProgressMsg('Hàng đợi đã tạm dừng theo yêu cầu của bạn.');
        setAIProcessingStatus(false);
        return;
      }

      const opStartTime = Date.now();
      updatedQueue[i].status = 'generating';
      updatedQueue[i].activeStageMessage = 'Khởi động AI…';
      setQueue([...updatedQueue]);
      setQueueProgressMsg(`Đang tự động bổ sung cho ${updatedQueue[i].cloCode} - Bloom B${updatedQueue[i].bloomLevel}…`);
      setAIProcessingStatus(true, `Hàng đợi: Bổ sung cho ${updatedQueue[i].cloCode} - Bloom B${updatedQueue[i].bloomLevel}…`);

      let usageData: any = null;
      try {
        if (mode === 'questions') {
          // Sinh câu hỏi qua SSE Stream
          const response = await fetch(
            `http://localhost:8000/api/courses/${courseId}/questions/generate-stream`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                clo_id: updatedQueue[i].cloId,
                bloom_level: updatedQueue[i].bloomLevel,
                count: 2,
                fast_mode: isFastMode
              })
            }
          );

          if (!response.ok) {
            throw new Error(`Lỗi server: ${response.status}`);
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentEvent = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (currentEvent === 'stage') {
                    updatedQueue[i].activeStageMessage = data.message;
                    setQueue([...updatedQueue]);
                    setAIProcessingStatus(true, `Hàng đợi: ${data.message}`);
                  } else if (currentEvent === 'question') {
                    updatedQueue[i].activeStageMessage = `Đã lưu câu hỏi ${data.index}/${data.total}`;
                    setQueue([...updatedQueue]);
                  } else if (currentEvent === 'done') {
                    if (data.usage) {
                      usageData = data.usage;
                    }
                  } else if (currentEvent === 'error') {
                    throw new Error(data.message);
                  }
                } catch (_) { }
              }
            }
          }
        } else {
          // Sinh slide mới qua SSE Stream
          const chId = updatedQueue[i].chapterId;
          if (!chId) {
            throw new Error('Không có chương học nào để bổ sung slide.');
          }

          const response = await fetch(
            `http://localhost:8000/api/courses/chapters/${chId}/append-slide-for-clo-stream`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                clo_id: updatedQueue[i].cloId,
                bloom_level: updatedQueue[i].bloomLevel
              })
            }
          );

          if (!response.ok) {
            throw new Error(`Lỗi server: ${response.status}`);
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentEvent = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (currentEvent === 'stage') {
                    updatedQueue[i].activeStageMessage = data.message;
                    setQueue([...updatedQueue]);
                    setAIProcessingStatus(true, `Hàng đợi: ${data.message}`);
                  } else if (currentEvent === 'done') {
                    if (data.usage) {
                      usageData = data.usage;
                    }
                  } else if (currentEvent === 'error') {
                    throw new Error(data.message);
                  }
                } catch (_) { }
              }
            }
          }
        }

        updatedQueue[i].status = 'success';
        updatedQueue[i].activeStageMessage = '';
        setQueue([...updatedQueue]);

        const opLatency = (Date.now() - opStartTime) / 1000;
        onRecordAIUsage({
          operation: `Hàng đợi: Bổ sung ${mode === 'questions' ? 'câu hỏi' : 'slide'} cho ${updatedQueue[i].cloCode}`,
          latency: Number(opLatency.toFixed(1)),
          cost: usageData?.total_cost || (mode === 'questions' ? 0.015 : 0.035),
          tokens: usageData ? { prompt: usageData.prompt_tokens, completion: usageData.completion_tokens } : undefined,
          model: usageData?.model_name || undefined,
          status: 'success'
        });
      } catch (err: any) {
        console.error(err);
        updatedQueue[i].status = 'failed';
        updatedQueue[i].activeStageMessage = '';
        updatedQueue[i].errorMsg = err.message || 'Lỗi hệ thống';
        setQueue([...updatedQueue]);

        const opLatency = (Date.now() - opStartTime) / 1000;
        onRecordAIUsage({
          operation: `Hàng đợi: Bổ sung ${mode === 'questions' ? 'câu hỏi' : 'slide'} cho ${updatedQueue[i].cloCode}`,
          latency: Number(opLatency.toFixed(1)),
          cost: 0,
          status: 'error'
        });
      }
    }

    setIsQueueRunning(false);
    setAIProcessingStatus(false);
    const completedAll = updatedQueue.every(item => item.status === 'success');
    if (completedAll) {
      setQueueProgressMsg('Tất cả điểm mù chất lượng đã được tự động khắc phục thành công!');
    } else {
      setQueueProgressMsg('Hàng đợi kết thúc. Hãy khắc phục các mục bị lỗi.');
    }
  };

  const handleNavigate = (view: string, extra: any = null) => {
    if (extra !== null) {
      if (typeof extra === 'object') {
        if (extra.chapterId !== undefined) setActiveChapterId(extra.chapterId);
        if (extra.cloId !== undefined) {
          setActiveCloId(extra.cloId);
        } else {
          setActiveCloId(null);
        }
        if (extra.cloCode !== undefined) {
          setActiveCloCode(extra.cloCode);
        } else {
          setActiveCloCode(null);
        }
        if (extra.bloomLevel !== undefined) {
          setActiveBloomLevel(extra.bloomLevel);
        } else {
          setActiveBloomLevel(null);
        }
      } else if (typeof extra === 'number') {
        setActiveChapterId(extra);
        setActiveCloId(null);
        setActiveCloCode(null);
        setActiveBloomLevel(null);
      }
    } else {
      setActiveCloId(null);
      setActiveCloCode(null);
      setActiveBloomLevel(null);
    }
    setActiveView(view);
    localStorage.setItem('active_view', view);
    if (view === 'dashboard') {
      setSelectedCourse(null);
      localStorage.removeItem('selected_course');
    }
  };

  useEffect(() => {
    // Tự động đăng nhập nếu có token và user trong localStorage
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      setUser(JSON.parse(savedUser));
      
      // Khôi phục môn học đã chọn và view đang xem trước đó
      const savedCourse = localStorage.getItem('selected_course');
      const savedView = localStorage.getItem('active_view');
      
      if (savedCourse) {
        try {
          const course = JSON.parse(savedCourse);
          setSelectedCourse(course);
          
          if (savedView && savedView !== 'login') {
            setActiveView(savedView);
          } else {
            setActiveView('course_roadmap');
          }
        } catch (e) {
          console.error(e);
          setActiveView('dashboard');
        }
      } else {
        if (savedView && savedView !== 'login') {
          setActiveView(savedView);
        } else {
          setActiveView('dashboard');
        }
      }
    } else {
      setActiveView('login');
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setActiveView('dashboard');
    localStorage.setItem('active_view', 'dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selected_course');
    localStorage.removeItem('active_view');
    setUser(null);
    setSelectedCourse(null);
    setActiveView('login');
    resetQueueState();
  };

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    localStorage.setItem('selected_course', JSON.stringify(course));
    setActiveView('course_roadmap');
    localStorage.setItem('active_view', 'course_roadmap');
    resetQueueState();
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div>Đang tải ứng dụng…</div>
      </div>
    );
  }

  return (
    <>
      {activeView === 'login' && (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
      {activeView === 'dashboard' && (
        <Dashboard
          user={user}
          onLogout={handleLogout}
          onSelectCourse={handleSelectCourse}
        />
      )}
      {selectedCourse && ['course_roadmap', 'course_config', 'lesson_planner', 'question_bank', 'matrix_dashboard', 'knowledge_base', 'chatbot', 'ai_monitor'].includes(activeView) && (
        <AppShell
          key={selectedCourse.id}
          course={selectedCourse}
          activeView={activeView}
          onNavigate={(view) => handleNavigate(view)}
          onLogout={handleLogout}
        >
          <div style={{ display: activeView === 'chatbot' ? 'block' : 'none' }}>
            <ChatBot
              course={selectedCourse}
              onGoBack={() => handleNavigate('course_roadmap')}
              activeView={activeView}
              isActive={activeView === 'chatbot'}
            />
          </div>
          <div style={{ display: activeView === 'course_roadmap' ? 'block' : 'none' }}>
            <CourseRoadmap
              course={selectedCourse}
              onBack={() => handleNavigate('dashboard')}
              onLogout={handleLogout}
              onNavigate={handleNavigate}
            />
          </div>
          <div style={{ display: activeView === 'course_config' ? 'block' : 'none' }}>
            <CourseConfig
              course={selectedCourse}
              onBack={() => handleNavigate('course_roadmap')}
              onNavigate={handleNavigate}
              onStartPlanning={() => handleNavigate('lesson_planner')}
              onRecordAIUsage={onRecordAIUsage}
              setAIProcessingStatus={setAIProcessingStatus}
              isActive={activeView === 'course_config'}
            />
          </div>
          <div style={{ display: activeView === 'lesson_planner' ? 'block' : 'none' }}>
            <LessonPlanner
              course={selectedCourse}
              initialChapterId={activeChapterId}
              initialCloId={activeCloId}
              initialCloCode={activeCloCode}
              initialBloomLevel={activeBloomLevel}
              onBack={() => handleNavigate('course_roadmap')}
              onLogout={handleLogout}
              onNavigate={handleNavigate}
              onGoToQuestionBank={() => handleNavigate('question_bank')}
              onRecordAIUsage={onRecordAIUsage}
              setAIProcessingStatus={setAIProcessingStatus}
              isActive={activeView === 'lesson_planner'}
            />
          </div>
          <div style={{ display: activeView === 'question_bank' ? 'block' : 'none' }}>
            <QuestionBank
              course={selectedCourse}
              initialChapterId={activeChapterId}
              initialCloId={activeCloId}
              initialBloomLevel={activeBloomLevel}
              onBack={() => handleNavigate('course_roadmap')}
              onGoToLessonPlanner={() => handleNavigate('lesson_planner')}
              onViewDashboard={() => handleNavigate('matrix_dashboard')}
              onNavigate={handleNavigate}
              onRecordAIUsage={onRecordAIUsage}
              setAIProcessingStatus={setAIProcessingStatus}
              isActive={activeView === 'question_bank'}
            />
          </div>
          <div style={{ display: activeView === 'matrix_dashboard' ? 'block' : 'none' }}>
            <MatrixDashboard
              course={selectedCourse}
              onBack={() => handleNavigate('course_roadmap')}
              onNavigate={handleNavigate}
              queue={queue}
              isQueueRunning={isQueueRunning}
              showQueuePanel={showQueuePanel}
              queueProgressMsg={queueProgressMsg}
              setIsQueueRunning={setIsQueueRunning}
              setQueue={setQueue}
              setShowQueuePanel={setShowQueuePanel}
              setQueueProgressMsg={setQueueProgressMsg}
              setQueueMode={setQueueMode}
              cancelRef={cancelRef}
              runGlobalQueue={runGlobalQueue}
              isActive={activeView === 'matrix_dashboard'}
            />
          </div>
          <div style={{ display: activeView === 'knowledge_base' ? 'block' : 'none' }}>
            <KnowledgeBase
              course={selectedCourse}
              onBack={() => handleNavigate('course_roadmap')}
              onLogout={handleLogout}
              onNavigate={(view) => handleNavigate(view)}
              activeView={activeView}
              isActive={activeView === 'knowledge_base'}
            />
          </div>
          <div style={{ display: activeView === 'ai_monitor' ? 'block' : 'none' }}>
            {selectedCourse && activeView === 'ai_monitor' && (
              <MonitorDashboard
                course={selectedCourse}
                monitorStats={monitorStats}
                onClearStats={onClearMonitorStats}
                onBack={() => handleNavigate('course_roadmap')}
                isActive={activeView === 'ai_monitor'}
              />
            )}
          </div>
        </AppShell>
      )}

      {/* FLOATING BATCH REMEDIATION QUEUE DRAWER/PANEL */}
      {selectedCourse && showQueuePanel && (
        isQueueMinimized ? (
          /* Minimized state */
          <div
            ref={dragRef}
            style={{
              position: 'fixed',
              ...(queuePosition
                ? { left: `${queuePosition.x}px`, top: `${queuePosition.y}px` }
                : { right: '24px', bottom: '24px' }),
              width: '240px',
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              boxShadow: '0 8px 25px rgba(0, 0, 0, 0.5)',
              zIndex: 9999,
              fontFamily: '"Outfit", "Inter", sans-serif',
              cursor: 'move',
              userSelect: 'none',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            onMouseDown={handleMouseDown}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isQueueRunning ? '#fbbf24' : '#64748b',
                boxShadow: isQueueRunning ? '0 0 8px #fbbf24' : 'none',
                flexShrink: 0
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} aria-hidden="true" /> Hàng đợi Điểm Mù
                </span>
                <span style={{ fontSize: '11px', color: '#cbd5e1', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  Tiến độ: {queue.filter(q => q.status === 'success').length}/{queue.length} ({Math.round((queue.filter(q => q.status === 'success').length / queue.length) * 100)}%)
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={() => setIsQueueMinimized(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Mở rộng"
              >
                <Maximize2 size={12} aria-hidden="true" />
              </button>
              <button
                onClick={() => {
                  cancelRef.current = true;
                  setShowQueuePanel(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Đóng"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          /* Maximized state */
          <div
            ref={dragRef}
            style={{
              position: 'fixed',
              ...(queuePosition
                ? { left: `${queuePosition.x}px`, top: `${queuePosition.y}px` }
                : { right: '24px', bottom: '24px' }),
              width: '400px',
              maxHeight: '520px',
              background: 'rgba(15, 23, 42, 0.96)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              fontFamily: '"Outfit", "Inter", sans-serif',
            }}
          >
            {/* Header */}
            <div
              onMouseDown={handleMouseDown}
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(30, 41, 59, 0.4)',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
                cursor: 'move',
                userSelect: 'none'
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} aria-hidden="true" /> Hàng đợi Khắc phục Điểm mù
                </h4>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Khắc phục chuẩn CLO - Bloom ({queueMode === 'questions' ? 'Đề thi' : 'Bài giảng'})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsQueueMinimized(true)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#cbd5e1',
                    borderRadius: '4px',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Thu gọn"
                >
                  <Minimize2 size={12} aria-hidden="true" />
                </button>
                <button
                  onClick={() => {
                    cancelRef.current = true;
                    setShowQueuePanel(false);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#cbd5e1',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Đóng"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Body List */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'left' }}>
                {queueProgressMsg || 'Hàng đợi đang chờ khởi chạy…'}
              </div>

              {/* Fast Mode Toggle */}
              {queueMode === 'questions' && !isQueueRunning && queue.every(q => q.status !== 'success') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px', margin: '4px 0', textAlign: 'left' }}>
                  <input
                    type="checkbox"
                    id="fast-mode-checkbox"
                    checked={isFastMode}
                    onChange={(e) => setIsFastMode(e.target.checked)}
                    style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                  />
                  <label htmlFor="fast-mode-checkbox" style={{ fontSize: '12px', color: '#fbbf24', cursor: 'pointer', userSelect: 'none', fontWeight: '600' }} title="Bỏ qua bước giải đề thử của Solver giúp rút ngắn thời gian sinh">
                    ⚡ Chế độ sinh nhanh (Fast Mode - Bỏ qua tự sửa sai)
                  </label>
                </div>
              )}

              {/* Progress bar */}
              {queue.length > 0 && (
                <div style={{ margin: '5px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    <span>Tiến độ: {queue.filter(q => q.status === 'success').length}/{queue.length}</span>
                    <span>{Math.round((queue.filter(q => q.status === 'success').length / queue.length) * 100)}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${(queue.filter(q => q.status === 'success').length / queue.length) * 100}%`,
                      background: 'linear-gradient(90deg, #f59e0b 0%, #10b981 100%)',
                      transition: 'width 0.3s ease-in-out'
                    }} />
                  </div>
                </div>
              )}

              {/* Queue items list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {queue.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '8px 12px',
                      background: item.status === 'generating' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                      border: item.status === 'generating' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '600', color: '#cbd5e1' }}>
                        {item.cloCode} — Bloom B{item.bloomLevel}
                      </span>
                      <div>
                        {item.status === 'pending' && <span style={{ color: '#94a3b8', fontSize: '11px' }}>Chờ xử lý</span>}
                        {item.status === 'generating' && <span style={{ color: '#fbbf24', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Loader2 size={11} className="animate-spin" aria-hidden="true" /> Đang xử lý</span>}
                        {item.status === 'success' && <span style={{ color: '#10b981', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={11} aria-hidden="true" /> Đã phủ</span>}
                        {item.status === 'failed' && <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><X size={11} aria-hidden="true" /> Lỗi</span>}
                      </div>
                    </div>

                    {/* Real-time Stage message */}
                    {item.status === 'generating' && item.activeStageMessage && (
                      <div style={{ fontSize: '11px', color: '#fcd34d', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', textAlign: 'left' }}>
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }} />
                        {item.activeStageMessage}
                      </div>
                    )}

                    {item.errorMsg && (
                      <span style={{ fontSize: '10px', color: '#f87171', marginTop: '2px', textAlign: 'left' }}>
                        Lỗi: {item.errorMsg}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(30, 41, 59, 0.2)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              borderBottomLeftRadius: '16px',
              borderBottomRightRadius: '16px',
            }}>
              {!isQueueRunning ? (
                <button
                  onClick={() => {
                    cancelRef.current = false;
                    if (selectedCourse) {
                      runGlobalQueue(queue, queueMode, selectedCourse.id);
                    }
                  }}
                  disabled={queue.length === 0 || queue.every(q => q.status === 'success')}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(245, 158, 11, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Play size={12} aria-hidden="true" /> Bắt đầu
                </button>
              ) : (
                <button
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fbbf24',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Pause size={12} aria-hidden="true" /> Tạm dừng
                </button>
              )}
              <button
                onClick={() => {
                  cancelRef.current = true;
                  setShowQueuePanel(false);
                }}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        )
      )}

      {/* GLOBAL AI PROCESSING FLOATING BUBBLE */}
      {globalAIStatus.isProcessing && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 10000,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          padding: '16px 20px',
          boxShadow: 'var(--shadow-lg)',
          width: '320px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          fontFamily: '"Outfit", "Inter", sans-serif',
          color: 'var(--text-primary)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--accent-color)' }} aria-hidden="true" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--text-primary)', textAlign: 'left' }}>Trợ lý AI đang xử lý…</span>
            <span style={{
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              marginTop: '2px',
              textAlign: 'left',
              wordBreak: 'break-word',
              lineHeight: '1.4'
            }}>
              {globalAIStatus.message || 'Vui lòng đợi trong giây lát…'}
            </span>
          </div>
          <button
            onClick={() => setAIProcessingStatus(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            title="Đóng thông báo"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

const styles = {
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'radial-gradient(circle at 10% 20%, rgb(15, 23, 42) 0%, rgb(9, 13, 26) 90%)',
    color: '#94a3b8',
    fontFamily: '"Outfit", "Inter", sans-serif',
  } as React.CSSProperties
};
