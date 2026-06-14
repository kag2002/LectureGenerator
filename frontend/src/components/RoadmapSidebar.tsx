/**
 * RoadmapSidebar — Detail sidebar panel for CourseRoadmap.
 * 
 * Extracted from CourseRoadmap.tsx (lines 74-369).
 * Shows node details with quick preview content (CLOs, Questions, Materials, Matrix, RAG docs).
 */
'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import {
  CheckCircle2, Clock, Circle, X, ChevronRight, Maximize2,
  Check, Minus, FileText, Search
} from 'lucide-react';
import { Course, CLO } from '@/types';

// ─── Helper: status label ────────────────────────────────────────────
function StatusBadge({ status }: { status: 'done' | 'in_progress' | 'pending' | string }) {
  if (status === 'done') {
    return <span className="roadmap-status-badge roadmap-status-badge--done"><CheckCircle2 size={14} /> Hoàn thành</span>;
  }
  if (status === 'in_progress') {
    return <span className="roadmap-status-badge roadmap-status-badge--in-progress"><Clock size={14} /> Đang thực hiện</span>;
  }
  return <span className="roadmap-status-badge roadmap-status-badge--pending"><Circle size={14} /> Chưa bắt đầu</span>;
}

const getBloomText = (level: number) => {
  switch (level) {
    case 1: return 'Nhớ (Bloom 1)';
    case 2: return 'Hiểu (Bloom 2)';
    case 3: return 'Áp dụng (Bloom 3)';
    case 4: return 'Phân tích (Bloom 4)';
    case 5: return 'Đánh giá (Bloom 5)';
    case 6: return 'Sáng tạo (Bloom 6)';
    default: return `Bloom ${level}`;
  }
};

export interface RoadmapSidebarProps {
  node: any;
  onClose: () => void;
  onNavigate: (view: string, id: number | null) => void;
  clos: CLO[];
  questions: any[];
  course: Course;
  onOpenWorkspace: (node: any) => void;
}

