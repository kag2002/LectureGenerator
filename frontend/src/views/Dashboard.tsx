import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { Plus, Pencil, Trash2, LogOut, ChevronRight, BookOpen } from 'lucide-react';
import { User, Course } from '@/types';
import '../styles/Dashboard.css';

export interface DashboardProps {
  user: User | null;
  onLogout: () => void;
  onSelectCourse: (course: Course) => void;
}

export default function Dashboard({ user, onLogout, onSelectCourse }: DashboardProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Lấy danh sách môn học của User từ API
  const fetchCourses = async () => {
    setLoading(true);
    try {
      const response = await client.get('/api/courses');
      setCourses(response.data);
    } catch (err) {
      console.error(err);
      setError('Không thể lấy danh sách môn học. Vui lòng tải lại trang.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await client.post('/api/courses', {
        course_code: courseCode,
        course_name: courseName
      });
      setCourses([response.data, ...courses]);
      setCourseCode('');
      setCourseName('');
    } catch (err) {
      console.error(err);
      setError('Lỗi khi tạo môn học mới.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCourse = async (course: Course, e: React.MouseEvent) => {
    e.stopPropagation(); // Ngăn sự kiện click vào Card kích hoạt select course
    const newCode = prompt('Nhập mã môn học mới:', course.course_code);
    if (newCode === null) return; // Hủy
    const newName = prompt('Nhập tên môn học mới:', course.course_name);
    if (newName === null) return; // Hủy

    if (!newCode.trim() || !newName.trim()) {
      alert('Mã môn và tên môn không được để trống.');
      return;
    }

    try {
      const response = await client.put(`/api/courses/${course.id}`, {
        course_code: newCode.trim(),
        course_name: newName.trim()
      });
      setCourses(courses.map(c => c.id === course.id ? response.data : c));
    } catch (err) {
      console.error(err);
      alert('Không thể cập nhật môn học này.');
    }
  };

  const handleDeleteCourse = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Ngăn sự kiện click vào Card kích hoạt select course
    if (!window.confirm('Bạn có chắc chắn muốn xóa môn học này không?')) return;

    try {
      await client.delete(`/api/courses/${id}`);
      setCourses(courses.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
      alert('Không thể xóa môn học này.');
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">LectureGenerator</h1>
          <p className="dashboard-welcome">Xin chào, <strong>{user?.username || 'Giảng viên'}</strong></p>
        </div>
        <button onClick={onLogout} className="dashboard-logout-btn">
          <LogOut size={15} /> Đăng Xuất
        </button>
      </header>

      {error && <div className="dashboard-error">{error}</div>}

      <main className="dashboard-main">
        {/* Khung tạo môn học mới bên trái */}
        <section className="dashboard-form-section">
          <h3 className="dashboard-section-title">Tạo Môn Học Mới</h3>
          <form onSubmit={handleCreateCourse} className="dashboard-form">
            <div className="dashboard-input-group">
              <label className="dashboard-label">Mã môn học</label>
              <input
                type="text"
                placeholder="Ví dụ: COMP2010"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="dashboard-input"
                required
              />
            </div>
            <div className="dashboard-input-group">
              <label className="dashboard-label">Tên môn học</label>
              <input
                type="text"
                placeholder="Ví dụ: Cấu trúc Dữ liệu"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="dashboard-input"
                required
              />
            </div>
            <button type="submit" disabled={submitting} className="dashboard-submit-btn">
              <span className="dashboard-inline-flex-center">
                <Plus size={16} /> {submitting ? 'Đang tạo...' : 'Tạo Môn Học'}
              </span>
            </button>
          </form>
        </section>

        {/* Danh sách môn học bên phải */}
        <section className="dashboard-list-section">
          <h3 className="dashboard-section-title">Danh Sách Môn Học Của Bạn</h3>
          {loading ? (
            <div className="dashboard-loading">Đang tải danh sách môn học...</div>
          ) : courses.length === 0 ? (
            <div className="dashboard-empty">
              <p>Chưa có môn học nào được tạo.</p>
              <p className="dashboard-empty-desc">Hãy nhập mã và tên môn học ở cột bên trái để khởi tạo.</p>
            </div>
          ) : (
            <div className="dashboard-grid">
              {courses.map(course => (
                <div 
                  key={course.id} 
                  onClick={() => onSelectCourse(course)}
                  className="dashboard-card"
                >
                  <div className="dashboard-card-header">
                    <span className="dashboard-course-badge">{course.course_code}</span>
                    <div className="dashboard-card-actions">
                      <button 
                        onClick={(e) => handleUpdateCourse(course, e)} 
                        className="dashboard-action-btn"
                        title="Chỉnh sửa môn học"
                      >
                        <Pencil size={15} className="dashboard-icon-pencil" />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteCourse(course.id, e)} 
                        className="dashboard-action-btn"
                        title="Xóa môn học"
                      >
                        <Trash2 size={15} className="dashboard-icon-trash" />
                      </button>
                    </div>
                  </div>
                  <h4 className="dashboard-course-name">{course.course_name}</h4>
                  <div className="dashboard-card-footer">
                    <span className="dashboard-inline-flex-left">
                      <BookOpen size={14} /> CLOs: Đang tải...
                    </span>
                    <span className="dashboard-enter-link">
                      Vào thiết lập <ChevronRight size={14} className="dashboard-enter-link-icon" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


