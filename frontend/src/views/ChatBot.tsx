'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import { 
  ArrowLeft, 
  MessageSquare, 
  Plus, 
  Send, 
  BarChart2, 
  Check, 
  X, 
  ShieldAlert, Cpu, Zap,
  Edit3,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileText,
  Target,
  Layers,
  HelpCircle,
  BookOpen,
  Paperclip,
  Upload
} from 'lucide-react';
import { Course } from '@/types';
import '../styles/ChatBot.css';

export interface ChatBotProps {
  course: Course;
  onGoBack: () => void;
  activeView: string;
  isActive?: boolean;
}

interface ChatSession {
  id: number;
  title: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parent_id?: number | null;
  versions?: number[];
  tool_calls?: any[] | string;
  tool_results?: any[] | string;
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms?: number;
  trace_id?: string;
}

interface Stage {
  stage: number;
  message: string;
}

interface PerformanceMetrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  trace_id?: string;
}

interface EvalCase {
  name: string;
  passed: boolean;
  user_message: string;
  failures?: string[];
}

interface EvalResult {
  eval_run_id: string;
  summary: {
    accuracy: number;
    passed_cases: number;
    total_cases: number;
    guardrail_violations_count: number;
  };
  results: EvalCase[];
}

interface EvalHistoryItem {
  id: number;
  eval_run_id: string;
  accuracy: number;
  provider: string;
  model: string;
  run_at: string;
}

