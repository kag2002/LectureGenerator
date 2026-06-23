'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { Course, CLO } from '@/types';
import { useDirtyState } from '@/hooks/useDirtyState';
import { useAI } from '../context/AIContext';
import SyllabusUploadTab from '../components/config/SyllabusUploadTab';
import AISyllabusGeneratorTab from '../components/config/AISyllabusGeneratorTab';
import CLOMatrixMapper from '../components/config/CLOMatrixMapper';
import TextbooksConfigSection from '../components/config/TextbooksConfigSection';
import ParsingProgressBar from '../components/config/ParsingProgressBar';
import '../styles/CourseConfig.css';

export interface CourseConfigProps {
  course: Course;
  onBack: () => void;
  onNavigate: (view: string) => void;
  onStartPlanning: () => void;
  isActive?: boolean;
}

export default function CourseConfig({
  course,
  onBack,
  onNavigate,
  onStartPlanning,
  isActive
}: CourseConfigProps) {
  const { recordAIUsage, setAIProcessingStatus } = useAI();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);

  const [clos, setClos] = useState<CLO[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [activeTab, setActiveTab] = useState<'file' | 'text' | 'ai'>('file');

  // AI Syllabus Generator States
  const [aiCourseName, setAiCourseName] = useState(course.course_name || '');
  const [aiCourseCode, setAiCourseCode] = useState(course.course_code || '');
  const [aiDescription, setAiDescription] = useState('');
  const [aiAudience, setAiAudience] = useState('Undergraduate');
  const [aiDuration, setAiDuration] = useState(15);
  const [aiFocus, setAiFocus] = useState('');
  const [aiLanguage, setAiLanguage] = useState('vi');
  const [generatingSyllabus, setGeneratingSyllabus] = useState(false);
  const [generatedSyllabus, setGeneratedSyllabus] = useState('');

  const [requiredTextbooks, setRequiredTextbooks] = useState(course.description || ''); 
  const [recommendedReadings, setRecommendedReadings] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [streamLog, setStreamLog] = useState('');
  const [streamStage, setStreamStage] = useState(0); 

  const [isDirty, setIsDirty] = useState(false);
  useDirtyState(isDirty, () => {
    handleSaveClos();
    return true;
  });

  const fetchClos = async () => {
    setLoading(true);
    try {
      const response = await client.get(`/api/courses/${course.id}/clos`);
      setClos(response.data);
      setIsDirty(false);
    } catch (err) {
      console.error(err);
      setError('Không thể lấy danh sách CLO hiện tại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClos();
  }, [course.id]);

  useEffect(() => {
    const handleDbChanged = () => {
      if (!isDirty) {
        fetchClos();
      }
    };
    window.addEventListener('db-state-changed', handleDbChanged);
    return () => {
      window.removeEventListener('db-state-changed', handleDbChanged);
    };
  }, [course.id, isDirty]);

  useEffect(() => {
    const handleTriggerParse = (e: Event) => {
      const customEvent = e as CustomEvent;
      const file = customEvent.detail.file;
      if (file) {
        setFile(file);
        setActiveTab('file');
        startParsing(file);
      }
    };
    window.addEventListener('trigger-syllabus-parse', handleTriggerParse);
    return () => {
      window.removeEventListener('trigger-syllabus-parse', handleTriggerParse);
    };
  }, [course.id]);

  const startParsing = async (finalFile: File) => {
    setError('');
    setMessage('');
    setLoading(true);
    setIsDirty(false);
    setStreamLog('🚀 Đang kết nối tới AI...');
    setStreamStage(0);
    setClos([]); 

    const token = localStorage.getItem('token');
    const opStartTime = Date.now();
    setAIProcessingStatus(true, 'AI đang chuẩn bị phân tích Syllabus...');

    try {
      const formData = new FormData();
      formData.append('file', finalFile);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/courses/${course.id}/parse-syllabus-stream`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || `Lỗi server: ${response.status}`);
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
                setStreamStage(data.stage);
                setStreamLog(data.message);
                setAIProcessingStatus(true, `Phân tích Syllabus: ${data.message}`);
              } else if (currentEvent === 'clo') {
                setClos(prev => {
                  if (prev.some(c => c.id === data.clo.id || c.clo_code === data.clo.clo_code)) {
                    return prev.map(c => c.clo_code === data.clo.clo_code ? data.clo : c);
                  }
                  return [...prev, data.clo];
                });
                setStreamLog(`✅ Đã trích xuất CLO ${data.index}/${data.total}: ${data.clo.clo_code}`);
              } else if (currentEvent === 'done') {
                setClos(data.clos);
                if (data.course) {
                  setRequiredTextbooks(data.course.required_textbooks || '');
                  setRecommendedReadings(data.course.recommended_readings || '');
                }
                setMessage(data.message);
                setLoading(false);
                setStreamLog('');
                setStreamStage(0);
                setAIProcessingStatus(false);

                window.dispatchEvent(new CustomEvent('programmatic-syllabus-parsed', {
                  detail: {
                    courseId: course.id,
                    closCount: data.clos ? data.clos.length : 0,
                    fileName: finalFile.name
                  }
                }));

                try {
                  let sessionId = null;
                  const sessionsRes = await client.get(`/api/chatbot/sessions?course_id=${course.id}`);
                  if (sessionsRes.data && sessionsRes.data.length > 0) {
                    sessionId = sessionsRes.data[0].id;
                  } else {
                    const createRes = await client.post('/api/chatbot/sessions', {
                      course_id: course.id,
                      title: "Trò chuyện với ODIN Companion"
                    });
                    sessionId = createRes.data.id;
                  }

                  const closList = data.clos || [];
                  let closMarkdown = `Dạ, em đã nạp thành công file đề cương **${finalFile.name}** và tự động trích xuất được **${closList.length} Chuẩn đầu ra (CLOs)** cho môn học **${course.course_name}**:\n\n`;
                  closList.forEach((c: any) => {
                    closMarkdown += `* **${c.clo_code}**: ${c.description} (Mức Bloom: Bậc B${c.bloom_level})\n`;
                  });

                  await client.post(`/api/chatbot/sessions/${sessionId}/messages`, {
                    role: 'user',
                    content: `[Tải lên đề cương syllabus: ${finalFile.name}]`
                  });

                  await client.post(`/api/chatbot/sessions/${sessionId}/messages`, {
                    role: 'assistant',
                    content: closMarkdown
                  });

                  window.dispatchEvent(new CustomEvent('db-state-changed'));
                } catch (chatErr) {
                  console.error("Lỗi đồng bộ tin nhắn chatbot:", chatErr);
                }

                const opLatency = (Date.now() - opStartTime) / 1000;
                recordAIUsage({
                  operation: `Phân tích Syllabus - ${finalFile.name}`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: 0.05,
                  status: 'success'
                });
              } else if (currentEvent === 'error') {
                setError(data.message);
                setLoading(false);
                setStreamLog('');
                setStreamStage(0);
                setAIProcessingStatus(false);
                const opLatency = (Date.now() - opStartTime) / 1000;
                recordAIUsage({
                  operation: `Phân tích Syllabus - ${finalFile.name}`,
                  latency: Number(opLatency.toFixed(1)),
                  cost: 0,
                  status: 'error'
                });
              }
            } catch (jsonErr) {
              console.error("Lỗi parse JSON stream:", jsonErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(`Lỗi phân tích Syllabus: ${err.message}`);
      setLoading(false);
      setStreamLog('');
      setStreamStage(0);
      setAIProcessingStatus(false);
      const opLatency = (Date.now() - opStartTime) / 1000;
      recordAIUsage({
        operation: `Phân tích Syllabus - ${finalFile.name}`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    }
  };

  const handleGenerateSyllabus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setGeneratingSyllabus(true);
    setGeneratedSyllabus('');

    const token = localStorage.getItem('token');
    const opStartTime = Date.now();
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/courses/${course.id}/generate-syllabus-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            course_name: aiCourseName,
            course_code: aiCourseCode,
            course_description: aiDescription,
            audience: aiAudience,
            duration_weeks: aiDuration,
            learning_outcomes_focus: aiFocus,
            language: aiLanguage
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Lỗi server: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        text += chunk;
        setGeneratedSyllabus(text);
      }

      const opLatency = (Date.now() - opStartTime) / 1000;
      recordAIUsage({
        operation: `Sinh Syllabus bằng AI`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0.05,
        status: 'success'
      });
    } catch (err: any) {
      console.error(err);
      setError(`Lỗi sinh Syllabus: ${err.message}`);
      const opLatency = (Date.now() - opStartTime) / 1000;
      recordAIUsage({
        operation: `Sinh Syllabus bằng AI`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    } finally {
      setGeneratingSyllabus(false);
    }
  };

  const handleUseGeneratedSyllabus = (parseImmediately: boolean) => {
    if (!generatedSyllabus) return;
    setRawText(generatedSyllabus);
    setActiveTab('text');
    
    if (parseImmediately) {
      const blob = new Blob([generatedSyllabus], { type: 'text/plain' });
      const finalFile = new File([blob], 'syllabus_generated.txt', { type: 'text/plain' });
      startParsing(finalFile);
    } else {
      setMessage('Đã sao chép Syllabus sinh bằng AI vào tab "Dán Văn Bản Thô".');
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'file' && !file) {
      setError('Vui lòng chọn file Syllabus.');
      return;
    }
    if (activeTab === 'text' && !rawText) {
      setError('Vui lòng nhập văn bản thô.');
      return;
    }

    let finalFile: File;
    if (activeTab === 'text') {
      const blob = new Blob([rawText], { type: 'text/plain' });
      finalFile = new File([blob], 'syllabus_pasted.txt', { type: 'text/plain' });
    } else {
      finalFile = file!;
    }

    startParsing(finalFile);
  };

  const handleAddRow = () => {
    const newCode = `CLO${clos.length + 1}`;
    setClos([
      ...clos,
      { id: Date.now(), clo_code: newCode, description: '', bloom_level: 2 }
    ]);
    setIsDirty(true);
  };

  const handleRemoveRow = (index: number) => {
    setClos(clos.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const handleFieldChange = (index: number, field: keyof CLO, value: any) => {
    const updated = [...clos];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setClos(updated);
    setIsDirty(true);
  };

  const handleSaveClos = async () => {
    setError('');
    setMessage('');
    setSaving(true);

    try {
      await client.put(`/api/courses/${course.id}`, {
        course_code: course.course_code,
        course_name: course.course_name,
        required_textbooks: requiredTextbooks,
        recommended_readings: recommendedReadings
      });

      const textData = JSON.stringify({ clos: clos });
      const blob = new Blob([`{"clos": ${textData}}`], { type: 'text/plain' });
      const jsonFile = new File([blob], 'syllabus_updated.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', jsonFile);

      const response = await client.post(`/api/courses/${course.id}/parse-syllabus`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data && response.data.course) {
        setRequiredTextbooks(response.data.course.required_textbooks || '');
        setRecommendedReadings(response.data.course.recommended_readings || '');
      }

      setMessage('Đã lưu danh sách CLO và tài liệu tham khảo môn học thành công!');
      fetchClos();
      window.dispatchEvent(new CustomEvent('db-state-changed'));
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.detail || err.response?.data?.message || err.response?.data?.details || 'Lỗi khi lưu danh sách CLO.';
      setError(typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="course-config-container">
      {/* HEADER */}
      {isActive && portalTarget ? createPortal(
        <button onClick={onStartPlanning} className="course-config-start-planning-btn">
          Bắt đầu soạn bài (AI Planner) <ArrowRight size={15} />
        </button>,
        portalTarget
      ) : !portalTarget ? (
        <header className="course-config-header">
          <div className="course-config-header-left">
            <button onClick={onBack} className="course-config-back-btn">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div className="course-config-course-info">
              <h2 className="course-config-title">{course.course_name}</h2>
            </div>
          </div>
          <button onClick={onStartPlanning} className="course-config-start-planning-btn">
            Bắt đầu soạn bài (AI Planner) <ArrowRight size={15} />
          </button>
        </header>
      ) : null}

      {error && <div className="course-config-error-alert">{error}</div>}
      {message && <div className="course-config-success-alert">{message}</div>}

      <div className="course-config-grid">
        {/* CỘT TRÁI: UPLOAD SYLLABUS */}
        <section className="course-config-upload-card">
          <h3 className="course-config-section-title">Nạp Tri Thức Đề Cương</h3>
          <div className="course-config-tab-header">
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={activeTab === 'file' ? "course-config-active-tab" : "course-config-inactive-tab"}
            >
              Tải File Lên
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={activeTab === 'text' ? "course-config-active-tab" : "course-config-inactive-tab"}
            >
              Dán Văn Bản Thô
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ai')}
              className={activeTab === 'ai' ? "course-config-active-tab" : "course-config-inactive-tab"}
            >
              Sinh bằng AI
            </button>
          </div>

          {(activeTab === 'file' || activeTab === 'text') && (
            <SyllabusUploadTab
              activeTab={activeTab}
              file={file}
              setFile={setFile}
              rawText={rawText}
              setRawText={setRawText}
              loading={loading}
              handleFileUpload={handleFileUpload}
              setMessage={setMessage}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'ai' && (
            <AISyllabusGeneratorTab
              course={course}
              aiCourseName={aiCourseName}
              setAiCourseName={setAiCourseName}
              aiCourseCode={aiCourseCode}
              setAiCourseCode={setAiCourseCode}
              aiDescription={aiDescription}
              setAiDescription={setAiDescription}
              aiAudience={aiAudience}
              setAiAudience={setAiAudience}
              aiDuration={aiDuration}
              setAiDuration={setAiDuration}
              aiFocus={aiFocus}
              setAiFocus={setAiFocus}
              aiLanguage={aiLanguage}
              setAiLanguage={setAiLanguage}
              generatingSyllabus={generatingSyllabus}
              generatedSyllabus={generatedSyllabus}
              handleGenerateSyllabus={handleGenerateSyllabus}
              handleUseGeneratedSyllabus={handleUseGeneratedSyllabus}
            />
          )}

          <TextbooksConfigSection
            requiredTextbooks={requiredTextbooks}
            setRequiredTextbooks={setRequiredTextbooks}
            recommendedReadings={recommendedReadings}
            setRecommendedReadings={setRecommendedReadings}
            setIsDirty={setIsDirty}
          />

          <ParsingProgressBar
            loading={loading}
            streamStage={streamStage}
            streamLog={streamLog}
          />
        </section>

        {/* CỘT PHẢI: MAPPER CLO & BLOOM TAXONOMY */}
        <section className="course-config-mapper-card">
          <CLOMatrixMapper
            clos={clos}
            handleAddRow={handleAddRow}
            handleRemoveRow={handleRemoveRow}
            handleFieldChange={handleFieldChange}
            handleSaveClos={handleSaveClos}
            loading={loading}
            saving={saving}
            isDirty={isDirty}
          />
        </section>
      </div>
    </div>
  );
}
