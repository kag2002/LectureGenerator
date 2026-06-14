'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import './CourseRoadmap.css';
import { 
  CheckCircle2, Clock, Circle, BookOpen, FileText, 
  HelpCircle, BarChart2, Library, ClipboardList, Target, 
  ArrowLeft, MessageSquare, LogOut,
  Plus, Minus, X, Check, Download, ListTodo,
  Printer, Pencil, Network
} from 'lucide-react';
import { Course, CLO, Chapter } from '@/types';
import { useRoadmapData } from '../hooks/useRoadmapData';
import RoadmapSidebar from '../components/RoadmapSidebar';
import RoadmapWorkspace from '../components/RoadmapWorkspace';

// ─── Single tree node ────────────────────────────────────────────────
interface TreeNodeProps {
  node: any;
  onSelect: (node: any) => void;
  onToggleCollapse: (id: string, e: React.MouseEvent) => void;
  isCollapsed?: boolean;
  hasChildren?: boolean;
}

function TreeNode({ node, onSelect, onToggleCollapse, isCollapsed, hasChildren }: TreeNodeProps) {
  return (
    <div
      className={`roadmap-node roadmap-node--${node.status}`}
      onClick={(e) => { e.stopPropagation(); onSelect(node); }}
      title={node.label}
    >
      <span className={`roadmap-node-status-dot roadmap-node-status-dot--${node.status}`} />
      <span className="roadmap-node-icon">
        {node.icon}
      </span>
      <div className="roadmap-node-label">{node.label}</div>
      {node.detail && <div className="roadmap-node-detail">{node.detail}</div>}
      
      {hasChildren && (
        <button
          className={`roadmap-node-toggle ${isCollapsed ? 'roadmap-node-toggle--collapsed' : ''}`}
          onClick={(e) => onToggleCollapse(node.id, e)}
          title={isCollapsed ? "Mở rộng nhánh con" : "Thu gọn nhánh con"}
        >
          {isCollapsed ? <Plus size={10} /> : <Minus size={10} />}
        </button>
      )}
    </div>
  );
}

// ─── Helper: bezier paths for visual connection ──────────────────────
function getHorizontalBezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + (x2 > x1 ? dx : -dx)} ${y1}, ${x2 + (x2 > x1 ? -dx : dx)} ${y2}, ${x2} ${y2}`;
}

function getVerticalBezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.abs(y2 - y1) * 0.5;
  return `M ${x1} ${y1} C ${x1} ${y1 + (y2 > y1 ? dy : -dy)}, ${x2} ${y2 + (y2 > y1 ? -dy : dy)}, ${x2} ${y2}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════
export interface CourseRoadmapProps {
  course: Course;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: string, extra?: any) => void;
}

