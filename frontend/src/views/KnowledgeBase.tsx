'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import {
  ArrowLeft,
  Library,
  Globe,
  FileText,
  Loader2,
  XCircle,
  Check,
  X
} from 'lucide-react';
import { Course, Chapter } from '@/types';
import '../styles/KnowledgeBase.css';

// Import sub-components
import RAGUploadForm from '../components/knowledge/RAGUploadForm';
import RAGDocumentList from '../components/knowledge/RAGDocumentList';
import AcademicSearchPanel from '../components/knowledge/AcademicSearchPanel';
import VectorDBInspector from '../components/knowledge/VectorDBInspector';

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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={14} style={{ color: '#10b981' }} /> Đã tự động nạp thành công {ingestedCount} tài liệu học thuật vào RAG (đã được tự động phân tách văn bản & vector hóa).</span>
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={14} style={{ color: '#10b981' }} /> Đã ép nạp thành công {successCount} tài liệu vào RAG (đã được tự động phân tách văn bản & vector hóa).</span>
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
            <ArrowLeft size={14} /> Đăng Xuất
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
              <RAGUploadForm
                uploadFile={uploadFile}
                setUploadFile={setUploadFile}
                uploadCategory={uploadCategory}
                setUploadCategory={setUploadCategory}
                uploadTags={uploadTags}
                setUploadTags={setUploadTags}
                selectedChapterIdForUpload={selectedChapterIdForUpload}
                setSelectedChapterIdForUpload={setSelectedChapterIdForUpload}
                chapters={chapters}
                isDragOver={isDragOver}
                handleDragOver={handleDragOver}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                handleUploadDocument={handleUploadDocument}
                loading={loading}
              />

              {/* CỘT PHẢI: Documents list */}
              <RAGDocumentList
                documentsDetailed={documentsDetailed}
                editingDocName={editingDocName}
                setEditingDocName={setEditingDocName}
                editingCategory={editingCategory}
                setEditingCategory={setEditingCategory}
                editingTags={editingTags}
                setEditingTags={setEditingTags}
                editingChapterId={editingChapterId}
                setEditingChapterId={setEditingChapterId}
                chapters={chapters}
                newlyIngestedDocs={newlyIngestedDocs}
                handleSaveMetadata={handleSaveMetadata}
                handleStartEditMetadata={handleStartEditMetadata}
                handleDeleteDocument={handleDeleteDocument}
                handleViewDocument={handleViewDocument}
                handleDownloadDocumentText={handleDownloadDocumentText}
                handleInspectDocument={handleInspectDocument}
              />
            </div>
          ) : (
            <AcademicSearchPanel
              chapters={chapters}
              selectedChapterId={selectedChapterId}
              setSelectedChapterId={setSelectedChapterId}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleWebSearch={handleWebSearch}
              searching={searching}
              loading={loading}
              showAdvancedSearch={showAdvancedSearch}
              setShowAdvancedSearch={setShowAdvancedSearch}
              maxResults={maxResults}
              setMaxResults={setMaxResults}
              credibilityThreshold={credibilityThreshold}
              setCredibilityThreshold={setCredibilityThreshold}
              loadingSuggestions={loadingSuggestions}
              suggestedQueries={suggestedQueries}
              searchResult={searchResult}
              expandedSearch={expandedSearch}
              toggleSearchDetail={toggleSearchDetail}
              summarizing={summarizing}
              summaries={summaries}
              toggleSummaryCollapse={toggleSummaryCollapse}
              handleSummarizeContent={handleSummarizeContent}
              collapsedSummaries={collapsedSummaries}
              selectedRejected={selectedRejected}
              setSelectedRejected={setSelectedRejected}
              handleForceIngest={handleForceIngest}
              showMetricGuide={showMetricGuide}
              setShowMetricGuide={setShowMetricGuide}
            />
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
      <VectorDBInspector
        inspectDocName={inspectDocName}
        setInspectDocName={setInspectDocName}
        inspectActiveTab={inspectActiveTab}
        setInspectActiveTab={setInspectActiveTab}
        chunksLoading={chunksLoading}
        docChunks={docChunks}
        docChunksPage={docChunksPage}
        totalChunks={totalChunks}
        handleInspectDocument={handleInspectDocument}
        handleSearchTest={handleSearchTest}
        testQuery={testQuery}
        setTestQuery={setTestQuery}
        testLoading={testLoading}
        testResults={testResults}
        highlightText={highlightText}
      />
    </div>
  );
}
