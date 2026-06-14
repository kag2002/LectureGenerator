import { useState, useEffect, useRef } from 'react';
import client from '../api/client';
import { Course, CLO, Chapter } from '@/types';
import { useMaterialsStream } from './useMaterialsStream';
import { useAcademicSearch } from './useAcademicSearch';

export interface LessonPlannerStateOptions {
  course: Course;
  initialChapterId: number | null;
  initialCloId: number | null;
  initialCloCode: string | null;
  initialBloomLevel: number | null;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: string, extra?: any) => void;
  onGoToQuestionBank?: () => void;
  onRecordAIUsage: (usage: {
    operation: string;
    model?: string;
    latency: number;
    cost?: number;
    tokens?: { prompt: number; completion: number };
    status: 'success' | 'error';
  }) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
}

export function useLessonPlannerState({
  course,
  initialChapterId,
  initialCloId,
  initialCloCode,
  initialBloomLevel,
  onBack,
  onLogout,
  onNavigate,
  onGoToQuestionBank,
  onRecordAIUsage,
  setAIProcessingStatus
}: LessonPlannerStateOptions) {
  // Navigation & States
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [activeLeftTab, setActiveLeftTab] = useState<'outline' | 'documents' | 'compliance' | 'mcqs' | 'citations'>('outline');
  const [clos, setClos] = useState<CLO[]>([]);
  const [ragReferences, setRagReferences] = useState<any[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<any | null>(null);
  const [citationTab, setCitationTab] = useState<'chunk' | 'full'>('chunk');
  const [viewingFullDocName, setViewingFullDocName] = useState<string | null>(null);
  const [fullDocContent, setFullDocContent] = useState('');
  const [fullDocLoading, setFullDocLoading] = useState(false);
  const [activeWorkTab, setActiveWorkTab] = useState<'slides' | 'active_learning'>('slides');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedSidebar = localStorage.getItem('planner_show_sidebar');
      if (savedSidebar !== null) return savedSidebar === 'true';

      const savedLayout = localStorage.getItem('planner_layout_mode');
      if (savedLayout === 'split' || savedLayout === 'editor') {
        return false;
      }
    }
    return true;
  });

  const [showAIProposal, setShowAIProposal] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedAI = localStorage.getItem('planner_show_ai_proposal');
      if (savedAI !== null) return savedAI === 'true';

      const savedLayout = localStorage.getItem('planner_layout_mode');
      if (savedLayout === 'editor') {
        return false;
      }
    }
    return true;
  });

  const [isZenMode, setIsZenMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedZen = localStorage.getItem('planner_zen_mode');
      return savedZen === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('planner_show_sidebar', String(showSidebar));
  }, [showSidebar]);

  useEffect(() => {
    localStorage.setItem('planner_show_ai_proposal', String(showAIProposal));
  }, [showAIProposal]);

  useEffect(() => {
    localStorage.setItem('planner_zen_mode', String(isZenMode));
  }, [isZenMode]);

  // Chapter material states
  const [slideContent, setSlideContent] = useState('');
  const [activeLearningScript, setActiveLearningScript] = useState('');
  const [savedSlideContent, setSavedSlideContent] = useState('');
  const [savedScript, setSavedScript] = useState('');
  const [slideEditMode, setSlideEditMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [scriptEditMode, setScriptEditMode] = useState<'edit' | 'preview'>('edit');
  const [slideProposalViewMode, setSlideProposalViewMode] = useState<'visual' | 'code'>('visual');
  const [selectedTheme, setSelectedTheme] = useState('warm_academic');
  
  // Document manager states
  const [documents, setDocuments] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // AI Config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [classSize, setClassSize] = useState(40);
  const [hasWifi, setHasWifi] = useState(true);
  const [furnitureType, setFurnitureType] = useState('movable');
  const [sessionDuration, setSessionDuration] = useState(90);

  // Messages & Errors
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Logs & revisions
  const [revisions, setRevisions] = useState<any[]>([]);
  const [chapterMcqs, setChapterMcqs] = useState<any[]>([]);
  const [loadingMcqs, setLoadingMcqs] = useState(false);

  const [editorFontSize, setEditorFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('editorFontSize');
      if (saved === 'sm' || saved === 'md' || saved === 'lg' || saved === 'xl') {
        return saved;
      }
    }
    return 'md';
  });

  useEffect(() => {
    localStorage.setItem('editorFontSize', editorFontSize);
  }, [editorFontSize]);

  // References to preserve state during unmount cleanup
  const slideContentRef = useRef(slideContent);
  const activeLearningScriptRef = useRef(activeLearningScript);
  const savedSlideContentRef = useRef(savedSlideContent);
  const savedScriptRef = useRef(savedScript);
  const selectedChapterRef = useRef<Chapter | null>(selectedChapter);

  useEffect(() => {
    slideContentRef.current = slideContent;
    activeLearningScriptRef.current = activeLearningScript;
    savedSlideContentRef.current = savedSlideContent;
    savedScriptRef.current = savedScript;
    selectedChapterRef.current = selectedChapter;
  }, [slideContent, activeLearningScript, savedSlideContent, savedScript, selectedChapter]);

  // Auto-save on unmount
  useEffect(() => {
    return () => {
      const ch = selectedChapterRef.current;
      const sCont = slideContentRef.current;
      const savedSCont = savedSlideContentRef.current;
      const aScript = activeLearningScriptRef.current;
      const savedSc = savedScriptRef.current;

      if (ch) {
        const hasChanges = sCont !== savedSCont || aScript !== savedSc;
        if (hasChanges) {
          const token = localStorage.getItem('token');
          fetch(`http://localhost:8000/api/courses/chapters/${ch.id}/materials`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              slide_content: sCont,
              active_learning_script: aScript
            })
          }).catch(err => console.error("Auto-save on unmount failed:", err));
        }
      }
    };
  }, []);

  // Auto-switch to split mode on fullscreen and toggle body class
  useEffect(() => {
    if (isFullscreen) {
      setSlideEditMode('split');
      document.body.classList.add('editor-fullscreen');
    } else {
      setSlideEditMode('edit');
      document.body.classList.remove('editor-fullscreen');
    }
    return () => {
      document.body.classList.remove('editor-fullscreen');
    };
  }, [isFullscreen]);

  // Lấy danh sách lịch sử chỉnh sửa
  const loadRevisions = async (chapterId: number) => {
    try {
      const response = await client.get(`/api/courses/chapters/${chapterId}/revisions`);
      setRevisions(response.data || []);
    } catch (err) {
      console.error("Error fetching revisions:", err);
    }
  };

  // Lấy danh sách MCQs của chương hiện tại
  const loadChapterMcqs = async (chapterId: number) => {
    setLoadingMcqs(true);
    try {
      const qRes = await client.get(`/api/courses/${course.id}/questions`);
      const filtered = (qRes.data || []).filter((q: any) => q.chapter_id === chapterId);
      setChapterMcqs(filtered);
    } catch (err) {
      console.error("Error loading chapter MCQs:", err);
    } finally {
      setLoadingMcqs(false);
    }
  };

  // Instantiate sub-hooks
  const stream = useMaterialsStream({
    courseId: course.id,
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
  });

  const search = useAcademicSearch({
    courseId: course.id,
    setDocuments,
    setError,
    setMessage,
    setLoading
  });

  // Fetch chapters & documents list
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const chResponse = await client.get(`/api/courses/${course.id}/chapters`);
      setChapters(chResponse.data);
      if (chResponse.data.length > 0) {
        const found = initialChapterId ? chResponse.data.find((ch: Chapter) => ch.id === initialChapterId) : null;
        handleSelectChapter(found || chResponse.data[0]);
      }
      
      const docResponse = await client.get(`/api/courses/${course.id}/documents`);
      setDocuments(docResponse.data.documents || []);

      // Fetch course CLOs
      const cloResponse = await client.get(`/api/courses/${course.id}/clos`);
      setClos(cloResponse.data || []);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải dữ liệu bài giảng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [course.id]);

  // Đồng bộ hóa chương học được chọn khi prop initialChapterId thay đổi từ Roadmap
  useEffect(() => {
    if (initialChapterId && chapters.length > 0) {
      const found = chapters.find((ch: Chapter) => ch.id === initialChapterId);
      if (found && (!selectedChapter || selectedChapter.id !== found.id)) {
        handleSelectChapter(found);
      }
    }
  }, [initialChapterId, chapters, selectedChapter]);

  // Chọn chương học và load nội dung hiện có
  const handleSelectChapter = async (chapter: Chapter) => {
    // Tự động lưu chương cũ nếu có thay đổi chưa đồng bộ
    if (selectedChapter) {
      const hasChanges = slideContent !== savedSlideContent || activeLearningScript !== savedScript;
      if (hasChanges) {
        try {
          await client.put(`/api/courses/chapters/${selectedChapter.id}/materials`, {
            slide_content: slideContent,
            active_learning_script: activeLearningScript
          });
        } catch (saveErr) {
          console.error("Auto-save failed on chapter switch:", saveErr);
        }
      }
    }

    setSelectedChapter(chapter);
    setError('');
    setMessage('');
    
    try {
      const response = await client.get(`/api/courses/chapters/${chapter.id}/materials`);
      const sCont = response.data.slide_content || '';
      const aScript = response.data.active_learning_script || '';
      
      setSlideContent(sCont);
      setActiveLearningScript(aScript);
      setSavedSlideContent(sCont);
      setSavedScript(aScript);

      // Fetch RAG references for citation matching
      try {
        const ragRes = await client.get(`/api/courses/chapters/${chapter.id}/rag-references`);
        setRagReferences(ragRes.data.references || []);
      } catch (ragErr) {
        console.error("Error loading RAG references:", ragErr);
        setRagReferences([]);
      }

      // Clear academic search result & suggest queries
      search.setSearchResult(null);
      search.setSuggestedQueries([]);
      try {
        const suggestRes = await client.get(`/api/courses/chapters/${chapter.id}/suggest-queries`);
        search.setSuggestedQueries(suggestRes.data.suggestions || []);
      } catch (suggestErr) {
        console.error("Error loading suggested queries:", suggestErr);
      }

      // Tải bổ sung lịch sử và MCQs
      loadRevisions(chapter.id);
      loadChapterMcqs(chapter.id);
    } catch (err) {
      console.error(err);
      setError('Không thể load nội dung chương học.');
    }
  };

  // AI sinh cấu trúc Outline chương học từ CLOs
  const handleGenerateOutline = async () => {
    if (!window.confirm('AI sẽ sinh lại toàn bộ dàn ý chương học dựa trên CLOs. Các chương học cũ sẽ bị ghi đè. Bạn có chắc chắn không?')) return;
    setLoading(true);
    setError('');
    setMessage('');
    
    // Khởi tạo thông báo trạng thái động
    setAIProcessingStatus(true, 'AI đang khởi động quy trình phân tích Syllabus môn học…');
    
    const steps = [
      'AI đang trích xuất danh sách chuẩn đầu ra CLOs…',
      'AI đang cấu trúc hóa phân bổ chương học theo logic từ cơ bản đến nâng cao…',
      'AI đang liên kết chuẩn đầu ra CLOs phù hợp cho từng chương học…',
      'AI đang cân đối mức Bloom cho các hoạt động và mục tiêu trong chương…',
      'AI đang lưu đề cương cấu trúc chương học vào cơ sở dữ liệu…'
    ];
    let currentStepIdx = 0;
    const intervalId = setInterval(() => {
      if (currentStepIdx < steps.length) {
        setAIProcessingStatus(true, steps[currentStepIdx]);
        currentStepIdx++;
      }
    }, 2500);
    
    try {
      const response = await client.post(`/api/courses/${course.id}/generate-outline`);
      setChapters(response.data.chapters);
      if (response.data.chapters.length > 0) {
        handleSelectChapter(response.data.chapters[0]);
      }
      setMessage('Đã sinh cấu trúc chương học bằng AI thành công!');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Không thể sinh cấu trúc Outline.');
    } finally {
      clearInterval(intervalId);
      setLoading(false);
      setAIProcessingStatus(false);
    }
  };

  // Upload tài liệu giáo trình RAG
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    
    setError('');
    setMessage('');
    setLoading(true);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      await client.post(`/api/courses/${course.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocuments([uploadFile.name, ...documents]);
      setUploadFile(null);
      setMessage('Nạp tài liệu nguồn thành công! Vector DB đã được cập nhật.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải tài liệu lên Vector DB.');
    } finally {
      setLoading(false);
    }
  };

  // Xóa tài liệu RAG
  const handleDeleteDocument = async (fileName: string) => {
    if (!window.confirm(`Bạn muốn xóa tài liệu tham chiếu '${fileName}' khỏi RAG?`)) return;
    setError('');
    
    try {
      await client.delete(`/api/courses/${course.id}/documents/${fileName}`);
      setDocuments(documents.filter(d => d !== fileName));
      setMessage('Đã xóa tài liệu khỏi Vector DB.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa tài liệu.');
    }
  };

  // Lưu bản soạn thảo chính của giảng viên xuống DB
  const handleSaveMaterials = async () => {
    if (!selectedChapter) return;
    setError('');
    setMessage('');
    setSaving(true);

    try {
      await client.put(`/api/courses/chapters/${selectedChapter.id}/materials`, {
        slide_content: slideContent,
        active_learning_script: activeLearningScript
      });
      setSavedSlideContent(slideContent);
      setSavedScript(activeLearningScript);
      setMessage('Đã lưu học liệu thành công lên hệ thống Cloud!');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi lưu học liệu.');
    } finally {
      setSaving(false);
    }
  };

  // Reset/Xóa học liệu chương học
  const handleResetMaterials = async () => {
    if (!selectedChapter) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa/reset toàn bộ học liệu (slide + kịch bản) của chương học này không?')) return;

    setError('');
    setMessage('');
    setSaving(true);

    try {
      await client.delete(`/api/courses/chapters/${selectedChapter.id}/materials`);
      setSlideContent('');
      setActiveLearningScript('');
      setSavedSlideContent('');
      setSavedScript('');
      setMessage('Đã xóa/reset học liệu chương thành công.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa học liệu.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportLessonPlan = () => {
    if (!selectedChapter) return;
    const token = localStorage.getItem('token');
    window.open(`http://localhost:8000/api/courses/chapters/${selectedChapter.id}/export-lesson-plan?token=${token}`, '_blank');
  };

  const handleAutoSplitSlide = (slideIndex: number) => {
    const lines = slideContent.split('\n');
    const slideHeaderIndices: number[] = [];
    
    lines.forEach((line, idx) => {
      if (line.trim().startsWith('#')) {
        slideHeaderIndices.push(idx);
      }
    });

    if (slideHeaderIndices.length === 0 || slideIndex >= slideHeaderIndices.length) return;

    const startLineIdx = slideHeaderIndices[slideIndex];
    const endLineIdx = slideIndex === slideHeaderIndices.length - 1 ? lines.length : slideHeaderIndices[slideIndex + 1];

    const slideLines = lines.slice(startLineIdx, endLineIdx);
    
    const bulletIndices: number[] = [];
    slideLines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('*') || trimmed.startsWith('-') || trimmed.startsWith('+') || trimmed.startsWith('•')) {
        bulletIndices.push(idx);
      }
    });

    if (bulletIndices.length <= 1) {
      alert("Không tìm thấy đủ ý gạch đầu dòng để tự động tách slide!");
      return;
    }

    const splitPoint = Math.ceil(bulletIndices.length / 2);
    const splitLineIdxInSlide = bulletIndices[splitPoint];

    const origTitleLine = slideLines[0];
    const cleanTitle = origTitleLine.replace(/^#+\s*/, '').trim();
    const hashPrefix = origTitleLine.match(/^#+/)?.[0] || '#';
    const newSlideTitleLine = `${hashPrefix} ${cleanTitle} (tiếp theo)`;

    const part1Lines = slideLines.slice(0, splitLineIdxInSlide);
    const part2Lines = [newSlideTitleLine, ...slideLines.slice(splitLineIdxInSlide)];

    const newLines = [
      ...lines.slice(0, startLineIdx),
      ...part1Lines,
      ...part2Lines,
      ...lines.slice(endLineIdx)
    ];

    setSlideContent(newLines.join('\n'));
    setMessage(`Đã tự động chia đôi Slide ${slideIndex + 1}!`);
  };

  const handleExportPPTX = async () => {
    if (!selectedChapter) return;
    setError('');
    setMessage('');
    setExporting(true);
    
    setAIProcessingStatus(true, 'Khởi tạo công cụ xuất bản PowerPoint chất lượng cao...');
    
    try {
      const { captureSlidesCanvas } = await import('../utils/slideExporter');
      
      const exportedSlides = await captureSlidesCanvas(
        slideContent,
        selectedTheme,
        (progressMessage) => {
          setAIProcessingStatus(true, `PPT-Master: ${progressMessage}`);
        }
      );
      
      setAIProcessingStatus(true, 'Đang gửi dữ liệu slide lên máy chủ đóng gói...');
      
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:8000/api/courses/chapters/${selectedChapter.id}/export-pptx-canvas`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            slides: exportedSlides,
            theme: selectedTheme
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Lỗi server: ${response.status}`);
      }

      setAIProcessingStatus(true, 'Đang tải file bài giảng (.pptx) xuống máy tính...');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Bai_Giang_Chuong_${selectedChapter.id}.pptx`);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
      
      setMessage('Xuất slide PPTX chất lượng cao thành công!');
    } catch (err: any) {
      console.error(err);
      setError(`Không thể xuất slide PPTX: ${err.message}`);
    } finally {
      setExporting(false);
      setAIProcessingStatus(false);
    }
  };

  const handleCitationClick = async (citationStr: string) => {
    const cleaned = citationStr.replace(/^(Nguon|Nguồn|Source|Ref|Trang|Page):\s*/i, '');
    const parts = cleaned.split(/-\s*(?:Trang|Page|trang|page):\s*/i);
    const fileName = parts[0]?.trim();
    const pageNum = parts[1] ? parseInt(parts[1].trim()) : null;

    setCitationTab('chunk');
    setFullDocContent('');
    setViewingFullDocName(null);

    let matchedRef: any = null;
    if (ragReferences && ragReferences.length > 0) {
      matchedRef = ragReferences.find(ref => {
        const refFile = ref.file_name?.toLowerCase();
        const refPage = ref.page_number;
        const fileMatch = refFile && fileName && (refFile.includes(fileName.toLowerCase()) || fileName.toLowerCase().includes(refFile));
        const pageMatch = pageNum === null || refPage === pageNum;
        return fileMatch && pageMatch;
      });
    }

    if (matchedRef) {
      setSelectedCitation({
        citation: citationStr,
        fileName: matchedRef.file_name,
        pageNumber: matchedRef.page_number,
        text: matchedRef.text,
        loading: false
      });
    } else if (fileName && pageNum !== null) {
      setSelectedCitation({
        citation: citationStr,
        fileName: fileName,
        pageNumber: pageNum,
        text: "Đang tải dữ liệu đoạn trích từ hệ thống...",
        loading: true
      });

      try {
        const response = await client.get(`/api/courses/${course.id}/documents/${encodeURIComponent(fileName)}/pages/${pageNum}/chunk`);
        if (response.data && response.data.text) {
          setSelectedCitation({
            citation: citationStr,
            fileName: fileName,
            pageNumber: pageNum,
            text: response.data.text,
            loading: false
          });
        } else {
          setSelectedCitation({
            citation: citationStr,
            fileName: fileName,
            pageNumber: pageNum,
            text: "Không tìm thấy nội dung đoạn trích gốc cho trang tài liệu này. Có thể tệp đã bị xóa hoặc trang không còn tồn tại.",
            loading: false
          });
        }
      } catch (err) {
        console.error("Error fetching dynamic citation fallback:", err);
        setSelectedCitation({
          citation: citationStr,
          fileName: fileName,
          pageNumber: pageNum,
          text: "Đã xảy ra lỗi khi kết nối máy chủ để tải đoạn trích trích dẫn.",
          loading: false
        });
      }
    } else {
      setSelectedCitation({
        citation: citationStr,
        fileName: fileName || "Không rõ tài liệu",
        pageNumber: pageNum || "N/A",
        text: "Không tìm thấy nội dung đoạn trích gốc trong Vector DB của chương học này. Có thể slide này được trích xuất từ tài liệu khác hoặc cấu trúc trang không khớp.",
        loading: false
      });
    }
  };

  const handleLoadFullDocument = async (fileName: string) => {
    if (!fileName || fileName === "Không rõ tài liệu") return;
    setCitationTab('full');
    if (viewingFullDocName === fileName && fullDocContent) {
      return;
    }
    setFullDocLoading(true);
    setFullDocContent('');
    setViewingFullDocName(fileName);
    try {
      const response = await client.get(`/api/courses/${course.id}/documents/${fileName}`);
      setFullDocContent(response.data.content || 'Không có nội dung.');
    } catch (err) {
      console.error(err);
      setFullDocContent('Lỗi khi tải nội dung tài liệu nguồn RAG.');
    } finally {
      setFullDocLoading(false);
    }
  };

  const parseActiveLearningScript = (scriptText: string) => {
    if (!scriptText) return { mainScript: '', rationale: '' };
    const marker = '---RATIONALE---';
    const parts = scriptText.split(marker);
    const mainScript = parts[0]?.trim() || '';
    const rationale = parts[1]?.trim() || '';
    return { mainScript, rationale };
  };

  const isCloCovered = (cloCode: string) => {
    if (!cloCode) return false;
    const escapedCode = cloCode.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\[CLO\\s*:?\\s*${escapedCode}\\s*\\]`, 'i');
    return regex.test(slideContent) || regex.test(stream.aiSlideProposal);
  };

  return {
    chapters,
    selectedChapter,
    activeLeftTab,
    setActiveLeftTab,
    clos,
    ragReferences,
    selectedCitation,
    setSelectedCitation,
    citationTab,
    setCitationTab,
    viewingFullDocName,
    fullDocContent,
    setFullDocContent,
    fullDocLoading,
    activeWorkTab,
    setActiveWorkTab,
    isFullscreen,
    setIsFullscreen,
    showSidebar,
    setShowSidebar,
    showAIProposal,
    setShowAIProposal,
    isZenMode,
    setIsZenMode,
    slideContent,
    setSlideContent,
    activeLearningScript,
    setActiveLearningScript,
    savedSlideContent,
    savedScript,
    slideEditMode,
    setSlideEditMode,
    scriptEditMode,
    setScriptEditMode,
    slideProposalViewMode,
    setSlideProposalViewMode,
    selectedTheme,
    setSelectedTheme,
    documents,
    uploadFile,
    setUploadFile,
    showConfigModal,
    setShowConfigModal,
    classSize,
    setClassSize,
    hasWifi,
    setHasWifi,
    furnitureType,
    setFurnitureType,
    sessionDuration,
    setSessionDuration,
    error,
    setError,
    message,
    setMessage,
    loading,
    saving,
    exporting,
    revisions,
    loadRevisions,
    chapterMcqs,
    loadingMcqs,
    editorFontSize,
    setEditorFontSize,

    // Handlers
    handleSelectChapter,
    handleGenerateOutline,
    handleUploadDocument,
    handleDeleteDocument,
    handleSaveMaterials,
    handleResetMaterials,
    handleExportLessonPlan,
    handleAutoSplitSlide,
    handleExportPPTX,
    handleCitationClick,
    handleLoadFullDocument,
    parseActiveLearningScript,
    isCloCovered,

    // Sub-hooks
    stream,
    search
  };
}
