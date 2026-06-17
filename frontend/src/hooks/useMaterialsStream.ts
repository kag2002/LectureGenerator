import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import client from '../api/client';
import { Chapter } from '@/types';

interface UseMaterialsStreamOptions {
  courseId: number;
  selectedChapter: Chapter | null;
  classSize: number;
  hasWifi: boolean;
  furnitureType: string;
  sessionDuration: number;
  selectedClos: string[];
  pedagogicalStyle: string;
  learnerLevel: string;
  onRecordAIUsage: (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
  setError: (msg: string) => void;
  setMessage: (msg: string) => void;
  setSlideContent: (content: string) => void;
  setActiveLearningScript: (script: string) => void;
  setSavedSlideContent: (content: string) => void;
  setSavedScript: (script: string) => void;
  setRagReferences: (refs: any[]) => void;
  loadRevisions: (chapterId: number) => Promise<void>;
  loadChapterMcqs: (chapterId: number) => Promise<void>;
}

export function useMaterialsStream({
  courseId,
  selectedChapter,
  classSize,
  hasWifi,
  furnitureType,
  sessionDuration,
  selectedClos,
  pedagogicalStyle,
  learnerLevel,
  onRecordAIUsage,
  setAIProcessingStatus,
  setError,
  setMessage,
  setSlideContent,
  setActiveLearningScript,
  setSavedSlideContent,
  setSavedScript,
  setRagReferences,
  loadRevisions,
  loadChapterMcqs
}: UseMaterialsStreamOptions) {
  const selectedChapterRef = useRef(selectedChapter);
  useEffect(() => {
    selectedChapterRef.current = selectedChapter;
  }, [selectedChapter]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [storyboardDrafts, setStoryboardDrafts] = useState<Record<number, any[]>>({});
  const [aiSlideProposals, setAiSlideProposals] = useState<Record<number, string>>({});
  const [aiActiveLearningProposals, setAiActiveLearningProposals] = useState<Record<number, string>>({});
  const [chapterWarnings, setChapterWarnings] = useState<Record<number, string[]>>({});

  const storyboardDraft = selectedChapter ? storyboardDrafts[selectedChapter.id] || null : null;
  const aiSlideProposal = selectedChapter ? aiSlideProposals[selectedChapter.id] || '' : '';
  const aiActiveLearningProposal = selectedChapter ? aiActiveLearningProposals[selectedChapter.id] || '' : '';
  const warnings = selectedChapter ? chapterWarnings[selectedChapter.id] || [] : [];

  const setStoryboardDraft = (draft: any[] | null) => {
    if (!selectedChapter) return;
    setStoryboardDrafts(prev => {
      const copy = { ...prev };
      if (draft === null) {
        delete copy[selectedChapter.id];
      } else {
        copy[selectedChapter.id] = draft;
      }
      return copy;
    });
  };

  const setAiSlideProposal = (proposal: string | ((prev: string) => string)) => {
    if (!selectedChapter) return;
    setAiSlideProposals(prev => {
      const currentVal = prev[selectedChapter.id] || '';
      const newVal = typeof proposal === 'function' ? proposal(currentVal) : proposal;
      return { ...prev, [selectedChapter.id]: newVal };
    });
  };

  const setAiActiveLearningProposal = (proposal: string | ((prev: string) => string)) => {
    if (!selectedChapter) return;
    setAiActiveLearningProposals(prev => {
      const currentVal = prev[selectedChapter.id] || '';
      const newVal = typeof proposal === 'function' ? proposal(currentVal) : proposal;
      return { ...prev, [selectedChapter.id]: newVal };
    });
  };

  const setWarnings = (warns: string[]) => {
    if (!selectedChapter) return;
    setChapterWarnings(prev => ({ ...prev, [selectedChapter.id]: warns }));
  };
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [apiStatus, setApiStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [genLog, setGenLog] = useState('');
  const [aiViewMode, setAiViewMode] = useState<'storyboard' | 'slides'>('storyboard');
  const [generatingChapterId, setGeneratingChapterId] = useState<number | null>(null);

  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [selfCorrectionAttempt, setSelfCorrectionAttempt] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{
    prompt_tokens: number;
    completion_tokens: number;
    total_cost: number;
    model_name: string;
  } | null>(null);

  useEffect(() => {
    if (selectedChapter && generatingChapterId === selectedChapter.id) {
      setAiViewMode('slides');
    }
  }, [selectedChapter, generatingChapterId]);

  const handleGenerateStoryboard = async () => {
    if (!selectedChapter) {
      setError('Vui lòng chọn hoặc sinh một chương học trước.');
      return;
    }

    if (generatingChapterId !== null && generatingChapterId !== selectedChapter.id) {
      const confirmCancel = window.confirm(
        `Trợ lý AI đang sinh slide cho chương khác. Bắt đầu thiết kế dàn ý mới cho chương này sẽ hủy tiến trình đang chạy. Bạn có muốn tiếp tục không?`
      );
      if (!confirmCancel) return;
      await handleCancelMaterialsGeneration();
    }
    
    setError('');
    setMessage('');
    setIsGeneratingStoryboard(true);
    setApiStatus('generating');
    setGenLog('Giai đoạn 1: AI đang lập cấu trúc slide (Storyboard)…');
    setStoryboardDraft(null);
    
    setActiveAgent('storyboard_architect');
    setAgentStatus('running');
    setSelfCorrectionAttempt(null);
    setTokenUsage(null);

    const startTime = Date.now();
    setAIProcessingStatus(true, 'AI đang khởi động công cụ lập đề cương bài giảng (Storyboard)…');
    
    const steps = [
      'AI đang phân tích mục tiêu chương học và chuẩn đầu ra CLOs…',
      'AI đang thiết kế khung cấu trúc phân bổ slide chi tiết…',
      'AI đang xác định định hướng nội dung và mức Bloom cho từng slide…',
      'AI đang tổng hợp và tinh chỉnh đề cương bài giảng (Storyboard)…'
    ];
    let stepIdx = 0;
    const intervalId = setInterval(() => {
      if (stepIdx < steps.length) {
        setAIProcessingStatus(true, steps[stepIdx]);
        stepIdx++;
      }
    }, 2500);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await client.post(`/api/courses/chapters/${selectedChapter.id}/generate-storyboard`, {
        class_size: classSize,
        has_wifi: hasWifi,
        furniture_type: furnitureType,
        language: 'vi',
        session_duration: sessionDuration,
        pedagogical_style: pedagogicalStyle,
        learner_level: learnerLevel,
        selected_clos: selectedClos
      }, {
        signal: controller.signal
      });
      
      setStoryboardDraft(response.data.storyboard || []);
      setApiStatus('success');
      setMessage(response.data.message);
      setGenLog('');

      window.dispatchEvent(new CustomEvent('programmatic-storyboard-generated', {
        detail: {
          chapterId: selectedChapter.id,
          chapterTitle: selectedChapter.title,
          storyboard: response.data.storyboard || []
        }
      }));
      
      const usage = response.data.usage;
      if (usage) {
        setTokenUsage({
          prompt_tokens: usage.prompt_tokens || 0,
          completion_tokens: usage.completion_tokens || 0,
          total_cost: usage.total_cost !== undefined ? Number(usage.total_cost) : 0.02,
          model_name: usage.model_name || '',
        });
      }
      setActiveAgent('storyboard_architect');
      setAgentStatus('completed');

      const opLatency = (Date.now() - startTime) / 1000;
      onRecordAIUsage({
        operation: `Lập Storyboard - ${selectedChapter.title}`,
        latency: Number(opLatency.toFixed(1)),
        cost: usage?.total_cost !== undefined ? Number(usage.total_cost) : 0.02,
        tokens: usage ? {
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0
        } : undefined,
        model: usage?.model_name,
        status: 'success'
      });
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || axios.isCancel(err)) {
        // Storyboard generation aborted on frontend
        return;
      }
      // Error logged silently in production

      setApiStatus('error');
      setError(err.response?.data?.detail || 'Lỗi khi sinh storyboard.');
      setGenLog('');
      setAgentStatus('error');
      const opLatency = (Date.now() - startTime) / 1000;
      onRecordAIUsage({
        operation: `Lập Storyboard - ${selectedChapter.title}`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    } finally {
      clearInterval(intervalId);
      setIsGeneratingStoryboard(false);
      setAIProcessingStatus(false);
    }
  };

  // Giai đoạn 2: Sinh chi tiết slide + kịch bản từ Storyboard đã duyệt
  const handleGenerateMaterialsFromStoryboard = async (confirmedStoryboard: any[]) => {
    if (!selectedChapter) {
      setError('Vui lòng chọn hoặc sinh một chương học trước.');
      return;
    }
    if (!confirmedStoryboard || confirmedStoryboard.length === 0) {
      setError('Storyboard rỗng. Không thể sinh chi tiết.');
      return;
    }

    if (generatingChapterId !== null && generatingChapterId !== selectedChapter.id) {
      const confirmCancel = window.confirm(
        `Trợ lý AI đang sinh slide cho chương khác. Bắt đầu sinh học liệu cho chương này sẽ hủy tiến trình đang chạy. Bạn có muốn tiếp tục không?`
      );
      if (!confirmCancel) return;
      await handleCancelMaterialsGeneration();
    }
    
    setError('');
    setMessage('');
    
    const targetChapterId = selectedChapter.id; // Chụp lại ID chương mục tiêu tại thời điểm bắt đầu
    setAiViewMode('slides'); // Tự động chuyển sang chế độ hiển thị Slide đang sinh
    setGeneratingChapterId(targetChapterId); // Đánh dấu chương này đang chạy AI ngầm
    
    setApiStatus('generating');
    setGenLog('Giai đoạn 2: AI đang viết slide chi tiết & giáo án tương tác…');
    setCurrentStage(1);
    setCurrentSlide(0);
    setTotalSlides(0);
    setAiSlideProposal('');
    setAiActiveLearningProposal('');
    setWarnings([]);
    
    setActiveAgent('content_allocator');
    setAgentStatus('running');
    setSelfCorrectionAttempt(null);
    setTokenUsage(null);

    const startTime = Date.now();
    const token = localStorage.getItem('token');
    setAIProcessingStatus(true, 'AI đang viết slide chi tiết & giáo án tương tác…');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/courses/chapters/${targetChapterId}/generate-materials-from-storyboard-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            class_size: classSize,
            has_wifi: hasWifi,
            furniture_type: furnitureType,
            language: 'vi',
            session_duration: sessionDuration,
            storyboard: confirmedStoryboard,
            pedagogical_style: pedagogicalStyle,
            learner_level: learnerLevel,
            selected_clos: selectedClos
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Lỗi server: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
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
              
              if (data.usage && selectedChapterRef.current?.id === targetChapterId) {
                setTokenUsage(data.usage);
              }

              if (currentEvent === 'stage') {
                if (selectedChapterRef.current?.id === targetChapterId) {
                  setGenLog(data.message);
                  if (data.stage) {
                    setCurrentStage(data.stage);
                  }
                  if (data.current_slide !== undefined) {
                    setCurrentSlide(data.current_slide);
                  }
                  if (data.total_slides !== undefined) {
                    setTotalSlides(data.total_slides);
                  }
                  if (data.active_agent !== undefined) {
                    setActiveAgent(data.active_agent);
                  }
                  if (data.agent_status !== undefined) {
                    setAgentStatus(data.agent_status);
                  }
                  if (data.self_correction_attempt !== undefined) {
                    setSelfCorrectionAttempt(data.self_correction_attempt);
                  } else {
                    setSelfCorrectionAttempt(null);
                  }
                  setAIProcessingStatus(true, `Học liệu: ${data.message}`);
                }
              } else if (currentEvent === 'token') {
                accumulatedText += data.token;
                
                let slideText = "";
                let activeText = "";
                if (accumulatedText.includes("---SLIDES---")) {
                  const parts = accumulatedText.split("---SLIDES---");
                  const afterSlides = parts.slice(1).join("---SLIDES---");
                  if (afterSlides.includes("---ACTIVE_LEARNING---")) {
                    const activeParts = afterSlides.split("---ACTIVE_LEARNING---");
                    slideText = activeParts[0];
                    activeText = activeParts.slice(1).join("---ACTIVE_LEARNING---");
                  } else {
                    slideText = afterSlides;
                  }
                } else {
                  if (accumulatedText.includes("---ACTIVE_LEARNING---")) {
                    const activeParts = accumulatedText.split("---ACTIVE_LEARNING---");
                    slideText = activeParts[0];
                    activeText = activeParts.slice(1).join("---ACTIVE_LEARNING---");
                  } else {
                    slideText = accumulatedText;
                  }
                }

                if (activeText.trim() && currentStage < 3 && selectedChapterRef.current?.id === targetChapterId) {
                  setCurrentStage(3);
                }

                setAiSlideProposals(prev => ({ ...prev, [targetChapterId]: slideText.trim() }));
                setAiActiveLearningProposals(prev => ({ ...prev, [targetChapterId]: activeText.trim() }));
              } else if (currentEvent === 'done') {
                setAiSlideProposals(prev => ({ ...prev, [targetChapterId]: data.slide_content }));
                setAiActiveLearningProposals(prev => ({ ...prev, [targetChapterId]: data.active_learning_script }));
                setWarnings(data.warnings || []);
                
                if (selectedChapterRef.current?.id === targetChapterId) {
                  setSlideContent(data.slide_content);
                  setActiveLearningScript(data.active_learning_script);
                  setSavedSlideContent(data.slide_content);
                  setSavedScript(data.active_learning_script);
                }

                setApiStatus('success');
                if (selectedChapterRef.current?.id === targetChapterId) {
                  setCurrentStage(6);
                  setMessage(data.message);
                  setGenLog('');
                  setAIProcessingStatus(false);
                  setActiveAgent('saver');
                  setAgentStatus('completed');
                  setSelfCorrectionAttempt(null);
                }
                setGeneratingChapterId(null); // Hoàn tất tiến trình chạy ngầm

                window.dispatchEvent(new CustomEvent('programmatic-materials-generated', {
                  detail: {
                    chapterId: targetChapterId,
                    chapterTitle: selectedChapterRef.current?.title || '',
                    warnings: data.warnings || []
                  }
                }));
                
                const opLatency = (Date.now() - startTime) / 1000;
                onRecordAIUsage({
                  operation: `Tạo bài giảng & giáo án - Chương ${targetChapterId}`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: data.usage?.total_cost !== undefined ? Number(data.usage.total_cost) : 0.04,
                  tokens: data.usage ? {
                    prompt: data.usage.prompt_tokens || 0,
                    completion: data.usage.completion_tokens || 0
                  } : undefined,
                  model: data.usage?.model_name,
                  status: 'success'
                });
                
                if (selectedChapterRef.current?.id === targetChapterId) {
                  try {
                    const ragRes = await client.get(`/api/courses/chapters/${targetChapterId}/rag-references`);
                    setRagReferences(ragRes.data.references || []);
                  } catch (ragErr) {
                    // Error logged silently in production
                  }

                  loadRevisions(targetChapterId);
                  loadChapterMcqs(targetChapterId);
                }
              } else if (currentEvent === 'error') {
                if (selectedChapterRef.current?.id === targetChapterId) {
                  setError(data.message);
                  setApiStatus('error');
                  setGenLog('');
                  setAIProcessingStatus(false);
                  setAgentStatus('error');
                }
                setGeneratingChapterId(null); // Giải phóng tiến trình chạy ngầm
                
                const opLatency = (Date.now() - startTime) / 1000;
                onRecordAIUsage({
                  operation: `Tạo bài giảng & giáo án - Chương ${targetChapterId}`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: 0,
                  status: 'error'
                });
              }
            } catch (_) {}
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Generation stream aborted by user on the frontend.
        return;
      }
      // Error logged silently in production
      if (selectedChapterRef.current?.id === targetChapterId) {
        setApiStatus('error');
        setError(`Lỗi kết nối stream: ${err.message}`);
        setGenLog('');
        setAIProcessingStatus(false);
        setAgentStatus('error');
      }
      setGeneratingChapterId(null); // Giải phóng tiến trình chạy ngầm
      const opLatency = (Date.now() - startTime) / 1000;
      onRecordAIUsage({
        operation: `Tạo bài giảng & giáo án - Chương ${targetChapterId}`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    }
  };

  const handleCancelMaterialsGeneration = async () => {
    const cancelId = generatingChapterId || selectedChapter?.id;
    if (!cancelId) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await client.post(`/api/courses/chapters/${cancelId}/cancel-materials-generation`);
    } catch (err) {
      // Error logged silently in production
    } finally {
      setApiStatus('idle');
      setGenLog('');
      setAIProcessingStatus(false);
      setGeneratingChapterId(null);
      setActiveAgent(null);
      setAgentStatus(null);
      setSelfCorrectionAttempt(null);
    }
  };

  const handleCancelStoryboardGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGeneratingStoryboard(false);
    setApiStatus('idle');
    setGenLog('');
    setAIProcessingStatus(false);
    setActiveAgent(null);
    setAgentStatus(null);
    setSelfCorrectionAttempt(null);
  };

  return {
    storyboardDraft,
    setStoryboardDraft,
    isGeneratingStoryboard,
    currentStage,
    currentSlide,
    totalSlides,
    aiSlideProposal,
    setAiSlideProposal,
    aiActiveLearningProposal,
    setAiActiveLearningProposal,
    apiStatus,
    setApiStatus,
    genLog,
    setGenLog,
    handleGenerateStoryboard,
    handleGenerateMaterialsFromStoryboard,
    handleCancelMaterialsGeneration,
    handleCancelStoryboardGeneration,
    aiViewMode,
    setAiViewMode,
    generatingChapterId,
    setGeneratingChapterId,
    warnings,
    setWarnings,
    activeAgent,
    agentStatus,
    selfCorrectionAttempt,
    tokenUsage
  };
}
