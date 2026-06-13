'use client';

import React, { useState, useEffect } from 'react';
import { 
  Map, 
  FileText, 
  BookOpen, 
  HelpCircle, 
  BarChart2, 
  Library, 
  MessageSquare,
  Sun, 
  Moon, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  User as UserIcon,
  Home,
  Activity,
  ArrowLeft
} from 'lucide-react';
import { Course } from '@/types';
import FlowSteps from './FlowSteps';
import '../styles/AppShell.css';

export interface AppShellProps {
  course: Course;
  activeView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AppShell({ 
  course, 
  activeView, 
  onNavigate, 
  onLogout, 
  children 
}: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'academic'>('light');
  const [username, setUsername] = useState('Giảng viên');

  // Load theme and user on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'academic' | null;
    const currentTheme = savedTheme || 'light';
    setTheme(currentTheme);
    document.documentElement.setAttribute('data-theme', currentTheme);

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.full_name) setUsername(u.full_name);
        else if (u && u.username) setUsername(u.username);
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const toggleTheme = () => {
    let nextTheme: 'light' | 'dark' | 'academic';
    if (theme === 'light') {
      nextTheme = 'academic';
    } else if (theme === 'academic') {
      nextTheme = 'dark';
    } else {
      nextTheme = 'light';
    }
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const getThemeInfo = () => {
    switch (theme) {
      case 'light':
        return {
          title: "Đang dùng Light Mode (Xanh/Trắng). Bấm để chuyển sang Academic Mode.",
          icon: <Sun size={16} />
        };
      case 'academic':
        return {
          title: "Đang dùng Academic Mode (Trắng/Cát). Bấm để chuyển sang Dark Mode.",
          icon: <BookOpen size={16} />
        };
      case 'dark':
      default:
        return {
          title: "Đang dùng Dark Mode (Velvet Tối). Bấm để chuyển sang Light Mode.",
          icon: <Moon size={16} />
        };
    }
  };

  const menuItems = [
    { view: 'course_roadmap', label: 'Lộ trình Môn học', icon: <Map size={18} /> },
    { view: 'course_config', label: 'Bóc tách Syllabus', icon: <FileText size={18} /> },
    { view: 'lesson_planner', label: 'Soạn Bài giảng', icon: <BookOpen size={18} /> },
    { view: 'question_bank', label: 'Ngân hàng Đề thi', icon: <HelpCircle size={18} /> },
    { view: 'matrix_dashboard', label: 'Ma trận CLO-Bloom', icon: <BarChart2 size={18} /> },
    { view: 'knowledge_base', label: 'Thư viện RAG', icon: <Library size={18} /> },
    { view: 'chatbot', label: 'Trợ lý AI Support', icon: <MessageSquare size={18} /> },
    { view: 'ai_monitor', label: 'Giám sát AI', icon: <Activity size={18} /> },
  ];

  return (
    <div className="app-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className={`app-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-logo">
            <span className="logo-icon">VL</span>
            {!isCollapsed && <span className="logo-text">VinUni Lecture</span>}
          </div>
          <button 
            className="collapse-btn" 
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map(item => {
            const isActive = activeView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                className={`nav-item ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">{item.icon}</span>
                {!isCollapsed && <span className="nav-label">{item.label}</span>}
                {isActive && <div className="active-indicator" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button onClick={() => onNavigate('dashboard')} className="footer-btn" title="Về Dashboard chính">
            <Home size={18} />
            {!isCollapsed && <span>Môn học khác</span>}
          </button>

          {/* User Profile, Theme Toggle, & Logout (moved from top header) */}
          {!isCollapsed ? (
            <div className="sidebar-user-card">
              <div className="user-profile">
                <div className="avatar">
                  <UserIcon size={16} />
                </div>
                <div className="user-info">
                  <span className="username">{username}</span>
                  <span className="user-role">Giảng viên</span>
                </div>
              </div>
              <div className="sidebar-actions-row">
                <button 
                  onClick={toggleTheme} 
                  className="theme-toggle" 
                  title={getThemeInfo().title}
                >
                  {getThemeInfo().icon}
                </button>
                <button onClick={onLogout} className="logout-btn" title="Đăng xuất khỏi hệ thống">
                  <LogOut size={16} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="sidebar-collapsed-actions">
              <div className="user-profile collapsed-avatar" title={username}>
                <div className="avatar">
                  <UserIcon size={16} />
                </div>
              </div>
              <button 
                onClick={toggleTheme} 
                className="theme-toggle" 
                title={getThemeInfo().title}
              >
                {getThemeInfo().icon}
              </button>
              <button onClick={onLogout} className="logout-btn icon-only" title="Đăng xuất khỏi hệ thống">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="app-main-wrapper">
        <header className="app-top-header">
          {/* Left Area: Back Button and Title */}
          <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {activeView === 'course_roadmap' ? (
              <button 
                onClick={() => onNavigate('dashboard')} 
                className="header-back-btn" 
                title="Về danh sách chọn môn học"
              >
                <ChevronLeft size={14} /> Môn khác
              </button>
            ) : (
              <button 
                onClick={() => onNavigate('course_roadmap')} 
                className="header-back-btn" 
                title="Quay lại Lộ trình Môn học"
              >
                <ArrowLeft size={14} /> Sơ đồ
              </button>
            )}
            
            {activeView === 'course_roadmap' && (
              <div className="header-title-container" style={{ display: 'flex', flexDirection: 'column' }}>
                <h1 className="header-page-title" style={{ margin: 0, fontSize: '15px', fontWeight: 800, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '300px' }} title={`${course?.course_code} - ${course?.course_name}`}>
                  {`${course?.course_code} - ${course?.course_name}`}
                </h1>
              </div>
            )}
          </div>

          {/* Center Area: Stepper Timeline */}
          <div className="header-center" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <FlowSteps 
              activeStep={
                activeView === 'course_config' ? 'syllabus' :
                activeView === 'knowledge_base' ? 'rag' :
                activeView === 'lesson_planner' ? 'slides' :
                activeView === 'question_bank' ? 'questions' :
                activeView === 'matrix_dashboard' ? 'matrix' : null
              } 
              onNavigate={onNavigate} 
            />
          </div>

          {/* Right Area: Action Portal Slot */}
          <div className="header-right-area" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            <div id="app-header-portal-slot" className="header-portal-slot" />
          </div>
        </header>

        <main className="app-main-content">
          <div className="animated-fade-in content-container">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
