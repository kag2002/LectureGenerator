import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { 
  Trash2, 
  RotateCcw, 
  Search, 
  AlertTriangle, 
  BookOpen, 
  FileText, 
  HelpCircle, 
  Loader2, 
  Info,
  CheckCircle,
  X
} from 'lucide-react';
import { Course } from '@/types';
import '../styles/Trash.css';

export interface TrashProps {
  course: Course | null;
  onNavigate?: (view: string) => void;
  isActive: boolean;
}

interface TrashItem {
  id: number;
  type: 'course' | 'chapter' | 'question';
  deleted_at: string;
  // Course-specific
  course_code?: string;
  course_name?: string;
  // Chapter-specific
  title?: string;
  course_is_deleted?: boolean;
  // Question-specific
  question_text?: string;
  question_type?: string;
  chapter_title?: string;
  chapter_is_deleted?: boolean;
}

export default function Trash({ course, onNavigate, isActive }: TrashProps) {
  const [courses, setCourses] = useState<TrashItem[]>([]);
  const [chapters, setChapters] = useState<TrashItem[]>([]);
  const [questions, setQuestions] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'courses' | 'chapters' | 'questions'>('all');
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'restore' | 'hard-delete';
    itemType: 'course' | 'chapter' | 'question';
    itemId: number;
    title: string;
    description: string;
    warning?: string;
    canProceed: boolean;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  // Fetch trash items from the API
  const fetchTrash = async () => {
    setLoading(true);
    setError('');
    try {
      const url = course ? `/api/trash?course_id=${course.id}` : '/api/trash';
      const response = await client.get(url);
      setCourses(response.data.courses || []);
      setChapters(response.data.chapters || []);
      setQuestions(response.data.questions || []);
    } catch (err: any) {
      console.error(err);
      setError('Không thể tải danh sách Thùng rác. Vui lòng tải lại trang.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchTrash();
    }
  }, [isActive, course]);

  // Clean success message after 4s
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  const openConfirmModal = (
    type: 'restore' | 'hard-delete',
    item: TrashItem
  ) => {
    let title = '';
    let description = '';
    let warning = '';
    let canProceed = true;

    const itemName = item.type === 'course' 
      ? `${item.course_code} - ${item.course_name}`
      : item.type === 'chapter'
        ? item.title || ''
        : item.question_text?.substring(0, 60) + (item.question_text && item.question_text.length > 60 ? '...' : '');

    if (type === 'restore') {
      title = 'Xác nhận khôi phục';
      description = `Bạn có chắc chắn muốn khôi phục mục "${itemName}" không?`;
      
      // Dependency check
      if (item.type === 'chapter' && item.course_is_deleted) {
        warning = `Không thể khôi phục chương này vì Môn học cha (${item.course_code}) đã bị xóa và nằm trong Thùng rác. Bạn cần khôi phục Môn học trước.`;
        canProceed = false;
      } else if (item.type === 'question') {
        if (item.course_is_deleted) {
          warning = `Không thể khôi phục câu hỏi này vì Môn học cha (${item.course_code}) đã bị xóa và nằm trong Thùng rác.`;
          canProceed = false;
        } else if (item.chapter_is_deleted) {
          warning = `Không thể khôi phục câu hỏi này vì Chương học cha "${item.chapter_title}" đã bị xóa và nằm trong Thùng rác. Bạn cần khôi phục Chương học trước.`;
          canProceed = false;
        }
      } else if (item.type === 'course') {
        description = `Bạn có chắc chắn muốn khôi phục Môn học "${itemName}" không? Tất cả các Chương và Câu hỏi đi kèm đã bị xóa cùng lúc sẽ được khôi phục.`;
      }
    } else {
      title = 'Xác nhận Xóa vĩnh viễn';
      description = `CẢNH BÁO: Hành động này không thể hoàn tác! Bạn có chắc chắn muốn xóa vĩnh viễn mục "${itemName}" ra khỏi cơ sở dữ liệu?`;
      
      if (item.type === 'course') {
        warning = 'Xóa vĩnh viễn môn học này sẽ đồng thời xóa vĩnh viễn toàn bộ Chương, Slide, Câu hỏi, Ma trận bao phủ, và Tài liệu RAG liên quan.';
      }
    }

    setConfirmModal({
      isOpen: true,
      type,
      itemType: item.type,
      itemId: item.id,
      title,
      description,
      warning,
      canProceed
    });
  };

  const handleActionConfirm = async () => {
    if (!confirmModal) return;
    setActionLoading(true);
    setError('');
    
    const { type, itemType, itemId } = confirmModal;

    try {
      if (type === 'restore') {
        await client.post(`/api/trash/restore/${itemType}/${itemId}`);
        setSuccessMsg('Đã khôi phục dữ liệu thành công!');
      } else {
        await client.delete(`/api/trash/hard-delete/${itemType}/${itemId}`);
        setSuccessMsg('Đã xóa vĩnh viễn dữ liệu thành công!');
      }
      setConfirmModal(null);
      // Reload items
      fetchTrash();
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Đã xảy ra lỗi khi thực hiện tác vụ.');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter items based on tab and search query
  const matchesSearch = (text?: string) => {
    if (!text) return false;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const filteredCourses = courses.filter(item => 
    matchesSearch(item.course_code) || matchesSearch(item.course_name)
  );

  const filteredChapters = chapters.filter(item => 
    matchesSearch(item.title) || matchesSearch(item.course_name) || matchesSearch(item.course_code)
  );

  const filteredQuestions = questions.filter(item => 
    matchesSearch(item.question_text) || matchesSearch(item.course_name) || matchesSearch(item.chapter_title)
  );

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('vi-VN', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  };

  const allItemsCount = filteredCourses.length + filteredChapters.length + filteredQuestions.length;

  return (
    <div className="trash-view-container">
      {/* HEADER SECTION */}
      <header className="trash-header">
        <div>
          <h2 className="trash-view-title">
            <Trash2 size={24} className="trash-title-icon" />
            {course ? `Thùng rác Môn học: ${course.course_code}` : 'Thùng rác Hệ thống'}
          </h2>
          <p className="trash-view-subtitle">
            {course 
              ? 'Xem và quản lý các Chương học, Câu hỏi đã xóa của môn học này.' 
              : 'Xem và quản lý các Môn học, Chương học, Câu hỏi đã xóa trên toàn hệ thống.'}
          </p>
        </div>
      </header>

      {/* ERROR & SUCCESS ALERTS */}
      {error && (
        <div className="trash-alert trash-alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="alert-close-btn"><X size={14} /></button>
        </div>
      )}

      {successMsg && (
        <div className="trash-alert trash-alert-success">
          <CheckCircle size={18} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="alert-close-btn"><X size={14} /></button>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="trash-toolbar">
        <div className="trash-tabs">
          <button 
            onClick={() => setActiveTab('all')} 
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          >
            Tất cả
          </button>
          {!course && (
            <button 
              onClick={() => setActiveTab('courses')} 
              className={`tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
            >
              Môn học ({courses.length})
            </button>
          )}
          <button 
            onClick={() => setActiveTab('chapters')} 
            className={`tab-btn ${activeTab === 'chapters' ? 'active' : ''}`}
          >
            Chương học ({chapters.length})
          </button>
          <button 
            onClick={() => setActiveTab('questions')} 
            className={`tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
          >
            Câu hỏi ({questions.length})
          </button>
        </div>

        <div className="trash-search-wrapper">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Tìm kiếm mục đã xóa..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="trash-search-input"
          />
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      {loading ? (
        <div className="trash-loading-wrapper">
          <Loader2 size={32} className="animate-spin text-indigo" />
          <p>Đang tải dữ liệu từ Thùng rác...</p>
        </div>
      ) : allItemsCount === 0 ? (
        <div className="trash-empty-state">
          <div className="empty-icon-circle">
            <Trash2 size={40} />
          </div>
          <h3>Thùng rác trống</h3>
          <p>Không tìm thấy mục nào đã xóa khớp với bộ lọc hiện tại.</p>
        </div>
      ) : (
        <div className="trash-items-grid">
          
          {/* 1. COURSES TAB */}
          {(activeTab === 'all' || activeTab === 'courses') && !course && filteredCourses.length > 0 && (
            <section className="trash-category-section">
              <h3 className="category-title">Môn học đã xóa</h3>
              <div className="trash-list-card">
                {filteredCourses.map(item => (
                  <div key={`course-${item.id}`} className="trash-item-row">
                    <div className="item-info-col">
                      <div className="item-icon-wrapper course-icon">
                        <BookOpen size={18} />
                      </div>
                      <div className="item-text-details">
                        <span className="item-main-name">{item.course_code} - {item.course_name}</span>
                        <span className="item-meta-desc">Đã xóa vào lúc: {formatDate(item.deleted_at)}</span>
                      </div>
                    </div>
                    <div className="item-actions-col">
                      <button 
                        onClick={() => openConfirmModal('restore', item)}
                        className="action-btn restore-btn"
                        title="Khôi phục môn học"
                      >
                        <RotateCcw size={14} /> Khôi phục
                      </button>
                      <button 
                        onClick={() => openConfirmModal('hard-delete', item)}
                        className="action-btn hard-delete-btn"
                        title="Xóa vĩnh viễn"
                      >
                        <Trash2 size={14} /> Xóa vĩnh viễn
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2. CHAPTERS TAB */}
          {(activeTab === 'all' || activeTab === 'chapters') && filteredChapters.length > 0 && (
            <section className="trash-category-section">
              <h3 className="category-title">Chương học đã xóa</h3>
              <div className="trash-list-card">
                {filteredChapters.map(item => (
                  <div key={`chapter-${item.id}`} className="trash-item-row">
                    <div className="item-info-col">
                      <div className="item-icon-wrapper chapter-icon">
                        <FileText size={18} />
                      </div>
                      <div className="item-text-details">
                        <span className="item-main-name">{item.title}</span>
                        <div className="item-hierarchy-path">
                          <span>Môn học: <strong>{item.course_code} - {item.course_name}</strong></span>
                          {item.course_is_deleted && (
                            <span className="dependency-warning-badge">
                              <AlertTriangle size={10} /> Môn học cha đã bị xóa
                            </span>
                          )}
                        </div>
                        <span className="item-meta-desc">Đã xóa vào lúc: {formatDate(item.deleted_at)}</span>
                      </div>
                    </div>
                    <div className="item-actions-col">
                      <button 
                        onClick={() => openConfirmModal('restore', item)}
                        className={`action-btn restore-btn ${item.course_is_deleted ? 'disabled' : ''}`}
                        title={item.course_is_deleted ? "Cần khôi phục Môn học trước" : "Khôi phục chương"}
                        disabled={item.course_is_deleted}
                      >
                        <RotateCcw size={14} /> Khôi phục
                      </button>
                      <button 
                        onClick={() => openConfirmModal('hard-delete', item)}
                        className="action-btn hard-delete-btn"
                        title="Xóa vĩnh viễn"
                      >
                        <Trash2 size={14} /> Xóa vĩnh viễn
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. QUESTIONS TAB */}
          {(activeTab === 'all' || activeTab === 'questions') && filteredQuestions.length > 0 && (
            <section className="trash-category-section">
              <h3 className="category-title">Câu hỏi đã xóa</h3>
              <div className="trash-list-card">
                {filteredQuestions.map(item => {
                  const isBlocked = item.course_is_deleted || item.chapter_is_deleted;
                  return (
                    <div key={`question-${item.id}`} className="trash-item-row">
                      <div className="item-info-col">
                        <div className="item-icon-wrapper question-icon">
                          <HelpCircle size={18} />
                        </div>
                        <div className="item-text-details">
                          <span className="item-main-name">{item.question_text}</span>
                          <div className="item-hierarchy-path">
                            <span>Môn học: <strong>{item.course_code}</strong></span>
                            {item.chapter_title && (
                              <span> | Chương: <strong>{item.chapter_title}</strong></span>
                            )}
                            {item.course_is_deleted && (
                              <span className="dependency-warning-badge">
                                <AlertTriangle size={10} /> Môn học cha đã bị xóa
                              </span>
                            )}
                            {!item.course_is_deleted && item.chapter_is_deleted && (
                              <span className="dependency-warning-badge">
                                <AlertTriangle size={10} /> Chương cha đã bị xóa
                              </span>
                            )}
                          </div>
                          <span className="item-meta-desc">Kiểu: {item.question_type} | Đã xóa vào lúc: {formatDate(item.deleted_at)}</span>
                        </div>
                      </div>
                      <div className="item-actions-col">
                        <button 
                          onClick={() => openConfirmModal('restore', item)}
                          className={`action-btn restore-btn ${isBlocked ? 'disabled' : ''}`}
                          title={isBlocked ? "Cần khôi phục Môn học hoặc Chương cha trước" : "Khôi phục câu hỏi"}
                          disabled={isBlocked}
                        >
                          <RotateCcw size={14} /> Khôi phục
                        </button>
                        <button 
                          onClick={() => openConfirmModal('hard-delete', item)}
                          className="action-btn hard-delete-btn"
                          title="Xóa vĩnh viễn"
                        >
                          <Trash2 size={14} /> Xóa vĩnh viễn
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      )}

      {/* DEPENDENCY INFO PANEL */}
      <div className="trash-info-footer">
        <Info size={16} />
        <span>Hệ thống bảo lưu dữ liệu đã xóa của bạn dưới dạng xóa mềm. Bạn chỉ có thể khôi phục các mục con (Chương, Câu hỏi) nếu môn học cha của chúng đang hoạt động.</span>
      </div>

      {/* CONFIRMATION DIALOG MODAL */}
      {confirmModal && confirmModal.isOpen && (
        <div className="trash-modal-backdrop">
          <div className="trash-modal">
            <div className="modal-header">
              <h3>{confirmModal.title}</h3>
              <button onClick={() => setConfirmModal(null)} className="modal-close-icon"><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">{confirmModal.description}</p>
              
              {confirmModal.warning && (
                <div className="modal-alert-box modal-alert-warning">
                  <AlertTriangle size={16} />
                  <span>{confirmModal.warning}</span>
                </div>
              )}

              {!confirmModal.canProceed && (
                <div className="modal-alert-box modal-alert-error">
                  <Info size={16} />
                  <span>Nút Xác nhận bị khóa do ràng buộc cấu trúc dữ liệu.</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="modal-btn cancel-btn"
                disabled={actionLoading}
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleActionConfirm} 
                className={`modal-btn confirm-btn ${confirmModal.type === 'hard-delete' ? 'danger-btn' : ''}`}
                disabled={!confirmModal.canProceed || actionLoading}
              >
                {actionLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={14} className="animate-spin" /> Đang xử lý...
                  </span>
                ) : (
                  'Xác nhận'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
