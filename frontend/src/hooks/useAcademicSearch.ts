import { useState } from 'react';
import client from '../api/client';

interface UseAcademicSearchOptions {
  courseId: number;
  setDocuments: (docs: string[]) => void;
  setError: (msg: string) => void;
  setMessage: (msg: string) => void;
  setLoading: (loading: boolean) => void;
  setAIProcessingStatus: (isProcessing: boolean, message?: string) => void;
}

export function useAcademicSearch({
  courseId,
  setDocuments,
  setError,
  setMessage,
  setLoading,
  setAIProcessingStatus
}: UseAcademicSearchOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [expandedSearch, setExpandedSearch] = useState<Record<string, boolean>>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [maxResults, setMaxResults] = useState(10);
  const [credibilityThreshold, setCredibilityThreshold] = useState(0.7);
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState<Record<string, boolean>>({});
  const [selectedRejected, setSelectedRejected] = useState<Record<string, boolean>>({});
  const [collapsedSummaries, setCollapsedSummaries] = useState<Record<string, boolean>>({});

  // Chạy Web Search Ingestion
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

    // Khởi tạo trạng thái động tìm kiếm học thuật
    setAIProcessingStatus(true, 'AI đang khởi động công cụ tìm kiếm học thuật trực tuyến…');
    
    const steps = [
      'AI đang tìm kiếm các bài viết khoa học trên Google Scholar & Wikipedia…',
      'AI đang tải nội dung chi tiết từ các nguồn kết quả tìm thấy…',
      'AI đang đánh giá độ tin cậy học thuật (kiểm tra chỉ số ISSN, DOI)…',
      'AI đang lọc bỏ các nguồn kém chất lượng hoặc chứa thông tin cá nhân…',
      'AI đang tiến hành phân tích văn bản và nạp dữ liệu vào Vector RAG…'
    ];
    let currentStepIdx = 0;
    const intervalId = setInterval(() => {
      if (currentStepIdx < steps.length) {
        setAIProcessingStatus(true, steps[currentStepIdx]);
        currentStepIdx++;
      }
    }, 3500);

    try {
      const response = await client.post(`/api/courses/${courseId}/web-search-ingest`, {
        query: searchQuery,
        max_results: maxResults,
        threshold: credibilityThreshold
      });
      setSearchResult(response.data);
      setMessage('Đã hoàn thành khảo sát độ uy tín và nạp RAG!');
    } catch (err) {
      console.error(err);
      setError('Lỗi trong quá trình tìm kiếm học thuật.');
    } finally {
      clearInterval(intervalId);
      setSearching(false);
      setAIProcessingStatus(false);
    }
  };

  const toggleSearchDetail = (key: string) => {
    setExpandedSearch(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleSummaryCollapse = (key: string) => {
    setCollapsedSummaries(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Gọi API tóm tắt nội dung
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

  const handleForceIngest = async () => {
    const selectedUrls = Object.keys(selectedRejected).filter(url => selectedRejected[url]);
    if (selectedUrls.length === 0) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    setAIProcessingStatus(true, 'AI đang nạp thủ công tài liệu vào Vector DB RAG…');
    
    let successCount = 0;
    try {
      for (const url of selectedUrls) {
        const item = searchResult.rejected.find((r: any) => r.url === url);
        if (!item) continue;
        
        await client.post(`/api/courses/${courseId}/force-ingest-url`, {
          url: item.url,
          title: item.title,
          content: item.content
        });
        
        successCount++;
      }
      
      // Reload documents list
      const docResponse = await client.get(`/api/courses/${courseId}/documents`);
      setDocuments(docResponse.data.documents || []);
      
      // Clear selection
      setSelectedRejected({});
      
      setMessage(`Đã nạp thủ công thành công ${successCount} tài liệu vào RAG.`);
    } catch (err) {
      console.error(err);
      setError('Lỗi khi nạp thủ công tài liệu vào RAG.');
    } finally {
      setLoading(false);
      setAIProcessingStatus(false);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    searching,
    setSearching,
    searchResult,
    setSearchResult,
    expandedSearch,
    setExpandedSearch,
    showAdvancedSearch,
    setShowAdvancedSearch,
    maxResults,
    setMaxResults,
    credibilityThreshold,
    setCredibilityThreshold,
    suggestedQueries,
    setSuggestedQueries,
    summaries,
    setSummaries,
    summarizing,
    setSummarizing,
    selectedRejected,
    setSelectedRejected,
    collapsedSummaries,
    setCollapsedSummaries,
    toggleSummaryCollapse,
    handleWebSearch,
    toggleSearchDetail,
    handleSummarizeContent,
    handleForceIngest
  };
}