const renderMarkdown = (text: string, onCitationClick?: (fileName: string, pageNum: string) => void) => {
  if (!text) return null;
  
  const parts = text.split(/(```[\s\S]*?```)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const codeLines = part.split('\n');
      const firstLine = codeLines[0].slice(3).trim();
      const codeContent = codeLines.slice(1, -1).join('\n');
      return (
        <pre key={index} className="chatbot-code-block" style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '12px',
          overflowX: 'auto',
          margin: '8px 0',
          fontFamily: 'Consolas, Courier New, monospace',
          fontSize: '13px',
          textAlign: 'left'
        }}>
          {firstLine && (
            <div style={{ 
              fontSize: '11px', 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              borderBottom: '1px solid var(--border-color)', 
              paddingBottom: '4px', 
              marginBottom: '6px' 
            }}>
              {firstLine}
            </div>
          )}
          <code>{codeContent}</code>
        </pre>
      );
    }
    
    const lines = part.split('\n');
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];
    const parsedElements: React.ReactNode[] = [];
    
    const parseInline = (str: string): React.ReactNode[] => {
      let segments: React.ReactNode[] = [str];
      
      segments = segments.flatMap(seg => {
        if (typeof seg !== 'string') return seg;
        const matches = seg.split(/(\*\*.*?\*\*)/g);
        return matches.map((m, idx) => {
          if (m.startsWith('**') && m.endsWith('**')) {
            return <strong key={idx}>{m.slice(2, -2)}</strong>;
          }
          return m;
        });
      });
      
      segments = segments.flatMap(seg => {
        if (typeof seg !== 'string') return seg;
        const matches = seg.split(/(\*.*?\*)/g);
        return matches.map((m, idx) => {
          if (m.startsWith('*') && m.endsWith('*') && !m.startsWith('**')) {
            return <em key={idx}>{m.slice(1, -1)}</em>;
          }
          return m;
        });
      });
      
      segments = segments.flatMap(seg => {
        if (typeof seg !== 'string') return seg;
        const matches = seg.split(/(`.*?`)/g);
        return matches.map((m, idx) => {
          if (m.startsWith('`') && m.endsWith('`')) {
            return <code key={idx} style={{ 
              background: 'rgba(255, 255, 255, 0.1)', 
              padding: '2px 4px', 
              borderRadius: '4px', 
              fontFamily: 'Consolas, monospace',
              fontSize: '12px'
            }}>{m.slice(1, -1)}</code>;
          }
          return m;
        });
      });

      segments = segments.flatMap(seg => {
        if (typeof seg !== 'string') return seg;
        // Match [Nguồn: document.pdf - Trang: 5] or [Ref: document.pdf - Page: 5]
        const matches = seg.split(/(\[(?:Nguồn|Ref):\s*[^\]]+?\s*-\s*(?:Trang|Page):\s*[^\]]+?\])/gi);
        return matches.map((m, idx) => {
          if (/^\[(?:Nguồn|Ref):\s*[^\]]+?\s*-\s*(?:Trang|Page):\s*[^\]]+?\]$/i.test(m)) {
            const cleaned = m.slice(1, -1);
            const parts = cleaned.split(/-\s*(?:Trang|Page):\s*/i);
            const fileName = parts[0]?.replace(/^(Nguồn|Ref):\s*/i, '').trim();
            const pageNum = parts[1]?.trim() || '';
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onCitationClick && onCitationClick(fileName, pageNum)}
                title={`Xem đoạn trích gốc từ ${fileName} - Trang ${pageNum}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(212, 163, 89, 0.15)',
                  border: '1px solid rgba(212, 163, 89, 0.3)',
                  color: '#fcd34d',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  margin: '0 4px',
                  verticalAlign: 'middle',
                  transition: 'all 0.2s'
                }}
              >
                <FileText size={12} /> {fileName} (Trang {pageNum})
              </button>
            );
          }
          return m;
        });
      });
      
      return segments;
    };
    
    const flushTable = (key: number) => {
      if (!inTable) return null;
      inTable = false;
      const headers = tableHeaders;
      const rows = tableRows;
      tableHeaders = [];
      tableRows = [];
      
      if (headers.length === 0 && rows.length === 0) return null;
      
      return (
        <div key={`table-${key}`} style={{ overflowX: 'auto', margin: '12px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', border: '1px solid var(--border-color)' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)' }}>
                {headers.map((h, hIdx) => (
                  <th key={hIdx} style={{ border: '1px solid var(--border-color)', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>
                    {parseInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ border: '1px solid var(--border-color)', padding: '8px 12px' }}>
                      {parseInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const columns = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        if (columns.every(col => col.startsWith('-') || col.replace(/-/g, '').trim() === '')) {
          continue;
        }
        if (!inTable) {
          inTable = true;
          tableHeaders = columns;
        } else {
          tableRows.push(columns);
        }
        continue;
      } else if (inTable) {
        const tbl = flushTable(i);
        if (tbl) parsedElements.push(tbl);
      }
      
      if (line.startsWith('# ')) {
        parsedElements.push(<h3 key={i} style={{ fontSize: '18px', fontWeight: 'bold', margin: '14px 0 8px 0', color: 'var(--vinuni-gold)' }}>{parseInline(line.slice(2))}</h3>);
      } else if (line.startsWith('## ')) {
        parsedElements.push(<h4 key={i} style={{ fontSize: '16px', fontWeight: 'bold', margin: '12px 0 6px 0', color: 'var(--vinuni-gold)' }}>{parseInline(line.slice(3))}</h4>);
      } else if (line.startsWith('### ')) {
        parsedElements.push(<h5 key={i} style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 4px 0' }}>{parseInline(line.slice(4))}</h5>);
      } 
      else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        parsedElements.push(
          <li key={i} style={{ listStyleType: 'disc', margin: '4px 0 4px 24px', textAlign: 'left' }}>
            {parseInline(line.trim().slice(2))}
          </li>
        );
      }
      else if (/^\d+\.\s/.test(line.trim())) {
        const dotIdx = line.trim().indexOf('.');
        parsedElements.push(
          <li key={i} style={{ listStyleType: 'decimal', margin: '4px 0 4px 28px', textAlign: 'left' }}>
            {parseInline(line.trim().slice(dotIdx + 1).trim())}
          </li>
        );
      }
      else if (line.trim() === '') {
        parsedElements.push(<div key={i} style={{ height: '6px' }} />);
      }
      else {
        parsedElements.push(<p key={i} style={{ margin: '4px 0', textAlign: 'left', lineHeight: '1.5' }}>{parseInline(line)}</p>);
      }
    }
    
    if (inTable) {
      const tbl = flushTable(lines.length);
      if (tbl) parsedElements.push(tbl);
    }
    
    return <div key={index}>{parsedElements}</div>;
  });
};

export default function ChatBot({ course, onGoBack, activeView, isActive }: ChatBotProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<{
    fileName: string;
    pageNumber: string;
    text: string;
  } | null>(null);

  const handleCitationClick = (fileName: string, pageNum: string) => {
    let matchedText = '';
    
    // Tìm kiếm trong lịch sử các tin nhắn của phiên trò chuyện hiện tại
    for (const msg of messages) {
      if (msg.tool_results) {
        const results = parseToolResults(msg.tool_results);
        const searchHit = results.find((item: any) => {
          if (item.tool === 'search_course_knowledge') {
            const hits = item.result.results || [];
            return hits.some((h: any) => {
              const fileMatch = h.file_name?.toLowerCase().includes(fileName.toLowerCase()) || fileName.toLowerCase().includes(h.file_name?.toLowerCase());
              const pageMatch = String(h.page_number) === String(pageNum);
              if (fileMatch && pageMatch) {
                matchedText = h.text;
                return true;
              }
              return false;
            });
          }
          return false;
        });
        if (searchHit) break;
      }
    }
    
    setSelectedCitation({
      fileName,
      pageNumber: pageNum,
      text: matchedText || "Không tìm thấy nội dung đoạn trích trong lịch sử cuộc gọi RAG của phiên trò chuyện này."
    });
  };
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'telemetry' | 'cost' | 'eval'>('telemetry');

  // Branching & Editing States
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictEditId, setConflictEditId] = useState<number | null>(null);
  const [conflictText, setConflictText] = useState('');
  const [conflictParentId, setConflictParentId] = useState<number | null>(null);

  // Telemetry & Stage tracking
  const [stages, setStages] = useState<Stage[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [toolCalls, setToolCalls] = useState<any[]>([]);
  const [toolResults, setToolResults] = useState<any[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);

  // Evaluation States
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evalHistory, setEvalHistory] = useState<EvalHistoryItem[]>([]);

  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const chatbotAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(0);
  const prevStagesLength = useRef(0);
  const prevSessionId = useRef<number | null>(null);

  const [pendingAction, setPendingAction] = useState<any | null>(null);

  // Drag & Drop / Syllabus Upload States in Chat
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState(0); // 0 -> 4
  const [uploadLog, setUploadLog] = useState('');
  const [extractedClos, setExtractedClos] = useState<any[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    }
  };

  useEffect(() => {
    const handleDispatchAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      setPendingAction(customEvent.detail);
    };
    const handleClearAction = () => {
      setPendingAction(null);
    };
    window.addEventListener('chatbot-dispatch-action', handleDispatchAction);
    window.addEventListener('confirm-chatbot-action', handleClearAction);
    window.addEventListener('cancel-chatbot-action', handleClearAction);
    return () => {
      window.removeEventListener('chatbot-dispatch-action', handleDispatchAction);
      window.removeEventListener('confirm-chatbot-action', handleClearAction);
      window.removeEventListener('cancel-chatbot-action', handleClearAction);
    };
  }, []);

  // Lấy các phiên trò chuyện
  const fetchSessions = async () => {
    try {
      const response = await client.get(`/api/chatbot/sessions?course_id=${course.id}`);
      setSessions(response.data);
      if (response.data.length > 0 && !currentSessionId) {
        setCurrentSessionId(response.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  // Khởi tạo phiên trò chuyện mới
  const handleCreateSession = async () => {
    try {
      const response = await client.post('/api/chatbot/sessions', {
        course_id: course.id,
        title: `Trò chuyện mới ${sessions.length + 1}`
      });
      setSessions([response.data, ...sessions]);
      setCurrentSessionId(response.data.id);
      setMessages([]);
      resetTelemetry();
    } catch (err) {
      console.error('Error creating session:', err);
    }
  };

  // Lấy tin nhắn trong session hiện tại
  const fetchMessages = async (sid: number) => {
    if (!sid) return;
    try {
      const response = await client.get(`/api/chatbot/sessions/${sid}/messages`);
      setMessages(response.data);
      
      // Khôi phục telemetry từ tin nhắn cuối cùng (nếu là assistant và có log)
      const lastAssistant = [...response.data].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        setPerformanceMetrics({
          prompt_tokens: lastAssistant.prompt_tokens || 0,
          completion_tokens: lastAssistant.completion_tokens || 0,
          total_tokens: (lastAssistant.prompt_tokens || 0) + (lastAssistant.completion_tokens || 0),
          latency_ms: lastAssistant.latency_ms || 0,
          trace_id: lastAssistant.trace_id
        });
        if (lastAssistant.tool_calls) {
          setToolCalls(typeof lastAssistant.tool_calls === 'string' ? JSON.parse(lastAssistant.tool_calls) : lastAssistant.tool_calls);
        }
        if (lastAssistant.tool_results) {
          setToolResults(typeof lastAssistant.tool_results === 'string' ? JSON.parse(lastAssistant.tool_results) : lastAssistant.tool_results);
        }
      } else {
        resetTelemetry();
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  // Lấy lịch sử Evaluation
  const fetchEvalHistory = async () => {
    try {
      const response = await client.get('/api/chatbot/eval/history');
      setEvalHistory(response.data);
    } catch (err) {
      console.error('Error fetching eval history:', err);
    }
  };

  useEffect(() => {
    if (course?.id) {
      fetchSessions();
      fetchEvalHistory();
    }
  }, [course]);

  useEffect(() => {
    if (currentSessionId) {
      fetchMessages(currentSessionId);
    }
  }, [currentSessionId]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    setTimeout(() => {
      if (chatHistoryRef.current) {
        chatHistoryRef.current.scrollTo({
          top: chatHistoryRef.current.scrollHeight,
          behavior: behavior
        });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      }
    }, 100);
  };

  useEffect(() => {
    if (activeView === 'chatbot') {
      scrollToBottom('auto');
    }
  }, [activeView]);

  useEffect(() => {
    if (!currentSessionId) return;

    const sessionChanged = prevSessionId.current !== currentSessionId;
    const messagesAdded = messages.length > prevMessagesLength.current;
    const stagesChanged = stages.length !== prevStagesLength.current;

    prevSessionId.current = currentSessionId;
    prevMessagesLength.current = messages.length;
    prevStagesLength.current = stages.length;

    if (sessionChanged) {
      scrollToBottom('auto');
    } else if (messagesAdded || stagesChanged) {
      scrollToBottom('smooth');
    }
  }, [messages, stages, currentSessionId]);

  const resetTelemetry = () => {
    setStages([]);
    setCurrentRound(1);
    setToolCalls([]);
    setToolResults([]);
    setPerformanceMetrics(null);
  };

  // Gửi tin nhắn và stream SSE kết quả
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentSessionId || loading) return;

    const userText = inputText;
    setInputText('');

    if ((window as any).hasPendingAction) {
      const lowerText = userText.trim().toLowerCase();
      if (['ok', 'cho phép', 'cho phep', 'đồng ý', 'dong y', 'xác nhận', 'xac nhan', 'yes', 'confirm', 'allow'].includes(lowerText)) {
        window.dispatchEvent(new CustomEvent('confirm-chatbot-action'));
        const tempUserMsg: Message = { id: Date.now(), role: 'user', content: userText };
        const aiMsg: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'Dạ, em đang thực hiện hành động theo yêu cầu của Thầy/Cô ạ!'
        };
        setMessages(prev => [...prev, tempUserMsg, aiMsg]);
        return;
      } else if (['hủy', 'huy', 'không', 'khong', 'hủy bỏ', 'huy bo', 'no', 'cancel'].includes(lowerText)) {
        window.dispatchEvent(new CustomEvent('cancel-chatbot-action'));
        const tempUserMsg: Message = { id: Date.now(), role: 'user', content: userText };
        const aiMsg: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'Em đã hủy lệnh theo yêu cầu của Thầy/Cô.'
        };
        setMessages(prev => [...prev, tempUserMsg, aiMsg]);
        return;
      }
    }

    setLoading(true);
    resetTelemetry();

    // Optimistic User message update
    const tempUserMsg: Message = { id: Date.now(), role: 'user', content: userText };
    setMessages(prev => [...prev, tempUserMsg]);

    const token = localStorage.getItem('token');
    
    if (chatbotAbortRef.current) {
      chatbotAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatbotAbortRef.current = controller;
    
    try {
      const response = await fetch(`${client.defaults.baseURL || 'http://localhost:8000'}/api/chatbot/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: currentSessionId,
          message: userText,
          course_id: course.id
        })
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      let tempToolCalls: any[] = [];
      let tempToolResults: any[] = [];

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
            setStages(prev => [...prev, data]);
          } else if (event === 'dispatch_action') {
            window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', { detail: data }));
          } else if (event === 'tool_call') {
            setCurrentRound(data.round);
            tempToolCalls = [...tempToolCalls, ...data.tool_calls];
            setToolCalls(tempToolCalls);
          } else if (event === 'tool_result') {
            tempToolResults = [...tempToolResults, ...data.tool_results];
            setToolResults(tempToolResults);
          } else if (event === 'done') {
            const aiMsg: Message = {
              id: Date.now() + 1,
              role: 'assistant',
              content: data.assistant_text,
              tool_calls: tempToolCalls,
              tool_results: tempToolResults
            };
            setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, aiMsg]);
            setPerformanceMetrics({
              prompt_tokens: data.prompt_tokens,
              completion_tokens: data.completion_tokens,
              total_tokens: data.total_tokens,
              latency_ms: data.latency_ms,
              trace_id: data.trace_id
            });
            if (data.assistant_text.includes('sự cố') || data.assistant_text.includes('phản hồi tự động')) {
              setStages(prev => [...prev, { stage: 99, message: 'Lỗi kết nối mô hình ngôn ngữ (LLM). Hệ thống đã tự động kích hoạt phản hồi dự phòng.' }]);
            }
            window.dispatchEvent(new CustomEvent('db-state-changed'));
          } else if (event === 'error') {
            alert(data.message);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Chatbot generation aborted by user on the frontend.');
        return;
      }
      console.error('Streaming error:', err);
    } finally {
      if (chatbotAbortRef.current === controller) {
        chatbotAbortRef.current = null;
      }
      setLoading(false);
      fetchMessages(currentSessionId);
    }
  };

  const handleSwitchBranch = async (messageId: number) => {
    if (!currentSessionId) return;
    setLoading(true);
    try {
      await client.post(`/api/chatbot/sessions/${currentSessionId}/switch-branch`, {
        message_id: messageId
      });
      window.dispatchEvent(new CustomEvent('db-state-changed'));
      await fetchMessages(currentSessionId);
    } catch (err) {
      console.error('Error switching branch:', err);
      alert('Có lỗi xảy ra khi chuyển nhánh hội thoại.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (m: Message) => {
    setEditingMessageId(m.id);
    setEditText(m.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const handleSaveEdit = async (m: Message) => {
    if (!editText.trim() || !currentSessionId) return;
    
    const messageIndex = messages.findIndex(msg => msg.id === m.id);
    const subsequentMessages = messages.slice(messageIndex + 1);
    const hasSubsequent = messageIndex < messages.length - 2;
    const hasDbSideEffects = subsequentMessages.some(msg => {
      if (msg.role !== 'assistant') return false;
      const results = parseToolResults(msg.tool_results);
      return results.some(item => 
        ['generate_course_outline_action', 'generate_chapter_materials_action', 'generate_chapter_questions_action'].includes(item.tool)
      );
    });

    if (hasSubsequent || hasDbSideEffects) {
      setConflictEditId(m.id);
      setConflictText(editText);
      setConflictParentId(m.parent_id || null);
      setConflictModalOpen(true);
    } else {
      await sendEditRequest(m.id, editText, m.parent_id || null, 'archive');
    }
    setEditingMessageId(null);
  };

  const sendEditRequest = async (editMessageId: number, text: string, parentId: number | null, action: string) => {
    if (!currentSessionId) return;
    setLoading(true);
    resetTelemetry();
    setEditText('');
    setEditingMessageId(null);

    const parentIndex = messages.findIndex(msg => msg.id === editMessageId);
    let messagesBeforeEdit = messages.slice(0, parentIndex);
    const tempUserMsg: Message = { id: Date.now(), role: 'user', content: text, parent_id: parentId };
    setMessages([...messagesBeforeEdit, tempUserMsg]);

    const token = localStorage.getItem('token');
    
    if (chatbotAbortRef.current) {
      chatbotAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatbotAbortRef.current = controller;
    
    try {
      const response = await fetch(`${client.defaults.baseURL || 'http://localhost:8000'}/api/chatbot/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: currentSessionId,
          message: text,
          course_id: course.id,
          parent_message_id: parentId,
          edit_message_id: editMessageId,
          reconciliation_action: action
        })
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      let tempToolCalls: any[] = [];
      let tempToolResults: any[] = [];

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
            setStages(prev => [...prev, data]);
          } else if (event === 'dispatch_action') {
            window.dispatchEvent(new CustomEvent('chatbot-dispatch-action', { detail: data }));
          } else if (event === 'tool_call') {
            setCurrentRound(data.round);
            tempToolCalls = [...tempToolCalls, ...data.tool_calls];
            setToolCalls(tempToolCalls);
          } else if (event === 'tool_result') {
            tempToolResults = [...tempToolResults, ...data.tool_results];
            setToolResults(tempToolResults);
          } else if (event === 'done') {
            const aiMsg: Message = {
              id: Date.now() + 1,
              role: 'assistant',
              content: data.assistant_text,
              tool_calls: tempToolCalls,
              tool_results: tempToolResults
            };
            setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, aiMsg]);
            setPerformanceMetrics({
              prompt_tokens: data.prompt_tokens,
              completion_tokens: data.completion_tokens,
              total_tokens: data.total_tokens,
              latency_ms: data.latency_ms,
              trace_id: data.trace_id
            });
            window.dispatchEvent(new CustomEvent('db-state-changed'));
          } else if (event === 'error') {
            alert(data.message);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Edit stream aborted by user.');
        return;
      }
      console.error('Streaming error during edit:', err);
    } finally {
      if (chatbotAbortRef.current === controller) {
        chatbotAbortRef.current = null;
      }
      setLoading(false);
      fetchMessages(currentSessionId);
    }
  };

  const handleCancelGeneration = async () => {
    if (!currentSessionId) return;
    if (chatbotAbortRef.current) {
      chatbotAbortRef.current.abort();
      chatbotAbortRef.current = null;
    }
    setLoading(false);
    try {
      await client.post(`/api/chatbot/sessions/${currentSessionId}/cancel`);
    } catch (err) {
      console.error('Error cancelling response:', err);
    } finally {
      fetchMessages(currentSessionId);
    }
  };

  const handleRunEvaluation = async () => {
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const response = await client.post('/api/chatbot/eval/run?provider=openrouter');
      setEvalResult(response.data);
      fetchEvalHistory();
    } catch (err) {
      console.error(err);
      alert('Chạy Evaluation gặp lỗi hệ thống.');
    } finally {
      setEvalLoading(false);
    }
  };

  return (
    <div className="chatbot-container">
      {/* Header */}
      {isActive && portalTarget ? createPortal(
        <div className="chatbot-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={14} /> Quy trình Agent & Kiểm duyệt An toàn
        </div>,
        portalTarget
      ) : !portalTarget ? (
        <header className="chatbot-header">
          <div className="chatbot-header-left">
            <button onClick={onGoBack} className="chatbot-back-btn">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="chatbot-title">Trợ Lý Sư Phạm AI</h1>
              <p className="chatbot-subtitle">{course.course_code} — {course.course_name}</p>
            </div>
          </div>
          <div className="chatbot-badge">
            <ShieldAlert size={14} /> Quy trình Agent & Kiểm duyệt An toàn
          </div>
        </header>
      ) : null}

      {/* Main Grid */}
      <div className="chatbot-main-grid">
        {/* Cột 1: Sidebar Sessions */}
        <aside className="chatbot-sidebar">
          <button onClick={handleCreateSession} className="chatbot-new-session-btn">
            <Plus size={16} /> Trò chuyện mới
          </button>
          <div className="chatbot-sessions-list">
            {sessions.map(s => {
              const isActive = currentSessionId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => setCurrentSessionId(s.id)}
                  className={`chatbot-session-item ${isActive ? 'chatbot-session-item-active' : ''}`}
                >
                  <MessageSquare size={15} />
                  <span className="chatbot-session-title">{s.title}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Cột 2: Chat View */}
        <section 
          className="chatbot-chat-container"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="chatbot-drag-overlay">
              <div className="chatbot-drag-overlay-icon">
                <Upload size={32} />
              </div>
              <h4 className="chatbot-drag-overlay-title">Thả tệp đề cương vào đây</h4>
              <p className="chatbot-drag-overlay-desc">Chấp nhận file .pdf, .docx, .txt để trích xuất CLOs tự động</p>
            </div>
          )}
          <div ref={chatHistoryRef} className="chatbot-chat-history">
            {messages.length === 0 ? (
              <div className="chatbot-empty-chat">
                <div className="chatbot-empty-icon-wrapper">
                  <Cpu size={48} />
                </div>
                <h4>Em có thể giúp gì cho Thầy/Cô hôm nay?</h4>
                <p>Thầy/Cô có thể yêu cầu soạn bài giảng, tra cứu tài liệu RAG, hoặc xem ma trận CLO chuẩn Bloom của môn học.</p>
                
                <div 
                  className="chatbot-empty-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  title="Nhấn để chọn file đề cương Syllabus (.pdf, .docx, .txt)"
                >
                  <div className="chatbot-empty-dropzone-icon-wrapper">
                    <Upload size={24} />
                  </div>
                  <span className="chatbot-empty-dropzone-title">Nạp nhanh đề cương Syllabus</span>
                  <span className="chatbot-empty-dropzone-desc">Kéo thả tệp đề cương vào đây hoặc click để tải lên (.pdf, .docx, .txt)</span>
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, idx) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={m.id || idx}
                      className={`chatbot-message-row ${isUser ? 'chatbot-message-row-user' : 'chatbot-message-row-bot'}`}
                    >
                      <div className="chatbot-message-wrapper">
                        {!isUser && <div className="chatbot-bot-avatar">AI</div>}
                        <div className={`chatbot-message-bubble ${isUser ? 'chatbot-user-bubble' : 'chatbot-bot-bubble'}`}>
                          {isUser && editingMessageId === m.id ? (
                            <div className="chatbot-edit-container">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="chatbot-edit-textarea"
                                rows={3}
                              />
                              <div className="chatbot-edit-actions">
                                <button 
                                  type="button" 
                                  onClick={() => handleSaveEdit(m)} 
                                  className="chatbot-edit-save-btn"
                                  disabled={loading}
                                >
                                  Lưu & Gửi
                                </button>
                                <button 
                                  type="button" 
                                  onClick={handleCancelEdit} 
                                  className="chatbot-edit-cancel-btn"
                                  disabled={loading}
                                >
                                  Hủy
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="chatbot-message-content">{renderMarkdown(m.content, handleCitationClick)}</div>
                              <div className="chatbot-message-bubble-footer">
                                {isUser && !loading && (
                                  <button 
                                    type="button" 
                                    onClick={() => handleStartEdit(m)} 
                                    className="chatbot-message-edit-btn"
                                    title="Sửa tin nhắn"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                )}
                                {m.versions && m.versions.length > 1 && (
                                  <div className="chatbot-version-selector">
                                    <button 
                                      type="button" 
                                      disabled={m.versions!.indexOf(m.id) === 0 || loading} 
                                      onClick={() => handleSwitchBranch(m.versions![m.versions!.indexOf(m.id) - 1])}
                                      className="chatbot-version-btn"
                                    >
                                      &lt;
                                    </button>
                                    <span className="chatbot-version-text">
                                      v{m.versions!.indexOf(m.id) + 1}/{m.versions!.length}
                                    </span>
                                    <button 
                                      type="button" 
                                      disabled={m.versions!.indexOf(m.id) === m.versions!.length - 1 || loading} 
                                      onClick={() => handleSwitchBranch(m.versions![m.versions!.indexOf(m.id) + 1])}
                                      className="chatbot-version-btn"
                                    >
                                      &gt;
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                          {m.role === 'assistant' && m.tool_calls && (
                            <CompletedReasoningAccordion 
                              toolCalls={parseToolCalls(m.tool_calls)} 
                              toolResults={parseToolResults(m.tool_results)} 
                            />
                          )}
                          {m.role === 'assistant' && m.tool_results && (
                            <div className="chatbot-message-widgets">
                              {parseToolResults(m.tool_results).map((item: any, trIdx: number) => {
                                if (item.tool === 'get_matrix_coverage') {
                                  return <MatrixCoverageWidget key={trIdx} data={item.result} />;
                                }
                                if (item.tool === 'get_course_clos') {
                                  return <ClosWidget key={trIdx} data={item.result} />;
                                }
                                if (item.tool === 'generate_course_outline_action' || item.tool === 'get_course_chapters') {
                                  return <OutlineWidget key={trIdx} data={item.result} />;
                                }
                                if (item.tool === 'generate_chapter_storyboard_action') {
                                  return <StoryboardWidget key={trIdx} data={item.result} />;
                                }
                                if (item.tool === 'generate_chapter_materials_action') {
                                  return <MaterialsWidget key={trIdx} data={item.result} />;
                                }
                                if (item.tool === 'generate_chapter_questions_action') {
                                  return <QuestionsWidget key={trIdx} data={item.result} />;
                                }
                                if (item.tool === 'search_course_knowledge') {
                                  return <SearchKnowledgeWidget key={trIdx} data={item.result} />;
                                }
                                return null;
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="chatbot-message-row chatbot-message-row-bot">
                    <div className="chatbot-message-wrapper">
                      <div className="chatbot-bot-avatar">AI</div>
                      <div className="chatbot-message-bubble chatbot-bot-bubble" style={{ minWidth: '320px' }}>
                        <div className="chatbot-reasoning-accordion">
                          <div className="chatbot-reasoning-header">
                            <span className="chatbot-reasoning-title">
                              <Cpu size={14} className="animate-pulse" style={{ color: 'var(--vinuni-gold)' }} />
                              AI đang suy luận...
                            </span>
                          </div>
                          {stages.length > 0 && (
                            <div className="chatbot-reasoning-content" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                              {stages.map((st, sIdx) => {
                                const isWarning = st.message.includes('Lỗi') || st.stage === 99;
                                return (
                                  <div key={sIdx} className="chatbot-reasoning-step" style={{ display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
                                    <span className="chatbot-reasoning-step-icon">
                                      {isWarning ? (
                                        <X size={12} className="chatbot-status-icon-error" style={{ color: 'var(--danger-color)' }} />
                                      ) : (
                                        <Check size={12} className="chatbot-status-icon-success" style={{ color: 'var(--success-color)' }} />
                                      )}
                                    </span>
                                    <span className={isWarning ? 'chatbot-text-error' : ''}>
                                      {st.message}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {pendingAction && (
                  <div className="chatbot-message-row chatbot-bot-row animate-fade-in" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <div className="chatbot-avatar-container">
                      <div className="chatbot-bot-avatar">
                        <Cpu size={16} style={{ color: 'var(--vinuni-gold)' }} />
                      </div>
                    </div>
                    <div className="chatbot-message-bubble chatbot-bot-bubble" style={{ border: '1px solid rgba(212, 163, 89, 0.3)', background: 'rgba(212, 163, 89, 0.05)', borderRadius: '12px', padding: '16px', maxWidth: '80%', width: '100%', minWidth: '320px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--vinuni-gold)', fontWeight: 600 }}>
                        <Zap size={14} className="animate-pulse" />
                        <span>Đề xuất tự động từ trợ lý Falcon AI</span>
                      </div>
                      <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: '1.5', textAlign: 'left' }}>
                        {pendingAction.message || 'Mascot AI đề xuất thực hiện hành động tự động trên giao diện này.'}
                      </p>
                      
                      {pendingAction.params && (
                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                          {pendingAction.params.chapter_title && <div><strong>Chương học:</strong> <span style={{ color: 'var(--text-primary)' }}>{pendingAction.params.chapter_title}</span></div>}
                          {pendingAction.params.clo_code && <div><strong>Chuẩn đầu ra:</strong> <span style={{ color: 'var(--text-primary)' }}>{pendingAction.params.clo_code}</span></div>}
                          {pendingAction.params.bloom_level && <div><strong>Mức độ Bloom:</strong> <span style={{ color: 'var(--vinuni-gold)' }}>Bậc B{pendingAction.params.bloom_level}</span></div>}
                          {pendingAction.params.count && <div><strong>Số lượng:</strong> <span style={{ color: 'var(--text-primary)' }}>{pendingAction.params.count} câu</span></div>}
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-start' }}>
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('confirm-chatbot-action'));
                            setPendingAction(null);
                          }}
                          className="planner-modal-confirm-btn"
                          style={{
                            background: 'var(--vinuni-gold)',
                            color: '#000000',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '12.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            height: '32px'
                          }}
                        >
                          <Check size={14} /> Xác nhận thực hiện
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('cancel-chatbot-action'));
                            setPendingAction(null);
                          }}
                          className="planner-modal-cancel-btn"
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: 'var(--text-primary)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            height: '32px'
                          }}
                        >
                          <X size={14} /> Hủy bỏ
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {uploadingFile && (
                  <div className="chatbot-message-row chatbot-message-row-bot">
                    <div className="chatbot-message-wrapper" style={{ width: '100%' }}>
                      <div className="chatbot-bot-avatar">AI</div>
                      <div className="chatbot-upload-progress-card">
                        <div className="chatbot-upload-progress-header">
                          <span>Phân tích đề cương Syllabus</span>
                          <span className="chatbot-upload-progress-filename">{uploadingFile}</span>
                        </div>
                        <div className="chatbot-upload-progress-body">
                          <div className="chatbot-upload-progressbar-container">
                            <div 
                              className={`chatbot-upload-progressbar ${uploadStage === 4 ? 'chatbot-upload-progressbar--success' : ''}`}
                              style={{ width: `${(uploadStage / 4) * 100}%` }}
                            />
                          </div>
                          <div className="chatbot-upload-progress-steps">
                            <div className={`chatbot-upload-progress-step ${uploadStage === 1 ? 'active' : ''} ${uploadStage > 1 ? 'completed' : ''}`}>
                              <span className="chatbot-inline-icon-prefix">📄</span> 1. Đọc và trích xuất tài liệu
                            </div>
                            <div className={`chatbot-upload-progress-step ${uploadStage === 2 ? 'active' : ''} ${uploadStage > 2 ? 'completed' : ''}`}>
                              <span className="chatbot-inline-icon-prefix">🤖</span> 2. AI phân tích cấu trúc CLOs
                            </div>
                            <div className={`chatbot-upload-progress-step ${uploadStage === 3 ? 'active' : ''} ${uploadStage > 3 ? 'completed' : ''}`}>
                              <span className="chatbot-inline-icon-prefix">📊</span> 3. Ánh xạ Bloom mức nhận thức
                            </div>
                            <div className={`chatbot-upload-progress-step ${uploadStage === 4 ? 'active' : ''} ${uploadStage > 4 ? 'completed' : ''}`}>
                              <span className="chatbot-inline-icon-prefix">💾</span> 4. Lưu trữ và đồng bộ hóa
                            </div>
                          </div>
                          
                          {uploadLog && (
                            <div className="chatbot-stream-log-text" style={{ fontSize: '12px', marginTop: '6px', color: 'var(--vinuni-gold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className="chatbot-pulse-dot" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--vinuni-gold)', animation: 'pulse 1s infinite' }} />
                              {uploadLog}
                            </div>
                          )}

                          {extractedClos.length > 0 && (
                            <div className="chatbot-upload-clos-preview">
                              <div className="chatbot-upload-clos-title">CLOs trích xuất nháp ({extractedClos.length})</div>
                              <div className="chatbot-upload-clos-list">
                                {extractedClos.map((c, idx) => (
                                  <div key={idx} className="chatbot-upload-clo-item">
                                    <span className="chatbot-upload-clo-code">{c.clo_code}</span>
                                    <span className="chatbot-upload-clo-desc" title={c.description}>{c.description}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Form Input */}
          <form onSubmit={handleSendMessage} className="chatbot-chat-form">
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
              className="chatbot-attach-btn"
              disabled={loading || !currentSessionId}
              title="Đính kèm file đề cương Syllabus (.pdf, .docx, .txt)"
            >
              <Paperclip size={18} />
            </button>
            <textarea
              placeholder="Nhập yêu cầu giảng dạy (ví dụ: Soạn slide Chương 1 hoặc xem CLOs)..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const fakeEvent = {
                    preventDefault: () => {},
                  } as React.FormEvent;
                  handleSendMessage(fakeEvent);
                }
              }}
              className="chatbot-chat-input"
              disabled={loading || !currentSessionId}
              rows={Math.min(5, Math.max(1, inputText.split('\n').length))}
              style={{
                resize: 'none',
                height: 'auto',
                lineHeight: '1.5',
                paddingTop: '12px',
                paddingBottom: '12px',
              }}
            />
            {loading && (
              <button
                type="button"
                onClick={handleCancelGeneration}
                className="chatbot-cancel-btn"
              >
                <X size={14} /> Dừng
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !inputText.trim() || !currentSessionId}
              className="chatbot-send-btn"
            >
              <Send size={14} /> Gửi
            </button>
          </form>
        </section>

        {/* Cột 3: Telemetry, Costs & Evaluations */}
        <section className="chatbot-analytics">
          {/* Tab Navigation */}
          <div className="chatbot-tabs">
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`chatbot-tab-btn ${activeTab === 'telemetry' ? 'chatbot-tab-btn-active' : ''}`}
            >
              Suy luận & Tool Logs
            </button>
            <button
              onClick={() => setActiveTab('cost')}
              className={`chatbot-tab-btn ${activeTab === 'cost' ? 'chatbot-tab-btn-active' : ''}`}
            >
              Token & Chi Phí
            </button>
            <button
              onClick={() => setActiveTab('eval')}
              className={`chatbot-tab-btn ${activeTab === 'eval' ? 'chatbot-tab-btn-active' : ''}`}
            >
              Eval Center
            </button>
          </div>

          <div className="chatbot-tab-content">
            {/* TAB 1: TELEMETRY & LOGS */}
            {activeTab === 'telemetry' && (
              <div className="chatbot-telemetry-panel">
                <h4 className="chatbot-panel-title">Quy trình cuộc gọi Agent Loop</h4>
                <div className="chatbot-panel-desc">
                  Hiển thị lịch sử gọi công cụ trung gian của AI trong vòng chat hiện tại.
                </div>
                
                {toolCalls.length === 0 ? (
                  <div className="chatbot-empty-telemetry">
                    Chưa có cuộc gọi công cụ nào được kích hoạt. Hãy thử hỏi câu hỏi liên quan đến tài liệu học trình.
                  </div>
                ) : (
                  <div className="chatbot-logs-list">
                    {toolCalls.map((tc, tcIdx) => (
                      <div key={tcIdx} className="chatbot-log-card">
                        <div className="chatbot-log-header">
                          <span className="chatbot-log-badge-tool">Tool Call</span>
                          <strong>{tc.name}</strong>
                        </div>
                        <pre className="chatbot-log-pre">
                          {JSON.stringify(tc.args, null, 2)}
                        </pre>
                        
                        {toolResults[tcIdx] && (
                          <div className="chatbot-log-result-container">
                            <span className="chatbot-log-badge-result">Result</span>
                            <pre className="chatbot-log-pre chatbot-log-pre--success">
                              {JSON.stringify(toolResults[tcIdx].result, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: COST & TOKENS */}
            {activeTab === 'cost' && (
              <div className="chatbot-cost-panel">
                <h4 className="chatbot-panel-title">Chi Phí & Token Tiêu Thụ</h4>
                
                {performanceMetrics ? (
                  <div className="chatbot-metrics-grid">
                    <div className="chatbot-metric-card">
                      <span className="chatbot-metric-label">Prompt Tokens</span>
                      <strong className="chatbot-metric-val">{performanceMetrics.prompt_tokens}</strong>
                    </div>
                    <div className="chatbot-metric-card">
                      <span className="chatbot-metric-label">Completion Tokens</span>
                      <strong className="chatbot-metric-val">{performanceMetrics.completion_tokens}</strong>
                    </div>
                    <div className="chatbot-metric-card chatbot-metric-card--highlight">
                      <span className="chatbot-metric-label">Total Tokens</span>
                      <strong className="chatbot-metric-val chatbot-metric-val--navy">{performanceMetrics.total_tokens}</strong>
                    </div>
                    <div className="chatbot-metric-card">
                      <span className="chatbot-metric-label">Độ trễ phản hồi</span>
                      <strong className="chatbot-metric-val">{(performanceMetrics.latency_ms / 1000).toFixed(2)}s</strong>
                    </div>
                    <div className="chatbot-metric-card chatbot-metric-card--span2">
                      <span className="chatbot-metric-label">Langfuse Trace ID</span>
                      <code className="chatbot-metric-code">
                        {performanceMetrics.trace_id || 'N/A'}
                      </code>
                    </div>
                  </div>
                ) : (
                  <div className="chatbot-empty-telemetry">
                    Chưa có thống kê token cho phiên chat này. Hãy gửi một tin nhắn để theo dõi.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: EVAL CENTER */}
            {activeTab === 'eval' && (
              <div className="chatbot-eval-panel">
                <div className="chatbot-eval-header-row">
                  <h4 className="chatbot-panel-title">Kiểm Thử Đánh Giá (Evaluation)</h4>
                  <button
                    onClick={handleRunEvaluation}
                    disabled={evalLoading}
                    className="chatbot-run-eval-btn"
                  >
                    {evalLoading ? 'Đang chạy...' : 'Chạy Evaluation'}
                  </button>
                </div>

                {evalResult && (
                  <div className="chatbot-eval-results-box">
                    <h5 className="chatbot-eval-subheader">Lượt chạy mới nhất: {evalResult.eval_run_id}</h5>
                    <div className="chatbot-eval-summary-grid">
                      <div>Độ chính xác: <strong>{evalResult.summary.accuracy * 100}%</strong></div>
                      <div>Số test cases đạt: <strong>{evalResult.summary.passed_cases}/{evalResult.summary.total_cases}</strong></div>
                      <div>Vi phạm Guardrail: <strong className="chatbot-text-danger">{evalResult.summary.guardrail_violations_count}</strong></div>
                    </div>
                    <div className="chatbot-eval-cases-list">
                      {evalResult.results.map((r, rIdx) => (
                        <div key={rIdx} className="chatbot-eval-case-item">
                          <span className={r.passed ? 'chatbot-eval-pass-badge' : 'chatbot-eval-fail-badge'}>
                            {r.passed ? 'PASS' : 'FAIL'}
                          </span>
                          <strong>{r.name}</strong>
                          <div className="chatbot-eval-user-msg">
                            {r.user_message}
                          </div>
                          {r.failures && r.failures.length > 0 && (
                            <div className="chatbot-eval-failures">
                              {r.failures.map((f, fIdx) => <div key={fIdx}>• {f}</div>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h5 className="chatbot-eval-history-title">
                  Lịch sử các lần chạy
                </h5>
                <div className="chatbot-eval-history-list">
                  {evalHistory.length === 0 ? (
                    <div className="chatbot-eval-history-empty">
                      Chưa có lượt đánh giá nào được chạy.
                    </div>
                  ) : (
                    evalHistory.map(h => (
                      <div key={h.id} className="chatbot-eval-history-card">
                        <div className="chatbot-eval-history-header">
                          <strong className="chatbot-eval-history-id">{h.eval_run_id}</strong>
                          <span className="chatbot-eval-history-pass">{h.accuracy * 100}% Pass</span>
                        </div>
                        <div className="chatbot-eval-history-meta">
                          Provider: {h.provider} | Model: {h.model} | Chạy lúc: {new Date(h.run_at).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {conflictModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="chatbot-modal-overlay">
          <div className="chatbot-modal-content">
            <h3 className="chatbot-modal-title">
              <AlertTriangle style={{ color: 'var(--vinuni-gold)' }} />
              Xác nhận sửa đổi tin nhắn
            </h3>
            <p className="chatbot-modal-body">
              Chỉnh sửa tin nhắn này sẽ cắt ngắn lịch sử hội thoại và tạo nhánh mới. Một số học liệu đã được tạo tự động trong nhánh cũ có thể bị ảnh hưởng. Hãy lựa chọn phương án xử lý học liệu cũ:
            </p>
            <div className="chatbot-modal-options">
              <button 
                type="button" 
                onClick={() => {
                  sendEditRequest(conflictEditId!, conflictText, conflictParentId, 'archive');
                  setConflictModalOpen(false);
                }}
                className="chatbot-modal-option-btn"
              >
                <span className="chatbot-modal-option-title">1. Lưu trữ (Archive) [Khuyến nghị]</span>
                <span className="chatbot-modal-option-desc">Ẩn các học liệu thuộc nhánh cũ khỏi dashboard, dễ dàng khôi phục khi chuyển lại phiên bản.</span>
              </button>
              <button 
                type="button" 
                onClick={() => {
                  sendEditRequest(conflictEditId!, conflictText, conflictParentId, 'overwrite');
                  setConflictModalOpen(false);
                }}
                className="chatbot-modal-option-btn"
              >
                <span className="chatbot-modal-option-title">2. Ghi đè (Overwrite)</span>
                <span className="chatbot-modal-option-desc">Xóa hoàn toàn các học liệu thuộc nhánh cũ khỏi cơ sở dữ liệu.</span>
              </button>
              <button 
                type="button" 
                onClick={() => {
                  sendEditRequest(conflictEditId!, conflictText, conflictParentId, 'keep');
                  setConflictModalOpen(false);
                }}
                className="chatbot-modal-option-btn"
              >
                <span className="chatbot-modal-option-title">3. Giữ lại (Keep)</span>
                <span className="chatbot-modal-option-desc">Giữ lại cả hai bộ học liệu (có thể dẫn đến trùng lặp dữ liệu môn học).</span>
              </button>
            </div>
            <div className="chatbot-modal-actions">
              <button 
                type="button" 
                onClick={() => setConflictModalOpen(false)} 
                className="chatbot-edit-cancel-btn"
              >
                Hủy sửa đổi
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {selectedCitation && typeof document !== 'undefined' && createPortal(
        <div className="chatbot-modal-overlay" style={{ zIndex: 1000 }}>
          <div className="chatbot-modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <h3 className="chatbot-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} style={{ color: 'var(--vinuni-gold)' }} />
              Xác minh nguồn trích dẫn RAG
            </h3>
            <div className="chatbot-modal-body" style={{ textAlign: 'left', margin: '15px 0' }}>
              <div style={{ marginBottom: '12px', fontSize: '13.5px' }}>
                <strong>Tài liệu:</strong> <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all' }}>{selectedCitation.fileName}</code> 
                {selectedCitation.pageNumber && (
                  <span style={{ marginLeft: '12px' }}>
                    <strong>Trang:</strong> <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{selectedCitation.pageNumber}</code>
                  </span>
                )}
              </div>
              <div style={{ 
                background: 'rgba(15, 23, 42, 0.4)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px', 
                padding: '16px', 
                maxHeight: '300px', 
                overflowY: 'auto',
                fontStyle: 'italic',
                lineHeight: '1.6',
                color: '#cbd5e1',
                fontSize: '13px',
                whiteSpace: 'pre-wrap'
              }}>
                "{selectedCitation.text}"
              </div>
            </div>
            <div className="chatbot-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                type="button" 
                onClick={() => setSelectedCitation(null)} 
                className="chatbot-edit-cancel-btn"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Helper function
function parseToolResults(tr: any): any[] {
  if (!tr) return [];
  let parsed = tr;
  if (typeof tr === 'string') {
    try {
      parsed = JSON.parse(tr);
    } catch (e) {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.flat().filter(Boolean);
  }
  return [];
}

function parseToolCalls(tc: any): any[] {
  if (!tc) return [];
  let parsed = tc;
  if (typeof tc === 'string') {
    try {
      parsed = JSON.parse(tc);
    } catch (e) {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.flat().filter(Boolean);
  }
  return [];
}

function CompletedReasoningAccordion({ toolCalls, toolResults }: { toolCalls: any[], toolResults: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="chatbot-reasoning-accordion">
      <div className="chatbot-reasoning-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="chatbot-reasoning-title">
          <BarChart2 size={14} className="text-gold" style={{ color: 'var(--vinuni-gold)' }} />
          Quy trình suy luận ({toolCalls.length} bước gọi công cụ)
        </span>
        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }} />
      </div>
      {isOpen && (
        <div className="chatbot-reasoning-content">
          {toolCalls.map((tc, idx) => {
            return (
              <div key={idx} className="chatbot-reasoning-step" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Check size={12} className="chatbot-status-icon-success" style={{ color: 'var(--success-color)' }} />
                  <strong>Bước {idx + 1}: Gọi công cụ</strong> <code>{tc.name}</code>
                </div>
                {tc.args && Object.keys(tc.args).length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '18px' }}>
                    Tham số: <code>{JSON.stringify(tc.args)}</code>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sub-components
function MatrixCoverageWidget({ data }: { data: any }) {
  const matrix = data.matrix || {};
  return (
    <div className="chatbot-widget-container">
      <div className="chatbot-widget-title"><BarChart2 size={14} /> Ma trận Phân bố CLO x Bloom</div>
      <div className="chatbot-widget-overflow">
        <table className="chatbot-widget-table">
          <thead>
            <tr className="chatbot-widget-table-header-row">
              <th className="chatbot-widget-table-header-cell">CLO</th>
              <th className="chatbot-widget-table-header-cell">Bloom mục tiêu</th>
              <th className="chatbot-widget-table-header-cell">Số Slide</th>
              <th className="chatbot-widget-table-header-cell">Số Câu hỏi (MCQ)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(matrix).map(([cloCode, info]: [string, any]) => (
              <tr key={cloCode} className="chatbot-widget-table-body-row">
                <td className="chatbot-widget-table-body-cell-bold">{cloCode}</td>
                <td className="chatbot-widget-table-body-cell">
                  <span className="chatbot-widget-badge-purple">
                    Bloom {info.target_bloom || info.bloom_level || 'N/A'}
                  </span>
                </td>
                <td className="chatbot-widget-text-blue">{info.material_slide_count || 0} slide(s)</td>
                <td className="chatbot-widget-text-green">{info.question_count || 0} MCQ(s)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClosWidget({ data }: { data: any }) {
  const clos = data.clos || [];
  return (
    <div className="chatbot-widget-flex-col">
      <div className="chatbot-widget-title-flex"><Target size={14} /> Chuẩn đầu ra môn học (CLOs)</div>
      <div className="chatbot-widget-list">
        {clos.map((c: any) => (
          <div key={c.id || c.clo_code} className="chatbot-widget-card-clo">
            <span className="chatbot-widget-badge-gradient">
              {c.clo_code}
            </span>
            <div>
              <div className="chatbot-widget-card-meta">
                Bloom level tối thiểu: <strong style={{ color: '#c084fc' }}>{c.bloom_level}</strong>
              </div>
              <div className="chatbot-widget-card-desc">{c.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutlineWidget({ data }: { data: any }) {
  const chapters = data.chapters || [];
  return (
    <div className="chatbot-widget-flex-col">
      <div className="chatbot-widget-title-flex">
        <FileText size={14} /> Đề cương chương học mới (Skeletal Outline)
      </div>
      <div className="chatbot-widget-list-small-gap">
        {chapters.map((ch: any, idx: number) => (
          <div key={ch.id || idx} className="chatbot-widget-outline-card">
            <div className="chatbot-widget-outline-header">
              <span>{ch.title}</span>
              <span className="chatbot-widget-outline-label">Chương {ch.sort_order || (idx + 1)}</span>
            </div>
            {ch.description && (
              <div className="chatbot-widget-outline-desc">
                {ch.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryboardWidget({ data }: { data: any }) {
  const storyboard = data.storyboard || [];
  return (
    <div className="chatbot-widget-flex-col">
      <div className="chatbot-widget-title-flex"><Layers size={14} /> Cấu trúc Slide nháp (Storyboard Outline)</div>
      <div className="chatbot-widget-list-scroll">
        {storyboard.map((s: any, idx: number) => (
          <div key={idx} className="chatbot-widget-storyboard-card">
            <div className="chatbot-widget-index-badge">
              {s.slide_index || (idx + 1)}
            </div>
            <div className="chatbot-widget-card-content">
              <div className="chatbot-widget-card-title-ellipsis">
                {s.title}
              </div>
              <div className="chatbot-widget-card-desc-ellipsis">
                Mục đích: {s.purpose}
              </div>
            </div>
            <div className="chatbot-widget-badge-group">
              <span className="chatbot-widget-badge-blue">
                {s.target_clo}
              </span>
              <span className="chatbot-widget-badge-purple-small">
                B{s.bloom_level}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialsWidget({ data }: { data: any }) {
  const [showWarnings, setShowWarnings] = useState(false);
  const [showSlides, setShowSlides] = useState(false);
  const slideCount = data.slide_count || 0;
  const warnings: string[] = data.warnings || [];
  const slideTitles: string[] = data.slide_titles || [];
  
  return (
    <div className="chatbot-widget-container-lighter">
      <div className="chatbot-widget-title-flex">
        <Edit3 size={14} /> <span>Đã Soạn Slide Bài Giảng & Active Learning</span>
      </div>
      <div className="chatbot-widget-stats-row">
        <div>Số slide đã sinh: <strong className="chatbot-widget-stats-val-blue">{slideCount} slides</strong></div>
        <div>Cảnh báo sư phạm: <strong className={warnings.length > 0 ? 'chatbot-widget-stats-val-rose' : 'chatbot-widget-stats-val-green'}>{warnings.length}</strong></div>
      </div>
      
      {slideTitles.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <button 
            type="button"
            onClick={() => setShowSlides(!showSlides)} 
            className="chatbot-widget-collapse-btn"
          >
            {showSlides ? <><ChevronDown size={14} /> Ẩn danh sách slide</> : <><ChevronRight size={14} /> Xem danh sách slide</>}
          </button>
          {showSlides && (
            <div className="chatbot-widget-inner-scroll">
              {slideTitles.map((t, idx) => (
                <div key={idx} style={{ color: '#94a3b8' }}>
                  {idx + 1}. {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div>
          <button 
            type="button"
            onClick={() => setShowWarnings(!showWarnings)} 
            className="chatbot-widget-collapse-btn-rose"
          >
            {showWarnings ? <><ChevronDown size={14} /> Ẩn cảnh báo sư phạm</> : <><ChevronRight size={14} /> Xem cảnh báo sư phạm</>}
          </button>
          {showWarnings && (
            <div className="chatbot-widget-warning-box">
              {warnings.map((w, idx) => (
                <div key={idx} className="chatbot-widget-warning-item">
                  <AlertTriangle size={12} className="chatbot-status-icon-error" /> {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionsWidget({ data }: { data: any }) {
  const questions = data.questions || [];
  return (
    <div className="chatbot-widget-flex-col">
      <div className="chatbot-widget-title-flex"><HelpCircle size={14} /> Bộ câu hỏi trắc nghiệm vừa sinh ({questions.length} câu)</div>
      {questions.map((q: any, idx: number) => (
        <QuizCard key={q.id || idx} q={q} idx={idx} />
      ))}
    </div>
  );
}

function QuizCard({ q, idx }: { q: any, idx: number }) {
  const [revealed, setRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  
  let options: string[] = [];
  try {
    options = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json;
  } catch (e) {
    options = [];
  }

  return (
    <div className="chatbot-widget-quiz-card">
      <div className="chatbot-widget-quiz-header">
        <span className="chatbot-widget-quiz-number">Câu {idx + 1}</span>
        <span className="chatbot-widget-quiz-bloom">
          Bloom {q.bloom_level}
        </span>
      </div>
      
      <div className="chatbot-widget-quiz-text">
        {q.question_text}
      </div>

      <div className="chatbot-widget-quiz-options-group">
        {options.map((opt, optIdx) => {
          const isSelected = selectedOption === opt;
          return (
            <button
              key={optIdx}
              type="button"
              onClick={() => setSelectedOption(opt)}
              className={`chatbot-widget-quiz-option ${isSelected ? 'chatbot-widget-quiz-option-selected' : ''}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="chatbot-widget-quiz-footer">
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          className="chatbot-widget-quiz-btn"
        >
          {revealed ? 'Ẩn đáp án' : 'Xem đáp án'}
        </button>
        {selectedOption && (
          <span className="chatbot-widget-quiz-selected-label">
            Đã chọn đáp án
          </span>
        )}
      </div>

      {revealed && (
        <div className="chatbot-widget-quiz-answer-box">
          <div className="chatbot-widget-quiz-correct-text" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Check size={12} aria-hidden="true" /> Đáp án đúng: {q.correct_answer}
          </div>
          {q.reasoning_path && (
            <div className="chatbot-widget-quiz-reasoning">
              <strong>Lập luận:</strong> {q.reasoning_path}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchKnowledgeWidget({ data }: { data: any }) {
  const results = data.results || [];
  if (results.length === 0) return null;
  return (
    <div className="chatbot-widget-flex-col">
      <div className="chatbot-widget-title-flex"><BookOpen size={14} /> Tài liệu tham khảo tìm thấy:</div>
      <div className="chatbot-widget-list-small-gap">
        {results.map((r: any, idx: number) => (
          <SourceCard key={idx} r={r} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ r }: { r: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="chatbot-widget-source-card">
      <div className="chatbot-widget-source-header">
        <span className="chatbot-widget-source-title">
          <FileText size={12} /> {r.file_name} {r.page_number !== undefined ? `(Trang ${r.page_number})` : ''}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="chatbot-widget-source-toggle-btn"
        >
          {expanded ? 'Ẩn' : 'Xem chi tiết'}
        </button>
      </div>
      {expanded && (
        <div className="chatbot-widget-source-body">
          "{r.text}"
        </div>
      )}
    </div>
  );
}















