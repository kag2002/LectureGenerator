'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Silent in production or reportable if desired, avoiding console.error leaks
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'radial-gradient(circle at 10% 20%, rgb(15, 23, 42) 0%, rgb(9, 13, 26) 90%)',
          color: '#f8fafc',
          fontFamily: '"Outfit", "Inter", sans-serif',
          padding: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(212, 163, 89, 0.2)',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '540px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)'
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              fontSize: '32px',
              marginBottom: '24px'
            }}>
              ⚠
            </div>
            
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '12px',
              color: '#fcd34d',
              letterSpacing: '-0.025em'
            }}>
              Đã xảy ra sự cố hiển thị
            </h2>
            
            <p style={{
              color: '#94a3b8',
              fontSize: '15px',
              lineHeight: '1.6',
              marginBottom: '24px'
            }}>
              Ứng dụng khách của Trợ lý Sư phạm AI đã phát hiện một lỗi kết xuất không mong muốn. Để tránh gián đoạn, Thầy/Cô vui lòng thử tải lại trang.
            </p>

            {this.state.error && (
              <pre style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#f87171',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '24px',
                maxHeight: '120px'
              }}>
                {this.state.error.toString()}
              </pre>
            )}

            <button
              onClick={this.handleReload}
              style={{
                background: 'linear-gradient(135deg, #d4a359 0%, #b8863b 100%)',
                color: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 6px -1px rgba(212, 163, 89, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 8px -1px rgba(212, 163, 89, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(212, 163, 89, 0.2)';
              }}
            >
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
