import { useState, useRef } from 'react';
import client from '../api/client';
import { Chapter } from '@/types';

interface UseMaterialsStreamOptions {
  courseId: number;
  selectedChapter: Chapter | null;
  classSize: number;
  hasWifi: boolean;
  furnitureType: string;
  sessionDuration: number;
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const [storyboardDraft, setStoryboardDraft] = useState<any[] | null>(null);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);
  const [aiSlideProposal, setAiSlideProposal] = useState('');
  const [aiActiveLearningProposal, setAiActiveLearningProposal] = useState('');
  const [apiStatus, setApiStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [genLog, setGenLog] = useState('');

  // Giai đoạn 1: Sinh đề cương Slide (Storyboard)
  const handleGenerateStoryboard = async () => {
    if (!selectedChapter) {
      setError('Vui lòng chọn hoặc sinh một chương học trước.');
      return;
    }
    
    setError('');
    setMessage('');
    setIsGeneratingStoryboard(true);
    setApiStatus('generating');
    setGenLog('Giai đoạn 1: AI đang lập cấu trúc slide (Storyboard)…');
    setStoryboardDraft(null);
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
        session_duration: sessionDuration
      }, {
        signal: controller.signal
      });
      
      setStoryboardDraft(response.data.storyboard || []);
      setApiStatus('success');
      setMessage(response.data.message);
      setGenLog('');
      const opLatency = (Date.now() - startTime) / 1000;
      const usage = response.data.usage;
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
      if (err.name === 'CanceledError' || err.name === 'AbortError' || client.isCancel?.(err)) {
        console.log('Storyboard generation aborted on frontend');
        return;
      }
      console.error(err);
      setApiStatus('error');
      setError(err.response?.data?.detail || 'Lỗi khi sinh storyboard.');
      setGenLog('');
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
    
    setError('');
    setMessage('');
    setApiStatus('generating');
    setGenLog('Giai đoạn 2: AI đang viết slide chi tiết & giáo án tương tác…');
    setCurrentStage(1);
    setCurrentSlide(0);
    setTotalSlides(0);
    setAiSlideProposal('');
    setAiActiveLearningProposal('');
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
        `http://localhost:8000/api/courses/chapters/${selectedChapter.id}/generate-materials-from-storyboard-stream`,
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
            storyboard: confirmedStoryboard
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
              
              if (currentEvent === 'stage') {
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
                setAIProcessingStatus(true, `Học liệu: ${data.message}`);
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

                if (activeText.trim() && currentStage < 3) {
                  setCurrentStage(3);
                }

                setAiSlideProposal(slideText.trim());
                setAiActiveLearningProposal(activeText.trim());
              } else if (currentEvent === 'done') {
                setAiSlideProposal(data.slide_content);
                setAiActiveLearningProposal(data.active_learning_script);
                
                setSlideContent(data.slide_content);
                setActiveLearningScript(data.active_learning_script);
                setSavedSlideContent(data.slide_content);
                setSavedScript(data.active_learning_script);

                setApiStatus('success');
                setCurrentStage(6);
                setMessage(data.message);
                setGenLog('');
                setAIProcessingStatus(false);
                
                const opLatency = (Date.now() - startTime) / 1000;
                onRecordAIUsage({
                  operation: `Tạo bài giảng & giáo án - ${selectedChapter.title}`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: data.usage?.total_cost !== undefined ? Number(data.usage.total_cost) : 0.04,
                  tokens: data.usage ? {
                    prompt: data.usage.prompt_tokens || 0,
                    completion: data.usage.completion_tokens || 0
                  } : undefined,
                  model: data.usage?.model_name,
                  status: 'success'
                });
                
                try {
                  const ragRes = await client.get(`/api/courses/chapters/${selectedChapter.id}/rag-references`);
                  setRagReferences(ragRes.data.references || []);
                } catch (ragErr) {
                  console.error("Error refreshing RAG references:", ragErr);
                }

                loadRevisions(selectedChapter.id);
                loadChapterMcqs(selectedChapter.id);
              } else if (currentEvent === 'error') {
                setError(data.message);
                setApiStatus('error');
                setGenLog('');
                setAIProcessingStatus(false);
                const opLatency = (Date.now() - startTime) / 1000;
                onRecordAIUsage({
                  operation: `Tạo bài giảng & giáo án - ${selectedChapter.title}`,
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
        console.log('Generation stream aborted by user on the frontend.');
        return;
      }
      console.error(err);
      setApiStatus('error');
      setError(`Lỗi kết nối stream: ${err.message}`);
      setGenLog('');
      setAIProcessingStatus(false);
      const opLatency = (Date.now() - startTime) / 1000;
      onRecordAIUsage({
        operation: `Tạo bài giảng & giáo án - ${selectedChapter.title}`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    }
  };

  const handleCancelMaterialsGeneration = async () => {
    if (!selectedChapter) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    try {
      await client.post(`/api/courses/chapters/${selectedChapter.id}/cancel-materials-generation`);
    } catch (err) {
      console.error('Error cancelling materials generation on backend:', err);
    } finally {
      setApiStatus('idle');
      setGenLog('');
      setAIProcessingStatus(false);
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
    handleCancelStoryboardGeneration
  };
}
