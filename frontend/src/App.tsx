'use client';

import React, { useState, useEffect, useRef } from 'react';
import Login from './views/Login';
import Landing from './views/Landing';
import Dashboard from './views/Dashboard';
import CourseRoadmap from './views/CourseRoadmap';
import CourseConfig from './views/CourseConfig';
import LessonPlanner from './views/LessonPlanner';
import QuestionBank from './views/QuestionBank';
import MatrixDashboard from './views/MatrixDashboard';
import KnowledgeBase from './views/KnowledgeBase';
import ChatBot from './views/ChatBot';
import AppShell from './components/AppShell';
import MonitorDashboard from './views/MonitorDashboard';
import AdminDashboard from './views/AdminDashboard';
import Trash from './views/Trash';
import AssessmentHub from './views/AssessmentHub';
import { User, Course, QueueItem } from '@/types';
import { Zap, X, Play, Pause, Check, Loader2, Maximize2, Minimize2, Cpu, AlertTriangle } from 'lucide-react';
import MascotCompanion from './components/MascotCompanion';
import { useUILock } from './context/UILockContext';
import { useAI } from './context/AIContext';
import { useQueue } from './context/QueueContext';
import RemediationQueueDrawer from './components/RemediationQueueDrawer';
import AIActionConfirmModal from './components/AIActionConfirmModal';
import DirtyWarningModal from './components/DirtyWarningModal';

const cleanLogText = (text: string) => {
  if (!text) return '';
  return text.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}️\s✅⚡⏳🛡️🎨🔍✍️🧩💾☁️⏱️❌🎉⚠️]+/u, '').trim();
};