export default function CourseRoadmap({ course, onBack, onLogout, onNavigate }: CourseRoadmapProps) {
  // Use extracted data hook
  const roadmapData = useRoadmapData(course);
  const {
    clos, chapters, questions, materialsMap, loading,
    selectedNode, setSelectedNode,
  } = roadmapData;

  const [viewMode, setViewMode] = useState<'mindmap' | 'checklist'>('checklist');
  const [downloadingChapterId, setDownloadingChapterId] = useState<number | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Direct export handlers
  const handleExportPPTX = async (chapterId: number) => {
    setDownloadingChapterId(chapterId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:8000/api/courses/chapters/${chapterId}/export-pptx?theme=warm_academic&engine=ppt_master`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Lỗi server: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bai_Giang_Chuong_${chapterId}.pptx`);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(`Không thể xuất slide PPTX: ${err.message}`);
    } finally {
      setDownloadingChapterId(null);
    }
  };

  const handleExportLessonPlan = (chapterId: number) => {
    const token = localStorage.getItem('token');
    window.open(`http://localhost:8000/api/courses/chapters/${chapterId}/export-lesson-plan?token=${token}`, '_blank');
  };

  const handleExportCourseLessonPlan = () => {
    const token = localStorage.getItem('token');
    window.open(`http://localhost:8000/api/courses/${course.id}/export-materials?token=${token}`, '_blank');
  };

  const handleExportCourseQuestions = () => {
    const token = localStorage.getItem('token');
    window.open(`http://localhost:8000/api/courses/${course.id}/export-questions?token=${token}`, '_blank');
  };

  const handleExportZIPPackage = async () => {
    setDownloadingZip(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:8000/api/courses/${course.id}/export-zip?organization_style=by_chapter&theme=warm_academic`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Lỗi server: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Course_Package_${course.course_code || 'export'}.zip`);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(`Không thể tải trọn bộ học liệu ZIP: ${err.message}`);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Canvas Refs & Control State
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());

  // ─── Build tree data structure ─────────────────────────────────────
  const tree = useMemo(() => {
    const hasClos = clos.length > 0;
    const totalQuestions = questions.length;

    const chapterNodes = chapters.map(ch => {
      const chQuestions = questions.filter(q => q.chapter_id === ch.id);
      const hasSlide = !!materialsMap[ch.id]?.hasSlide;
      const hasScript = !!materialsMap[ch.id]?.hasScript;
      const hasMat = hasSlide && hasScript;
      const hasPartialMat = hasSlide || hasScript;
      const hasQ = chQuestions.length > 0;
      const chapterStatus = (hasMat && hasQ) ? 'done' : (hasPartialMat || hasQ) ? 'in_progress' : 'pending';

      return {
        id: `chapter_${ch.id}`,
        icon: <BookOpen size={18} style={{ color: '#6366f1' }} />,
        label: ch.title,
        detail: ch.title ? ch.title.substring(0, 50) + '…' : null,
        status: chapterStatus,
        targetView: 'lesson_planner',
        description: `Chương "${ch.title}" trong môn ${course.course_name}. Bạn có thể soạn nội dung slide, kịch bản hoạt động tương tác, và sinh câu hỏi kiểm tra cho chương này.`,
        stats: [
          { value: hasMat ? <Check size={18} style={{ color: '#10b981' }} /> : hasPartialMat ? <Clock size={18} style={{ color: '#f59e0b' }} /> : <Minus size={18} style={{ color: '#64748b' }} />, label: 'Học liệu' },
          { value: chQuestions.length, label: 'Câu hỏi' },
        ],
        children: [
          {
            id: `materials_${ch.id}`,
            icon: <FileText size={18} style={{ color: '#a855f7' }} />,
            label: 'Slide & Hoạt động',
            detail: hasMat ? 'Đã soạn xong' : hasPartialMat ? 'Đang soạn dở' : 'Chưa soạn',
            status: hasMat ? 'done' : hasPartialMat ? 'in_progress' : 'pending',
            targetView: 'lesson_planner',
            description: `Nội dung slide bài giảng và kịch bản Active Learning cho chương "${ch.title}". AI sẽ đề xuất nội dung dựa trên tài liệu nguồn RAG và bạn duyệt/sửa trên giao diện Split-Screen Editor.`,
            stats: [{ value: hasMat ? <Check size={18} style={{ color: '#10b981' }} /> : hasPartialMat ? <Clock size={18} style={{ color: '#f59e0b' }} /> : <X size={18} style={{ color: '#ef4444' }} />, label: 'Trạng thái' }],
          },
          {
            id: `questions_${ch.id}`,
            icon: <HelpCircle size={18} style={{ color: '#ec4899' }} />,
            label: 'Ngân hàng Câu hỏi',
            detail: `${chQuestions.length} câu`,
            status: hasQ ? 'done' : 'pending',
            targetView: 'question_bank',
            description: `Ngân hàng câu hỏi trắc nghiệm MCQ cho chương "${ch.title}". Câu hỏi được sinh bởi AI với Self-Correction (Generator + Solver) và gán tag CLO + mức Bloom.`,
            stats: [{ value: chQuestions.length, label: 'Tổng câu hỏi' }],
          },
        ],
      };
    });

    const matrixNode = {
      id: 'matrix',
      icon: <BarChart2 size={18} style={{ color: '#06b6d4' }} />,
      label: 'Ma trận CLO-Bloom',
      detail: totalQuestions > 0 ? `${totalQuestions} câu hỏi` : 'Chưa có dữ liệu',
      status: totalQuestions > 0 ? 'done' : 'pending',
      targetView: 'matrix_dashboard',
      description: 'Bảng tổng hợp độ phủ ngân hàng câu hỏi theo ma trận CLO × Bloom Level. Giúp giảng viên đảm bảo đề thi bao phủ đầy đủ các chuẩn đầu ra và mức độ nhận thức.',
      stats: [
        { value: totalQuestions, label: 'Tổng câu hỏi' },
        { value: clos.length, label: 'Số CLO' },
      ],
    };

    return {
      syllabus: {
        id: 'syllabus',
        icon: <ClipboardList size={18} style={{ color: '#10b981' }} />,
        label: 'Nạp Đề Cương (Syllabus)',
        detail: hasClos ? `${clos.length} CLO đã bóc tách` : 'Chưa tải Syllabus',
        status: hasClos ? 'done' : 'pending',
        targetView: 'course_config',
        description: 'Tải lên file Syllabus (PDF/Docx) hoặc dán nội dung đề cương. AI sẽ tự động bóc tách các Chuẩn đầu ra (CLO) và ánh xạ mức Bloom Taxonomy.',
        stats: [{ value: clos.length, label: 'CLOs' }],
      },
      clos: {
        id: 'clos',
        icon: <Target size={18} style={{ color: '#f59e0b' }} />,
        label: 'Chuẩn Đầu Ra (CLOs)',
        detail: hasClos ? `${clos.length} CLO` : 'Chưa cấu hình',
        status: hasClos ? 'done' : 'pending',
        targetView: 'course_config',
        description: 'Danh sách các Chuẩn đầu ra môn học (Course Learning Outcomes) đã trích xuất từ Syllabus. Bạn có thể chỉnh sửa, thêm/xóa CLO và cập nhật mức Bloom Taxonomy.',
        stats: clos.slice(0, 4).map(c => ({ value: c.clo_code || c.code || '', label: `Bloom ${c.bloom_level}` })),
      },
      knowledgeBase: {
        id: 'knowledge_base',
        icon: <Library size={18} style={{ color: '#3b82f6' }} />,
        label: 'Thư viện RAG & Học thuật',
        detail: 'Nạp tài liệu & Duyệt học thuật',
        status: 'done',
        targetView: 'knowledge_base',
        description: 'Không gian tìm kiếm tài liệu học thuật trực tuyến và quản lý tài liệu RAG chính thống phục vụ quá trình sinh bài giảng.',
        stats: [],
      },
      chapters: chapterNodes,
      matrix: matrixNode,
    };
  }, [clos, chapters, questions, materialsMap, course]);

  // ─── Progress calculation ──────────────────────────────────────────
  const progress = useMemo(() => {
    let total = 0;
    let done = 0;
    function count(node: any) {
      if (!node) return;
      total++;
      if (node.status === 'done') done++;
      if (node.children) node.children.forEach(count);
    }
    count(tree.syllabus);
    count(tree.clos);
    count(tree.knowledgeBase);
    tree.chapters.forEach(ch => count(ch));
    count(tree.matrix);
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }, [tree]);

  // ─── Spatial Nodes Layout ──────────────────────────────────────────
  const positionedNodes = useMemo(() => {
    const nodes: any[] = [];
    nodes.push({ ...tree.syllabus, x: 0, y: 0 });
    nodes.push({ ...tree.clos, x: -320, y: -100 });
    nodes.push({ ...tree.knowledgeBase, x: -320, y: 100 });
    nodes.push({ ...tree.matrix, x: 0, y: 260 });

    const chCount = tree.chapters.length;
    tree.chapters.forEach((ch, idx) => {
      const chY = chCount <= 1 ? 0 : (idx - (chCount - 1) / 2) * 240;
      const isCollapsed = collapsedChapters.has(ch.id);
      nodes.push({ ...ch, x: 320, y: chY, hasChildren: true, isCollapsed });

      if (!isCollapsed && ch.children) {
        const matChild = ch.children[0];
        if (matChild) nodes.push({ ...matChild, x: 620, y: chY - 60 });
        const qChild = ch.children[1];
        if (qChild) nodes.push({ ...qChild, x: 620, y: chY + 60 });
      }
    });
    return nodes;
  }, [tree, collapsedChapters]);

  // ─── SVG Connection Paths ──────────────────────────────────────────
  const connections = useMemo(() => {
    const paths: any[] = [];
    paths.push({ id: 'conn-syllabus-clos', d: getHorizontalBezierPath(1500 - 120, 1500, 1500 - 320 + 120, 1500 - 100), status: tree.clos.status });
    paths.push({ id: 'conn-syllabus-knowledgebase', d: getHorizontalBezierPath(1500 - 120, 1500, 1500 - 320 + 120, 1500 + 100), status: tree.knowledgeBase.status });
    paths.push({ id: 'conn-syllabus-matrix', d: getVerticalBezierPath(1500, 1500 + 37, 1500, 1500 + 260 - 37), status: tree.matrix.status });

    const chCount = tree.chapters.length;
    tree.chapters.forEach((ch, idx) => {
      const chY = chCount <= 1 ? 0 : (idx - (chCount - 1) / 2) * 240;
      const isCollapsed = collapsedChapters.has(ch.id);
      paths.push({ id: `conn-syllabus-${ch.id}`, d: getHorizontalBezierPath(1500 + 120, 1500, 1500 + 320 - 120, 1500 + chY), status: ch.status });

      if (!isCollapsed && ch.children) {
        const matChild = ch.children[0];
        if (matChild) paths.push({ id: `conn-${ch.id}-materials`, d: getHorizontalBezierPath(1500 + 320 + 120, 1500 + chY, 1500 + 620 - 120, 1500 + chY - 60), status: matChild.status });
        const qChild = ch.children[1];
        if (qChild) paths.push({ id: `conn-${ch.id}-questions`, d: getHorizontalBezierPath(1500 + 320 + 120, 1500 + chY, 1500 + 620 - 120, 1500 + chY + 60), status: qChild.status });
      }
    });
    return paths;
  }, [tree, collapsedChapters]);

  // ─── Pan/Zoom Controls ─────────────────────────────────────────────
  const resetCenter = () => {
    setZoom(1.0);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({ x: rect.width / 2 - 1500, y: rect.height / 2 - 1500 });
    }
  };

  useEffect(() => {
    if (viewMode === 'mindmap' && !loading) {
      const timer = setTimeout(resetCenter, 100);
      return () => clearTimeout(timer);
    }
  }, [viewMode, loading]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.roadmap-node') || target.closest('.roadmap-controls') ||
        target.closest('.roadmap-sidebar') || target.closest('.roadmap-back-btn') ||
        target.closest('.roadmap-logout-btn')) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: Math.max(-1500 - 300, Math.min(rect.width - 1500 + 300, newX)),
        y: Math.max(-1500 - 300, Math.min(rect.height - 1500 + 300, newY)),
      });
    } else {
      setPan({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      const intensity = Math.min(Math.abs(delta) * 0.0008, 0.05);
      const factor = 1 + intensity;
      setZoom(prev => delta < 0 ? Math.min(prev * factor, 2.0) : Math.max(prev / factor, 0.4));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const toggleChapterCollapse = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const zoomIn = () => setZoom(prev => Math.min(prev * 1.15, 2.0));
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.15, 0.4));

  if (loading) {
    return (
      <div className="roadmap-page">
        <div className="roadmap-loading">
          <div className="roadmap-spinner" />
          <span>Đang tải lộ trình môn học…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="roadmap-page">

      {/* ── Progress Bar ── */}
      <div className="roadmap-progress-bar-container">
        <div className="roadmap-progress-label">
          Tiến độ thiết kế bài giảng: {progress}%
        </div>
        <div className="roadmap-progress-track">
          <div className="roadmap-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── View Mode Toggle ── */}
      <div className="roadmap-view-mode-toggle-container">
        <button 
          className={`roadmap-view-toggle-btn ${viewMode === 'checklist' ? 'active' : ''}`}
          onClick={() => setViewMode('checklist')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <ClipboardList size={16} /> Bảng tiến độ & Tải đầu ra (Khuyên dùng)
        </button>
        <button 
          className={`roadmap-view-toggle-btn ${viewMode === 'mindmap' ? 'active' : ''}`}
          onClick={() => setViewMode('mindmap')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Network size={16} /> Sơ đồ Tư duy (Mạng lưới)
        </button>
      </div>

      {viewMode === 'checklist' ? (
        <div className="roadmap-checklist-container animate-fade-in">
          {/* Dashboard Summary Card */}
          <div className="checklist-summary-card">
            <div className="checklist-summary-header">
              <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 className="checklist-summary-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Library size={20} style={{ color: '#3b82f6' }} /> Trung tâm Tải học liệu & Đề thi
                </h3>
                <span className="checklist-summary-subtitle">Đảm bảo chuẩn sư phạm VinUni</span>
              </div>
              <div className="checklist-bulk-actions">
                <button onClick={handleExportZIPPackage} disabled={downloadingZip} className="checklist-bulk-btn zip-package" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={14} /> {downloadingZip ? 'Đang đóng gói...' : 'Tải Trọn bộ Môn học (.zip)'}
                </button>
                <button onClick={handleExportCourseLessonPlan} className="checklist-bulk-btn lesson-plan" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <BookOpen size={14} /> Tải Giáo án Cả khóa (.md)
                </button>
                <button onClick={handleExportCourseQuestions} className="checklist-bulk-btn questions" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={14} /> Tải Đề thi Cả khóa (.md)
                </button>
              </div>
            </div>
            <p className="checklist-summary-desc">
              Hệ thống đã chuẩn hóa đầu ra theo chuẩn học thuật VinUni. Bạn có thể theo dõi tiến độ hoàn thiện của từng chương và tải trực tiếp các tệp tin bài giảng (.pptx), kịch bản giảng dạy active learning và bộ câu hỏi MCQ bên dưới.
            </p>
          </div>

          {/* Chapter Table */}
          <div className="checklist-table-wrapper">
            <table className="checklist-table">
              <thead>
                <tr>
                  <th>Chương học</th>
                  <th>Slide bài giảng (.pptx)</th>
                  <th>Giáo án Active Learning</th>
                  <th>Ngân hàng Đề thi (MCQ)</th>
                  <th>Gợi ý hành động tiếp theo</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((ch, idx) => {
                  const hasSlide = !!materialsMap[ch.id]?.hasSlide;
                  const hasScript = !!materialsMap[ch.id]?.hasScript;
                  const chQuestions = questions.filter(q => q.chapter_id === ch.id);
                  const hasQ = chQuestions.length > 0;
                  
                  // Compute dynamic guide
                  let nextActionGuide = "";
                  let guideClass = "guide-info";
                  if (!hasSlide && !hasScript && !hasQ) {
                    nextActionGuide = "Chương học trống. Hãy chọn 'Biên soạn' tại cột Slide để AI gợi ý bài soạn.";
                    guideClass = "guide-pending";
                  } else if (hasSlide && !hasScript) {
                    nextActionGuide = "Đã soạn Slide nhưng thiếu Kịch bản giảng dạy. Hãy nhấp 'Biên soạn' tại cột Giáo án.";
                    guideClass = "guide-warning";
                  } else if (hasSlide && hasScript && !hasQ) {
                    nextActionGuide = "Học liệu đã xong. Hãy tạo bộ câu hỏi thi trắc nghiệm để hoàn thiện chương học.";
                    guideClass = "guide-warning";
                  } else if (hasSlide && hasScript && hasQ) {
                    nextActionGuide = "Chương học đã hoàn thiện 100%. Toàn bộ file slide, giáo án và đề thi đã sẵn sàng tải về!";
                    guideClass = "guide-success";
                  } else {
                    nextActionGuide = "Tiến độ đang hoàn thiện. Tiếp tục bổ sung nội dung slide bài soạn.";
                    guideClass = "guide-info";
                  }

                  return (
                    <tr key={ch.id}>
                      <td className="col-chapter">
                        <div className="chapter-order">Chương {idx + 1}</div>
                        <div className="chapter-title" title={ch.title}>{ch.title}</div>
                      </td>
                      
                      <td className="col-slides">
                        <div className="status-badge-row">
                          <span className={`status-badge ${hasSlide ? 'status-done' : 'status-pending'}`}>
                            {hasSlide ? '🟢 Đã soạn' : '⚪ Chưa soạn'}
                          </span>
                        </div>
                        <div className="action-buttons-row">
                          <button 
                            onClick={() => handleExportPPTX(ch.id)}
                            disabled={!hasSlide || downloadingChapterId === ch.id}
                            className="checklist-action-btn pptx"
                            title="Tải slide PowerPoint của chương này"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                          >
                            {downloadingChapterId === ch.id ? 'Tải...' : <><Download size={13} /> Tải PPTX</>}
                          </button>
                          <button 
                            onClick={() => onNavigate('lesson_planner', ch.id)}
                            className="checklist-action-btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                          >
                            <Pencil size={13} /> Biên soạn
                          </button>
                        </div>
                      </td>

                      <td className="col-lesson-plan">
                        <div className="status-badge-row">
                          <span className={`status-badge ${hasScript ? 'status-done' : 'status-pending'}`}>
                            {hasScript ? '🟢 Đã soạn' : '⚪ Chưa soạn'}
                          </span>
                        </div>
                        <div className="action-buttons-row">
                          <button 
                            onClick={() => handleExportLessonPlan(ch.id)}
                            disabled={!hasScript}
                            className="checklist-action-btn script"
                            title="In hoặc lưu file PDF giáo án bài giảng tương tác"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                          >
                            <Printer size={13} /> In Giáo án
                          </button>
                          <button 
                            onClick={() => onNavigate('lesson_planner', ch.id)}
                            className="checklist-action-btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                          >
                            <Pencil size={13} /> Biên soạn
                          </button>
                        </div>
                      </td>

                      <td className="col-questions">
                        <div className="status-badge-row">
                          <span className={`status-badge ${hasQ ? 'status-done' : 'status-pending'}`}>
                            {hasQ ? `🟢 Đã có (${chQuestions.length} câu)` : '⚪ Chưa có'}
                          </span>
                        </div>
                        <div className="action-buttons-row">
                          <button 
                            onClick={() => roadmapData.handleExportChapterExam(ch.id, ch.title)}
                            disabled={!hasQ}
                            className="checklist-action-btn questions"
                            title="Tải ngân hàng câu hỏi trắc nghiệm của chương"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                          >
                            <Download size={13} /> Tải Đề thi
                          </button>
                          <button 
                            onClick={() => onNavigate('question_bank', ch.id)}
                            className="checklist-action-btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                          >
                            <Plus size={13} /> Tạo câu hỏi
                          </button>
                        </div>
                      </td>

                      <td className="col-guide">
                        <div className={`guide-box ${guideClass}`}>
                          {nextActionGuide}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Spatial Mind Map Viewport */
        <div
          ref={containerRef}
          className={`roadmap-viewport ${isDragging ? 'roadmap-viewport--dragging' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={canvasRef}
            className="roadmap-canvas"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <div className="roadmap-grid" />

            <svg className="roadmap-svg-overlay">
              {connections.map(conn => (
                <g key={conn.id}>
                  {conn.status !== 'pending' && (
                    <path d={conn.d} className={`roadmap-path-glow roadmap-path--${conn.status}`} />
                  )}
                  <path d={conn.d} className={`roadmap-path-main roadmap-path--${conn.status}`} />
                  {conn.status === 'done' && (
                    <circle r="3.5" className="roadmap-path-pulse">
                      <animateMotion dur="4s" repeatCount="indefinite" path={conn.d} />
                    </circle>
                  )}
                </g>
              ))}
            </svg>

            {positionedNodes.map(node => (
              <div
                key={node.id}
                className="roadmap-node-wrapper"
                style={{
                  left: `${1500 + node.x - 120}px`,
                  top: `${1500 + node.y - 37}px`,
                  position: 'absolute',
                }}
              >
                <TreeNode
                  node={node}
                  onSelect={setSelectedNode}
                  onToggleCollapse={toggleChapterCollapse}
                  isCollapsed={node.isCollapsed}
                  hasChildren={node.hasChildren}
                />
              </div>
            ))}
          </div>

          <div className="roadmap-controls">
            <button className="roadmap-control-btn" onClick={zoomIn} title="Phóng to"><Plus size={16} /></button>
            <button className="roadmap-control-btn" onClick={zoomOut} title="Thu nhỏ"><Minus size={16} /></button>
            <button className="roadmap-control-btn" onClick={resetCenter} title="Căn giữa"><Target size={16} /></button>
            <span className="roadmap-zoom-indicator">{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      )}

      <RoadmapSidebar
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onNavigate={onNavigate}
        clos={clos}
        questions={questions}
        course={course}
        onOpenWorkspace={roadmapData.handleOpenWorkspace}
      />
      <RoadmapWorkspace
        course={course}
        {...roadmapData}
      />
    </div>
  );
}
