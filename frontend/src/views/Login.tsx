import React, { useState } from 'react';
import client from '../api/client';
import { LogIn, UserPlus } from 'lucide-react';
import { User } from '@/types';
import '../styles/Login.css';

export interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('prof.khatkhe@vinuni.edu.vn');
  const [password, setPassword] = useState('VinUni2026!#');
  const [fullName, setFullName] = useState('GS. Nguyen Khat Khe');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
            <label className="login-label" htmlFor="login-email">Email trường học</label>
            <input
              id="login-email"
              name="email"
              type="email"
              placeholder="username@vinuni.edu.vn"
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
        </div>
      </div>
    </div>
  );
}


