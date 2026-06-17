/**
 * RoadmapWorkspace — Fullscreen workspace overlay for CourseRoadmap.
 * 
 * Extracted from CourseRoadmap.tsx (renderWorkspaceOverlay, lines 719-1276).
 * Contains 4 workspace views: Materials, Questions, CLOs, RAG/Vector DB.
 */
'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2, AlertTriangle, BookOpen, FileText,
  Library, X, Plus, Trash2, Save, Upload,
  Sparkles, Edit3, Eye, File
} from 'lucide-react';
import { Course, CLO } from '@/types';

export interface RoadmapWorkspaceProps {
  course: Course;
  clos: CLO[];

  // Workspace state
  workspaceNode: any | null;
  setWorkspaceNode: (node: any | null) => void;
  localSlideContent: string;
  setLocalSlideContent: (v: string) => void;
  localActiveScript: string;
  setLocalActiveScript: (v: string) => void;
  localClos: CLO[];
  setLocalClos: (v: CLO[]) => void;
  localQuestions: any[];
  localRagDocs: string[];
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  uploading: boolean;
  editingQuestion: any | null;
  setEditingQuestion: (q: any | null) => void;
  materialTab: 'slides' | 'script';
  setMaterialTab: (t: 'slides' | 'script') => void;
  isDragOver: boolean;
  workspaceSaving: boolean;
  workspaceError: string;
  workspaceMessage: string;

  // Drag handlers
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent) => void;

  // CRUD handlers
  handleAiGenerateMaterials: () => void;
  handleAiGenerateQuestions: () => void;
  handleAiSuggestClos: () => void;
  handleSaveWorkspaceMaterials: () => void;
  handleSaveWorkspaceClos: () => void;
  handleSaveWorkspaceQuestion: (q: any) => void;
  handleDeleteWorkspaceQuestion: (qId: number) => void;
  handleUploadWorkspaceDoc: (e: React.FormEvent) => void;
  handleDeleteWorkspaceDoc: (fileName: string) => void;
}

