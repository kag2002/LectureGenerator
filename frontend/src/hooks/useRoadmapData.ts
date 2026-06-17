/**
 * useRoadmapData — Custom hook for CourseRoadmap data management.
 * 
 * Extracted from CourseRoadmap.tsx to separate:
 * - Data fetching (CLOs, chapters, questions, matrix, materials)
 * - Tree data structure building
 * - Progress calculation
 * - Workspace state & CRUD handlers (materials, questions, CLOs, RAG docs)
 */
import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import { Course, CLO, Chapter } from '@/types';

export interface RoadmapWorkspaceState {
  workspaceNode: any | null;
  localSlideContent: string;
  localActiveScript: string;
  localClos: CLO[];
  localQuestions: any[];
  localRagDocs: string[];
  uploadFile: File | null;
  uploading: boolean;
  editingQuestion: any | null;
  materialTab: 'slides' | 'script';
  isDragOver: boolean;
  workspaceSaving: boolean;
  workspaceError: string;
  workspaceMessage: string;
}

export function useRoadmapData(course: Course) {
  // ─── Core Data ──────────────────────────────────────────────────
  const [clos, setClos] = useState<CLO[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [materialsMap, setMaterialsMap] = useState<Record<number, { hasSlide: boolean; hasScript: boolean }>>({});
  const [matrixData, setMatrixData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  // ─── Workspace States ──────────────────────────────────────────
  const [workspaceNode, setWorkspaceNode] = useState<any | null>(null);
  const [localSlideContent, setLocalSlideContent] = useState('');
  const [localActiveScript, setLocalActiveScript] = useState('');
  const [localClos, setLocalClos] = useState<CLO[]>([]);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [localRagDocs, setLocalRagDocs] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localQuestions, setLocalQuestions] = useState<any[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [materialTab, setMaterialTab] = useState<'slides' | 'script'>('slides');
  const [isDragOver, setIsDragOver] = useState(false);

  // ─── Fetch all data on mount ───────────────────────────────────
  useEffect(() => {
    if (!course) return;
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      try {
        const [closRes, outlineRes, questionsRes, matrixRes] = await Promise.allSettled([
          client.get(`/api/courses/${course.id}/clos`),
          client.get(`/api/courses/${course.id}/chapters`),
          client.get(`/api/courses/${course.id}/questions`),
          client.get(`/api/courses/${course.id}/matrix-coverage`),
        ]);

        if (cancelled) return;

        const closData = closRes.status === 'fulfilled' ? closRes.value.data : [];
        const chaptersData = outlineRes.status === 'fulfilled' ? outlineRes.value.data : [];
        const questionsData = questionsRes.status === 'fulfilled' ? questionsRes.value.data : [];
        const matrixObj = matrixRes.status === 'fulfilled' ? matrixRes.value.data : null;

        setClos(Array.isArray(closData) ? closData : []);
        setChapters(Array.isArray(chaptersData) ? chaptersData : []);
        setQuestions(Array.isArray(questionsData) ? questionsData : []);
        setMatrixData(matrixObj);

        // Fetch materials for each chapter
        const matMap: Record<number, { hasSlide: boolean; hasScript: boolean }> = {};
        if (Array.isArray(chaptersData)) {
          const matPromises = chaptersData.map(ch =>
            client.get(`/api/courses/chapters/${ch.id}/materials`)
              .then(r => {
                matMap[ch.id] = {
                  hasSlide: !!(r.data && r.data.slide_content?.trim()),
                  hasScript: !!(r.data && r.data.active_learning_script?.trim())
                };
              })
              .catch(() => {
                matMap[ch.id] = { hasSlide: false, hasScript: false };
              })
          );
          await Promise.allSettled(matPromises);
        }
        if (!cancelled) setMaterialsMap(matMap);
      } catch (err) {
        console.error('Roadmap fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    const handleDbChanged = () => {
      fetchAll();
    };
    window.addEventListener('db-state-changed', handleDbChanged);
    return () => { 
      cancelled = true; 
      window.removeEventListener('db-state-changed', handleDbChanged);
    };
  }, [course]);

  // ─── Drag and drop event handlers ──────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setUploadFile(file);
      setWorkspaceMessage(`Đã nhận diện tệp: ${file.name} (vui lòng nhấn "Tải lên" để nạp vector)`);
    }
  };

  // ─── Workspace CRUD Handlers ───────────────────────────────────

  const handleAiGenerateMaterials = async () => {
    if (!workspaceNode) return;
    setWorkspaceSaving(true);
    setWorkspaceError('');
    setWorkspaceMessage('AI đang phân tích tài liệu và tự động soạn thảo slide + kịch bản giảng dạy… Vui lòng đợi trong giây lát.');
    const chapterId = parseInt(workspaceNode.id.split('_')[1]);
    try {
      const res = await client.post(`/api/courses/chapters/${chapterId}/generate-materials`, {
        class_size: 40, has_wifi: true, furniture_type: "movable",
        language: "vi", session_duration: 90
      });
      setLocalSlideContent(res.data.slide_content || '');
      setLocalActiveScript(res.data.active_learning_script || '');
      setMaterialsMap(prev => ({
        ...prev,
        [chapterId]: {
          hasSlide: !!(res.data.slide_content?.trim()),
          hasScript: !!(res.data.active_learning_script?.trim())
        }
      }));
      setWorkspaceMessage('AI đã sinh học liệu bài giảng thành công!');
    } catch (err: any) {
      console.error(err);
      setWorkspaceError(err.response?.data?.detail || 'Lỗi khi AI sinh học liệu.');
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleAiGenerateQuestions = async () => {
    if (!workspaceNode) return;
    setWorkspaceSaving(true);
    setWorkspaceError('');
    setWorkspaceMessage('AI đang lập ngân hàng câu hỏi trắc nghiệm và thực hiện giải chéo lỗi (Self-Correction)…');
    const chapterId = parseInt(workspaceNode.id.split('_')[1]);
    try {
      await client.post(`/api/courses/${course.id}/questions/generate`, {
        chapter_id: chapterId, bloom_level: 3, count: 5,
        fast_mode: false, clo_id: clos[0]?.id || null
      });
      const qRes = await client.get(`/api/courses/${course.id}/questions`);
      setQuestions(qRes.data || []);
      setLocalQuestions((qRes.data || []).filter((q: any) => q.chapter_id === chapterId));
      setWorkspaceMessage('AI đã sinh thành công 5 câu hỏi trắc nghiệm!');
    } catch (err: any) {
      console.error(err);
      setWorkspaceError(err.response?.data?.detail || 'Lỗi khi AI sinh câu hỏi.');
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleAiSuggestClos = () => {
    setWorkspaceMessage('AI đang tạo danh sách chuẩn đầu ra CLOs tham chiếu chuẩn giáo dục VinUni…');
    const courseCode = course.course_code || 'CS101';
    const courseName = course.course_name || 'Học phần mới';
    
    const suggested = [
      { id: 0, clo_code: 'CLO1', bloom_level: 2,
        description: `Giải thích được các nguyên lý lý thuyết, mô hình kiến trúc và giải thuật vận hành cơ bản của học phần ${courseName}.` },
      { id: 0, clo_code: 'CLO2', bloom_level: 3,
        description: `Áp dụng phương pháp luận và kỹ thuật học phần để xây dựng giải pháp thực tế giải quyết các bài toán môn ${courseName}.` },
      { id: 0, clo_code: 'CLO3', bloom_level: 4,
        description: `Phân tích, phản biện và đo lường hiệu quả hoạt động các thuật toán/mô hình thiết kế trong phạm vi học phần ${courseCode}.` },
      { id: 0, clo_code: 'CLO4', bloom_level: 6,
        description: `Sáng tạo, thiết kế cấu trúc hệ thống và tích hợp các kỹ năng chuyên nghiệp để hoàn thiện đề án môn học thực tiễn.` },
    ];
    
    setLocalClos(suggested);
    setWorkspaceMessage('Đã điền danh sách CLOs mẫu chuẩn hóa! Hãy rà soát nội dung và nhấn "Lưu & Khớp dữ liệu CLOs".');
  };

  const handleOpenWorkspace = async (node: any) => {
    setWorkspaceNode(node);
    setWorkspaceError('');
    setWorkspaceMessage('');
    setEditingQuestion(null);
    setUploadFile(null);
    setMaterialTab('slides');

    const nodeId = node.id;
    if (nodeId.startsWith('materials_') || nodeId.startsWith('chapter_')) {
      const chapterId = parseInt(nodeId.split('_')[1]);
      setLoading(true);
      try {
        const res = await client.get(`/api/courses/chapters/${chapterId}/materials`);
        setLocalSlideContent(res.data.slide_content || '');
        setLocalActiveScript(res.data.active_learning_script || '');
      } catch (err) {
        console.error("Error loading workspace materials:", err);
      } finally {
        setLoading(false);
      }
    } else if (nodeId === 'clos' || nodeId === 'syllabus') {
      setLocalClos([...clos]);
    } else if (nodeId.startsWith('questions_')) {
      const chapterId = parseInt(nodeId.split('_')[1]);
      setLocalQuestions(questions.filter(q => q.chapter_id === chapterId));
    } else if (nodeId === 'knowledge_base') {
      setLoading(true);
      try {
        const res = await client.get(`/api/courses/${course.id}/documents`);
        setLocalRagDocs(res.data.documents || []);
      } catch (err) {
        console.error("Error loading workspace RAG docs:", err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSaveWorkspaceMaterials = async () => {
    if (!workspaceNode) return;
    setWorkspaceSaving(true);
    setWorkspaceError('');
    setWorkspaceMessage('');
    const chapterId = parseInt(workspaceNode.id.split('_')[1]);
    try {
      await client.put(`/api/courses/chapters/${chapterId}/materials`, {
        slide_content: localSlideContent,
        active_learning_script: localActiveScript
      });
      setMaterialsMap(prev => ({
        ...prev,
        [chapterId]: {
          hasSlide: !!localSlideContent.trim(),
          hasScript: !!localActiveScript.trim()
        }
      }));
      setWorkspaceMessage('Lưu học liệu bài giảng thành công!');
      setTimeout(() => setWorkspaceNode(null), 1000);
    } catch (err: any) {
      console.error(err);
      setWorkspaceError('Lỗi khi lưu học liệu.');
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleSaveWorkspaceClos = async () => {
    setWorkspaceSaving(true);
    setWorkspaceError('');
    setWorkspaceMessage('');
    try {
      await client.put(`/api/courses/${course.id}`, {
        course_code: course.course_code,
        course_name: course.course_name,
        required_textbooks: course.description || '',
        recommended_readings: ''
      });
      
      const textData = JSON.stringify({ clos: localClos });
      const blob = new Blob([`{"clos": ${textData}}`], { type: 'text/plain' });
      const jsonFile = new window.File([blob], 'syllabus_updated.txt', { type: 'text/plain' });
      
      const formData = new FormData();
      formData.append('file', jsonFile);
      
      await client.post(`/api/courses/${course.id}/parse-syllabus`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const res = await client.get(`/api/courses/${course.id}/clos`);
      setClos(res.data);
      
      setWorkspaceMessage('Cập nhật danh sách CLOs môn học thành công!');
      setTimeout(() => setWorkspaceNode(null), 1000);
    } catch (err: any) {
      console.error(err);
      setWorkspaceError('Lỗi khi lưu danh sách CLOs.');
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleSaveWorkspaceQuestion = async (q: any) => {
    setWorkspaceError('');
    setWorkspaceMessage('');
    if (!q.question_text.trim()) {
      setWorkspaceError('Nội dung câu hỏi không được trống.');
      return;
    }
    if (q.options.some((opt: string) => !opt.trim())) {
      setWorkspaceError('Vui lòng nhập đủ 4 phương án lựa chọn.');
      return;
    }
    if (!q.correct_answer.trim()) {
      setWorkspaceError('Vui lòng chọn đáp án đúng.');
      return;
    }
    try {
      const chapterId = parseInt(workspaceNode.id.split('_')[1]);
      if (q.id === 'new') {
        const res = await client.post(`/api/courses/${course.id}/questions`, {
          chapter_id: chapterId,
          question_text: q.question_text,
          options_json: JSON.stringify(q.options),
          correct_answer: q.correct_answer,
          bloom_level: parseInt(q.bloom_level.toString()),
          clo_id: q.clo_id ? parseInt(q.clo_id.toString()) : null
        });
        setQuestions(prev => [...prev, res.data]);
        setLocalQuestions(prev => prev.map(item => item.id === 'new' ? res.data : item));
        setWorkspaceMessage('Tạo câu hỏi thành công!');
      } else {
        const res = await client.put(`/api/courses/questions/${q.id}`, {
          question_text: q.question_text,
          options_json: JSON.stringify(q.options),
          correct_answer: q.correct_answer,
          bloom_level: parseInt(q.bloom_level.toString()),
          clo_id: q.clo_id ? parseInt(q.clo_id.toString()) : null
        });
        setQuestions(prev => prev.map(item => item.id === q.id ? res.data : item));
        setLocalQuestions(prev => prev.map(item => item.id === q.id ? res.data : item));
        setWorkspaceMessage('Cập nhật câu hỏi thành công!');
      }
      setEditingQuestion(null);
    } catch (err: any) {
      console.error(err);
      setWorkspaceError('Lỗi khi lưu câu hỏi.');
    }
  };

  const handleDeleteWorkspaceQuestion = async (qId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) return;
    setWorkspaceError('');
    setWorkspaceMessage('');
    try {
      await client.delete(`/api/courses/questions/${qId}`);
      setQuestions(prev => prev.filter(item => item.id !== qId));
      setLocalQuestions(prev => prev.filter(item => item.id !== qId));
      setWorkspaceMessage('Đã xóa câu hỏi.');
    } catch (err) {
      console.error(err);
      setWorkspaceError('Lỗi khi xóa câu hỏi.');
    }
  };

  const handleUploadWorkspaceDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setWorkspaceError('');
    setWorkspaceMessage('');
    const formData = new FormData();
    formData.append('file', uploadFile);
    try {
      await client.post(`/api/courses/${course.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setLocalRagDocs([uploadFile.name, ...localRagDocs]);
      setUploadFile(null);
      setWorkspaceMessage('Nạp tài liệu nguồn thành công!');
    } catch (err) {
      console.error(err);
      setWorkspaceError('Lỗi khi tải tài liệu lên RAG.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteWorkspaceDoc = async (fileName: string) => {
    if (!confirm(`Bạn muốn xóa tài liệu tham chiếu '${fileName}'?`)) return;
    setWorkspaceError('');
    setWorkspaceMessage('');
    try {
      await client.delete(`/api/courses/${course.id}/documents/${fileName}`);
      setLocalRagDocs(localRagDocs.filter(d => d !== fileName));
      setWorkspaceMessage('Đã xóa tài liệu khỏi Vector DB.');
    } catch (err) {
      console.error(err);
      setWorkspaceError('Lỗi khi xóa tài liệu.');
    }
  };

  const handleCreateChapter = async (title: string, description: string) => {
    try {
      const nextSortOrder = chapters.length > 0
        ? Math.max(...chapters.map((c: any) => c.sort_order || 0)) + 1
        : 1;
      const res = await client.post(`/api/courses/${course.id}/chapters`, {
        title,
        description,
        sort_order: nextSortOrder
      });
      setChapters(prev => [...prev, res.data].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)));
      window.dispatchEvent(new CustomEvent('db-state-changed'));
      return res.data;
    } catch (err: any) {
      console.error(err);
      throw new Error(err.response?.data?.detail || 'Lỗi khi tạo chương học.');
    }
  };

  const handleUpdateChapter = async (chapterId: number, title: string, description: string, sortOrder: number) => {
    try {
      const res = await client.put(`/api/courses/chapters/${chapterId}`, {
        title,
        description,
        sort_order: sortOrder
      });
      setChapters(prev => prev.map(c => c.id === chapterId ? res.data : c).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)));
      window.dispatchEvent(new CustomEvent('db-state-changed'));
      return res.data;
    } catch (err: any) {
      console.error(err);
      throw new Error(err.response?.data?.detail || 'Lỗi khi cập nhật chương học.');
    }
  };

  const handleDeleteChapter = async (chapterId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa chương học này? Toàn bộ slide bài soạn, kịch bản tương tác và câu hỏi thuộc chương này cũng sẽ bị xóa.')) return;
    try {
      await client.delete(`/api/courses/chapters/${chapterId}`);
      setChapters(prev => prev.filter(c => c.id !== chapterId));
      window.dispatchEvent(new CustomEvent('db-state-changed'));
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Lỗi khi xóa chương học.');
    }
  };

  return {
    handleCreateChapter,
    handleUpdateChapter,
    handleDeleteChapter,

    // Core data
    clos, chapters, questions, materialsMap, matrixData, loading,
    selectedNode, setSelectedNode,

    // Workspace state
    workspaceNode, setWorkspaceNode,
    localSlideContent, setLocalSlideContent,
    localActiveScript, setLocalActiveScript,
    localClos, setLocalClos,
    localQuestions, setLocalQuestions,
    localRagDocs, setLocalRagDocs,
    uploadFile, setUploadFile,
    uploading,
    editingQuestion, setEditingQuestion,
    materialTab, setMaterialTab,
    isDragOver,
    workspaceSaving, workspaceError, workspaceMessage,

    // Drag handlers
    handleDragOver, handleDragLeave, handleDrop,

    // Workspace CRUD handlers
    handleOpenWorkspace,
    handleAiGenerateMaterials,
    handleAiGenerateQuestions,
    handleAiSuggestClos,
    handleSaveWorkspaceMaterials,
    handleSaveWorkspaceClos,
    handleSaveWorkspaceQuestion,
    handleDeleteWorkspaceQuestion,
    handleUploadWorkspaceDoc,
    handleDeleteWorkspaceDoc,
    
    // Client-side export handler
    handleExportChapterExam: (chapterId: number, chapterTitle: string) => {
      const chQuestions = questions.filter(q => q.chapter_id === chapterId);
      if (chQuestions.length === 0) {
        alert('Chưa có câu hỏi nào để xuất bản cho chương này.');
        return;
      }
      
      const escapeGift = (text: string) => {
        return text.replace(/[{}[\]~=#:\/]/g, '\\$&');
      };

      let content = `// Ngân hàng câu hỏi trắc nghiệm - Chương: ${chapterTitle || ''}\n`;
      content += `// Môn học: ${course.course_name} (${course.course_code})\n`;
      content += `// Số lượng câu hỏi: ${chQuestions.length} câu\n\n`;
      
      chQuestions.forEach((q) => {
        const qText = escapeGift(q.question_text || '');
        let opts: string[] = [];
        if (q.options_json) {
          try {
            opts = JSON.parse(q.options_json);
          } catch(e) {
            opts = [];
          }
        }
        
        const giftOptions = opts.map(opt => {
          const optEscaped = escapeGift(opt);
          if (opt.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()) {
            return `=${optEscaped}`;
          }
          return `~${optEscaped}`;
        });

        // Fallback if correct_answer was letter matching index (e.g., 'A', 'B', 'C', 'D')
        const hasCorrect = giftOptions.some(o => o.startsWith('='));
        if (!hasCorrect && ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'].includes(q.correct_answer.trim())) {
          const idx = q.correct_answer.trim().toUpperCase().charCodeAt(0) - 65;
          if (idx < giftOptions.length) {
            giftOptions[idx] = '=' + giftOptions[idx].slice(1);
          }
        }

        // Ultimate fallback
        const hasCorrectFinal = giftOptions.some(o => o.startsWith('='));
        if (!hasCorrectFinal && giftOptions.length > 0) {
          giftOptions[0] = '=' + giftOptions[0].slice(1);
        }

        content += `${qText} {${giftOptions.join(' ')}}` + '\n\n';
      });
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `De_thi_${course.course_code}_Chuong_${chapterId}.gift`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
}
