import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Sparkles, Settings, BarChart2, HelpCircle, FileText, Check, Zap, Upload, Paperclip } from 'lucide-react';
import client from '../api/client';
import '../styles/MascotCompanion.css';
import { renderMarkdown } from '../utils/markdown';


interface MascotCompanionProps {
  onNavigate: (view: string) => void;
  onTriggerPedagogicalConfig?: () => void;
  selectedCourse: any;
}

const WELCOME_MESSAGES = [
  "Em chào Thầy/Cô ạ! Hôm nay mình sẽ thiết kế bài giảng cho chương học nào thế nhỉ?",
  "Thầy/Cô có muốn em hỗ trợ cấu hình bối cảnh sư phạm lớp học VinUni không ạ?",
  "Ma trận CLO x Bloom của môn học hiện tại đã đầy đủ chưa Thầy/Cô ơi?",
  "Em là Falcon AI - Trợ lý ảo đồng hành soạn bài giảng cùng Thầy/Cô!"
];

interface MascotAvatarProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  hasNotification: boolean;
  isDragging: boolean;
}

function MascotAvatar({ onMouseDown, onTouchStart, hasNotification, isDragging }: MascotAvatarProps) {
  const [frame, setFrame] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f === 1 ? 2 : 1));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="mascot-avatar-wrapper"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      title="Trợ lý ảo Falcon AI(Đang thử nghiệm)"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <img
        src={`/mascot_frame${frame}.png?v=penguin`}
        alt="AI Assistant Mascot"
        className="mascot-avatar-image"
      />
      {hasNotification && <span className="mascot-badge-notification">1</span>}
    </div>
  );
}

export default function MascotCompanion({ onNavigate, onTriggerPedagogicalConfig, selectedCourse }: MascotCompanionProps) {
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
    setMessage("Falcon AI: Đang suy nghĩ...");

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
          title: "Trò chuyện với Falcon Companion"
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
        setMessage("Falcon AI: Lỗi kết nối hệ thống.");
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
            setMessage(`Falcon AI: ${data.message}...`);
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
            setMessage(`Falcon AI: Gặp lỗi - ${data.message}`);
          }
        }
      }
    } catch (err) {
      console.error("Mascot chat error:", err);
      setMessage("Falcon AI: Gặp sự cố kết nối LLM.");
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
              <Bot size={15} style={{ color: 'var(--vinuni-gold)' }} />
              Trợ lý ảo Falcon AI(Đang thử nghiệm)
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
                  <span>Đề xuất tự động từ Falcon AI</span>
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
              disabled={isThinking || !selectedCourse}
              title="Đính kèm file đề cương Syllabus (.pdf, .docx, .txt)"
            >
              <Paperclip size={16} />
            </button>
            <input
              type="text"
              placeholder={isThinking ? "Falcon AI đang suy nghĩ..." : "Hỏi Falcon AI..."}
              value={chatInput}
              disabled={isThinking}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
              className="mascot-chat-input"
            />
            <button
              onClick={handleSendChat}
              disabled={isThinking || !chatInput.trim()}
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
