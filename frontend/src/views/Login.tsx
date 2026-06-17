import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { LogIn, UserPlus } from 'lucide-react';
import { User } from '@/types';
import '../styles/Login.css';

export interface LoginProps {
  onLoginSuccess: (user: User) => void;
  onBackToLanding?: () => void;
}

export default function Login({ onLoginSuccess, onBackToLanding }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async (response: any) => {
    setError('');
    setLoading(true);
    try {
      const idToken = response.credential;
      const res = await client.post('/api/auth/google', {
        id_token: idToken,
      });
      const { access_token, user } = res.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail || 
        'Đăng nhập bằng Google thất bại. Vui lòng thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initGoogleSignIn = () => {
      const g = (window as any).google;
      if (typeof window !== 'undefined' && g?.accounts?.id) {
        try {
          const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id-here.apps.googleusercontent.com';
          
          g.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleLogin,
            cancel_on_tap_outside: true,
          });

          const buttonParent = document.getElementById('google-signin-btn');
          if (buttonParent) {
            g.accounts.id.renderButton(buttonParent, {
              theme: 'outline',
              size: 'large',
              width: '100%',
              text: 'signin_with',
              shape: 'rectangular',
              logo_alignment: 'left',
            });
          }
        } catch (err) {
          console.error('Lỗi khi khởi tạo Google Sign-in:', err);
        }
      }
    };

    if (typeof window !== 'undefined') {
      const g = (window as any).google;
      if (g?.accounts?.id) {
        initGoogleSignIn();
      } else {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const currentG = (window as any).google;
          if (currentG?.accounts?.id) {
            initGoogleSignIn();
            clearInterval(interval);
          } else if (attempts > 15) {
            clearInterval(interval);
          }
        }, 300);
        return () => clearInterval(interval);
      }
    }
  }, [isRegister]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const response = await client.post('/api/auth/register', {
          email,
          password,
          full_name: fullName
        });
        const { access_token, user } = response.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('user', JSON.stringify(user));
        onLoginSuccess(user);
      } else {
        const response = await client.post('/api/auth/login', {
          email,
          password
        });
        const { access_token, user } = response.data;
        localStorage.setItem('token', access_token);
        localStorage.setItem('user', JSON.stringify(user));
        onLoginSuccess(user);
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail || 
        'Có lỗi xảy ra, vui lòng kiểm tra lại thông tin đăng nhập.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background decoration bubbles */}
      <div className="login-bubble-1"></div>
      <div className="login-bubble-2"></div>

      <div className="login-card">
        <div className="login-header">
          <h2 className="login-title">AI Lecture Assistant</h2>
          <p className="login-subtitle">
            {isRegister ? 'Tạo tài khoản Giảng viên mới' : 'Hệ thống thiết kế bài giảng & Đề thi'}
          </p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {isRegister && (
            <div className="login-input-group">
              <label className="login-label" htmlFor="register-name">Họ và tên</label>
              <input
                id="register-name"
                name="name"
                type="text"
                placeholder="Nhập họ và tên giảng viên"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="login-input"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="login-input-group">
            <label className="login-label" htmlFor="login-email">Email giảng viên / Trường học</label>
            <input
              id="login-email"
              name="email"
              type="email"
              placeholder="username@domain.com hoặc email trường"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="login-input"
              autoComplete="email"
              spellCheck={false}
              required
            />
          </div>

          <div className="login-input-group">
            <label className="login-label" htmlFor="login-password">Mật khẩu</label>
            <input
              id="login-password"
              name="password"
              type="password"
              placeholder="Nhập mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? (
              'Đang xử lý…'
            ) : isRegister ? (
              <span className="login-btn-inner">
                <UserPlus size={18} aria-hidden="true" /> Đăng Ký Thành Viên
              </span>
            ) : (
              <span className="login-btn-inner">
                <LogIn size={18} aria-hidden="true" /> Đăng Nhập
              </span>
            )}
          </button>
        </form>

        <div className="login-divider">
          <span className="login-divider-line"></span>
          <span className="login-divider-text">Hoặc</span>
          <span className="login-divider-line"></span>
        </div>

        <div className="login-google-container">
          <div id="google-signin-btn"></div>
        </div>

        <div className="login-footer">
          <p className="login-footer-text">
            {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản giảng viên?'}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="login-switch-btn"
            >
              {isRegister ? 'Đăng nhập ngay' : 'Đăng ký tại đây'}
            </button>
          </p>
          {onBackToLanding && (
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={onBackToLanding}
                className="login-switch-btn"
                style={{ fontSize: '13px', opacity: 0.8 }}
              >
                ← Trở về trang giới thiệu
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


