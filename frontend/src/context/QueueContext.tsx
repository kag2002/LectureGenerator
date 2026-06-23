'use client';

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { QueueItem } from '@/types';
import { useAI } from './AIContext';

interface QueueContextType {
  queue: QueueItem[];
  isQueueRunning: boolean;
  showQueuePanel: boolean;
  queueProgressMsg: string;
  queueMode: 'questions' | 'materials';
  isQueueMinimized: boolean;
  queuePosition: { x: number; y: number } | null;
  isFastMode: boolean;
  cancelRef: React.MutableRefObject<boolean>;
  dragRef: React.RefObject<HTMLDivElement | null>;
  
  setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>;
  setIsQueueRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setShowQueuePanel: React.Dispatch<React.SetStateAction<boolean>>;
  setQueueProgressMsg: React.Dispatch<React.SetStateAction<string>>;
  setQueueMode: React.Dispatch<React.SetStateAction<'questions' | 'materials'>>;
  setIsQueueMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  setQueuePosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  setIsFastMode: React.Dispatch<React.SetStateAction<boolean>>;
  
  resetQueueState: () => void;
  runGlobalQueue: (currentQueue: QueueItem[], mode: 'questions' | 'materials', courseId: number) => Promise<void>;
  handleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const QueueContext = createContext<QueueContextType | null>(null);

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};

export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { recordAIUsage, setAIProcessingStatus } = useAI();
  
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [queueProgressMsg, setQueueProgressMsg] = useState('');
  const [queueMode, setQueueMode] = useState<'questions' | 'materials'>('questions');
  const [isQueueMinimized, setIsQueueMinimized] = useState(false);
  const [queuePosition, setQueuePosition] = useState<{ x: number; y: number } | null>(null);
  const [isFastMode, setIsFastMode] = useState(false);

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
    const boundedX = Math.max(10, Math.min(window.innerWidth - (isQueueMinimized ? 250 : 420), newX));
    const boundedY = Math.max(10, Math.min(window.innerHeight - (isQueueMinimized ? 80 : 530), newY));
    setQueuePosition({ x: boundedX, y: boundedY });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isQueueMinimized]);

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
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/courses/${courseId}/questions/generate-stream`,
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
          const chId = updatedQueue[i].chapterId;
          if (!chId) {
            throw new Error('Không có chương học nào để bổ sung slide.');
          }

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/courses/chapters/${chId}/append-slide-for-clo-stream`,
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
        recordAIUsage({
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
        recordAIUsage({
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

  return (
    <QueueContext.Provider
      value={{
        queue,
        isQueueRunning,
        showQueuePanel,
        queueProgressMsg,
        queueMode,
        isQueueMinimized,
        queuePosition,
        isFastMode,
        cancelRef,
        dragRef,
        
        setQueue,
        setIsQueueRunning,
        setShowQueuePanel,
        setQueueProgressMsg,
        setQueueMode,
        setIsQueueMinimized,
        setQueuePosition,
        setIsFastMode,
        
        resetQueueState,
        runGlobalQueue,
        handleMouseDown
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};