export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<string>('landing'); // 'landing' | 'login' | 'dashboard' | 'course_roadmap' | 'course_config' | 'lesson_planner' | 'question_bank' | 'matrix_dashboard' | 'knowledge_base' | 'chatbot' | 'trash'
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null);
  const [activeCloId, setActiveCloId] = useState<number | null>(null);
  const [activeCloCode, setActiveCloCode] = useState<string | null>(null);
  const [activeBloomLevel, setActiveBloomLevel] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [forceOpenPedagogicalModal, setForceOpenPedagogicalModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<{
    view: string;
    action: string;
    params: any;
    message?: string;
  } | null>(null);
  const [showActionModal, setShowActionModal] = useState<boolean>(false);
  const [showDirtyModal, setShowDirtyModal] = useState<boolean>(false);
  const [dirtyActionCallback, setDirtyActionCallback] = useState<(() => void) | null>(null);
  const [isSavingDirty, setIsSavingDirty] = useState<boolean>(false);
  const { locks, fetchLocks } = useUILock();
  const { monitorStats, globalAIStatus, recordAIUsage, setAIProcessingStatus, clearMonitorStats } = useAI();
  const { resetQueueState } = useQueue();

  const onRecordAIUsage = recordAIUsage;
  const onClearMonitorStats = clearMonitorStats;

  const checkDirtyAndExecute = (action: () => void) => {
    if ((window as any).isDirty) {
      setDirtyActionCallback(() => action);
      setShowDirtyModal(true);
    } else {
      action();
    }
  };

  const handleNavigate = (view: string, extra: any = null) => {
    const performNavigation = () => {
      if (view === 'chatbot' && process.env.NEXT_PUBLIC_HIDE_CHAT === 'true') {
        view = 'course_roadmap';
      }
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

    checkDirtyAndExecute(performNavigation);
  };

  useEffect(() => {
    // Tự động đăng nhập nếu có token và user trong localStorage
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        
        // Khôi phục môn học đã chọn và view đang xem trước đó
        const savedCourse = localStorage.getItem('selected_course');
        const savedView = localStorage.getItem('active_view');
        
        if (parsedUser && parsedUser.role === 'admin') {
          // Admin luôn được đưa về admin_dashboard
          if (savedView && ['admin_dashboard', 'ai_monitor'].includes(savedView)) {
            setActiveView(savedView);
          } else {
            setActiveView('admin_dashboard');
            localStorage.setItem('active_view', 'admin_dashboard');
          }
        } else if (savedCourse) {
          try {
            const course = JSON.parse(savedCourse);
            setSelectedCourse(course);
            fetchLocks(course.id);
            
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
          setActiveView('dashboard');
        }
      } catch (e) {
        console.error(e);
        setActiveView('landing');
      }
    } else {
      setActiveView('landing');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (window as any).hasPendingAction = showActionModal;
  }, [showActionModal]);

  useEffect(() => {
    const handleGlobalSyllabusUpload = (e: Event) => {
      const customEvent = e as CustomEvent;
      const file = customEvent.detail.file;
      if (file && selectedCourse) {
        handleNavigate('course_config');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('trigger-syllabus-parse', { detail: { file } }));
        }, 150);
      }
    };
    window.addEventListener('global-syllabus-upload', handleGlobalSyllabusUpload);
    return () => {
      window.removeEventListener('global-syllabus-upload', handleGlobalSyllabusUpload);
    };
  }, [selectedCourse]);

  // SSE Notification Stream with Exponential Backoff
  useEffect(() => {
    if (!selectedCourse?.id) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let attempt = 0;
    const maxAttempts = 5;

    const connectSSE = () => {
      if (!selectedCourse?.id) return;
      const token = localStorage.getItem('token');
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const sseUrl = `${apiBase}/api/autopilot/notifications/stream?token=${token || ''}`;
      
      console.log(`[SSE] Connecting to autopilot notifications stream (attempt ${attempt + 1})...`);
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        console.log('[SSE] Connection established successfully.');
        attempt = 0; // Reset attempts
        window.dispatchEvent(new CustomEvent('sse-connection-status', { detail: { status: 'connected' } }));
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.course_id === selectedCourse.id) {
            console.log('[SSE] Notification received:', data);
            if (data.event === 'lock_acquired' || data.event === 'lock_released' || data.event === 'lock_renewed') {
              fetchLocks(selectedCourse.id);
            } else if (data.event === 'autopilot_undone') {
              window.dispatchEvent(new CustomEvent('db-state-changed'));
              fetchLocks(selectedCourse.id);
            }
          }
        } catch (err) {
          // Bỏ qua lỗi parse cho tin nhắn ping
        }
      };

      eventSource.onerror = (err) => {
        console.error('[SSE] Notification stream error:', err);
        if (eventSource) {
          eventSource.close();
        }

        if (attempt < maxAttempts) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.log(`[SSE] Reconnecting in ${backoff}ms...`);
          window.dispatchEvent(new CustomEvent('sse-connection-status', { 
            detail: { status: 'reconnecting', attempt: attempt + 1, backoff } 
          }));
          
          reconnectTimeout = setTimeout(() => {
            attempt++;
            connectSSE();
          }, backoff);
        } else {
          console.error('[SSE] Max reconnection attempts reached.');
          window.dispatchEvent(new CustomEvent('sse-connection-status', { detail: { status: 'failed' } }));
        }
      };
    };

    connectSSE();

    return () => {
      console.log('[SSE] Cleaning up autopilot notifications stream connection');
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [selectedCourse?.id]);

  useEffect(() => {
    const handleChatbotDispatch = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (detail && detail.view) {
        setPendingAction({
          view: detail.view,
          action: detail.action,
          params: detail.params,
          message: detail.message
        });
        
        // Bắt sự kiện mở bubble mascot nếu người dùng không ở trang chatbot
        if (activeView !== 'chatbot') {
          window.dispatchEvent(new CustomEvent('open-mascot-bubble'));
        }
      }
    };
    const handleGlobalConfirm = () => {
      handleConfirmAction();
    };
    const handleGlobalCancel = () => {
      handleCancelAction();
    };

    window.addEventListener('chatbot-dispatch-action', handleChatbotDispatch);
    window.addEventListener('confirm-chatbot-action', handleGlobalConfirm);
    window.addEventListener('cancel-chatbot-action', handleGlobalCancel);

    return () => {
      window.removeEventListener('chatbot-dispatch-action', handleChatbotDispatch);
      window.removeEventListener('confirm-chatbot-action', handleGlobalConfirm);
      window.removeEventListener('cancel-chatbot-action', handleGlobalCancel);
    };
  }, [pendingAction, selectedCourse, activeView]);

  // Real-time notification logic when background generations complete
  useEffect(() => {
    if (!selectedCourse?.id) return;

    const handleSyllabusParsed = (e: Event) => {
      const { courseId, closCount, fileName } = (e as CustomEvent).detail || {};
      if (courseId !== selectedCourse.id) return;

      const message = `Dạ, em đã nạp thành công file đề cương **${fileName}** và trích xuất thành công **${closCount} Chuẩn đầu ra (CLO)**. Thầy/Cô có muốn em tiến hành sinh cấu trúc Dàn ý các chương học (Course Outline) cho môn học này không ạ?`;
      
      window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', {
        detail: {
          view: 'lesson_planner',
          action: 'generate_outline',
          params: {},
          message
        }
      }));
    };

    const handleOutlineGenerated = (e: Event) => {
      const { courseId, chapters } = (e as CustomEvent).detail || {};
      if (courseId !== selectedCourse.id) return;
      if (!chapters || chapters.length === 0) return;

      const message = `Cấu trúc Outline môn học gồm **${chapters.length} chương** đã được thiết kế thành công! Thầy/Cô có muốn chuyển sang thiết kế Dàn ý slide (Storyboard) nháp cho **Chương 1: ${chapters[0].title}** không ạ?`;
      
      window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', {
        detail: {
          view: 'lesson_planner',
          action: 'generate_storyboard',
          params: {
            chapter_id: chapters[0].id,
            chapter_title: chapters[0].title
          },
          message
        }
      }));
    };

    const handleStoryboardGenerated = (e: Event) => {
      const { chapterId, chapterTitle } = (e as CustomEvent).detail || {};
      
      const message = `Dàn ý slide (Storyboard) nháp cho chương **${chapterTitle}** đã được sinh nháp thành công! Thầy/Cô có muốn em bắt đầu sinh chi tiết nội dung slide bài giảng và kịch bản hoạt động tương tác sư phạm (giáo án) không ạ?`;

      window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', {
        detail: {
          view: 'lesson_planner',
          action: 'generate_materials',
          params: {
            chapter_id: chapterId,
            chapter_title: chapterTitle
          },
          message
        }
      }));
    };

    const handleMaterialsGenerated = async (e: Event) => {
      const { chapterId, chapterTitle } = (e as CustomEvent).detail || {};
      
      let cloWarningText = "";
      try {
        const token = localStorage.getItem('token');
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
        const response = await fetch(
          `${apiBase}/api/courses/${selectedCourse.id}/matrix-coverage`,
          {
            headers: { 'Authorization': `Bearer ${token || ''}` }
          }
        );
        if (response.ok) {
          const resData = await response.json();
          const matrixData = resData.matrix;
          const missingM: string[] = [];
          Object.keys(matrixData).forEach(code => {
            const clo = matrixData[code];
            const targetLvl = clo.target_bloom;
            const mLevels = clo.material_levels || {};
            if ((mLevels[String(targetLvl)] || 0) === 0) {
              missingM.push(`${code} (Bloom B${targetLvl})`);
            }
          });
          if (missingM.length > 0) {
            cloWarningText = `\n\n⚠️ **Cảnh báo chuẩn đầu ra**: Hiện tại bài giảng chưa bao phủ đầy đủ chuẩn đầu ra ở mức Bloom mục tiêu: **${missingM.join(', ')}**.`;
          } else {
            cloWarningText = `\n\n✅ **Độ phủ chuẩn đầu ra**: Bài giảng đã bao phủ đầy đủ các Chuẩn đầu ra (CLOs).`;
          }
        }
      } catch (err) {
        console.error("Lỗi khi kiểm tra ma trận độ phủ:", err);
      }

      const message = `Em đã sinh thành công nội dung slide chi tiết và kịch bản tương tác cho chương **${chapterTitle}**!${cloWarningText}\n\nThầy/Cô có muốn chuyển sang **Ngân hàng đề thi** để tự động sinh các câu hỏi trắc nghiệm đánh giá (MCQs) cho chương học này không ạ?`;

      window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', {
        detail: {
          view: 'question_bank',
          action: 'generate_questions',
          params: {
            chapter_id: chapterId,
            chapter_title: chapterTitle,
            count: 3,
            bloom_level: 3
          },
          message
        }
      }));
    };

    const handleQuestionsGenerated = async (e: Event) => {
      const { chapterId, count } = (e as CustomEvent).detail || {};
      
      let cloWarningText = "";
      let hasBlindSpots = false;
      try {
        const token = localStorage.getItem('token');
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
        const response = await fetch(
          `${apiBase}/api/courses/${selectedCourse.id}/matrix-coverage`,
          {
            headers: { 'Authorization': `Bearer ${token || ''}` }
          }
        );
        if (response.ok) {
          const resData = await response.json();
          const matrixData = resData.matrix;
          const missingQ: string[] = [];
          Object.keys(matrixData).forEach(code => {
            const clo = matrixData[code];
            const targetLvl = clo.target_bloom;
            const qLevels = clo.question_levels || {};
            if ((qLevels[String(targetLvl)] || 0) === 0) {
              missingQ.push(`${code} (Bloom B${targetLvl})`);
            }
          });
          if (missingQ.length > 0) {
            hasBlindSpots = true;
            cloWarningText = `\n\n⚠️ **Điểm mù ngân hàng đề thi**: Phát hiện thiếu hụt độ phủ câu hỏi cho chuẩn đầu ra: **${missingQ.join(', ')}**.`;
          } else {
            cloWarningText = `\n\n🎉 **Chúc mừng**: Ngân hàng đề thi đã bao phủ đầy đủ 100% các Chuẩn đầu ra (CLOs) môn học ở mức Bloom mục tiêu!`;
          }
        }
      } catch (err) {
        console.error("Lỗi khi kiểm tra ma trận câu hỏi:", err);
      }

      let message = "";
      let detailAction = {};
      if (hasBlindSpots) {
        message = `Đã sinh xong **${count} câu hỏi** trắc nghiệm cho chương!${cloWarningText}\n\nThầy/Cô có muốn em kích hoạt **Hàng đợi Tự động Khắc phục Điểm mù** để tự động bổ sung câu hỏi bao phủ các CLO còn thiếu không ạ?`;
        detailAction = {
          view: 'matrix_dashboard',
          action: 'run_remediation_queue',
          params: { mode: 'questions' },
          message
        };
      } else {
        message = `Đã sinh xong **${count} câu hỏi** trắc nghiệm cho chương!${cloWarningText}\n\nThầy/Cô có muốn em mở giao diện **Tải đề thi (.gift)** để nhập trực tiếp vào hệ thống LMS Canvas/Moodle không ạ?`;
        detailAction = {
          view: 'question_bank',
          action: 'export_exam',
          params: {},
          message
        };
      }

      window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', {
        detail: detailAction
      }));
    };

    window.addEventListener('programmatic-syllabus-parsed', handleSyllabusParsed);
    window.addEventListener('programmatic-outline-generated', handleOutlineGenerated);
    window.addEventListener('programmatic-storyboard-generated', handleStoryboardGenerated);
    window.addEventListener('programmatic-materials-generated', handleMaterialsGenerated);
    window.addEventListener('programmatic-questions-generated', handleQuestionsGenerated);

    return () => {
      window.removeEventListener('programmatic-syllabus-parsed', handleSyllabusParsed);
      window.removeEventListener('programmatic-outline-generated', handleOutlineGenerated);
      window.removeEventListener('programmatic-storyboard-generated', handleStoryboardGenerated);
      window.removeEventListener('programmatic-materials-generated', handleMaterialsGenerated);
      window.removeEventListener('programmatic-questions-generated', handleQuestionsGenerated);
    };
  }, [selectedCourse?.id]);

  const handleConfirmAction = () => {
    if (!pendingAction) return;

    const { view, action, params } = pendingAction;

    // 1. Navigate to the view and pass parameters
    const extra: any = {};
    if (params?.chapter_id) extra.chapterId = params.chapter_id;
    if (params?.clo_id) extra.cloId = params.clo_id;
    if (params?.clo_code) extra.cloCode = params.clo_code;
    if (params?.bloom_level) extra.bloomLevel = params.bloom_level;

    // Navigate to the correct page context
    handleNavigate(view, extra);

    // Dispatch a CustomEvent to the window after a short delay to allow mounting
    setTimeout(() => {
      // Do NOT dispatch programmatic triggers for background execution actions,
      // as they are handled direct via Mascot Companion's direct-action stream (locks screen & cancel)
      const EXECUTION_ACTIONS = ['generate_questions', 'autopilot_storyboard'];
      if (EXECUTION_ACTIONS.includes(action)) {
        return;
      }

      let eventName = '';
      if (view === 'lesson_planner') {
        eventName = 'lesson-planner-programmatic-trigger';
      } else if (view === 'question_bank') {
        eventName = 'question-bank-programmatic-trigger';
      } else if (view === 'matrix_dashboard') {
        eventName = 'matrix-dashboard-programmatic-trigger';
      }

      if (eventName) {
        window.dispatchEvent(new CustomEvent(eventName, { 
          detail: { action, params } 
        }));
      }
    }, 250);

    // Close the modal
    setShowActionModal(false);
    setPendingAction(null);
  };

  const handleCancelAction = () => {
    setShowActionModal(false);
    setPendingAction(null);
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    if (loggedInUser.role === 'admin') {
      setActiveView('admin_dashboard');
      localStorage.setItem('active_view', 'admin_dashboard');
    } else {
      setActiveView('dashboard');
      localStorage.setItem('active_view', 'dashboard');
    }
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
    fetchLocks(course.id);
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
        {activeView === 'landing' && (
        <Landing user={user} onNavigate={handleNavigate} />
      )}
      {activeView === 'login' && (
        <Login onLoginSuccess={handleLoginSuccess} onBackToLanding={() => handleNavigate('landing')} />
      )}
      {activeView === 'dashboard' && (
        <Dashboard
          user={user}
          onLogout={handleLogout}
          onSelectCourse={handleSelectCourse}
          onEnterAdminDashboard={() => {
            setSelectedCourse(null);
            localStorage.removeItem('selected_course');
            handleNavigate('admin_dashboard');
          }}
        />
      )}
      {(selectedCourse || activeView === 'admin_dashboard') && ['course_roadmap', 'course_config', 'lesson_planner', 'question_bank', 'matrix_dashboard', 'knowledge_base', 'chatbot', 'ai_monitor', 'admin_dashboard', 'trash', 'assessment_hub'].includes(activeView) && (
        <AppShell
          key={selectedCourse?.id || 0}
          course={selectedCourse || { id: 0, course_code: 'SYS', course_name: 'Hệ thống Quản trị' } as any}
          activeView={activeView}
          onNavigate={(view) => handleNavigate(view)}
          onLogout={handleLogout}
        >
          <div style={{ display: activeView === 'chatbot' ? 'block' : 'none' }}>
            {selectedCourse && (
              <ChatBot
                course={selectedCourse}
                onGoBack={() => handleNavigate('course_roadmap')}
                activeView={activeView}
                isActive={activeView === 'chatbot'}
              />
            )}
          </div>
          <div style={{ display: activeView === 'course_roadmap' ? 'block' : 'none' }}>
            {selectedCourse && (
              <CourseRoadmap
                course={selectedCourse}
                onBack={() => handleNavigate('dashboard')}
                onLogout={handleLogout}
                onNavigate={handleNavigate}
              />
            )}
          </div>
          <div style={{ display: activeView === 'course_config' ? 'block' : 'none' }}>
            {selectedCourse && (
              <CourseConfig
                course={selectedCourse}
                onBack={() => handleNavigate('course_roadmap')}
                onNavigate={handleNavigate}
                onStartPlanning={() => handleNavigate('lesson_planner')}
                isActive={activeView === 'course_config'}
              />
            )}
          </div>
          <div style={{ display: activeView === 'lesson_planner' ? 'block' : 'none' }}>
            {selectedCourse && (
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
                forceOpenPedagogicalModal={forceOpenPedagogicalModal}
                clearForceOpenPedagogicalModal={() => setForceOpenPedagogicalModal(false)}
              />
            )}
          </div>
          <div style={{ display: activeView === 'question_bank' ? 'block' : 'none' }}>
            {selectedCourse && (
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
            )}
          </div>
          <div style={{ display: activeView === 'matrix_dashboard' ? 'block' : 'none' }}>
            {selectedCourse && (
              <MatrixDashboard
                course={selectedCourse}
                onBack={() => handleNavigate('course_roadmap')}
                onNavigate={handleNavigate}
                isActive={activeView === 'matrix_dashboard'}
              />
            )}
          </div>
          <div style={{ display: activeView === 'knowledge_base' ? 'block' : 'none' }}>
            {selectedCourse && (
              <KnowledgeBase
                course={selectedCourse}
                onBack={() => handleNavigate('course_roadmap')}
                onLogout={handleLogout}
                onNavigate={(view) => handleNavigate(view)}
                activeView={activeView}
                isActive={activeView === 'knowledge_base'}
              />
            )}
          </div>
          <div style={{ display: activeView === 'assessment_hub' ? 'block' : 'none' }}>
            {selectedCourse && (
              <AssessmentHub
                course={selectedCourse}
                onBack={() => handleNavigate('course_roadmap')}
                onNavigate={handleNavigate}
                onRecordAIUsage={onRecordAIUsage}
                setAIProcessingStatus={setAIProcessingStatus}
                isActive={activeView === 'assessment_hub'}
              />
            )}
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
          <div style={{ display: activeView === 'admin_dashboard' ? 'block' : 'none' }}>
            {activeView === 'admin_dashboard' && (
              <AdminDashboard
                onBack={() => handleNavigate(selectedCourse ? 'course_roadmap' : 'dashboard')}
                isActive={activeView === 'admin_dashboard'}
              />
            )}
          </div>
          <div style={{ display: activeView === 'trash' ? 'block' : 'none' }}>
            {activeView === 'trash' && (
              <Trash
                course={selectedCourse}
                onNavigate={handleNavigate}
                isActive={activeView === 'trash'}
              />
            )}
          </div>
        </AppShell>
      )}

      {/* FLOATING BATCH REMEDIATION QUEUE DRAWER/PANEL */}
      {selectedCourse && (
        <RemediationQueueDrawer selectedCourse={selectedCourse} />
      )}
      {user && selectedCourse && (
        <MascotCompanion
          selectedCourse={selectedCourse}
          onNavigate={handleNavigate}
          onTriggerPedagogicalConfig={() => setForceOpenPedagogicalModal(true)}
          aiStatus={globalAIStatus}
        />
      )}

      <AIActionConfirmModal
        show={showActionModal}
        pendingAction={pendingAction}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />

      <DirtyWarningModal
        show={showDirtyModal}
        isSavingDirty={isSavingDirty}
        onGoBack={() => {
          setShowDirtyModal(false);
          setDirtyActionCallback(null);
        }}
        onDiscardAndContinue={() => {
          (window as any).isDirty = false;
          if (dirtyActionCallback) {
            dirtyActionCallback();
          }
          setShowDirtyModal(false);
          setDirtyActionCallback(null);
        }}
        onSaveAndContinue={async () => {
          setIsSavingDirty(true);
          try {
            const success = await (window as any).dirtySaveCallback();
            if (success) {
              (window as any).isDirty = false;
              if (dirtyActionCallback) {
                dirtyActionCallback();
              }
              setShowDirtyModal(false);
              setDirtyActionCallback(null);
            } else {
              alert("Không thể lưu tự động. Vui lòng kiểm tra lại dữ liệu.");
            }
          } catch (err) {
            console.error("Auto save failed:", err);
          } finally {
            setIsSavingDirty(false);
          }
        }}
        hasSaveCallback={!!(window as any).dirtySaveCallback}
      />
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
