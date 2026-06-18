import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import FlowSteps from '../components/FlowSteps';
import { ArrowLeft, ArrowRight, Upload, BookOpen, Trash2, Plus, CheckCircle, RefreshCw } from 'lucide-react';
import { Course, CLO } from '@/types';
import { useDirtyState } from '@/hooks/useDirtyState';
import '../styles/CourseConfig.css';

export interface CourseConfigProps {
  course: Course;
  onBack: () => void;
  onNavigate: (view: string) => void;
  onStartPlanning: () => void;
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

export default function CourseConfig({
  course,
  onBack,
  onNavigate,
  onStartPlanning,
  onRecordAIUsage,
  setAIProcessingStatus,
  isActive
}: CourseConfigProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);

  const [clos, setClos] = useState<CLO[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [useTextarea, setUseTextarea] = useState(false);

  const [requiredTextbooks, setRequiredTextbooks] = useState(course.description || ''); // maps description or textbooks
  const [recommendedReadings, setRecommendedReadings] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [streamLog, setStreamLog] = useState('');
  const [streamStage, setStreamStage] = useState(0); // 0 -> 4

  const [isDirty, setIsDirty] = useState(false);
  useDirtyState(isDirty, () => {
    handleSaveClos();
    return true;
  });

  // Lấy các CLO hiện có của môn học từ API
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
        setUseTextarea(false);
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
    setClos([]); // Xóa danh sách cũ để cập nhật mới từ stream

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

                // Đồng bộ tin nhắn chatbot
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
                onRecordAIUsage({
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
                onRecordAIUsage({
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
      onRecordAIUsage({
        operation: `Phân tích Syllabus - ${finalFile.name}`,
        latency: Number(opLatency.toFixed(1)),
        cost: 0,
        status: 'error'
      });
    }
  };

  // Xử lý upload file Syllabus và gửi API parse bằng Stream SSE
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !useTextarea) {
      setError('Vui lòng chọn file Syllabus hoặc nhập văn bản thô.');
      return;
    }

    let finalFile: File;
    if (useTextarea) {
      const blob = new Blob([rawText], { type: 'text/plain' });
      finalFile = new File([blob], 'syllabus_pasted.txt', { type: 'text/plain' });
    } else {
      finalFile = file!;
    }

    startParsing(finalFile);
  };

  // Thêm một dòng CLO trống
  const handleAddRow = () => {
    const newCode = `CLO${clos.length + 1}`;
    setClos([
      ...clos,
      { id: Date.now(), clo_code: newCode, description: '', bloom_level: 2 }
    ]);
    setIsDirty(true);
  };

  // Xóa một dòng CLO
  const handleRemoveRow = (index: number) => {
    setClos(clos.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  // Cập nhật giá trị một trường của CLO trong danh sách
  const handleFieldChange = (index: number, field: keyof CLO, value: any) => {
    const updated = [...clos];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setClos(updated);
    setIsDirty(true);
  };

  // Lưu danh sách CLO xuống DB
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
              onClick={() => setUseTextarea(false)}
              className={!useTextarea ? "course-config-active-tab" : "course-config-inactive-tab"}
            >
              Tải File Lên
            </button>
            <button
              onClick={() => setUseTextarea(true)}
              className={useTextarea ? "course-config-active-tab" : "course-config-inactive-tab"}
            >
              Dán Văn Bản Thô
            </button>
          </div>

          <form onSubmit={handleFileUpload} className="course-config-upload-form">
            {!useTextarea ? (
              <div className="course-config-dropzone">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                  className="course-config-file-input"
                  id="syllabus-file"
                />
                <label htmlFor="syllabus-file" className="course-config-dropzone-label">
                  <div className="course-config-dropzone-icon-container">
                    <Upload size={32} />
                  </div>
                  {file ? (
                    <strong className="course-config-dropzone-filename">{file.name}</strong>
                  ) : (
                    <>
                      <strong>Chọn file Syllabus của bạn</strong>
                      <span>Hỗ trợ PDF, DOCX, TXT (Tối đa 50MB)</span>
                    </>
                  )}
                </label>
              </div>
            ) : (
              <textarea
                placeholder="Dán toàn bộ nội dung text Syllabus vào đây..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="course-config-textarea"
                rows={10}
                required
              />
            )}

            <div className="course-config-sample-section" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              margin: '12px 0',
              padding: '10px 14px',
              background: 'rgba(251, 191, 36, 0.05)',
              border: '1px dashed rgba(251, 191, 36, 0.25)',
              borderRadius: '8px',
              fontSize: '12.5px'
            }}>
              <div style={{ color: 'var(--vinuni-gold)', fontWeight: 600 }}>💡 Dành cho thử nghiệm:</div>
              <div style={{ color: 'var(--text-secondary)' }}>Thầy/Cô có thể sử dụng đề cương Syllabus mẫu:</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <a 
                  href="/sample_syllabus.txt" 
                  download="sample_syllabus.txt"
                  className="course-config-sample-btn"
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    textDecoration: 'none',
                    textAlign: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                >
                  📥 Tải file mẫu
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const sampleText = `COURSE SYLLABUS: INTRODUCTION TO MACHINE LEARNING (ML101)
---------------------------------------------------------

Course Description:
This course provides a broad introduction to machine learning, data mining, and statistical pattern recognition. Topics include supervised learning (parametric/non-parametric algorithms, support vector machines, kernels, neural networks), unsupervised learning (clustering, dimensionality reduction, recommender systems, deep learning), and best practices in machine learning (bias/variance theory; innovation process in machine learning and AI).

Course Learning Outcomes (CLOs):
At the end of this course, students will be able to:
- CLO1: Explain the fundamental concepts, theories, and algorithms of supervised and unsupervised machine learning models. (Bloom Level: 2 - Understand)
- CLO2: Implement machine learning algorithms (such as linear regression, logistic regression, decision trees, and k-means clustering) using Python and Scikit-Learn. (Bloom Level: 3 - Apply)
- CLO3: Evaluate and optimize machine learning models using validation techniques, regularization, hyperparameter tuning, and diagnostic metrics (precision, recall, F1-score). (Bloom Level: 4 - Analyze)
- CLO4: Design and develop an end-to-end machine learning pipeline to solve a real-world predictive modeling task. (Bloom Level: 6 - Create)

Weekly Outline:
- Week 1: Introduction to Machine Learning & Regression Analysis (CLO1, CLO2)
- Week 2: Classification Models: Logistic Regression & Decision Trees (CLO1, CLO2)
- Week 3: Support Vector Machines & Kernel Methods (CLO1, CLO2, CLO3)
- Week 4: Unsupervised Learning: Clustering (K-Means) & Dimensionality Reduction (PCA) (CLO1, CLO2)
- Week 5: Introduction to Neural Networks & Deep Learning (CLO1, CLO2)
- Week 6: Best Practices, Model Evaluation, and ML Pipelines (CLO3, CLO4)`;
                    setUseTextarea(true);
                    setRawText(sampleText);
                    setMessage('Đã nạp nội dung Syllabus mẫu vào ô nhập văn bản. Bạn có thể bấm nút bắt đầu phân tích bên dưới.');
                  }}
                  className="course-config-sample-btn"
                  style={{
                    flex: 1.2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    background: 'rgba(212, 163, 89, 0.15)',
                    border: '1px solid rgba(212, 163, 89, 0.3)',
                    borderRadius: '6px',
                    color: 'var(--vinuni-gold)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212, 163, 89, 0.25)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(212, 163, 89, 0.15)'}
                >
                  ⚡ Nạp nhanh văn bản
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="course-config-parse-btn">
              {loading ? (
                <span className="course-config-inline-flex">
                  <RefreshCw size={16} className="animate-spin" /> Đang phân tích (LLM)...
                </span>
              ) : 'Bắt đầu phân tích Syllabus (AI)'}
            </button>
          </form>

          {/* Cấu hình học liệu tham khảo cốt lõi */}
          <div className="course-config-textbooks-container">
            <h4 className="course-config-section-title course-config-textbooks-title">
              <BookOpen size={16} className="course-config-textbooks-icon" /> Tài Liệu Tham Khảo Môn Học (Tự Động Trích Xuất)
            </h4>
            <div className="course-config-textbooks-fields">
              <div>
                <label className="course-config-textbooks-label">
                  Giáo trình bắt buộc (Required Textbooks)
                </label>
                <textarea
                  value={requiredTextbooks}
                  onChange={(e) => {
                    setRequiredTextbooks(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Ví dụ: Cấu trúc dữ liệu & Giải thuật - Nguyễn Văn A - NXB Đại Học Quốc Gia"
                  className="course-config-textarea course-config-textbooks-textarea"
                />
              </div>
              <div>
                <label className="course-config-textbooks-label">
                  Tài liệu đọc thêm (Recommended Readings)
                </label>
                <textarea
                  value={recommendedReadings}
                  onChange={(e) => {
                    setRecommendedReadings(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder="Ví dụ: Introduction to Algorithms - Cormen et al."
                  className="course-config-textarea course-config-textbooks-textarea"
                />
              </div>
            </div>
          </div>

          {loading && streamStage > 0 && (
            <div className="course-config-progress-container">
              <div className="course-config-progressbar-wrapper">
                <div
                  className={`course-config-progressbar ${streamStage === 4 ? 'course-config-progressbar--success' : ''}`}
                  style={{ width: `${(streamStage / 4) * 100}%` }}
                />
              </div>
              <div className="course-config-progress-text">
                <span>Giai đoạn {streamStage}/4</span>
                <span>{Math.round((streamStage / 4) * 100)}%</span>
              </div>
              {streamLog && (
                <div className="course-config-stream-log-text">
                  <span className="course-config-pulse-dot" /> {streamLog}
                </div>
              )}
            </div>
          )}
        </section>

        {/* CỘT PHẢI: MAPPER CLO & BLOOM TAXONOMY */}
        <section className="course-config-mapper-card">
          <div className="course-config-section-header">
            <h3 className="course-config-section-title">Ma Trận Chuẩn Đầu Ra (CLOs)</h3>
            <button onClick={handleAddRow} className="course-config-add-btn">
              <Plus size={14} /> Thêm CLO
            </button>
          </div>

          {clos.length === 0 && !loading ? (
            <div className="course-config-empty-state">
              <p>Chưa cấu hình Chuẩn đầu ra môn học.</p>
              <p className="course-config-empty-desc">Hãy upload Syllabus ở bên trái để AI tự động trích xuất.</p>

              {isDirty && (
                <div className="course-config-save-container" style={{ borderTop: 'none', paddingTop: 0, justifyContent: 'center', marginBottom: '20px' }}>
                  <button onClick={handleSaveClos} disabled={saving} className="course-config-save-btn">
                    {saving ? 'Đang lưu...' : (
                      <span className="course-config-inline-flex">
                        <CheckCircle size={16} /> Lưu & Đồng bộ CLOs
                      </span>
                    )}
                  </button>
                </div>
              )}

              <div className="empty-suggestions-box">
                <div className="empty-suggestions-title">
                  <span>💡 Hướng dẫn & Gợi ý thực hiện:</span>
                </div>
                <ul className="empty-suggestions-list">
                  <li className="empty-suggestions-item">Tải lên file đề cương môn học (Syllabus) dạng PDF, DOCX, TXT bằng cách kéo thả hoặc click chọn file trong khung <strong>"Nạp Tri Thức Đề Cương"</strong> bên trái.</li>
                  <li className="empty-suggestions-item">Hoặc chọn tab <strong>"Dán Văn Bản Thô"</strong> để dán trực tiếp nội dung đề cương môn học.</li>
                  <li className="empty-suggestions-item">Bấm <strong>"Bắt đầu phân tích Syllabus (AI)"</strong> để hệ thống tự động sinh chuẩn đầu ra CLOs & mức Bloom.</li>
                  <li className="empty-suggestions-item">Bạn cũng có thể tự thêm thủ công bằng cách click nút <strong>"Thêm CLO"</strong> ở phía trên bên phải.</li>
                </ul>
              </div>
            </div>
          ) : clos.length === 0 && loading ? (
            <div className="course-config-loading-state">
              <div className="course-config-spinner" />
              <p className="course-config-loading-desc">AI đang khởi động phân tích đề cương...</p>
            </div>
          ) : (
            <div className="course-config-list">
              <div className="course-config-rows-container">
                {clos.map((clo, index) => (
                  <div key={clo.id || index} className="course-config-row">
                    <input
                      type="text"
                      value={clo.clo_code || clo.code || ''}
                      onChange={(e) => handleFieldChange(index, 'clo_code', e.target.value)}
                      className="course-config-clo-code-input"
                      placeholder="Mã CLO"
                      required
                    />
                    <input
                      type="text"
                      value={clo.description}
                      onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                      className="course-config-clo-desc-input"
                      placeholder="Mô tả chuẩn đầu ra môn học (động từ hành động Bloom)"
                      required
                    />
                    <select
                      value={clo.bloom_level}
                      onChange={(e) => handleFieldChange(index, 'bloom_level', parseInt(e.target.value))}
                      className="course-config-bloom-select"
                    >
                      <option value={1}>Nhớ (B1)</option>
                      <option value={2}>Hiểu (B2)</option>
                      <option value={3}>Vận dụng (B3)</option>
                      <option value={4}>Phân tích (B4)</option>
                      <option value={5}>Đánh giá (B5)</option>
                      <option value={6}>Sáng tạo (B6)</option>
                    </select>
                    <button
                      onClick={() => handleRemoveRow(index)}
                      className="course-config-row-delete-btn"
                      title="Xóa CLO"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="course-config-save-container">
                <button onClick={handleSaveClos} disabled={saving} className="course-config-save-btn">
                  {saving ? 'Đang lưu...' : (
                    <span className="course-config-inline-flex">
                      <CheckCircle size={16} /> Lưu & Đồng bộ CLOs
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
