'use client';

import React from 'react';
import { Upload, RefreshCw } from 'lucide-react';

interface SyllabusUploadTabProps {
  activeTab: 'file' | 'text';
  file: File | null;
  setFile: (file: File | null) => void;
  rawText: string;
  setRawText: (text: string) => void;
  loading: boolean;
  handleFileUpload: (e: React.FormEvent) => Promise<void>;
  setMessage: (msg: string) => void;
  setActiveTab: (tab: 'file' | 'text' | 'ai') => void;
}

export default function SyllabusUploadTab({
  activeTab,
  file,
  setFile,
  rawText,
  setRawText,
  loading,
  handleFileUpload,
  setMessage,
  setActiveTab
}: SyllabusUploadTabProps) {
  if (activeTab === 'file') {
    return (
      <form onSubmit={handleFileUpload} className="course-config-upload-form">
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

        <button type="submit" disabled={loading} className="course-config-parse-btn">
          {loading ? (
            <span className="course-config-inline-flex">
              <RefreshCw size={16} className="animate-spin" /> Đang phân tích (LLM)...
            </span>
          ) : 'Bắt đầu phân tích Syllabus (AI)'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleFileUpload} className="course-config-upload-form">
      <textarea
        placeholder="Dán toàn bộ nội dung text Syllabus vào đây..."
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        className="course-config-textarea"
        rows={10}
        required
      />

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
              setActiveTab('text');
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
  );
}
