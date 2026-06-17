'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import FlowSteps from '../components/FlowSteps';
import QuestionConfigForm from '../components/QuestionConfigForm';
import QuestionEditorForm from '../components/QuestionEditorForm';
import QuestionCard from '../components/QuestionCard';
import { ArrowLeft, BookOpen, BarChart2, Download, Plus, Sparkles, Map, Target } from 'lucide-react';
import { Course, CLO, Chapter, Question } from '@/types';
import '../styles/QuestionBank.css';

export interface QuestionBankProps {
  course: Course;
  initialChapterId: number | null;
  initialCloId: number | null;
  initialBloomLevel: number | null;
  onBack: () => void;
  onGoToLessonPlanner?: () => void;
  onViewDashboard: () => void;
  onNavigate: (view: string, extra?: any) => void;
  onRecordAIUsage: (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
  isActive?: boolean;
}

export interface AgentMonitorState {
  traceId?: string;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalCost?: number;
  latency?: number;
  stages: { stage: number; message: string; status: 'pending' | 'success' | 'error' | 'running' }[];
  questionAttempts: { [key: number]: { attempts: number; guardrail_ok: boolean } };
  status: 'idle' | 'running' | 'success' | 'error';
}

export default function QuestionBank({
  course,
  initialChapterId,
  initialCloId,
  initialBloomLevel,
  onBack,
  onGoToLessonPlanner,
  onViewDashboard,
  onNavigate,
  onRecordAIUsage,
  setAIProcessingStatus,
  isActive
}: QuestionBankProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [clos, setClos] = useState<CLO[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  
  // States cho Form Sinh Câu hỏi
  const [selectedClo, setSelectedClo] = useState<string | number>('');
  const [selectedChapter, setSelectedChapter] = useState<string | number>('');
  const [bloomLevel, setBloomLevel] = useState<number>(3);
  const [count, setCount] = useState<string | number>(3);
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState('');
  const [isFastMode, setIsFastMode] = useState(false);
  const [agentMonitor, setAgentMonitor] = useState<AgentMonitorState>({
    stages: [],
    questionAttempts: {},
    status: 'idle'
  });

  // General States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<any>(null);

  // Load ban đầu
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Load questions
      const qRes = await client.get(`/api/courses/${course.id}/questions`);
      setQuestions(qRes.data);
      
      // 2. Load CLOs
      const cloRes = await client.get(`/api/courses/${course.id}/clos`);
      setClos(cloRes.data);
      if (initialCloId) {
        setSelectedClo(initialCloId);
      } else if (cloRes.data.length > 0) {
        setSelectedClo(cloRes.data[0].id);
      }
      
      // 3. Load Chapters
      const capRes = await client.get(`/api/courses/${course.id}/chapters`);
      setChapters(capRes.data);
      if (capRes.data.length > 0) {
        const found = initialChapterId && capRes.data.some((c: Chapter) => c.id === initialChapterId);
        setSelectedChapter(found ? (initialChapterId as number) : capRes.data[0].id);
      }
    } catch (err) {
      console.error(err);
      setError('Không thể tải dữ liệu ngân hàng câu hỏi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [course.id]);

  // Đồng bộ hóa chương học được chọn khi prop initialChapterId thay đổi từ Roadmap
  useEffect(() => {
    if (initialChapterId && chapters.length > 0) {
      const found = chapters.some((c: Chapter) => c.id === initialChapterId);
      if (found && selectedChapter !== initialChapterId) {
        setSelectedChapter(initialChapterId);
      }
    }
  }, [initialChapterId, chapters, selectedChapter]);

  // Đồng bộ hóa chuẩn đầu ra và mức Bloom khi được chuyển vùng từ Ma trận
  useEffect(() => {
    if (initialCloId) {
      setSelectedClo(initialCloId);
    }
  }, [initialCloId]);

  useEffect(() => {
    if (initialBloomLevel) {
      setBloomLevel(initialBloomLevel);
    }
  }, [initialBloomLevel]);

  const handleGenerateQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setGenerating(true);
    setGenLog('Khởi động AI Generator... đang kết nối OpenRouter...');

    const token = localStorage.getItem('token');
    const opStartTime = Date.now();
    setAIProcessingStatus(true, 'AI đang khởi động generator sinh câu hỏi...');

    setAgentMonitor({
      stages: [
        { stage: 1, message: 'Đang kết nối OpenRouter và chuẩn bị...', status: 'pending' }
      ],
      questionAttempts: {},
      status: 'running',
      latency: 0
    });

    let timer: any = null;
    timer = setInterval(() => {
      setAgentMonitor(prev => {
        if (prev.status !== 'running') return prev;
        return {
          ...prev,
          latency: Number(((Date.now() - opStartTime) / 1000).toFixed(1))
        };
      });
    }, 200);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/courses/${course.id}/questions/generate-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            clo_id: selectedClo ? parseInt(selectedClo.toString()) : null,
            chapter_id: selectedChapter ? parseInt(selectedChapter.toString()) : null,
            bloom_level: parseInt(bloomLevel.toString()),
            count: parseInt(count.toString()),
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
      const newQuestions: any[] = [];
      let currentEvent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Giữ lại dòng chưa hoàn chỉnh

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (currentEvent === 'stage') {
                setGenLog(data.message);
                setAIProcessingStatus(true, `Sinh câu hỏi: ${data.message}`);

                const stageNum = data.stage || 1;
                const traceId = data.trace_id;
                setAgentMonitor(prev => {
                  const existingStageIdx = prev.stages.findIndex(s => s.stage === stageNum);
                  let newStages = [...prev.stages];
                  if (existingStageIdx > -1) {
                    newStages[existingStageIdx] = {
                      stage: stageNum,
                      message: data.message,
                      status: 'running'
                    };
                  } else {
                    newStages = newStages.map(s => ({ ...s, status: s.status === 'running' ? 'success' : s.status }));
                    newStages.push({
                      stage: stageNum,
                      message: data.message,
                      status: 'running'
                    });
                  }
                  return {
                    ...prev,
                    traceId: traceId || prev.traceId,
                    stages: newStages
                  };
                });

              } else if (currentEvent === 'question') {
                newQuestions.push(data.question);
                setQuestions(prev => [...prev, data.question]);
                setGenLog(`Câu ${data.index}/${data.total} đã xác minh và lưu vào CSDL!`);

                const attempts = data.attempts !== undefined ? data.attempts : 1;
                const guardrail_ok = data.guardrail_ok !== undefined ? data.guardrail_ok : true;
                const index = data.index;
                setAgentMonitor(prev => {
                  const nextAttempts = { ...prev.questionAttempts, [index]: { attempts, guardrail_ok } };
                  const newStages = prev.stages.map(s => {
                    if (s.stage === 3) {
                      return { ...s, message: `⏳ Đang tự sửa lỗi và xác minh câu ${index}/${data.total}...`, status: 'running' as const };
                    }
                    return s;
                  });
                  return {
                    ...prev,
                    questionAttempts: nextAttempts,
                    stages: newStages
                  };
                });

              } else if (currentEvent === 'done') {
                if (timer) clearInterval(timer);
                setMessage(data.message);
                setGenerating(false);
                setGenLog('');
                setAIProcessingStatus(false);
                const opLatency = (Date.now() - opStartTime) / 1000;
                onRecordAIUsage({
                  operation: `Sinh câu hỏi tự động - ${count} câu`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: data.usage?.total_cost !== undefined ? Number(data.usage.total_cost) : Number((parseInt(count.toString()) * 0.005).toFixed(4)),
                  tokens: data.usage ? {
                    prompt: data.usage.prompt_tokens || 0,
                    completion: data.usage.completion_tokens || 0
                  } : undefined,
                  model: data.usage?.model_name,
                  status: 'success'
                });

                setAgentMonitor(prev => ({
                  ...prev,
                  status: 'success',
                  latency: Number(opLatency.toFixed(1)),
                  modelName: data.usage?.model_name || 'OpenRouter API',
                  promptTokens: data.usage?.prompt_tokens || 0,
                  completionTokens: data.usage?.completion_tokens || 0,
                  totalCost: data.usage?.total_cost !== undefined ? Number(data.usage.total_cost) : Number((parseInt(count.toString()) * 0.005).toFixed(4)),
                  stages: prev.stages.map(s => ({ ...s, status: 'success' }))
                }));

              } else if (currentEvent === 'error') {
                if (timer) clearInterval(timer);
                setError(data.message);
                setGenerating(false);
                setGenLog('');
                setAIProcessingStatus(false);
                const opLatency = (Date.now() - opStartTime) / 1000;
                onRecordAIUsage({
                  operation: `Sinh câu hỏi tự động - ${count} câu`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: 0,
                  status: 'error'
                });

                setAgentMonitor(prev => ({
                  ...prev,
                  status: 'error',
                  latency: Number(opLatency.toFixed(1)),
                  stages: prev.stages.map((s, idx) => {
                    if (idx === prev.stages.length - 1) {
                      return { ...s, message: `❌ Lỗi: ${data.message}`, status: 'error' };
                    }
                    return s;
                  })
                }));
              }
            } catch (_) {}
          }
        }
      }

    } catch (err: any) {
      if (timer) clearInterval(timer);
      console.error(err);
      setError(`Lỗi kết nối stream: ${err.message}`);
      setGenerating(false);
      setGenLog('');
      setAIProcessingStatus(false);
      const opLatency = (Date.now() - opStartTime) / 1000;
      onRecordAIUsage({
        operation: `Sinh câu hỏi tự động - ${count} câu`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });

      setAgentMonitor(prev => ({
        ...prev,
        status: 'error',
        latency: Number(opLatency.toFixed(1)),
        stages: prev.stages.map((s, idx) => {
          if (idx === prev.stages.length - 1) {
            return { ...s, message: `❌ Lỗi kết nối stream: ${err.message}`, status: 'error' };
          }
          return s;
        })
      }));
    }
  };

  useEffect(() => {
    const handleDbChanged = () => {
      fetchData();
    };
    window.addEventListener('db-state-changed', handleDbChanged);
    return () => window.removeEventListener('db-state-changed', handleDbChanged);
  }, [course.id]);

  useEffect(() => {
    const handleProgrammaticTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { action, params } = customEvent.detail || {};
      if (action === 'generate_questions') {
        if (params?.clo_id) setSelectedClo(params.clo_id);
        if (params?.chapter_id) setSelectedChapter(params.chapter_id);
        if (params?.bloom_level) setBloomLevel(params.bloom_level);
        if (params?.count) setCount(params.count);
        if (params?.fast_mode !== undefined) setIsFastMode(params.fast_mode);
        
        setTimeout(() => {
          const btn = document.getElementById('qb-generate-btn');
          if (btn) {
            btn.classList.add('programmatic-click');
            setTimeout(() => {
              btn.classList.remove('programmatic-click');
              handleGenerateQuestions({ preventDefault: () => {} } as any);
            }, 1000);
          } else {
            handleGenerateQuestions({ preventDefault: () => {} } as any);
          }
        }, 150);
      }
    };
    window.addEventListener('question-bank-programmatic-trigger', handleProgrammaticTrigger);
    return () => window.removeEventListener('question-bank-programmatic-trigger', handleProgrammaticTrigger);
  }, [clos, chapters, selectedClo, selectedChapter, bloomLevel, count, isFastMode, handleGenerateQuestions]);

  // Sinh câu hỏi isomorphic
  const handleGenerateIsomorphic = async (qId: number) => {
    setError('');
    setMessage('');
    setLoading(true);
    const opStartTime = Date.now();
    setAIProcessingStatus(true, 'AI đang sinh câu hỏi đồng cấu tương tự...');
    try {
      const response = await client.post(`/api/courses/questions/${qId}/generate-isomorphic`);
      setQuestions([...questions, response.data.question]);
      setMessage('Đã sinh thành công 1 câu hỏi đồng cấu tương tự!');
      
      const opLatency = (Date.now() - opStartTime) / 1000;
      const usage = response.data.usage;
      onRecordAIUsage({
        operation: `Sinh câu hỏi đồng cấu - ID: ${qId}`,
        latency: Number(opLatency.toFixed(1)),
        cost: usage?.total_cost !== undefined ? Number(usage.total_cost) : 0.005,
        tokens: usage ? {
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0
        } : undefined,
        model: usage?.model_name,
        status: 'success'
      });
    } catch (err) {
      console.error(err);
      setError('Lỗi khi sinh câu hỏi đồng cấu.');
      
      const opLatency = (Date.now() - opStartTime) / 1000;
      onRecordAIUsage({
        operation: `Sinh câu hỏi đồng cấu - ID: ${qId}`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    } finally {
      setLoading(false);
      setAIProcessingStatus(false);
    }
  };

  // Sửa câu hỏi
  const handleEditClick = (q: Question) => {
    let options: string[] = [];
    if (q.options_json) {
      try {
        options = JSON.parse(q.options_json);
      } catch (e) {
        options = ["", "", "", ""];
      }
    } else {
      options = ["", "", "", ""];
    }
    setEditingQuestion({
      ...q,
      options
    });
  };

  const handleCreateManualClick = () => {
    setEditingQuestion({
      id: 'new',
      question_text: '',
      options: ['', '', '', ''],
      correct_answer: '',
      bloom_level: 3,
      clo_id: clos.length > 0 ? clos[0].id : null,
      chapter_id: selectedChapter ? parseInt(selectedChapter.toString()) : null
    });
  };

  const handleUpdateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    // Đảm bảo đáp án đúng phải trùng khớp với một trong các lựa chọn
    if (!editingQuestion.options.includes(editingQuestion.correct_answer)) {
      setError('Đáp án đúng phải trùng với một trong bốn lựa chọn đã nhập.');
      return;
    }

    try {
      if (editingQuestion.id === 'new') {
        const response = await client.post(`/api/courses/${course.id}/questions`, {
          chapter_id: editingQuestion.chapter_id ? parseInt(editingQuestion.chapter_id.toString()) : null,
          question_text: editingQuestion.question_text,
          options_json: JSON.stringify(editingQuestion.options),
          correct_answer: editingQuestion.correct_answer,
          bloom_level: parseInt(editingQuestion.bloom_level.toString()),
          clo_id: editingQuestion.clo_id ? parseInt(editingQuestion.clo_id.toString()) : null
        });
        setQuestions([...questions, response.data]);
        setMessage('Tạo câu hỏi thủ công thành công!');
      } else {
        const response = await client.put(`/api/courses/questions/${editingQuestion.id}`, {
          question_text: editingQuestion.question_text,
          options_json: JSON.stringify(editingQuestion.options),
          correct_answer: editingQuestion.correct_answer,
          bloom_level: parseInt(editingQuestion.bloom_level.toString()),
          clo_id: editingQuestion.clo_id ? parseInt(editingQuestion.clo_id.toString()) : null
        });
        setQuestions(questions.map(q => q.id === editingQuestion.id ? response.data : q));
        setMessage('Cập nhật câu hỏi thành công!');
      }
      setEditingQuestion(null);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Lỗi khi lưu câu hỏi.');
    }
  };

  // Xóa câu hỏi
  const handleDeleteQuestion = async (qId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) return;
    setError('');
    setMessage('');
    
    try {
      await client.delete(`/api/courses/questions/${qId}`);
      setQuestions(questions.filter(q => q.id !== qId));
      setMessage('Đã xóa câu hỏi thành công.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa câu hỏi.');
    }
  };

  // Xuất bản đề thi (tải file Markdown)
  const handleExportExam = () => {
    if (questions.length === 0) {
      setError('Chưa có câu hỏi nào để xuất bản.');
      return;
    }
    
    let content = `# ĐỀ THI TRẮC NGHIỆM MÔN HỌC: ${(course.course_name || '').toUpperCase()}\n`;
    content += `Mã môn học: ${course.course_code || ''}\n`;
    content += `Số lượng câu hỏi: ${questions.length} câu\n`;
    content += `Sinh tự động bởi AI Lecture Assistant (G02-Team023)\n\n`;
    content += `--------------------------------------------------------\n\n`;
    
    questions.forEach((q, idx) => {
      content += `Câu ${idx + 1}: ${q.question_text || ''}\n`;
      let opts: string[] = [];
      if (q.options_json) {
        try {
          opts = JSON.parse(q.options_json);
        } catch(e) {
          opts = [];
        }
      }
      
      const labels = ["A", "B", "C", "D"];
      opts.forEach((opt, oIdx) => {
        content += `${labels[oIdx]}. ${opt}\n`;
      });
      
      content += `\n* Đáp án đúng: ${q.correct_answer || ''}\n`;
      const clo = clos.find(c => c.id === q.clo_id);
      content += `* Phân loại: [${clo ? (clo.clo_code || clo.code) : 'N/A'}] - Bloom level: ${q.bloom_level}\n\n`;
      content += `----------------\n\n`;
    });
    
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `De_thi_${course.course_code || 'export'}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helpers hiển thị Bloom text
  const getBloomText = (lvl: number) => {
    const texts = ["Nhớ (B1)", "Hiểu (B2)", "Vận dụng (B3)", "Phân tích (B4)", "Đánh giá (B5)", "Sáng tạo (B6)"];
    return texts[lvl - 1] || `B${lvl}`;
  };

  return (
    <div className="qb-container">
      {/* HEADER */}
      {isActive && portalTarget ? createPortal(
        <div className="qb-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onGoToLessonPlanner && (
            <button onClick={onGoToLessonPlanner} className="qb-dashboard-btn">
              <BookOpen size={15} /> Soạn Slide & Giáo án
            </button>
          )}
          <button onClick={onViewDashboard} className="qb-dashboard-btn">
            <BarChart2 size={15} /> Xem Ma trận Bloom-CLO
          </button>
          <button onClick={handleExportExam} className="qb-export-btn">
            <Download size={15} /> Xuất bản Đề thi (.md)
          </button>
        </div>,
        portalTarget
      ) : !portalTarget ? (
        <header className="qb-header">
          <div className="qb-header-left">
            <button onClick={onBack} className="qb-back-btn">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div className="qb-course-info">
              <h2 className="qb-title">Ngân Hàng Đề Thi & Câu Hỏi</h2>
            </div>
          </div>
          <div className="qb-header-right">
            {onGoToLessonPlanner && (
              <button onClick={onGoToLessonPlanner} className="qb-dashboard-btn">
                <BookOpen size={15} /> Soạn Slide & Giáo án
              </button>
            )}
            <button onClick={onViewDashboard} className="qb-dashboard-btn">
              <BarChart2 size={15} /> Xem Ma trận Bloom-CLO
            </button>
            <button onClick={handleExportExam} className="qb-export-btn">
              <Download size={15} /> Xuất bản Đề thi (.md)
            </button>
          </div>
        </header>
      ) : null}

      {error && <div className="qb-error-alert">{error}</div>}
      {message && <div className="qb-success-alert">{message}</div>}

      {initialCloId && initialBloomLevel && (
        <div className="qb-remedy-alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Target size={16} /> <strong>Bổ sung chuẩn đầu ra còn thiếu:</strong> Công cụ tạo câu hỏi và bộ lọc đã được tự động điều chỉnh chọn chuẩn đầu ra và mức Bloom tương ứng. Nhấn <strong>"Bắt đầu tạo câu hỏi"</strong> ở bảng bên trái hoặc thêm thủ công để bù đắp.
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div className="qb-whats-next-banner animate-fade-in">
          <div className="qb-whats-next-content" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="whats-next-sparkle" style={{ display: 'inline-flex', alignItems: 'center' }}><Sparkles size={16} /></span>
            <div style={{ textAlign: 'left' }}>
              <strong>Ngân hàng đề thi hiện có {questions.length} câu hỏi!</strong> Bạn có thể xuất bản toàn bộ đề thi, xem ma trận bao phủ hoặc quay về bảng tiến độ:
            </div>
          </div>
          <div className="qb-whats-next-actions">
            <button 
              onClick={handleExportExam} 
              className="whats-next-action-btn questions"
              title="Tải toàn bộ bộ câu hỏi trắc nghiệm dưới dạng tệp Markdown (.md)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            >
              <Download size={14} /> Tải Đề thi (.md)
            </button>
            <button 
              onClick={onViewDashboard} 
              className="whats-next-action-btn matrix"
              title="Xem ma trận phân loại phân bố mức Bloom và CLO"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            >
              <BarChart2 size={14} /> Xem Ma trận Bloom-CLO
            </button>
            <button 
              onClick={() => onNavigate('course_roadmap')}
              className="whats-next-action-btn roadmap"
              title="Quay lại sơ đồ tổng thể và trung tâm tải học liệu"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}
            >
              <Map size={14} /> Quay về Sơ đồ Lộ trình
            </button>
          </div>
        </div>
      )}

      <div className="qb-main-grid">

        <QuestionConfigForm
          selectedClo={selectedClo}
          setSelectedClo={setSelectedClo}
          clos={clos}
          selectedChapter={selectedChapter}
          setSelectedChapter={setSelectedChapter}
          chapters={chapters}
          bloomLevel={bloomLevel}
          setBloomLevel={setBloomLevel}
          count={count}
          setCount={setCount}
          generating={generating}
          loading={loading}
          genLog={genLog}
          handleGenerateQuestions={handleGenerateQuestions}
          isFastMode={isFastMode}
          setIsFastMode={setIsFastMode}
          agentMonitor={agentMonitor}
        />

        {/* BẢNG CHÍNH BÊN PHẢI: CHI TIẾT CÂU HỎI */}
        <main className="qb-content-area">
          <QuestionEditorForm
            editingQuestion={editingQuestion}
            setEditingQuestion={setEditingQuestion}
            clos={clos}
            handleUpdateQuestion={handleUpdateQuestion}
          />

          {/* DANH SÁCH CÂU HỎI */}
          <div className="qb-questions-list">
            <div className="qb-list-header">
              <h3>Danh sách Câu hỏi Hiện tại ({questions.length} câu)</h3>
              <button 
                onClick={handleCreateManualClick} 
                className="qb-add-manual-btn"
              >
                <Plus size={14} /> Thêm câu hỏi thủ công
              </button>
            </div>

            {loading ? (
              <div className="qb-loading-state">Đang đồng bộ dữ liệu ngân hàng đề thi...</div>
            ) : questions.length === 0 ? (
              <div className="qb-empty-state">
                <p>Chưa có câu hỏi nào trong môn học này.</p>
                <p className="qb-empty-desc">Hãy cấu hình bảng AI Generator ở bên trái để sinh tự động.</p>
                
                <div className="empty-suggestions-box">
                  <div className="empty-suggestions-title">
                    <span>💡 Hướng dẫn & Gợi ý thực hiện:</span>
                  </div>
                  <ul className="empty-suggestions-list">
                    <li className="empty-suggestions-item">Chọn <strong>Chuẩn đầu ra (CLO)</strong>, <strong>Chương học</strong> và <strong>Mức độ nhận thức (Bloom)</strong> mong muốn tại panel <strong>"Cấu hình Sinh Câu hỏi AI"</strong> ở bên trái.</li>
                    <li className="empty-suggestions-item">Chọn số lượng câu hỏi cần tạo và bấm nút <strong>"Bắt đầu tạo câu hỏi (AI)"</strong> để AI tự động sinh và kiểm định.</li>
                    <li className="empty-suggestions-item">Hoặc click vào nút <strong>"Thêm câu hỏi thủ công"</strong> ở góc phải của danh sách để tự biên soạn câu hỏi.</li>
                  </ul>
                </div>
              </div>
            ) : (
              questions.map((q, index) => (
                <QuestionCard
                  key={q.id || index}
                  q={q}
                  index={index}
                  clos={clos}
                  handleGenerateIsomorphic={handleGenerateIsomorphic}
                  handleEditClick={handleEditClick}
                  handleDeleteQuestion={handleDeleteQuestion}
                  getBloomText={getBloomText}
                />
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
