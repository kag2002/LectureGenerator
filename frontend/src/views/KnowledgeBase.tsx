'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import FlowSteps from '../components/FlowSteps';
import { 
  ArrowLeft, 
  Library, 
  Globe, 
  Eye, 
  Trash2, 
  BarChart2, 
  Info, 
  AlertTriangle, 
  Settings, 
  Lightbulb, 
  BookOpen, 
  LogOut, 
  Upload,
  FileText,
  Loader2,
  XCircle,
  Sparkles,
  Check,
  Zap,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2
} from 'lucide-react';
import { Course, Chapter } from '@/types';
import '../styles/KnowledgeBase.css';

export interface KnowledgeBaseProps {
  course: Course;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  activeView: string;
  isActive?: boolean;
}

interface WebSearchResultItem {
  url: string;
  title: string;
  content: string;
  score: number;
  justification: string;
  isForced?: boolean;
}

interface WebSearchResult {
  ingested: WebSearchResultItem[];
  rejected: WebSearchResultItem[];
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!text) return "";
  if (!query || !query.trim()) return text;
  
  const stopWords = new Set(['và', 'thì', 'của', 'là', 'để', 'trong', 'với', 'cho', 'tại', 'những', 'các', 'the', 'and', 'of', 'in', 'to', 'a', 'is', 'for', 'with', 'on']);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim())
    .filter(t => t.length > 1 && !stopWords.has(t));
    
  if (terms.length === 0) return text;
  
  const escapedTerms = terms.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, idx) => 
        regex.test(part) ? (
          <mark key={idx} className="highlighted-term" style={{ backgroundColor: 'rgba(217, 119, 6, 0.2)', color: 'inherit', borderRadius: '2px', padding: '0 2px' }}>{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function KnowledgeBase({ course, onBack, onLogout, onNavigate, activeView, isActive }: KnowledgeBaseProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('app-header-portal-slot'));
  }, []);
  const [activeTab, setActiveTab] = useState<'documents' | 'academic_search'>('documents');
  
  // Data lists
  const [documents, setDocuments] = useState<string[]>([]);
  const [documentsDetailed, setDocumentsDetailed] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editingDocName, setEditingDocName] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string>('Textbook');
  const [editingTags, setEditingTags] = useState<string>('');
  const [editingChapterId, setEditingChapterId] = useState<number | ''>('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<number | ''>('');
  
  // RAG upload with metadata
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>('Textbook');
  const [uploadTags, setUploadTags] = useState<string>('');
  const [selectedChapterIdForUpload, setSelectedChapterIdForUpload] = useState<number | ''>('');
  
  // RAG Vector DB Chunk inspector states
  const [inspectDocName, setInspectDocName] = useState<string | null>(null);
  const [docChunks, setDocChunks] = useState<any[]>([]);
  const [docChunksPage, setDocChunksPage] = useState(1);
  const [totalChunks, setTotalChunks] = useState(0);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [inspectActiveTab, setInspectActiveTab] = useState<'chunks' | 'playground'>('chunks');
  
  // RAG Similarity query test states
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  
  // Academic Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<WebSearchResult | null>(null);
  const [expandedSearch, setExpandedSearch] = useState<Record<string, boolean>>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [maxResults, setMaxResults] = useState(10);
  const [credibilityThreshold, setCredibilityThreshold] = useState(0.7);
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const [collapsedSummaries, setCollapsedSummaries] = useState<Record<string, boolean>>({});
  const [showMetricGuide, setShowMetricGuide] = useState(false);
  const [selectedRejected, setSelectedRejected] = useState<Record<string, boolean>>({});
  
  // RAG Document Viewer states
  const [viewingDocName, setViewingDocName] = useState<string | null>(null);
  const [viewingDocContent, setViewingDocContent] = useState('');
  const [viewingDocLoading, setViewingDocLoading] = useState(false);
  
  // Global messages & loading
  const [error, setError] = useState('');
  const [message, setMessage] = useState<string | React.ReactNode>('');
  const [newlyIngestedDocs, setNewlyIngestedDocs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleViewDocument = async (fileName: string) => {
    setViewingDocName(fileName);
    setViewingDocContent('');
    setViewingDocLoading(true);
    try {
      const response = await client.get(`/api/courses/${course.id}/documents/${fileName}`);
      setViewingDocContent(response.data.content || 'Không có nội dung.');
    } catch (err) {
      console.error(err);
      setViewingDocContent('Lỗi khi tải nội dung tài liệu nguồn RAG.');
    } finally {
      setViewingDocLoading(false);
    }
  };

  const handleDownloadDocumentText = async (fileName: string) => {
    setError('');
    setMessage('');
    try {
      const response = await client.get(`/api/courses/${course.id}/documents/${encodeURIComponent(fileName)}`);
      const content = response.data.content || '';
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const baseName = fileName.replace(/\.[^/.]+$/, "");
      link.setAttribute('download', `${baseName}_extracted.txt`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMessage(`Tải xuống tệp văn bản bóc tách '${fileName}' thành công.`);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải xuống tệp văn bản bóc tách.');
    }
  };

  const handleSaveMetadata = async (fileName: string) => {
    setError('');
    setMessage('');
    try {
      await client.put(`/api/courses/${course.id}/documents/${encodeURIComponent(fileName)}/metadata`, {
        category: editingCategory,
        tags: editingTags,
        chapter_id: editingChapterId || 0
      });
      setEditingDocName(null);
      loadDocuments();
      setMessage(`Đã cập nhật siêu dữ liệu cho tài liệu '${fileName}' thành công.`);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi cập nhật siêu dữ liệu tài liệu.');
    }
  };

  const handleStartEditMetadata = (doc: any) => {
    setEditingDocName(doc.file_name);
    setEditingCategory(doc.category || 'Textbook');
    setEditingTags(doc.tags || '');
    setEditingChapterId(doc.chapter_id || '');
  };

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
      setUploadFile(e.dataTransfer.files[0]);
    }
  };

  // Load documents and chapters on mount or when activeView changes to knowledge_base
  useEffect(() => {
    if (!course) return;
    if (activeView === 'knowledge_base') {
      loadDocuments();
      loadChapters();
    }
  }, [course.id, activeView]);

  // Poll status of processing documents every 3 seconds
  useEffect(() => {
    const hasProcessing = documentsDetailed.some(doc => doc.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      loadDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documentsDetailed]);

  const loadDocuments = async () => {
    try {
      const docResponse = await client.get(`/api/courses/${course.id}/documents`);
      setDocuments(docResponse.data.documents || []);
      setDocumentsDetailed(docResponse.data.documents_detailed || []);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải danh sách tài liệu RAG.');
    }
  };

  const loadChapters = async () => {
    try {
      const response = await client.get(`/api/courses/${course.id}/chapters`);
      setChapters(response.data || []);
      if (response.data && response.data.length > 0) {
        setSelectedChapterId(response.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch suggested queries when selected chapter changes
  useEffect(() => {
    if (!selectedChapterId) return;
    fetchSuggestedQueries(selectedChapterId);
  }, [selectedChapterId]);

  const fetchSuggestedQueries = async (chapterId: number) => {
    setLoadingSuggestions(true);
    try {
      const suggestRes = await client.get(`/api/courses/chapters/${chapterId}/suggest-queries`);
      setSuggestedQueries(suggestRes.data.suggestions || []);
    } catch (err) {
      console.error("Error loading suggested queries:", err);
      setSuggestedQueries([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Upload RAG file
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    
    setError('');
    setMessage('');
    setLoading(true);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      let url = `/api/courses/${course.id}/documents?category=${encodeURIComponent(uploadCategory)}`;
      if (uploadTags.trim()) {
        url += `&tags=${encodeURIComponent(uploadTags.trim())}`;
      }
      if (selectedChapterIdForUpload) {
        url += `&chapter_id=${selectedChapterIdForUpload}`;
      }
      const response = await client.post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadFile(null);
      setUploadTags('');
      setSelectedChapterIdForUpload('');
      if (response.data.file_name) {
        setNewlyIngestedDocs(prev => [...prev, response.data.file_name]);
      }
      setMessage('Nạp tài liệu nguồn thành công! Vector DB đang xử lý tài liệu.');
      await loadDocuments();
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải tài liệu lên Vector DB.');
    } finally {
      setLoading(false);
    }
  };

  // Delete RAG file
  const handleDeleteDocument = async (fileName: string) => {
    if (!window.confirm(`Bạn muốn xóa tài liệu tham chiếu '${fileName}' khỏi RAG?`)) return;
    setError('');
    setMessage('');
    
    try {
      await client.delete(`/api/courses/${course.id}/documents/${fileName}`);
      setDocuments(documents.filter(d => d !== fileName));
      setDocumentsDetailed(documentsDetailed.filter(d => d.file_name !== fileName));
      setMessage('Đã xóa tài liệu khỏi Vector DB.');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi xóa tài liệu.');
    }
  };

  // Inspect Vector chunks
  const handleInspectDocument = async (fileName: string, pageNum: number = 1) => {
    setInspectDocName(fileName);
    setDocChunksPage(pageNum);
    setChunksLoading(true);
    setError('');
    try {
      const response = await client.get(`/api/courses/${course.id}/documents/${encodeURIComponent(fileName)}/chunks?page=${pageNum}&page_size=5`);
      setDocChunks(response.data.chunks || []);
      setTotalChunks(response.data.total_chunks || 0);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tải danh sách chunks từ Vector DB.');
    } finally {
      setChunksLoading(false);
    }
  };

  // Run Semantic similarity search test query
  const handleSearchTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) return;
    setTestLoading(true);
    setTestResults([]);
    setError('');
    try {
      const response = await client.post(`/api/courses/${course.id}/documents/search-test`, {
        query: testQuery.trim(),
        top_k: 5
      });
      setTestResults(response.data.results || []);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi thực hiện thử nghiệm tìm kiếm Vector.');
    } finally {
      setTestLoading(false);
    }
  };

  // Academic Search
  const handleWebSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setError('');
    setMessage('');
    setSearching(true);
    setSearchResult(null);
    setExpandedSearch({});
    setSummaries({});
    setCollapsedSummaries({});

    try {
      const response = await client.post(`/api/courses/${course.id}/web-search-ingest`, {
        query: searchQuery,
        max_results: maxResults,
        threshold: credibilityThreshold,
        chapter_id: selectedChapterId || undefined
      });
      setSearchResult(response.data);
      
      const fileNames = response.data.ingested?.map((x: any) => x.file_name).filter(Boolean) || [];
      if (fileNames.length > 0) {
        setNewlyIngestedDocs(prev => [...prev, ...fileNames]);
      }

      const ingestedCount = response.data.ingested?.length || 0;
      if (ingestedCount > 0) {
        setMessage(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} style={{ color: '#fbbf24' }} /> Đã tự động nạp thành công {ingestedCount} tài liệu học thuật vào RAG (đã được tự động phân tách văn bản & vector hóa).</span>
            <button 
              type="button" 
              onClick={() => setActiveTab('documents')} 
              className="rag-success-alert-btn"
            >
              Xem trong Thư viện RAG
            </button>
          </div>
        );
      } else {
        setMessage('Đã hoàn thành khảo sát độ uy tín. Không có tài liệu nào đủ ngưỡng độ tin cậy để nạp tự động.');
      }
      
      loadDocuments(); // Reload documents list to reflect changes
    } catch (err) {
      console.error(err);
      setError('Lỗi trong quá trình tìm kiếm học thuật.');
    } finally {
      setSearching(false);
    }
  };

  // Toggle detail view for scraped content
  const toggleSearchDetail = (key: string) => {
    setExpandedSearch(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Toggle collapse state for summary
  const toggleSummaryCollapse = (key: string) => {
    setCollapsedSummaries(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Summarize content
  const handleSummarizeContent = async (key: string, title: string, content: string) => {
    if (summaries[key]) return;
    setSummarizing(prev => ({ ...prev, [key]: true }));
    try {
      const response = await client.post(`/api/courses/summarize-content`, {
        content: content,
        title: title
      });
      setSummaries(prev => ({
        ...prev,
        [key]: response.data.summary
      }));
      setCollapsedSummaries(prev => ({
        ...prev,
        [key]: false
      }));
    } catch (err) {
      console.error(err);
      setSummaries(prev => ({
        ...prev,
        [key]: 'Lỗi khi kết nối với máy chủ AI để tóm tắt.'
      }));
    } finally {
      setSummarizing(prev => ({ ...prev, [key]: false }));
    }
  };

  // Force Ingest of rejected sources
  const handleForceIngest = async () => {
    if (!searchResult) return;
    const selectedUrls = Object.keys(selectedRejected).filter(url => selectedRejected[url]);
    if (selectedUrls.length === 0) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    let successCount = 0;
    const ingestedList = [...(searchResult.ingested || [])];
    let rejectedList = [...(searchResult.rejected || [])];
    const newlyIngested: string[] = [];

    try {
      for (const url of selectedUrls) {
        const item = rejectedList.find(r => r.url === url);
        if (!item) continue;
        
        const response = await client.post(`/api/courses/${course.id}/force-ingest-url`, {
          url: item.url,
          title: item.title,
          content: item.content,
          chapter_id: selectedChapterId || undefined
        });
        
        if (response.data.file_name) {
          newlyIngested.push(response.data.file_name);
        }
        
        successCount++;
        // Add to ingested with a forced flag
        ingestedList.push({
          ...item,
          isForced: true
        });
        // Remove from rejected
        rejectedList = rejectedList.filter(r => r.url !== url);
      }
      
      setSearchResult({
        ...searchResult,
        ingested: ingestedList,
        rejected: rejectedList
      });
      
      if (newlyIngested.length > 0) {
        setNewlyIngestedDocs(prev => [...prev, ...newlyIngested]);
      }
      
      loadDocuments();
      setSelectedRejected({});
      
      setMessage(
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} style={{ color: '#fbbf24' }} /> Đã ép nạp thành công {successCount} tài liệu vào RAG (đã được tự động phân tách văn bản & vector hóa).</span>
          <button 
            type="button" 
            onClick={() => setActiveTab('documents')} 
            className="rag-success-alert-btn"
          >
            Xem trong Thư viện RAG
          </button>
        </div>
      );
    } catch (err) {
      console.error(err);
      setError('Lỗi khi nạp thủ công tài liệu vào RAG.');
    } finally {
      setLoading(false);
    }
  };

  // Recommendation builder
  const getRecommendation = (score: number) => {
    const pct = Math.round(score * 100);
    if (pct >= 80) {
      return {
        label: "Khuyên dùng (Highly Recommended)",
        level: "highly-recommended",
        desc: "Nguồn chính thống/độ tin cậy học thuật rất cao. Rất khuyên dùng để nạp vào RAG."
      };
    } else if (pct >= 60) {
      return {
        label: "Đáng tin cậy (Credible)",
        level: "credible",
        desc: "Tài liệu học thuật/tổ chức giáo dục hợp lệ. Rất phù hợp làm học liệu bổ trợ."
      };
    } else if (pct >= 40) {
      return {
        label: "Cần cân nhắc (Average)",
        level: "average",
        desc: "Nguồn tin phổ thông phi học thuật (.org, .com). Hãy cân nhắc kiểm duyệt trước khi nạp RAG."
      };
    } else {
      return {
        label: "Không khuyến nghị (Low Credibility)",
        level: "low-credibility",
        desc: "Blog cá nhân, diễn đàn hoặc mạng xã hội. Độ tin cậy thấp, không khuyến nghị nạp RAG."
      };
    }
  };

  const renderJustifications = (justification: string) => {
    if (!justification) return null;
    const items = justification.split('; ');
    return (
      <div className="justification-container">
        {items.map((item, idx) => {
          const isPositive = item.includes('+');
          const isNegative = item.includes('-');
          let badgeClass = "justification-badge-neutral";
          if (isPositive) badgeClass = "justification-badge-positive";
          if (isNegative) badgeClass = "justification-badge-negative";
          return (
            <span key={idx} className={`justification-badge ${badgeClass}`}>
              {item}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="rag-container">
      {/* HEADER */}
      {!portalTarget && (
        <header className="rag-header">
          <div className="rag-header-left">
            <button onClick={onBack} className="rag-back-btn">
              <ArrowLeft size={15} /> Sơ đồ
            </button>
            <div>
              <h2 className="rag-course-title">{course.course_name}</h2>
            </div>
          </div>
          <button className="rag-logout-btn" onClick={onLogout}>
            <LogOut size={14} /> Đăng Xuất
          </button>
        </header>
      )}

      {error && <div className="rag-error-alert">{error}</div>}
      {message && <div className="rag-success-alert">{message}</div>}

      <div className="rag-tab-section">
        <div className="rag-tab-header">
          <button 
            onClick={() => setActiveTab('documents')} 
            className={`rag-tab-btn ${activeTab === 'documents' ? 'rag-tab-btn-active' : ''}`}
          >
            <Library size={16} /> Thư viện tài liệu RAG
          </button>
          <button 
            onClick={() => setActiveTab('academic_search')} 
            className={`rag-tab-btn ${activeTab === 'academic_search' ? 'rag-tab-btn-active' : ''}`}
          >
            <Globe size={16} /> Tìm kiếm học thuật trực tuyến
          </button>
        </div>

        <div className="rag-tab-content">
          {activeTab === 'documents' ? (
            <div className="rag-split-layout">
              {/* CỘT TRÁI: Upload form */}
              <div className="rag-form-panel">
                <h3 className="rag-section-title">Nạp tài liệu mới vào Vector DB</h3>
                <p className="rag-section-desc">Hệ thống RAG sẽ bóc tách văn bản trong file và băm vector để cung cấp kiến thức thực tế cho AI lúc soạn giáo án.</p>
                <form onSubmit={handleUploadDocument} className="rag-upload-form">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Chọn hoặc Kéo thả tệp:</label>
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('drag-file-input')?.click()}
                      style={{
                        border: isDragOver ? '2px dashed var(--vinuni-gold)' : '2px dashed var(--border-color)',
                        borderRadius: '10px',
                        padding: '24px 16px',
                        background: isDragOver ? 'rgba(217, 119, 6, 0.05)' : 'var(--bg-secondary)',
                        color: 'var(--text-secondary)',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Upload size={24} style={{ color: isDragOver ? 'var(--vinuni-gold)' : 'var(--text-muted)' }} />
                      {uploadFile ? (
                        <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '13.5px' }}>
                          {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      ) : (
                        <span style={{ fontSize: '13px' }}>Kéo thả file PDF, DOCX, TXT vào đây hoặc nhấp để chọn</span>
                      )}
                      <input
                        id="drag-file-input"
                        type="file"
                        accept=".pdf,.docx,.txt"
                        onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                        style={{ display: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Phân loại tài liệu:</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="search-select"
                    >
                      <option value="Textbook">Giáo trình / Sách giáo khoa (Textbook)</option>
                      <option value="Slides">Bài giảng Slide (Slides)</option>
                      <option value="Syllabus">Đề cương chi tiết (Syllabus)</option>
                      <option value="Exam">Đề thi / Câu hỏi (Exam)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Nhãn (Tags - Phân tách bằng dấu phẩy):</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: dsa, avl tree, midterm..."
                      value={uploadTags}
                      onChange={(e) => setUploadTags(e.target.value)}
                      className="search-input"
                      style={{ minHeight: '42px', padding: '10px 14px', fontSize: '14px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Liên kết Chương học (Tùy chọn):</label>
                    <select
                      value={selectedChapterIdForUpload}
                      onChange={(e) => setSelectedChapterIdForUpload(e.target.value ? Number(e.target.value) : '')}
                      className="search-select"
                    >
                      <option value="">Không liên kết</option>
                      {chapters.map(ch => (
                        <option key={ch.id} value={ch.id}>{ch.title}</option>
                      ))}
                    </select>
                  </div>

                  <button type="submit" disabled={!uploadFile || loading} className="rag-upload-btn">
                    {loading ? 'Đang nạp Vector…' : (
                      <>
                        <Upload size={14} aria-hidden="true" /> Nạp Vào RAG (Vector DB)
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* CỘT PHẢI: Documents list */}
              <div className="rag-list-panel">
                <h3 className="rag-section-title">Danh mục tài liệu RAG đã nạp ({documentsDetailed.length})</h3>
                {documentsDetailed.length === 0 ? (
                  <div className="rag-empty-state">Chưa nạp tài liệu tham khảo nào cho môn học này.</div>
                ) : (
                  <div className="rag-table-wrapper">
                    <table className="rag-doc-table">
                      <thead>
                        <tr>
                          <th>Tên tài liệu</th>
                          <th>Phân loại & Nhãn</th>
                          <th>Trạng thái</th>
                          <th style={{ textAlign: 'right' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentsDetailed.map((doc, idx) => {
                          const isEditing = editingDocName === doc.file_name;
                          if (isEditing) {
                            return (
                              <tr key={idx} className="rag-table-row-editing">
                                <td colSpan={4}>
                                  <div className="rag-inline-edit-container">
                                    <div className="rag-edit-title">
                                      <Edit2 size={14} className="rag-doc-icon" /> Đang sửa: <strong>{doc.file_name}</strong>
                                    </div>
                                    <form 
                                      onSubmit={(e) => { 
                                        e.preventDefault(); 
                                        handleSaveMetadata(doc.file_name); 
                                      }} 
                                      className="rag-inline-edit-form"
                                    >
                                      <div className="rag-inline-edit-fields">
                                        <div className="rag-inline-edit-field">
                                          <label>Phân loại:</label>
                                          <select
                                            value={editingCategory}
                                            onChange={(e) => setEditingCategory(e.target.value)}
                                            className="rag-inline-edit-input"
                                          >
                                            <option value="Textbook">Giáo trình</option>
                                            <option value="Slides">Bài giảng Slide</option>
                                            <option value="Syllabus">Đề cương chi tiết</option>
                                            <option value="Exam">Đề thi / Câu hỏi</option>
                                          </select>
                                        </div>
                                        <div className="rag-inline-edit-field">
                                          <label>Nhãn (Tags):</label>
                                          <input
                                            type="text"
                                            value={editingTags}
                                            onChange={(e) => setEditingTags(e.target.value)}
                                            placeholder="Ví dụ: dsa, tree..."
                                            className="rag-inline-edit-input"
                                          />
                                        </div>
                                        <div className="rag-inline-edit-field">
                                          <label>Chương liên kết:</label>
                                          <select
                                            value={editingChapterId}
                                            onChange={(e) => setEditingChapterId(e.target.value ? Number(e.target.value) : '')}
                                            className="rag-inline-edit-input"
                                          >
                                            <option value="">Không liên kết</option>
                                            {chapters.map(ch => (
                                              <option key={ch.id} value={ch.id}>{ch.title}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="rag-inline-edit-actions">
                                        <button
                                          type="button"
                                          onClick={() => setEditingDocName(null)}
                                          className="doc-viewer-btn"
                                          style={{ minHeight: '32px', padding: '4px 12px', fontSize: '12.5px' }}
                                        >
                                          Hủy
                                        </button>
                                        <button
                                          type="submit"
                                          className="doc-viewer-btn"
                                          style={{ 
                                            minHeight: '32px', 
                                            padding: '4px 12px', 
                                            fontSize: '12.5px', 
                                            background: 'var(--vinuni-navy)', 
                                            color: '#fff', 
                                            borderColor: 'var(--vinuni-navy)' 
                                          }}
                                        >
                                          Lưu
                                        </button>
                                      </div>
                                    </form>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={idx} className={`rag-table-row ${newlyIngestedDocs.includes(doc.file_name) ? 'rag-table-row-new' : ''}`}>
                              <td className="rag-table-cell-name" title={doc.file_name}>
                                <div className="rag-doc-name-wrapper">
                                  <FileText size={14} className="rag-doc-icon" />
                                  <span className="rag-doc-name-text">{doc.file_name}</span>
                                  {newlyIngestedDocs.includes(doc.file_name) && (
                                    <span className="rag-new-badge">Mới</span>
                                  )}
                                </div>
                              </td>
                              <td className="rag-table-cell-meta">
                                {doc.status === 'ready' && (
                                  <div className="rag-doc-meta-container" style={{ marginTop: 0 }}>
                                    <span className="rag-doc-meta-badge">
                                      {doc.category || 'Giáo trình'}
                                    </span>
                                    {doc.tags && doc.tags.split(',').map((tag: string, tIdx: number) => (
                                      <span key={tIdx} className="rag-doc-meta-badge" style={{ fontSize: '10px' }}>
                                        #{tag.trim()}
                                      </span>
                                    ))}
                                    {doc.chapter_id && (
                                      <span className="rag-doc-meta-badge" style={{ fontSize: '10px', color: 'var(--vinuni-gold)' }}>
                                        Chương: {chapters.find(ch => ch.id === doc.chapter_id)?.title || doc.chapter_id}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="rag-table-cell-status">
                                {doc.status === 'processing' && (
                                  <span className="rag-doc-status-badge rag-doc-status-processing">
                                    <Loader2 size={12} className="animate-spin" /> Đang xử lý...
                                  </span>
                                )}
                                {doc.status === 'failed' && (
                                  <span 
                                    className="rag-doc-status-badge rag-doc-status-failed" 
                                    title={doc.error_message || "Lỗi không xác định khi nạp dữ liệu"}
                                  >
                                    <AlertTriangle size={12} /> Thất bại
                                  </span>
                                )}
                                {doc.status === 'ready' && (
                                  <span className="rag-doc-status-badge rag-doc-status-ready">
                                    <Check size={12} /> Sẵn sàng
                                  </span>
                                )}
                              </td>
                              <td className="rag-table-cell-actions">
                                <div className="rag-doc-actions" style={{ justifyContent: 'flex-end' }}>
                                  {doc.status === 'ready' && (
                                    <>
                                      <button 
                                        type="button"
                                        onClick={() => handleViewDocument(doc.file_name)} 
                                        className="rag-action-btn-circle rag-action-btn-view"
                                        title="Xem nội dung tài liệu"
                                        aria-label="Xem nội dung tài liệu"
                                      >
                                        <Eye size={14} aria-hidden="true" />
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleDownloadDocumentText(doc.file_name)} 
                                        className="rag-action-btn-circle rag-action-btn-download"
                                        title="Tải xuống file text bóc tách"
                                        aria-label="Tải xuống file text bóc tách"
                                      >
                                        <Download size={14} aria-hidden="true" />
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleStartEditMetadata(doc)} 
                                        className="rag-action-btn-circle rag-action-btn-edit"
                                        style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366f1', borderColor: 'rgba(99, 102, 241, 0.3)' }}
                                        title="Chỉnh sửa Phân loại & Nhãn"
                                        aria-label="Chỉnh sửa Phân loại & Nhãn"
                                      >
                                        <Edit2 size={14} aria-hidden="true" />
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleInspectDocument(doc.file_name, 1)} 
                                        className="rag-action-btn-circle rag-action-btn-inspect"
                                        title="Kiểm tra Vector Chunks"
                                        aria-label="Kiểm tra Vector Chunks"
                                      >
                                        <Settings size={14} aria-hidden="true" />
                                      </button>
                                    </>
                                  )}
                                  <button 
                                    type="button"
                                    onClick={() => handleDeleteDocument(doc.file_name)} 
                                    className="rag-action-btn-circle rag-action-btn-delete"
                                    title="Xóa tài liệu"
                                    aria-label="Xóa tài liệu"
                                    disabled={doc.status === 'processing'}
                                    style={{ opacity: doc.status === 'processing' ? 0.4 : 1 }}
                                  >
                                    <Trash2 size={14} aria-hidden="true" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="search-split-layout">
              {/* CỘT TRÁI: Tìm kiếm form */}
              <div className="search-form-panel">
                <h3 className="rag-section-title">Tìm kiếm & Thẩm định học thuật</h3>
                
                {/* Metric Guide */}
                <div className="metric-guide-box">
                  <div className="metric-guide-header" onClick={() => setShowMetricGuide(!showMetricGuide)}>
                    <span className="metric-guide-header-title">
                      <BarChart2 size={16} /> Cách tính điểm uy tín (%) <Info size={14} />
                    </span>
                    <span className="metric-guide-header-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {showMetricGuide ? 'Thu gọn' : 'Chi tiết'}
                      {showMetricGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                  {showMetricGuide && (
                    <div className="metric-guide-content">
                      <ul className="metric-list">
                        <li><strong>Domain Whitelist (Max 50%):</strong> .edu, .gov, các nhà xuất bản uy tín (IEEE, Springer, ScienceDirect...).</li>
                        <li><strong>DOI/ISSN (Max 20%):</strong> Chứa mã định danh nghiên cứu.</li>
                        <li><strong>Từ khóa học thuật (Max 15%):</strong> Mật độ thuật ngữ khoa học chuyên ngành.</li>
                        <li><strong>Độ mới (Max 15%):</strong> Xuất bản hoặc cập nhật trong giai đoạn 2020-2026.</li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Chapter Context Selector */}
                {chapters.length > 0 ? (
                  <div className="search-select-group">
                    <label className="search-label">Lấy gợi ý từ khóa theo chương:</label>
                    <select
                      value={selectedChapterId}
                      onChange={(e) => setSelectedChapterId(e.target.value ? Number(e.target.value) : '')}
                      className="search-select"
                    >
                      {chapters.map(ch => (
                        <option key={ch.id} value={ch.id}>{ch.title}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="no-chapters-warning">
                    <AlertTriangle size={18} className="no-chapters-icon" />
                    Môn học này hiện chưa có chương học nào được thiết kế. Vui lòng quay lại Roadmap và sinh Dàn Ý để khởi tạo chương học.
                  </div>
                )}

                <form onSubmit={handleWebSearch} className="search-form">
                  <div className="search-input-group">
                    <label className="search-label">Từ khóa học thuật cần tìm kiếm</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: binary search tree worst case complexity…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="search-input"
                      required
                    />
                  </div>
                  
                  <div className="search-action-row">
                    <button type="submit" disabled={searching || loading} className="search-submit-btn">
                      {searching ? 'Đang quét học thuật…' : 'Tìm kiếm & Đánh giá'}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setShowAdvancedSearch(!showAdvancedSearch)} 
                      className="search-config-toggle"
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Settings size={14} /> Cấu hình {showAdvancedSearch ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </button>
                  </div>

                  {/* Advanced Settings */}
                  {showAdvancedSearch && (
                    <div className="search-advanced-panel">
                      <div className="search-advanced-row">
                        <label className="search-label">Số tài liệu tối đa:</label>
                        <select
                          value={maxResults}
                          onChange={(e) => setMaxResults(parseInt(e.target.value))}
                          className="search-select"
                        >
                          <option value={5}>5 tài liệu</option>
                          <option value={10}>10 tài liệu</option>
                          <option value={15}>15 tài liệu</option>
                        </select>
                      </div>
                      
                      <div className="search-advanced-row">
                        <label className="search-label">Mức uy tín tối thiểu (Threshold):</label>
                        <div className="search-slider-container">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(credibilityThreshold * 100)}
                            onChange={(e) => setCredibilityThreshold(parseFloat(e.target.value) / 100)}
                            className="search-slider"
                          />
                          <span className="search-slider-value">
                            {Math.round(credibilityThreshold * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Suggested Queries */}
                  {chapters.length > 0 && (
                    <div className="search-suggestions-section">
                      <div className="search-suggestions-title">
                        <Lightbulb size={14} className="search-suggestion-icon" /> Gợi ý từ khóa AI cho chương đang chọn:
                      </div>
                      {loadingSuggestions ? (
                        <div className="search-loading-suggestions"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Đang tải gợi ý từ khóa từ AI…</div>
                      ) : suggestedQueries.length > 0 ? (
                        <div className="search-suggestions-chips">
                          {suggestedQueries.map((query, idx) => (
                            <button 
                              key={idx} 
                              type="button"
                              onClick={() => setSearchQuery(query)}
                              className="search-suggestion-chip"
                            >
                              {query}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="search-loading-suggestions search-suggestions-error"><XCircle size={14} /> Không tải được gợi ý từ khóa cho chương học này.</div>
                      )}
                    </div>
                  )}
                </form>
              </div>

              {/* CỘT PHẢI: Kết quả tìm kiếm */}
              <div className="search-results-panel">
                <h3 className="rag-section-title">Kết quả khảo sát</h3>
                {searchResult ? (
                  <div className="search-results-wrapper">
                    <div className="search-results-header">
                      Đã lọc: {searchResult.ingested.length} Đã nạp | {searchResult.rejected.length} Bị lọc
                    </div>

                    {/* INGESTED (XANH) */}
                    {searchResult.ingested.map((src, i) => {
                      const key = `ing-${i}`;
                      const isExpanded = !!expandedSearch[key];
                      const isSummarizing = !!summarizing[key];
                      const summary = summaries[key];
                      const rec = getRecommendation(src.score);
                      return (
                        <div key={key} className="credibility-card credibility-card-green">
                          <div className="credibility-header">
                            <span className="credibility-score-badge credibility-score-badge-green">{(src.score * 100).toFixed(0)}% Uy tín</span>
                            <span className={`credibility-recommend-badge credibility-recommend-badge--${rec.level}`}>{rec.label}</span>
                            {src.isForced && (
                              <span className="credibility-recommend-badge credibility-recommend-badge--forced" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Zap size={10} /> Đã ép nạp vào RAG
                              </span>
                            )}
                          </div>
                          <strong className="credibility-title">{src.title}</strong>
                          <a 
                            href={src.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="credibility-url credibility-link"
                            title={src.url}
                          >
                            {src.url}
                          </a>
                          {renderJustifications(src.justification)}
                          <div className="credibility-desc-text"><Lightbulb size={13} className="credibility-desc-icon" /> {rec.desc}</div>
                          
                          <div className="credibility-actions">
                            {src.content && (
                              <button
                                type="button"
                                onClick={() => toggleSearchDetail(key)}
                                className="credibility-btn-outline"
                              >
                                {isExpanded ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn</span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Đọc nội dung</span>
                                )}
                              </button>
                            )}
                            {src.content && (
                              <button
                                type="button"
                                onClick={
                                  summary
                                    ? () => toggleSummaryCollapse(key)
                                    : () => handleSummarizeContent(key, src.title, src.content)
                                }
                                disabled={isSummarizing}
                                className="credibility-btn-outline"
                              >
                                {isSummarizing ? (
                                  <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang tóm tắt…</>
                                ) : summary ? (
                                  collapsedSummaries[key] ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Xem tóm tắt</span>
                                  ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn tóm tắt</span>
                                  )
                                ) : (
                                  <><Sparkles size={12} aria-hidden="true" /> Tóm tắt (AI)</>
                                )}
                              </button>
                            )}
                          </div>

                          {isExpanded && src.content && (
                            <pre className="scraped-content-box">{src.content}</pre>
                          )}

                          {summary && !collapsedSummaries[key] && (
                            <div className="ai-summary-box animate-fade-in">
                              <div className="ai-summary-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={14} /> Phân tích học thuật chuyên sâu (AI):</div>
                              <div>{summary}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* REJECTED (ĐỎ) */}
                    {searchResult.rejected && searchResult.rejected.length > 0 && (
                      <div className="search-rejected-container">
                        <div className="force-ingest-panel-header">
                          <span className="search-rejected-header"><AlertTriangle size={14} className="search-rejected-icon" /> Bị từ chối ({searchResult.rejected.length})</span>
                          {Object.values(selectedRejected).filter(Boolean).length > 0 && (
                            <button
                              type="button"
                              onClick={handleForceIngest}
                              className="force-ingest-btn"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Zap size={12} /> Nạp lại tài liệu ({Object.values(selectedRejected).filter(Boolean).length})
                            </button>
                          )}
                        </div>
                        
                        {searchResult.rejected.map((src, i) => {
                          const key = `rej-${i}`;
                          const isExpanded = !!expandedSearch[key];
                          const isSummarizing = !!summarizing[key];
                          const summary = summaries[key];
                          const rec = getRecommendation(src.score);
                          const isChecked = !!selectedRejected[src.url];
                          return (
                            <div key={key} className="credibility-card credibility-card-red">
                              <div className="search-rejected-item-layout">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => setSelectedRejected(prev => ({ ...prev, [src.url]: !prev[src.url] }))}
                                  className="search-rejected-checkbox"
                                />
                                <div className="search-rejected-content-wrapper">
                                  <div className="credibility-header">
                                    <span className="credibility-score-badge credibility-score-badge-red">{(src.score * 100).toFixed(0)}% Uy uy tín</span>
                                    <span className={`credibility-recommend-badge credibility-recommend-badge--${rec.level}`}>{rec.label}</span>
                                  </div>
                                  <strong className="credibility-title">{src.title}</strong>
                                  <a 
                                    href={src.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="credibility-url credibility-link"
                                    title={src.url}
                                  >
                                    {src.url}
                                  </a>
                                  {renderJustifications(src.justification)}
                                  <div className="credibility-desc-text"><Lightbulb size={13} className="credibility-desc-icon" /> {rec.desc}</div>

                                  <div className="credibility-actions">
                                    {src.content && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSearchDetail(key)}
                                        className="credibility-btn-outline"
                                      >
                                         {isExpanded ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn</span>
                                  ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Đọc nội dung</span>
                                  )}
                                      </button>
                                    )}
                                    {src.content && (
                                      <button
                                        type="button"
                                        onClick={
                                          summary
                                            ? () => toggleSummaryCollapse(key)
                                            : () => handleSummarizeContent(key, src.title, src.content)
                                        }
                                        disabled={isSummarizing}
                                        className="credibility-btn-outline"
                                      >
                                        {isSummarizing ? (
                                          <><Loader2 size={12} className="animate-spin" aria-hidden="true" /> Đang tóm tắt…</>
                                        ) : summary ? (
                                          collapsedSummaries[key] ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronDown size={12} /> Xem tóm tắt</span>
                                          ) : (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ChevronUp size={12} /> Thu gọn tóm tắt</span>
                                          )
                                        ) : (
                                          <><Sparkles size={12} aria-hidden="true" /> Tóm tắt (AI)</>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {isExpanded && src.content && (
                                    <pre className="scraped-content-box">{src.content}</pre>
                                  )}

                                  {summary && !collapsedSummaries[key] && (
                                    <div className="ai-summary-box animate-fade-in">
                                      <div className="ai-summary-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Sparkles size={14} /> Phân tích học thuật chuyên sâu (AI):</div>
                                      <div>{summary}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="search-empty-results">
                    Chưa thực hiện tìm kiếm học thuật trực tuyến.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* MODAL XEM NỘI DUNG TÀI LIỆU RAG */}
      {viewingDocName && typeof document !== 'undefined' && createPortal(
        <div className="doc-viewer-overlay">
          <div className="doc-viewer-modal">
            <div className="doc-viewer-header">
              <div>
                <h4 className="doc-viewer-title">
                  <FileText size={18} className="doc-viewer-title-icon" />
                  <span className="doc-viewer-title-text">Đang xem: {viewingDocName}</span>
                </h4>
                <span className="doc-viewer-subtitle">Dữ liệu bóc tách được lưu trữ trong RAG Vector DB</span>
              </div>
              <button 
                type="button" 
                onClick={() => setViewingDocName(null)} 
                className="doc-viewer-close-btn" 
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="doc-viewer-body">
              {viewingDocLoading ? (
                <div className="doc-viewer-loading">
                  <Loader2 className="animate-spin doc-viewer-loader-icon" size={24} aria-hidden="true" />
                  <span>Đang tải nội dung văn bản bóc tách…</span>
                </div>
              ) : (
                viewingDocContent
              )}
            </div>
            <div className="doc-viewer-footer" style={{ gap: '12px' }}>
              <button 
                type="button"
                onClick={() => handleDownloadDocumentText(viewingDocName!)}
                className="doc-viewer-btn"
                style={{ background: 'var(--success-bg)', color: 'var(--success-color)', borderColor: 'var(--success-color)' }}
              >
                Tải xuống file Text
              </button>
              <button 
                type="button"
                onClick={() => setViewingDocName(null)}
                className="doc-viewer-btn"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL VECTOR DB INSPECTOR */}
      {inspectDocName && typeof document !== 'undefined' && createPortal(
        <div className="doc-viewer-overlay">
          <div className="doc-viewer-modal" style={{ maxWidth: '900px', height: '85%' }}>
            <div className="doc-viewer-header">
              <div>
                <h4 className="doc-viewer-title">
                  <Library size={18} className="doc-viewer-title-icon" />
                  <span className="doc-viewer-title-text">Quản lý Vector DB: {inspectDocName}</span>
                </h4>
                <span className="doc-viewer-subtitle">Kiểm tra trực quan các vector chunks và kiểm nghiệm RAG</span>
              </div>
              <button 
                type="button" 
                onClick={() => setInspectDocName(null)} 
                className="doc-viewer-close-btn" 
                aria-label="Đóng"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            
            <div className="doc-viewer-body" style={{ display: 'flex', flexDirection: 'column', padding: '20px', gap: '16px' }}>
              <div className="chunks-tab-headers">
                <button
                  type="button"
                  onClick={() => setInspectActiveTab('chunks')}
                  className={`chunks-tab-btn ${inspectActiveTab === 'chunks' ? 'chunks-tab-btn-active' : ''}`}
                >
                  Chunks của tài liệu
                </button>
                <button
                  type="button"
                  onClick={() => setInspectActiveTab('playground')}
                  className={`chunks-tab-btn ${inspectActiveTab === 'playground' ? 'chunks-tab-btn-active' : ''}`}
                >
                  Thử nghiệm truy vấn (Playground)
                </button>
              </div>

              {inspectActiveTab === 'chunks' ? (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  {chunksLoading ? (
                    <div className="doc-viewer-loading">
                      <Loader2 className="animate-spin doc-viewer-loader-icon" size={24} aria-hidden="true" />
                      <span>Đang tải các vector chunks…</span>
                    </div>
                  ) : docChunks.length === 0 ? (
                    <div className="rag-empty-state">Tài liệu không có vector chunks nào.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                        {docChunks.map((chunk, idx) => (
                          <div key={chunk.id || idx} className="chunk-card">
                            <div className="chunk-header">
                              <span style={{ fontWeight: 'bold' }}>Chunk #{((docChunksPage - 1) * 5) + idx + 1}</span>
                              <span>Trang: {chunk.page_number}</span>
                            </div>
                            <div className="chunk-meta-badges">
                              <span className="chunk-badge">Phân loại: {chunk.category || 'Chưa rõ'}</span>
                              {chunk.tags && (
                                <span className="chunk-badge">Tags: {chunk.tags}</span>
                              )}
                              {chunk.chapter_id && (
                                <span className="chunk-badge">Chương ID: {chunk.chapter_id}</span>
                              )}
                            </div>
                            <pre className="chunk-text">{chunk.text}</pre>
                          </div>
                        ))}
                      </div>
                      
                      <div className="chunks-pagination">
                        <button 
                          type="button"
                          disabled={docChunksPage <= 1 || chunksLoading} 
                          onClick={() => handleInspectDocument(inspectDocName, docChunksPage - 1)}
                          className="rag-action-btn-circle"
                          style={{ minHeight: '36px', minWidth: '36px' }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="pagination-text">Trang {docChunksPage} / {Math.ceil(totalChunks / 5) || 1} ({totalChunks} chunks)</span>
                        <button 
                          type="button"
                          disabled={docChunksPage >= Math.ceil(totalChunks / 5) || chunksLoading} 
                          onClick={() => handleInspectDocument(inspectDocName, docChunksPage + 1)}
                          className="rag-action-btn-circle"
                          style={{ minHeight: '36px', minWidth: '36px' }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <form onSubmit={handleSearchTest} className="search-test-form">
                    <input
                      type="text"
                      placeholder="Nhập câu truy vấn ngữ nghĩa để thử nghiệm tìm kiếm (ví dụ: AVL tree complexity)..."
                      value={testQuery}
                      onChange={(e) => setTestQuery(e.target.value)}
                      className="search-input"
                      style={{ flex: 1, minHeight: '42px', padding: '10px 14px' }}
                      required
                    />
                    <button type="submit" disabled={testLoading} className="search-submit-btn" style={{ flex: 'none', width: '120px', minHeight: '42px' }}>
                      {testLoading ? 'Đang truy vấn…' : 'Tìm thử'}
                    </button>
                  </form>

                  {testLoading ? (
                    <div className="doc-viewer-loading">
                      <Loader2 className="animate-spin doc-viewer-loader-icon" size={24} aria-hidden="true" />
                      <span>Đang thực hiện tìm kiếm tương đồng trên Vector DB…</span>
                    </div>
                  ) : testResults.length === 0 ? (
                    <div className="rag-empty-state">Nhập câu hỏi và nhấn 'Tìm thử' để xem các đoạn ngữ nghĩa tương đồng nhất.</div>
                  ) : (
                    <div className="search-test-results">
                      <div className="search-results-header">Các kết quả tương đồng nhất trong môn học:</div>
                      {testResults.map((hit, idx) => (
                        <div key={idx} className="search-test-hit">
                          <div className="search-test-header">
                            <span className="search-test-score">Score: {(hit.score * 100).toFixed(0)}%</span>
                            <span style={{ color: 'var(--text-muted)' }}>Nguồn: {hit.file_name} - Trang: {hit.page_number}</span>
                          </div>
                          <pre className="chunk-text" style={{ maxHeight: '100px', whiteSpace: 'pre-wrap' }}>{highlightText(hit.text, testQuery)}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="doc-viewer-footer">
              <button 
                type="button"
                onClick={() => setInspectDocName(null)}
                className="doc-viewer-btn"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