export default function RoadmapWorkspace(props: RoadmapWorkspaceProps) {
  const {
    course, clos,
    workspaceNode, setWorkspaceNode,
    localSlideContent, setLocalSlideContent,
    localActiveScript, setLocalActiveScript,
    localClos, setLocalClos,
    localQuestions, localRagDocs,
    uploadFile, setUploadFile, uploading,
    editingQuestion, setEditingQuestion,
    materialTab, setMaterialTab,
    isDragOver,
    workspaceSaving, workspaceError, workspaceMessage,
    handleDragOver, handleDragLeave, handleDrop,
    handleAiGenerateMaterials, handleAiGenerateQuestions, handleAiSuggestClos,
    handleSaveWorkspaceMaterials, handleSaveWorkspaceClos,
    handleSaveWorkspaceQuestion, handleDeleteWorkspaceQuestion,
    handleUploadWorkspaceDoc, handleDeleteWorkspaceDoc,
  } = props;

  if (!workspaceNode) return null;

  const nodeId = workspaceNode.id;
  const isMaterials = nodeId.startsWith('materials_') || nodeId.startsWith('chapter_');
  const isQuestions = nodeId.startsWith('questions_');
  const isClos = nodeId === 'clos' || nodeId === 'syllabus';
  const isRag = nodeId === 'knowledge_base';

  const overlayContent = (
    <div className="roadmap-workspace-fullscreen">
      <div className="roadmap-workspace-header">
        <div>
          <span className="roadmap-course-badge roadmap-course-badge--margin">{course.course_code}</span>
          <h2 className="roadmap-workspace-title">
            Bảng thao tác: {workspaceNode.label}
          </h2>
        </div>
        <button 
          className="roadmap-workspace-close-btn" 
          onClick={() => setWorkspaceNode(null)}
        >
          <X size={16} /> Đóng
        </button>
      </div>

      <div className="roadmap-workspace-body">
        {workspaceError && (
          <div className="roadmap-workspace-alert-error">
            <AlertTriangle size={16} /> {workspaceError}
          </div>
        )}
        {workspaceMessage && (
          <div className="roadmap-workspace-alert-success">
            <CheckCircle2 size={16} /> {workspaceMessage}
          </div>
        )}

        {/* 1. MATERIALS VIEW */}
        {isMaterials && (
          <div className="roadmap-workspace-split-editor">
            <div className="roadmap-workspace-editor-column">
              <div className="workspace-tab-container">
                <button
                  className={`material-tab-toggle-btn ${materialTab === 'slides' ? 'active' : ''}`}
                  onClick={() => setMaterialTab('slides')}
                >
                  <BookOpen size={14} /> Soạn Slide Bài giảng
                </button>
                <button
                  className={`material-tab-toggle-btn ${materialTab === 'script' ? 'active' : ''}`}
                  onClick={() => setMaterialTab('script')}
                >
                  <FileText size={14} /> Soạn Kịch bản Tương tác
                </button>
              </div>

              {materialTab === 'slides' ? (
                <textarea
                  className="workspace-textarea"
                  value={localSlideContent}
                  onChange={(e) => setLocalSlideContent(e.target.value)}
                  placeholder="Nhập slide bài giảng (hỗ trợ định dạng Markdown)…"
                />
              ) : (
                <textarea
                  className="workspace-textarea"
                  value={localActiveScript}
                  onChange={(e) => setLocalActiveScript(e.target.value)}
                  placeholder="Nhập kịch bản tương tác (hoạt động nhóm, câu hỏi thảo luận)…"
                />
              )}

              <div className="workspace-btn-group">
                <button 
                  className="workspace-ai-materials-btn"
                  onClick={handleAiGenerateMaterials}
                  disabled={workspaceSaving}
                >
                  <Sparkles size={14} aria-hidden="true" /> {workspaceSaving ? 'Đang phân tích…' : 'AI gợi ý bài giảng (RAG)'}
                </button>
                <button 
                  className="roadmap-workspace-save-btn" 
                  onClick={handleSaveWorkspaceMaterials}
                  disabled={workspaceSaving}
                >
                  {workspaceSaving ? 'Đang lưu…' : 'Lưu học liệu'}
                </button>
                <button 
                  className="roadmap-workspace-cancel-btn" 
                  onClick={() => setWorkspaceNode(null)}
                >
                  Hủy
                </button>
              </div>
            </div>

            <div className="roadmap-workspace-preview-column">
              <div className="workspace-preview-header">
                <Eye size={14} /> LIVE PREVIEW (XEM TRƯỚC GIAO DIỆN)
              </div>
              <div className="workspace-preview-content">
                {materialTab === 'slides' ? (
                  <div className="workspace-preview-text-monospace">
                    {localSlideContent || (
                      <span className="roadmap-sidebar-empty-text">
                        Nội dung Slide bài giảng đang trống. Hãy nhập nội dung ở bên trái để xem trước.
                        <div className="empty-suggestions-box" style={{ marginTop: '12px' }}>
                          <div className="empty-suggestions-title">
                            <span>💡 Gợi ý thực hiện:</span>
                          </div>
                          <ul className="empty-suggestions-list">
                            <li className="empty-suggestions-item">Nhập nội dung slide theo cú pháp Markdown ở cột soạn thảo bên trái.</li>
                            <li className="empty-suggestions-item">Hoặc bấm nút <strong>"AI gợi ý bài giảng (RAG)"</strong> để AI tự động thiết kế slide dựa trên tài liệu nguồn.</li>
                          </ul>
                        </div>
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="workspace-preview-text">
                    {localActiveScript || (
                      <span className="roadmap-sidebar-empty-text">
                        Nội dung kịch bản tương tác đang trống. Hãy nhập nội dung ở bên trái để xem trước.
                        <div className="empty-suggestions-box" style={{ marginTop: '12px' }}>
                          <div className="empty-suggestions-title">
                            <span>💡 Gợi ý thực hiện:</span>
                          </div>
                          <ul className="empty-suggestions-list">
                            <li className="empty-suggestions-item">Nhập kịch bản hoạt động lớp học, thảo luận nhóm ở cột bên trái.</li>
                            <li className="empty-suggestions-item">Hoặc sử dụng <strong>"AI gợi ý bài giảng (RAG)"</strong> để tham khảo ý tưởng lớp học năng động.</li>
                          </ul>
                        </div>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. QUESTIONS VIEW */}
        {isQuestions && (
          <div className="roadmap-workspace-split-editor">
            <div className="roadmap-workspace-editor-column">
              <div className="workspace-section-header">
                <h3 className="workspace-list-title">
                  Danh sách câu hỏi của chương ({localQuestions.length})
                </h3>
                <div className="workspace-header-actions">
                  <button
                    className="workspace-ai-questions-btn"
                    onClick={handleAiGenerateQuestions}
                    disabled={workspaceSaving}
                  >
                    <Sparkles size={14} aria-hidden="true" /> {workspaceSaving ? 'Đang sinh…' : 'AI tự sinh 5 câu hỏi'}
                  </button>
                  <button
                    className="workspace-add-btn"
                    onClick={() => setEditingQuestion({
                      id: 'new',
                      question_text: '',
                      options: ['', '', '', ''],
                      correct_answer: '',
                      bloom_level: 1,
                      clo_id: clos[0]?.id || ''
                    })}
                  >
                    <Plus size={14} aria-hidden="true" /> Tạo câu hỏi mới
                  </button>
                </div>
              </div>

              {localQuestions.length === 0 ? (
                <div className="workspace-empty-state">
                  Chưa có câu hỏi nào trong chương này. Hãy tạo một câu hỏi mới.
                  <div className="empty-suggestions-box" style={{ marginTop: '12px' }}>
                    <div className="empty-suggestions-title">
                      <span>💡 Gợi ý thực hiện:</span>
                    </div>
                    <ul className="empty-suggestions-list">
                      <li className="empty-suggestions-item">Bấm nút <strong>"AI tự sinh 5 câu hỏi"</strong> ở góc trên để sinh câu hỏi trắc nghiệm tự động.</li>
                      <li className="empty-suggestions-item">Hoặc bấm <strong>"Tạo câu hỏi mới"</strong> để bắt đầu tự tay soạn thảo các câu hỏi cho chương này.</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="workspace-cards-list">
                  {localQuestions.map((q, idx) => {
                    let opts: string[] = [];
                    if (q.options_json) {
                      try { opts = JSON.parse(q.options_json); } catch(e) {}
                    }
                    const matchedClo = clos.find(c => c.id === q.clo_id);
                    return (
                      <div key={q.id || idx} className="workspace-card-item">
                        <div className="workspace-card-header">
                          <div className="workspace-badge-row">
                            <span className="workspace-badge-idx">Câu {idx + 1}</span>
                            <span className="workspace-badge-bloom">Bloom B{q.bloom_level}</span>
                            {matchedClo && (
                              <span className="workspace-badge-clo">
                                {matchedClo.clo_code || matchedClo.code}
                              </span>
                            )}
                          </div>
                          <div className="workspace-actions-group">
                            <button
                              onClick={() => setEditingQuestion({
                                id: q.id,
                                question_text: q.question_text,
                                options: [...opts],
                                correct_answer: q.correct_answer,
                                bloom_level: q.bloom_level,
                                clo_id: q.clo_id || ''
                              })}
                              className="workspace-card-action-btn workspace-card-action-btn--edit"
                              title="Chỉnh sửa câu hỏi"
                              aria-label="Chỉnh sửa câu hỏi"
                            >
                              <Edit3 size={14} aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => handleDeleteWorkspaceQuestion(q.id)}
                              className="workspace-card-action-btn workspace-card-action-btn--delete"
                              title="Xóa câu hỏi"
                              aria-label="Xóa câu hỏi"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="workspace-card-question-text">{q.question_text}</div>
                        <div className="workspace-grid-choices">
                          {opts.map((opt, oIdx) => {
                            const isCorrect = opt === q.correct_answer;
                            return (
                              <div key={oIdx} className={`workspace-choice-card ${isCorrect ? 'correct' : ''}`}>
                                <span className="workspace-choice-label">
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>
                                {opt}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Question Form Editor */}
            <div className="roadmap-workspace-preview-column" style={{ background: 'rgba(15,23,42,0.6)' }}>
              <div className="workspace-preview-header">
                📝 FORM BIÊN SOẠN CÂU HỎI
              </div>
              <div className="workspace-preview-content" style={{ padding: '30px' }}>
                {editingQuestion ? (
                  <div className="workspace-form-container">
                    <div>
                      <label className="workspace-form-label">NỘI DUNG CÂU HỎI</label>
                      <textarea
                        className="workspace-textarea workspace-textarea--question"
                        value={editingQuestion.question_text}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })}
                        placeholder="Nhập nội dung câu hỏi trắc nghiệm…"
                      />
                    </div>

                    <div className="workspace-form-grid-2">
                      <div>
                        <label className="workspace-form-label">MỨC ĐỘ NHẬN THỨC (BLOOM)</label>
                        <select
                          className="workspace-select"
                          value={editingQuestion.bloom_level}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, bloom_level: parseInt(e.target.value) })}
                        >
                          <option value={1}>Nhớ (Bloom 1)</option>
                          <option value={2}>Hiểu (Bloom 2)</option>
                          <option value={3}>Áp dụng (Bloom 3)</option>
                          <option value={4}>Phân tích (Bloom 4)</option>
                          <option value={5}>Đánh giá (Bloom 5)</option>
                          <option value={6}>Sáng tạo (Bloom 6)</option>
                        </select>
                      </div>
                      <div>
                        <label className="workspace-form-label">CHUẨN ĐẦU RA MỤC TIÊU (CLO)</label>
                        <select
                          className="workspace-select"
                          value={editingQuestion.clo_id || ''}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, clo_id: e.target.value ? parseInt(e.target.value) : null })}
                        >
                          <option value="">Không gán CLO</option>
                          {clos.map((c, i) => (
                            <option key={c.id || i} value={c.id}>
                              {c.clo_code || c.code} - {c.description.substring(0, 50)}…
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="workspace-form-label">
                        CÁC PHƯƠNG ÁN LỰA CHỌN & ĐÁP ÁN ĐÚNG (TÍCH CHỌN PHƯƠNG ÁN ĐÚNG)
                      </label>
                      <div className="workspace-form-flex-col">
                        {editingQuestion.options.map((opt: string, oIdx: number) => {
                          const optLetter = String.fromCharCode(65 + oIdx);
                          const isCorrect = editingQuestion.correct_answer === opt && opt !== '';
                          return (
                            <div key={oIdx} className="workspace-choice-input-row">
                              <button
                                type="button"
                                onClick={() => setEditingQuestion({ ...editingQuestion, correct_answer: opt })}
                                className={`workspace-choice-badge-btn ${isCorrect ? 'correct' : ''}`}
                              >
                                {optLetter}
                              </button>
                              <input
                                type="text"
                                className="workspace-input"
                                style={{ flex: 1 }}
                                value={opt}
                                onChange={(e) => {
                                  const nextOpts = [...editingQuestion.options];
                                  nextOpts[oIdx] = e.target.value;
                                  const nextCorrect = editingQuestion.correct_answer === opt ? e.target.value : editingQuestion.correct_answer;
                                  setEditingQuestion({
                                    ...editingQuestion,
                                    options: nextOpts,
                                    correct_answer: nextCorrect
                                  });
                                }}
                                placeholder={`Nhập phương án ${optLetter}…`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="workspace-form-actions">
                      <button
                        className="workspace-card-save-btn"
                        onClick={() => handleSaveWorkspaceQuestion(editingQuestion)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Save size={14} aria-hidden="true" /> Lưu câu hỏi
                      </button>
                      <button
                        className="workspace-card-cancel-btn"
                        onClick={() => setEditingQuestion(null)}
                      >
                        Hủy bỏ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="workspace-preview-empty">
                    <Edit3 size={32} aria-hidden="true" />
                    <span className="workspace-preview-empty-text">
                      Chọn biểu tượng bút chì bên danh sách câu hỏi để chỉnh sửa, hoặc nhấn <strong>"Tạo câu hỏi mới"</strong> để bắt đầu soạn thảo.
                    </span>
                    <div className="empty-suggestions-box" style={{ maxWidth: '400px', margin: '20px auto 0' }}>
                      <div className="empty-suggestions-title">
                        <span>💡 Hướng dẫn Form soạn thảo:</span>
                      </div>
                      <ul className="empty-suggestions-list">
                        <li className="empty-suggestions-item">Điền nội dung câu hỏi trắc nghiệm và gán chuẩn đầu ra CLO mục tiêu.</li>
                        <li className="empty-suggestions-item">Điền 4 phương án lựa chọn A, B, C, D. Click vào nhãn chữ cái (A, B, C, D) bên cạnh để đánh dấu đáp án đúng.</li>
                        <li className="empty-suggestions-item">Nhấn <strong>Lưu câu hỏi</strong> để cập nhật trực tiếp vào chương học.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. CLOS VIEW */}
        {isClos && (
          <div className="workspace-container-card">
            <div className="workspace-section-header">
              <h3 className="workspace-list-title" style={{ fontSize: '17px' }}>
                Danh sách Chuẩn đầu ra môn học (CLOs)
              </h3>
              <div className="workspace-header-actions">
                <button
                  className="workspace-ai-clos-btn"
                  onClick={handleAiSuggestClos}
                  disabled={workspaceSaving}
                >
                  <Sparkles size={14} /> AI gợi ý CLOs
                </button>
                <button
                  className="workspace-add-btn"
                  onClick={() => setLocalClos([...localClos, {
                    id: 0,
                    clo_code: `CLO${localClos.length + 1}`,
                    bloom_level: 1,
                    description: ''
                  }])}
                >
                  <Plus size={14} /> Thêm chuẩn đầu ra CLO
                </button>
              </div>
            </div>

            {localClos.length === 0 ? (
              <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>
                Chưa cấu hình chuẩn đầu ra nào.
                <div className="empty-suggestions-box" style={{ maxWidth: '600px', margin: '20px auto 0' }}>
                  <div className="empty-suggestions-title">
                    <span>💡 Gợi ý thực hiện:</span>
                  </div>
                  <ul className="empty-suggestions-list">
                    <li className="empty-suggestions-item">Bấm nút <strong>"AI gợi ý CLOs"</strong> ở góc trên để AI tự đề xuất chuẩn đầu ra từ Syllabus môn học.</li>
                    <li className="empty-suggestions-item">Hoặc bấm nút <strong>"Thêm chuẩn đầu ra CLO"</strong> để tự định nghĩa chuẩn đầu ra môn học của bạn.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '30px' }}>
                {localClos.map((clo, idx) => (
                  <div key={idx} className="workspace-clo-row">
                    <div className="workspace-clo-col-code">
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '800', marginBottom: '6px' }}>MÃ CLO</label>
                      <input
                        type="text"
                        className="workspace-input"
                        value={clo.clo_code || clo.code || ''}
                        onChange={(e) => {
                          const updated = [...localClos];
                          updated[idx] = { ...clo, clo_code: e.target.value, code: e.target.value };
                          setLocalClos(updated);
                        }}
                        placeholder="Ví dụ: CLO1"
                      />
                    </div>

                    <div className="workspace-clo-col-bloom">
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '800', marginBottom: '6px' }}>MỨC ĐỘ NHẬN THỨC</label>
                      <select
                        className="workspace-select"
                        value={clo.bloom_level}
                        onChange={(e) => {
                          const updated = [...localClos];
                          updated[idx] = { ...clo, bloom_level: parseInt(e.target.value) };
                          setLocalClos(updated);
                        }}
                      >
                        <option value={1}>Nhớ (Bloom 1)</option>
                        <option value={2}>Hiểu (Bloom 2)</option>
                        <option value={3}>Áp dụng (Bloom 3)</option>
                        <option value={4}>Phân tích (Bloom 4)</option>
                        <option value={5}>Đánh giá (Bloom 5)</option>
                        <option value={6}>Sáng tạo (Bloom 6)</option>
                      </select>
                    </div>

                    <div className="workspace-clo-col-desc">
                      <label className="workspace-clo-form-label">MÔ TẢ CHUẨN ĐẦU RA</label>
                      <input
                        type="text"
                        className="workspace-input"
                        value={clo.description}
                        onChange={(e) => {
                          const updated = [...localClos];
                          updated[idx] = { ...clo, description: e.target.value };
                          setLocalClos(updated);
                        }}
                        placeholder="Mô tả kỹ năng/kiến thức sinh viên đạt được…"
                      />
                    </div>

                    <button
                      onClick={() => setLocalClos(localClos.filter((_, i) => i !== idx))}
                      className="workspace-clo-delete-btn"
                      title="Xóa dòng này"
                      aria-label="Xóa dòng này"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="workspace-btn-group">
              <button 
                className="roadmap-workspace-save-btn" 
                onClick={handleSaveWorkspaceClos}
                disabled={workspaceSaving}
              >
                {workspaceSaving ? 'Đang cập nhật đề cương…' : 'Lưu & Khớp dữ liệu CLOs'}
              </button>
              <button 
                className="roadmap-workspace-cancel-btn" 
                onClick={() => setWorkspaceNode(null)}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* 4. RAG / VECTOR DB VIEW */}
        {isRag && (
          <div className="roadmap-workspace-split-editor">
            <div 
              className={`workspace-upload-dropzone ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <form onSubmit={handleUploadWorkspaceDoc} className="workspace-upload-form">
                <Upload size={48} aria-hidden="true" />
                <h3 className="workspace-list-title">
                  Tải tệp tin giáo trình hoặc tài liệu tham khảo nguồn
                </h3>
                <p className="workspace-upload-dropzone-desc">
                  Hệ thống hỗ trợ các tệp tin định dạng văn bản PDF, DOCX, TXT. Nội dung tệp tin sẽ được phân nhỏ, mã hóa vector và nạp vào thư viện RAG hỗ trợ AI sinh bài giảng.
                </p>
                
                <input
                  type="file"
                  className="workspace-file-input"
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  accept=".pdf,.docx,.txt"
                />
                
                {uploadFile && (
                  <div className="workspace-upload-file-name">
                    Đã chọn: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}

                <button
                  type="submit"
                  className="workspace-upload-btn roadmap-sidebar-action"
                  disabled={uploading || !uploadFile}
                >
                  <Upload size={16} aria-hidden="true" /> {uploading ? 'Đang tải và nạp vector…' : 'Tải lên thư viện RAG'}
                </button>
              </form>
            </div>

            <div className="roadmap-workspace-preview-column">
              <div className="workspace-preview-header" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Library size={16} /> TÀI LIỆU NGUỒN TRONG THƯ VIỆN RAG ({localRagDocs.length})
              </div>
              <div className="workspace-preview-content" style={{ padding: '20px' }}>
                {localRagDocs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '12px' }}>
                    <Library size={32} />
                    <span style={{ fontSize: '13.5px', fontStyle: 'italic', marginBottom: '8px' }}>Thư viện RAG trống. Hãy tải lên tài liệu tham khảo ở bên trái.</span>
                    <div className="empty-suggestions-box" style={{ width: '90%', margin: '0 auto' }}>
                      <div className="empty-suggestions-title">
                        <span>💡 Gợi ý thực hiện:</span>
                      </div>
                      <ul className="empty-suggestions-list">
                        <li className="empty-suggestions-item">Chọn tệp tin học liệu dạng PDF, DOCX, TXT ở khung kéo thả bên trái.</li>
                        <li className="empty-suggestions-item">Bấm <strong>Tải lên thư viện RAG</strong> để AI tự động phân tách và nạp vector dữ liệu.</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {localRagDocs.map((doc, idx) => (
                      <div key={idx} className="workspace-card-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          <File size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc}>{doc}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteWorkspaceDoc(doc)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: '4px', display: 'inline-flex', alignItems: 'center' }}
                          title="Xóa tài liệu tham chiếu này"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(overlayContent, document.body);
  }
  return overlayContent;
}
