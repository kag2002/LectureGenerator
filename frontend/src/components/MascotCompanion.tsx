import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Sparkles, Settings, BarChart2, HelpCircle, FileText, Check, Zap, Upload, Paperclip, Loader2, WifiOff } from 'lucide-react';
import client from '../api/client';
import '../styles/MascotCompanion.css';
import { renderMarkdown } from '../utils/markdown';
import { useUILock } from '../context/UILockContext';


interface MascotCompanionProps {
  onNavigate: (view: string) => void;
  onTriggerPedagogicalConfig?: () => void;
  selectedCourse: any;
  aiStatus?: { isProcessing: boolean; message: string };
}

const WELCOME_MESSAGES = [
  "Em chào Thầy/Cô ạ! Hôm nay mình sẽ thiết kế bài giảng cho chương học nào thế nhỉ?",
  "Thầy/Cô có muốn em hỗ trợ cấu hình bối cảnh sư phạm lớp học VinUni không ạ?",
  "Ma trận CLO x Bloom của môn học hiện tại đã đầy đủ chưa Thầy/Cô ơi?",
  "Em là ODIN AI - Trợ lý ảo đồng hành soạn bài giảng cùng Thầy/Cô!"
];

interface MascotAvatarProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  hasNotification: boolean;
  isDragging: boolean;
  isProcessing?: boolean;
  isOffline?: boolean;
}

function MascotAvatar({ onMouseDown, onTouchStart, hasNotification, isDragging, isProcessing, isOffline }: MascotAvatarProps) {
  const [frame, setFrame] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f === 1 ? 2 : 1));
    }, isProcessing ? 150 : 300);
    return () => clearInterval(interval);
  }, [isProcessing]);

  return (
    <div
      className="mascot-avatar-wrapper"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      title="Trợ lý ảo ODIN AI (Đang thử nghiệm)"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <img
        src={`/mascot_frame${frame}.png?v=penguin`}
        alt="AI Assistant Mascot"
        className="mascot-avatar-image"
        style={isProcessing ? { filter: 'brightness(1.15) saturate(1.3)', animation: 'mascotPulse 1s ease-in-out infinite' } : undefined}
      />
      {/* Wifi Offline status indicator */}
      {isOffline && (
        <span style={{
          position: 'absolute',
          top: '-2px',
          left: '-2px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#475569',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 12,
          boxShadow: '0 0 6px rgba(0,0,0,0.5)'
        }} title="Mất kết nối với máy chủ">
          <WifiOff size={11} style={{ color: '#cbd5e1' }} />
        </span>
      )}
      {/* AI processing ring */}
      {isProcessing && (
        <span style={{
          position: 'absolute',
          inset: '-4px',
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: 'var(--vinuni-gold)',
          borderRightColor: 'var(--vinuni-gold)',
          animation: 'spin 0.8s linear infinite',
          pointerEvents: 'none',
          zIndex: 10
        }} />
      )}
      {!isProcessing && hasNotification && <span className="mascot-badge-notification">1</span>}
      {isProcessing && (
        <span style={{
          position: 'absolute',
          bottom: '-2px',
          right: '-2px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: 'var(--vinuni-gold)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 11,
          boxShadow: '0 0 8px rgba(212,163,89,0.6)'
        }}>
          <Loader2 size={11} style={{ color: '#000', animation: 'spin 0.8s linear infinite' }} />
        </span>
      )}
    </div>
  );
}