export default function RoadmapSidebar({ node, onClose, onNavigate, clos, questions, course, onOpenWorkspace }: RoadmapSidebarProps) {
  if (!node) return null;

  const [loadingContent, setLoadingContent] = useState(false);
  const [materialData, setMaterialData] = useState<{ slide_content: string; active_learning_script: string } | null>(null);
  const [ragDocs, setRagDocs] = useState<string[]>([]);
  const [materialTab, setMaterialTab] = useState<'slides' | 'script'>('slides');

  useEffect(() => {
    setMaterialData(null);
    setRagDocs([]);
    setMaterialTab('slides');

    const nodeId = node.id;
    if (nodeId.startsWith('materials_') || nodeId.startsWith('chapter_')) {
      const chapterId = parseInt(nodeId.split('_')[1]);
      setLoadingContent(true);
      client.get(`/api/courses/chapters/${chapterId}/materials`)
        .then(res => {
          setMaterialData({
            slide_content: res.data.slide_content || '',
            active_learning_script: res.data.active_learning_script || ''
          });
        })
        .catch(err => console.error("Error fetching preview materials:", err))
        .finally(() => setLoadingContent(false));
    } else if (nodeId === 'knowledge_base') {
      setLoadingContent(true);
      client.get(`/api/courses/${course.id}/documents`)
        .then(res => {
          setRagDocs(res.data.documents || []);
        })
        .catch(err => console.error("Error fetching preview RAG docs:", err))
        .finally(() => setLoadingContent(false));
    }
  }, [node, course.id]);

  let chapterIdForQuestions: number | null = null;
  if (node.id.startsWith('questions_')) {
    chapterIdForQuestions = parseInt(node.id.split('_')[1]);
  } else if (node.id.startsWith('chapter_')) {
    chapterIdForQuestions = parseInt(node.id.split('_')[1]);
  }

  const chQuestions = chapterIdForQuestions 
    ? questions.filter(q => q.chapter_id === chapterIdForQuestions) 
    : [];

  const sidebarContent = (
    <>
      <div className="roadmap-sidebar-overlay" onClick={onClose} />
      <div className="roadmap-sidebar">
        <div className="roadmap-sidebar-header">
          <h3 className="roadmap-sidebar-title">{node.label}</h3>
          <button className="roadmap-sidebar-close" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        <div className="roadmap-sidebar-body">
          <div className="roadmap-sidebar-icon">
            {node.icon}
          </div>
          <div className="roadmap-sidebar-status-container">
            <div className={`roadmap-sidebar-status roadmap-sidebar-status--${node.status}`}>
              <StatusBadge status={node.status} />
            </div>
          </div>
          <p className="roadmap-sidebar-desc">{node.description}</p>

          {node.stats && node.stats.length > 0 && (
            <div className="roadmap-sidebar-stats">
              {node.stats.map((s: any, i: number) => (
                <div key={i} className="roadmap-sidebar-stat">
                  <span className="roadmap-sidebar-stat-value">{s.value}</span>
                  <span className="roadmap-sidebar-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* DYNAMIC QUICK PREVIEW DRAWERS */}
          <div className="roadmap-sidebar-section">
            <h4 className="roadmap-sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={16} /> Xem nhanh nội dung
            </h4>
            
            {loadingContent ? (
              <div className="roadmap-sidebar-loading-row">
                <span className="roadmap-spinner roadmap-spinner--small" />
                <span>Đang tải nội dung trực tiếp…</span>
              </div>
            ) : (
              <>
                {/* 1. CLOs & Syllabus Preview */}
                {(node.id === 'clos' || node.id === 'syllabus') && (
                  clos.length === 0 ? (
                    <div className="roadmap-sidebar-empty-text">Chưa có chuẩn đầu ra CLO nào được nạp.</div>
                  ) : (
                    <div className="roadmap-sidebar-list-scroll">
                      {clos.map((c, idx) => (
                        <div key={c.id || idx} className="roadmap-sidebar-clo-card">
                          <div className="roadmap-sidebar-clo-card-header">
                            <span className="roadmap-sidebar-clo-badge-orange">
                              {c.clo_code || c.code}
                            </span>
                            <span className="roadmap-sidebar-clo-badge-purple">
                              Bloom B{c.bloom_level}
                            </span>
                          </div>
                          <div className="roadmap-sidebar-clo-desc">{c.description}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* 2. MCQ Questions Preview */}
                {node.id.startsWith('questions_') && (
                  chQuestions.length === 0 ? (
                    <div className="roadmap-sidebar-empty-text">Chưa thiết kế câu hỏi nào cho chương này.</div>
                  ) : (
                    <div className="roadmap-sidebar-list-scroll-large">
                      {chQuestions.map((q, idx) => {
                        let opts: string[] = [];
                        if (q.options_json) {
                          try { opts = JSON.parse(q.options_json); } catch(e) {}
                        }
                        return (
                          <div key={q.id || idx} className="roadmap-sidebar-quiz-card">
                            <div className="roadmap-sidebar-quiz-card-header">
                              <span className="roadmap-sidebar-quiz-num">Câu {idx + 1}</span>
                              <span className="roadmap-sidebar-quiz-bloom">Bloom B{q.bloom_level}</span>
                            </div>
                            <div className="roadmap-sidebar-quiz-text">{q.question_text}</div>
                            <div className="roadmap-sidebar-quiz-options">
                              {opts.map((opt, oIdx) => {
                                const isCorrect = opt === q.correct_answer;
                                return (
                                  <div key={oIdx} className={`roadmap-sidebar-quiz-option ${isCorrect ? 'roadmap-sidebar-quiz-option--correct' : ''}`}>
                                    <span className={isCorrect ? 'roadmap-sidebar-quiz-letter--correct' : 'roadmap-sidebar-quiz-letter'}>
                                      {String.fromCharCode(65 + oIdx)}.
                                    </span>
                                    <span>{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* 3. Document Library Preview */}
                {node.id === 'knowledge_base' && (
                  ragDocs.length === 0 ? (
                    <div className="roadmap-sidebar-empty-text">Thư viện RAG trống. Hãy nạp tài liệu vào hệ thống.</div>
                  ) : (
                    <div className="roadmap-sidebar-list-scroll">
                      {ragDocs.map((doc, idx) => (
                        <div key={idx} className="roadmap-sidebar-doc-card" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={14} className="roadmap-sidebar-doc-icon" style={{ color: 'var(--text-muted)' }} />
                          <span className="roadmap-sidebar-doc-title" title={doc}>{doc}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* 4. Slide & Active Learning Preview */}
                {(node.id.startsWith('materials_') || node.id.startsWith('chapter_')) && (
                  (!materialData || (!materialData.slide_content && !materialData.active_learning_script)) ? (
                    <div className="roadmap-sidebar-empty-text">Chương này chưa có nội dung slide hay kịch bản hoạt động.</div>
                  ) : (
                    <div className="roadmap-sidebar-list-scroll-large">
                      <div className="roadmap-sidebar-tabs-row">
                        <button 
                          onClick={() => setMaterialTab('slides')}
                          className={`roadmap-sidebar-tab-toggle ${materialTab === 'slides' ? 'roadmap-sidebar-tab-toggle--active' : ''}`}
                        >
                          Slide Bài giảng
                        </button>
                        <button 
                          onClick={() => setMaterialTab('script')}
                          className={`roadmap-sidebar-tab-toggle ${materialTab === 'script' ? 'roadmap-sidebar-tab-toggle--active' : ''}`}
                        >
                          Kịch bản tương tác
                        </button>
                      </div>

                      {materialTab === 'slides' ? (
                        <div className="roadmap-sidebar-code-preview">
                          {materialData.slide_content || 'Nội dung Slide trống.'}
                        </div>
                      ) : (
                        <div className="roadmap-sidebar-text-preview">
                          {materialData.active_learning_script || 'Kịch bản lớp học trống.'}
                        </div>
                      )}
                    </div>
                  )
                )}

                {/* 5. Matrix Coverage Preview */}
                {node.id === 'matrix' && (
                  questions.length === 0 ? (
                    <div className="roadmap-sidebar-empty-text">Chưa thiết kế câu hỏi để thống kê ma trận.</div>
                  ) : (
                    <div className="roadmap-sidebar-list-scroll-align-left">
                      <div className="roadmap-sidebar-matrix-title">
                        Phân bổ mức độ nhận thức (Bloom Taxonomy) trên toàn bộ ngân hàng câu hỏi môn học:
                      </div>
                      {[1, 2, 3, 4, 5, 6].map(level => {
                        const levelQuestions = questions.filter(q => q.bloom_level === level);
                        const pct = Math.round((levelQuestions.length / questions.length) * 100);
                        return (
                          <div key={level} className="roadmap-sidebar-matrix-card">
                            <div className="roadmap-sidebar-matrix-header">
                              <span className="roadmap-sidebar-matrix-bloom-label">{getBloomText(level)}</span>
                              <span className="roadmap-sidebar-matrix-bloom-val">{levelQuestions.length} câu ({pct}%)</span>
                            </div>
                            <div className="roadmap-sidebar-matrix-track">
                              <div className="roadmap-sidebar-matrix-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </>
            )}
          </div>

          <div className="roadmap-sidebar-footer-divider" />

          {node.targetView && (
            <div className="roadmap-sidebar-footer-actions">
              <button
                onClick={() => onOpenWorkspace(node)}
                className="roadmap-sidebar-action roadmap-sidebar-action--workspace"
              >
                <Maximize2 size={15} /> Mở rộng Bảng thao tác
              </button>
              <button
                className="roadmap-sidebar-action"
                onClick={() => {
                  onClose();
                  let chId: number | null = null;
                  if (node.id.startsWith('chapter_')) {
                    chId = parseInt(node.id.split('_')[1]);
                  } else if (node.id.startsWith('materials_')) {
                    chId = parseInt(node.id.split('_')[1]);
                  } else if (node.id.startsWith('questions_')) {
                    chId = parseInt(node.id.split('_')[1]);
                  }
                  onNavigate(node.targetView, chId);
                }}
              >
                Vào trang chi tiết <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (typeof document !== 'undefined') {
    return createPortal(sidebarContent, document.body);
  }
  return sidebarContent;
}