export default function MascotCompanion({ onNavigate, onTriggerPedagogicalConfig, selectedCourse, aiStatus }: MascotCompanionProps) {
  const { locks, releaseLock } = useUILock();
  const isAutopilotActive = Object.values(locks).some(l => l.lockedBy === 'odin_autopilot');

  const [sseStatus, setSseStatus] = useState<'connected' | 'reconnecting' | 'failed'>('connected');
  const [showManualUnlock, setShowManualUnlock] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState(WELCOME_MESSAGES[0]);
  const [hasNotification, setHasNotification] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  // Bug fix: Lưu câu hỏi gốc user để (1) hiển thị trong bubble, (2) xác định action buttons
  const [lastUserInput, setLastUserInput] = useState('');
  // Bug fix: Track xem response có chứa tool mutating không để quyết định dispatch db-state-changed
  const [hadMutatingTool, setHadMutatingTool] = useState(false);
  const [pendingAction, setPendingAction] = useState<any | null>(null);

  // Drag & Drop / Syllabus Upload States in Mascot Companion
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState(0); // 0 -> 4
  const [uploadLog, setUploadLog] = useState('');
  const [extractedClos, setExtractedClos] = useState<any[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dragging states for the mascot companion
  const [isDraggingMascot, setIsDraggingMascot] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const clampPosition = (x: number, y: number, isBubbleOpen: boolean) => {
    const margin = 16;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
    const avatarWidth = viewportWidth <= 576 ? 70 : 80;
    const avatarHeight = viewportWidth <= 576 ? 70 : 80;
    const bubbleGapOffset = viewportWidth <= 576 ? 85 : 95;

    let minX = margin;
    let maxX = viewportWidth - avatarWidth - margin;
    let minY = margin;
    let maxY = viewportHeight - avatarHeight - margin;

    if (isBubbleOpen && bubbleRef.current) {
      const bubbleWidth = bubbleRef.current.offsetWidth;
      const bubbleHeight = bubbleRef.current.offsetHeight;
      const gap = bubbleGapOffset - avatarHeight;

      // Determine alignment based on x coordinate
      const isLeftAligned = x < viewportWidth / 2;

      if (isLeftAligned) {
        minX = margin;
        maxX = Math.min(maxX, viewportWidth - bubbleWidth - margin);
      } else {
        minX = Math.max(minX, bubbleWidth - avatarWidth + margin);
        maxX = viewportWidth - avatarWidth - margin;
      }

      minY = Math.max(minY, bubbleHeight + gap + margin);
    }

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = position.x;
    const startPosY = position.y;
    let moved = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (!moved) {
          setIsDraggingMascot(true);
          moved = true;
        }
      }

      if (moved) {
        const targetX = startPosX + dx;
        const targetY = startPosY + dy;
        const clamped = clampPosition(targetX, targetY, isOpen);
        setPosition(clamped);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsDraggingMascot(false);

      if (!moved) {
        handleAvatarClick();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    const startPosX = position.x;
    const startPosY = position.y;
    let moved = false;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touchMove = moveEvent.touches[0];
      const dx = touchMove.clientX - startX;
      const dy = touchMove.clientY - startY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (!moved) {
          setIsDraggingMascot(true);
          moved = true;
        }
      }

      if (moved) {
        const targetX = startPosX + dx;
        const targetY = startPosY + dy;
        const clamped = clampPosition(targetX, targetY, isOpen);
        setPosition(clamped);
      }
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      setIsDraggingMascot(false);

      if (!moved) {
        handleAvatarClick();
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  // Initialize position and load from localStorage
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('mascot-position');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition(clampPosition(parsed.x, parsed.y, false));
          return;
        }
      } catch (e) {
        // ignore
      }
    }
    // Default: bottom-right corner
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const avatarWidth = viewportWidth <= 576 ? 70 : 80;
    const avatarHeight = viewportWidth <= 576 ? 70 : 80;
    setPosition({
      x: viewportWidth - avatarWidth - 24,
      y: viewportHeight - avatarHeight - 24
    });
  }, []);

  // Save position to localStorage
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('mascot-position', JSON.stringify(position));
    }
  }, [position, isMounted]);

  // Adjust on screen resize
  useEffect(() => {
    if (!isMounted) return;
    const handleResize = () => {
      setPosition(current => clampPosition(current.x, current.y, isOpen));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, isMounted]);

  // Lắng nghe trạng thái kết nối SSE để hiển thị wifi offline / nút mở khóa thủ công
  useEffect(() => {
    let reconnectStart: number | null = null;
    let timer: any = null;

    const handleSSEStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSseStatus(detail.status);
      
      if (detail.status === 'reconnecting' || detail.status === 'failed') {
        if (!reconnectStart) {
          reconnectStart = Date.now();
        }
        if (!timer) {
          timer = setInterval(() => {
            if (reconnectStart && Date.now() - reconnectStart > 15000) {
              setShowManualUnlock(true);
            }
          }, 1000);
        }
      } else if (detail.status === 'connected') {
        reconnectStart = null;
        setShowManualUnlock(false);
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    };

    window.addEventListener('sse-connection-status', handleSSEStatus);
    return () => {
      window.removeEventListener('sse-connection-status', handleSSEStatus);
      if (timer) clearInterval(timer);
    };
  }, []);

  const handleManualUnlock = async () => {
    if (!selectedCourse?.id) return;
    
    // Giải phóng tất cả các khóa trên giao diện của môn học này
    const lockedKeys = Object.keys(locks);
    for (const key of lockedKeys) {
      await releaseLock(selectedCourse.id, key);
    }
    
    setShowManualUnlock(false);
    setMessage("Đã mở khóa thủ công giao diện thành công.");
    window.dispatchEvent(new CustomEvent('db-state-changed'));
  };

  // Adjust position when bubble opens or changes content
  useEffect(() => {
    if (isOpen && isMounted) {
      const timer = setTimeout(() => {
        setPosition(current => clampPosition(current.x, current.y, true));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, message, pendingAction, uploadingFile, isMounted]);

  useEffect(() => {
    const handleDispatchAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      setPendingAction(customEvent.detail);
      setHasNotification(true);
    };
    const handleOpenBubble = () => {
      setIsOpen(true);
      setHasNotification(false);
    };
    const handleClearAction = () => {
      setPendingAction(null);
    };

    window.addEventListener('chatbot-dispatch-action', handleDispatchAction);
    window.addEventListener('open-mascot-bubble', handleOpenBubble);
    window.addEventListener('confirm-chatbot-action', handleClearAction);
    window.addEventListener('cancel-chatbot-action', handleClearAction);

    return () => {
      window.removeEventListener('chatbot-dispatch-action', handleDispatchAction);
      window.removeEventListener('open-mascot-bubble', handleOpenBubble);
      window.removeEventListener('confirm-chatbot-action', handleClearAction);
      window.removeEventListener('cancel-chatbot-action', handleClearAction);
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      alert(`Định dạng tệp '${ext}' không được hỗ trợ. Chỉ chấp nhận file đề cương .pdf, .docx hoặc .txt.`);
      return;
    }

    // Gửi sự kiện nạp đề cương toàn cục để chuyển hướng và xử lý ở trang thiết lập chính
    window.dispatchEvent(new CustomEvent('global-syllabus-upload', { detail: { file } }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedCourse) return;
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedCourse) return;
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedCourse) return;
    dragCounter.current = 0;
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    }
  };

  useEffect(() => {
    setMessage(WELCOME_MESSAGES[0]);
    setLastUserInput('');
    setPendingAction(null);
  }, [selectedCourse?.id]);

  // Cycle messages randomly on click
  const rotateMessage = () => {
    if (isThinking) return;
    const randomIdx = Math.floor(Math.random() * WELCOME_MESSAGES.length);
    setMessage(WELCOME_MESSAGES[randomIdx]);
  };

  const handleAvatarClick = () => {
    setIsOpen(!isOpen);
    setHasNotification(false);
    if (!isOpen && !lastUserInput) {
      rotateMessage();
    }
  };

  const handleAction = (actionType: 'pedagogical_config' | 'matrix' | 'questions' | 'syllabus') => {
    if (!selectedCourse) {
      setMessage("Thầy/Cô vui lòng chọn một môn học trên bảng điều khiển trước khi thực hiện chức năng này nhé!");
      return;
    }
    setLastUserInput(''); // Clear user input khi navigate
    if (actionType === 'pedagogical_config') {
      onNavigate('lesson_planner');
      if (onTriggerPedagogicalConfig) {
        setTimeout(() => {
          onTriggerPedagogicalConfig();
        }, 100);
      }
      setMessage("Em đã tự động chuyển sang trang Soạn bài giảng và mở Bảng cấu hình sư phạm cho Thầy/Cô rồi nhé!");
    } else if (actionType === 'matrix') {
      onNavigate('matrix_dashboard');
      setMessage("Em đã mở Ma trận phân bổ CLO x Bloom cho Thầy/Cô rồi đấy ạ!");
    } else if (actionType === 'questions') {
      onNavigate('question_bank');
      setMessage("Em đã chuyển sang Ngân hàng câu hỏi trắc nghiệm rồi Thầy/Cô nhé!");
    } else if (actionType === 'syllabus') {
      onNavigate('course_config');
      setMessage("Em đã mở trang Bóc tách Syllabus (Cấu hình môn học) để Thầy/Cô nạp đề cương Syllabus rồi nhé!");
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    if (!selectedCourse) {
      setMessage("Thầy/Cô vui lòng chọn một môn học trên bảng điều khiển trước khi thực hiện chức năng này nhé!");
      return;
    }

    const userText = chatInput.trim();
    setChatInput('');
    setLastUserInput(userText); // Bug fix: Lưu câu hỏi user để hiển thị
    setHadMutatingTool(false); // Reset mutating flag cho lượt chat mới

    if ((window as any).hasPendingAction) {
      const lowerText = userText.toLowerCase();
      if (['ok', 'cho phép', 'cho phep', 'đồng ý', 'dong y', 'xác nhận', 'xac nhan', 'yes', 'confirm', 'allow'].includes(lowerText)) {
        window.dispatchEvent(new CustomEvent('confirm-chatbot-action'));
        setMessage("Dạ, em đang thực hiện hành động theo yêu cầu của Thầy/Cô ạ!");
        return;
      } else if (['hủy', 'huy', 'không', 'khong', 'hủy bỏ', 'huy bo', 'no', 'cancel'].includes(lowerText)) {
        window.dispatchEvent(new CustomEvent('cancel-chatbot-action'));
        setMessage("Em đã hủy lệnh theo yêu cầu của Thầy/Cô.");
        return;
      }
    }

    setIsThinking(true);
    setMessage("ODIN AI: Đang suy nghĩ...");

    try {
      const token = localStorage.getItem('token');

      // 1. Lấy hoặc tạo phiên trò chuyện
      let sessionId = null;
      const sessionsRes = await client.get(`/api/chatbot/sessions?course_id=${selectedCourse.id}`);
      if (sessionsRes.data && sessionsRes.data.length > 0) {
        sessionId = sessionsRes.data[0].id;
      } else {
        const createRes = await client.post('/api/chatbot/sessions', {
          course_id: selectedCourse.id,
          title: "Trò chuyện với ODIN Companion"
        });
        sessionId = createRes.data.id;
      }

      // 2. Gọi API stream chatbot
      const response = await fetch(`${client.defaults.baseURL || 'http://localhost:8000'}/api/chatbot/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: userText,
          course_id: selectedCourse.id
        })
      });

      if (!response.body) {
        setMessage("ODIN AI: Lỗi kết nối hệ thống.");
        setIsThinking(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const eventMatch = line.match(/^event:\s*(.+)$/m);
          const dataMatch = line.match(/^data:\s*(.+)$/m);

          if (!eventMatch || !dataMatch) continue;

          const event = eventMatch[1].trim();
          const data = JSON.parse(dataMatch[1].trim());

          if (event === 'stage') {
            setMessage(`ODIN AI: ${data.message}...`);
          } else if (event === 'dispatch_action') {
            window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', { detail: data }));
          } else if (event === 'tool_call') {
            // Bug fix: Track nếu có tool mutating để quyết định dispatch db-state-changed
            const MUTATING_TOOLS = ['generate_course_outline_action', 'generate_chapter_storyboard_action', 'generate_chapter_materials_action', 'generate_chapter_questions_action'];
            const calls = data.tool_calls || [];
            if (calls.some((tc: any) => MUTATING_TOOLS.includes(tc.name))) {
              setHadMutatingTool(true);
            }
          } else if (event === 'done') {
            setMessage(data.assistant_text);
            // Bug fix: Chỉ dispatch db-state-changed khi có tool thay đổi dữ liệu thực sự
            // Tránh re-render không cần thiết cho các câu trả lời text thông thường
            if (hadMutatingTool) {
              window.dispatchEvent(new CustomEvent('db-state-changed'));
            }
          } else if (event === 'error') {
            setMessage(`ODIN AI: Gặp lỗi - ${data.message}`);
          }
        }
      }
    } catch (err) {
      console.error("Mascot chat error:", err);
      setMessage("ODIN AI: Gặp sự cố kết nối LLM.");
    } finally {
      setIsThinking(false);
    }
  };

  // Bug fix: Dùng câu hỏi gốc của USER để xác định action buttons — không dùng bot response
  // Trước đó, bot trả lời chứa "CLO" hay "chuẩn đầu ra" → trigger sai nút "Xem ma trận"
  const actionSource = lastUserInput ? lastUserInput.toLowerCase() : '';

  const showPedagogical = actionSource.includes('cấu hình') ||
    actionSource.includes('sư phạm') ||
    actionSource.includes('lớp học') ||
    actionSource.includes('bối cảnh') ||
    actionSource.includes('tiết dạy') ||
    actionSource.includes('sĩ số') ||
    actionSource.includes('wifi') ||
    actionSource.includes('bàn ghế');

  const showMatrix = actionSource.includes('ma trận') ||
    actionSource.includes('bloom');

  const showQuestions = actionSource.includes('đề thi') ||
    actionSource.includes('câu hỏi') ||
    actionSource.includes('ngân hàng') ||
    actionSource.includes('mcq');

  const showSyllabus = actionSource.includes('syllabus') ||
    actionSource.includes('đề cương') ||
    actionSource.includes('bóc tách') ||
    actionSource.includes('trích xuất') ||
    actionSource.includes('nạp syllabus') ||
    actionSource.includes('upload');

  const hasActions = showPedagogical || showMatrix || showQuestions || showSyllabus;

  const isLeftAligned = isMounted && position.x < window.innerWidth / 2;
  const avatarSize = isMounted ? (window.innerWidth <= 576 ? 70 : 80) : 80;

  return (
    <div
      className="mascot-companion-container"
      style={isMounted ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        bottom: 'auto',
        right: 'auto',
        width: `${avatarSize}px`,
        height: `${avatarSize}px`,
        opacity: 1,
      } : {
        opacity: 0,
      }}
    >
      {/* Floating Avatar */}
      <MascotAvatar
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        hasNotification={hasNotification}
        isDragging={isDraggingMascot}
        isProcessing={isAutopilotActive || aiStatus?.isProcessing}
        isOffline={sseStatus !== 'connected'}
      />

      {/* Speech Bubble / Drawer */}
      {isOpen && (
        <div
          ref={bubbleRef}
          className={`mascot-bubble ${isLeftAligned ? 'bubble-left-aligned' : 'bubble-right-aligned'}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="mascot-drag-overlay">
              <Upload size={24} style={{ color: 'var(--vinuni-gold)', animation: 'pulse 1.5s infinite' }} />
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>THẢ SYLLABUS TẠI ĐÂY</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Chấp nhận tệp .pdf, .docx, .txt</div>
            </div>
          )}
          <div className="mascot-bubble-header">
            <span className="mascot-bubble-title">
              <Bot size={15} style={{ color: (isAutopilotActive || aiStatus?.isProcessing) ? '#fbbf24' : 'var(--vinuni-gold)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span>{isAutopilotActive ? 'ODIN Autopilot' : 'Trợ lý ảo ODIN AI'}</span>
                {isAutopilotActive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, color: '#fbbf24' }}>
                    <Loader2 size={9} style={{ animation: 'spin 0.8s linear infinite' }} />
                    Đang tự soạn bài giảng...
                  </span>
                ) : aiStatus?.isProcessing ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, color: '#fbbf24' }}>
                    <Loader2 size={9} style={{ animation: 'spin 0.8s linear infinite' }} />
                    {aiStatus.message || 'Đang xử lý…'}
                  </span>
                ) : (
                  <span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.6, letterSpacing: '0.3px' }}>Đang thử nghiệm</span>
                )}
              </span>
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="mascot-bubble-close"
              title="Đóng chat"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mascot-bubble-scroll-container">
            {uploadingFile ? (
              <div className="mascot-upload-progress-card" style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '2px dashed var(--vinuni-gold)',
                padding: '12px',
                marginTop: '8px',
                color: '#ffffff',
                fontFamily: 'VT323',
                fontSize: '15px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 'bold' }}>
                  <span>NẠP SYLLABUS:</span>
                  <span style={{ color: 'var(--vinuni-gold)' }}>{uploadingFile}</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', marginBottom: '8px' }}>
                  <div style={{ height: '100%', background: 'var(--vinuni-gold)', width: `${(uploadStage / 4) * 100}%` }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ color: uploadStage >= 1 ? 'var(--vinuni-gold)' : '#64748b' }}>
                    1. Đọc và trích xuất tài liệu {uploadStage > 1 && '✅'}
                  </div>
                  <div style={{ color: uploadStage >= 2 ? 'var(--vinuni-gold)' : '#64748b' }}>
                    2. AI phân tích cấu trúc CLOs {uploadStage > 2 && '✅'}
                  </div>
                  <div style={{ color: uploadStage >= 3 ? 'var(--vinuni-gold)' : '#64748b' }}>
                    3. Ánh xạ Bloom {uploadStage > 3 && '✅'}
                  </div>
                  <div style={{ color: uploadStage >= 4 ? 'var(--vinuni-gold)' : '#64748b' }}>
                    4. Lưu trữ và đồng bộ hóa {uploadStage > 4 && '✅'}
                  </div>
                </div>
                {uploadLog && (
                  <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
                    {uploadLog}
                  </div>
                )}
                {extractedClos.length > 0 && (
                  <div style={{ marginTop: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px', maxHeight: '80px', overflowY: 'auto' }}>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>ĐÃ TRÍCH XUẤT ({extractedClos.length}):</div>
                    {extractedClos.map((c, idx) => (
                      <div key={idx} style={{ fontSize: '13px' }}>
                        - <strong style={{ color: 'var(--vinuni-gold)' }}>{c.clo_code}</strong>: {c.description.slice(0, 30)}...
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {isAutopilotActive ? (
                  <div style={{
                    background: 'rgba(212, 163, 89, 0.05)',
                    border: '1px solid rgba(212, 163, 89, 0.25)',
                    borderRadius: '8px',
                    padding: '12px',
                    margin: '8px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    textAlign: 'left'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--vinuni-gold)', fontWeight: 700, fontSize: '13px' }}>
                      <Loader2 size={14} className="animate-spin" />
                      <span>ODIN Autopilot Active</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.4' }}>
                      Em đang tự động tương tác và thiết kế bài giảng thay cho Thầy/Cô. Tiến trình này đang chạy ngầm và giao diện tương ứng sẽ tạm thời khóa để đảm bảo an toàn dữ liệu.
                    </p>
                    <div style={{
                      height: '4px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: '2px',
                      overflow: 'hidden',
                      marginTop: '4px'
                    }}>
                      <div style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--vinuni-gold), #b8860b)',
                        width: '75%',
                        animation: 'pulse 1.5s infinite'
                      }} />
                    </div>
                    {showManualUnlock && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '11.5px', fontWeight: 600 }}>
                          <WifiOff size={13} />
                          <span>Mất kết nối thời gian thực!</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleManualUnlock}
                          style={{
                            background: '#ef4444',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '12px',
                            alignSelf: 'flex-start',
                            boxShadow: '0 2px 4px rgba(239,68,68,0.2)'
                          }}
                        >
                          Mở khóa thủ công
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {lastUserInput && (
                      <div className="mascot-user-question">
                        <strong>Thầy/Cô:</strong> {lastUserInput}
                      </div>
                    )}
                    <div
                      className="mascot-bubble-body"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(message) }}
                    />
                  </>
                )}
              </>
            )}

            {pendingAction && (
              <div style={{
                background: 'rgba(212, 163, 89, 0.05)',
                border: '1px solid rgba(212, 163, 89, 0.25)',
                borderRadius: '8px',
                padding: '12px',
                margin: '12px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--vinuni-gold)', fontWeight: 600, fontSize: '12.5px' }}>
                  <Zap size={14} className="animate-pulse" />
                  <span>Đề xuất tự động từ ODIN AI</span>
                </div>
                <p style={{ margin: '0', fontSize: '13px', color: '#f1f5f9', lineHeight: '1.4', textAlign: 'left' }}>
                  {pendingAction.message || 'Mascot AI đề xuất thực hiện hành động tự động trên giao diện này.'}
                </p>

                {pendingAction.params && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '8px 10px', fontSize: '11.5px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                    {pendingAction.params.chapter_title && <div><strong>Chương:</strong> {pendingAction.params.chapter_title}</div>}
                    {pendingAction.params.clo_code && <div><strong>CLO:</strong> {pendingAction.params.clo_code}</div>}
                    {pendingAction.params.bloom_level && <div><strong>Bloom:</strong> Bậc B{pendingAction.params.bloom_level}</div>}
                    {pendingAction.params.count && <div><strong>Số câu:</strong> {pendingAction.params.count}</div>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('confirm-chatbot-action'));
                      setPendingAction(null);
                    }}
                    style={{
                      background: 'var(--vinuni-gold)',
                      color: '#000000',
                      border: 'none',
                      padding: '5px 10px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Check size={12} /> Xác nhận
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('cancel-chatbot-action'));
                      setPendingAction(null);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: '#ffffff',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '5px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <X size={12} /> Hủy bỏ
                  </button>
                </div>
              </div>
            )}

            {hasActions && (
              <div className="mascot-bubble-actions">
                {showPedagogical && (
                  <button
                    onClick={() => handleAction('pedagogical_config')}
                    className="mascot-action-btn"
                  >
                    <span>Mở cấu hình lớp học</span>
                    <Settings size={14} />
                  </button>
                )}

                {showMatrix && (
                  <button
                    onClick={() => handleAction('matrix')}
                    className="mascot-action-btn"
                  >
                    <span>Xem ma trận CLO x Bloom</span>
                    <BarChart2 size={14} />
                  </button>
                )}

                {showQuestions && (
                  <button
                    onClick={() => handleAction('questions')}
                    className="mascot-action-btn"
                  >
                    <span>Đi đến ngân hàng đề thi</span>
                    <HelpCircle size={14} />
                  </button>
                )}

                {showSyllabus && (
                  <button
                    onClick={() => handleAction('syllabus')}
                    className="mascot-action-btn"
                  >
                    <span>Bóc tách Syllabus</span>
                    <FileText size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mascot-bubble-chat">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mascot-attach-btn"
              disabled={isThinking || isAutopilotActive || !selectedCourse}
              title="Đính kèm file đề cương Syllabus (.pdf, .docx, .txt)"
            >
              <Paperclip size={16} />
            </button>
            <input
              type="text"
              placeholder={isAutopilotActive ? "ODIN đang chạy tự động..." : isThinking ? "ODIN AI đang suy nghĩ..." : "Hỏi ODIN AI..."}
              value={chatInput}
              disabled={isThinking || isAutopilotActive}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              className="mascot-chat-input"
            />
            <button
              onClick={handleSendChat}
              disabled={isThinking || isAutopilotActive || !chatInput.trim()}
              className="mascot-chat-send-btn"
            >
              Gửi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
