'use client';

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Cpu, 
  Database, 
  HardDrive, 
  Activity, 
  DollarSign, 
  TrendingUp, 
  RefreshCw, 
  Layers, 
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronRight,
  DatabaseZap,
  BarChart2,
  Settings,
  Download,
  AlertCircle,
  Eye
} from 'lucide-react';
import axios from 'axios';
import '../styles/AppShell.css'; // Tận dụng style chung

interface AdminDashboardProps {
  onBack: () => void;
  isActive: boolean;
}

export default function AdminDashboard({ onBack, isActive }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [traffic, setTraffic] = useState<any>(null);
  const [aiCosts, setAiCosts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'traffic' | 'ai' | 'pedagogical' | 'alerts' | 'memory'>('overview');
  const [refreshInterval, setRefreshInterval] = useState<number>(10); // seconds
  const [sftData, setSftData] = useState<any>(null);
  const [simulatingAlert, setSimulatingAlert] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  // Cấu hình cảnh báo hiển thị trên UI
  const [localAlertConfig, setLocalAlertConfig] = useState({
    slack_webhook_url: 'https://hooks.slack.com/services/... (Cấu hình qua .env)',
    telegram_bot_token: 'bot... (Cấu hình qua .env)',
    telegram_chat_id: '... (Cấu hình qua .env)',
    enable_alerting: true,
    alert_cpu_threshold: 85,
    alert_ram_threshold: 90
  });

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const fetchSftData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API_BASE_URL}/api/telemetry/admin/analytics/finetune-dataset`, { headers });
      setSftData(res.data);
    } catch (err: any) {
      console.error('Lỗi khi fetch dữ liệu SFT:', err);
    }
  };

  const fetchMemories = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoadingMemories(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API_BASE_URL}/api/admin/agent/memory`, { headers });
      setMemories(res.data);
    } catch (err: any) {
      console.error('Lỗi khi fetch dữ liệu bộ nhớ:', err);
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bản ghi bộ nhớ này của Agent không? Điều này sẽ ảnh hưởng đến khả năng Reflection / Few-shot học từ quá khứ của User.')) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.delete(`${API_BASE_URL}/api/admin/agent/memory/${memoryId}`, { headers });
      setMessage({ text: 'Xóa bản ghi bộ nhớ Agent thành công.', type: 'success' });
      fetchMemories();
    } catch (err: any) {
      console.error('Lỗi khi xóa bộ nhớ:', err);
      setMessage({ 
        text: err.response?.data?.detail || 'Không thể xóa bản ghi bộ nhớ.', 
        type: 'error' 
      });
    }
  };


  const handleSimulateAlert = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setSimulatingAlert(true);
    setMessage({ text: 'Đang gửi tín hiệu giả lập cảnh báo tới Slack và Telegram...', type: 'info' });

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post(`${API_BASE_URL}/api/admin/alert/simulate`, {}, { headers });
      if (res.data.slack_sent || res.data.telegram_sent) {
        setMessage({ 
          text: `Mô phỏng thành công! ${res.data.message}`, 
          type: 'success' 
        });
      } else {
        setMessage({ 
          text: `Giả lập gửi tin nhắn thành công. Lưu ý: Cảnh báo thực tế có thể không kích hoạt nếu thiếu biến cấu hình webhook trong .env. (${res.data.message})`, 
          type: 'info' 
        });
      }
    } catch (err: any) {
      console.error('Lỗi giả lập cảnh báo:', err);
      setMessage({ 
        text: err.response?.data?.detail || 'Lỗi hệ thống khi gửi cảnh báo mô phỏng.', 
        type: 'error' 
      });
    } finally {
      setSimulatingAlert(false);
    }
  };

  const getBloomDistribution = () => {
    const dist = [0, 0, 0, 0, 0, 0];
    if (!sftData || !sftData.data) return dist;
    sftData.data.forEach((item: any) => {
      const level = item.metadata?.bloom_level;
      if (level >= 1 && level <= 6) {
        dist[level - 1]++;
      }
    });
    return dist;
  };

  const getAverageEditRatio = () => {
    if (!sftData || !sftData.data || sftData.data.length === 0) return 0;
    let totalRatio = 0;
    let count = 0;
    sftData.data.forEach((item: any) => {
      if (item.proposed && item.accepted_edited) {
        const prop = item.proposed;
        const edit = item.accepted_edited;
        const maxLen = Math.max(prop.length, edit.length);
        if (maxLen > 0) {
          let diff = Math.abs(prop.length - edit.length);
          const minLen = Math.min(prop.length, edit.length);
          const step = Math.max(1, Math.floor(minLen / 50));
          for (let i = 0; i < minLen; i += step) {
            if (prop[i] !== edit[i]) diff += step;
          }
          const ratio = 1 - (diff / maxLen);
          totalRatio += Math.max(0, Math.min(1, ratio));
          count++;
        }
      }
    });
    return count > 0 ? (totalRatio / count) : 1.0;
  };

  const handleDownloadSftDataset = () => {
    if (!sftData || !sftData.data) return;
    
    // NER Anonymization helper
    const anonymizeText = (text: string) => {
      if (!text) return '';
      return text
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]') // Emails
        .replace(/([Vv][Ii][Nn]\d{8}|\d{7,10})/g, '[ID]') // Student/VinUni IDs
        .replace(/(0\d{9,10}|\+84\d{9,10})/g, '[PHONE]') // Phone numbers
        .replace(/\b(Nguyen|Tran|Le|Pham|Hoang|Huynh|Phan|Vu|Vo|Dang|Bui|Do|Ho|Ngo|Duong|Ly)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\b/g, '[NAME]'); // Common Vietnamese names
    };

    // Format as JSONL with NER applied
    const jsonlString = sftData.data.map((item: any) => {
      const anonymizedItem = {
        prompt: anonymizeText(item.prompt),
        proposed: anonymizeText(item.proposed),
        accepted_edited: anonymizeText(item.accepted_edited),
        rating: item.rating,
        metadata: item.metadata
      };
      return JSON.stringify(anonymizedItem);
    }).join('\n');

    const blob = new Blob([jsonlString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vinuni_sft_dataset_anonymized_${new Date().toISOString().split('T')[0]}.jsonl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  function renderLineChart(
    data: any[],
    key: string,
    strokeColor: string,
    fillGradId: string,
    gradientColor: string,
    maxVal = 100
  ) {
    if (!data || data.length === 0) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '150px', color: '#64748b', fontSize: '13px' }}>
          Chưa có dữ liệu lịch sử tải hệ thống.
        </div>
      );
    }

    const width = 500;
    const height = 150;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const actualMax = Math.max(...data.map(d => d[key] || 0), 1);
    const scaleMax = maxVal === 100 ? 100 : Math.ceil(actualMax * 1.2 / 5) * 5;

    const points = data.map((d, i) => {
      const val = d[key] || 0;
      const x = paddingLeft + (i / (data.length === 1 ? 1 : data.length - 1)) * chartWidth;
      const y = height - paddingBottom - (val / scaleMax) * chartHeight;
      return { x, y, val };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = points.length > 0 
      ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z` 
      : '';

    return (
      <svg width="100%" height="150" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradientColor} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={gradientColor} stopOpacity="0"/>
          </linearGradient>
        </defs>
        
        {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
          const y = paddingTop + r * chartHeight;
          const label = Math.round(scaleMax - r * scaleMax);
          return (
            <g key={idx}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
              <text x={paddingLeft - 8} y={y + 4} fill="#64748b" fontSize="9" textAnchor="end">{label}</text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill={`url(#${fillGradId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {points.slice(-15).map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#0f172a" stroke={strokeColor} strokeWidth="1.5" />
        ))}
        
        {points.length > 1 && [0, Math.floor(points.length / 2), points.length - 1].map((idx) => {
          if (idx >= points.length) return null;
          const p = points[idx];
          const rawTime = data[idx].timestamp ? new Date(data[idx].timestamp) : new Date();
          const timeStr = rawTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <text key={idx} x={p.x} y={height - 8} fill="#64748b" fontSize="9" textAnchor="middle">
              {timeStr}
            </text>
          );
        })}
      </svg>
    );
  }

  const fetchData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [metricsRes, trafficRes, aiCostsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/admin/system/metrics`, { headers }),
        axios.get(`${API_BASE_URL}/api/admin/traffic/summary?window_minutes=60`, { headers }),
        axios.get(`${API_BASE_URL}/api/admin/ai/costs`, { headers })
      ]);

      setMetrics(metricsRes.data);
      setTraffic(trafficRes.data);
      setAiCosts(aiCostsRes.data);
      setLoading(false);
    } catch (err: any) {
      console.error('Lỗi khi fetch dữ liệu admin:', err);
      setMessage({ 
        text: err.response?.data?.detail || 'Không thể kết nối đến máy chủ quản trị hệ thống.', 
        type: 'error' 
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchData();
      if (activeTab === 'pedagogical') {
        fetchSftData();
      }
      if (activeTab === 'memory') {
        fetchMemories();
      }
      // Thiết lập tự động làm mới
      const interval = setInterval(() => {
        fetchData();
        if (activeTab === 'pedagogical') {
          fetchSftData();
        }
        if (activeTab === 'memory') {
          fetchMemories();
        }
      }, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [isActive, refreshInterval, activeTab]);

  const handleOptimizeDb = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setOptimizing(true);
    setMessage({ text: 'Đang tối ưu hóa và nén cơ sở dữ liệu SQLite...', type: 'info' });
    
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.post(`${API_BASE_URL}/api/admin/db/optimize`, {}, { headers });
      
      setMessage({ text: res.data.message || 'Tối ưu hóa cơ sở dữ liệu thành công.', type: 'success' });
      await fetchData();
    } catch (err: any) {
      setMessage({ 
        text: err.response?.data?.detail || 'Lỗi xảy ra khi tối ưu cơ sở dữ liệu.', 
        type: 'error' 
      });
    } finally {
      setOptimizing(false);
    }
  };

  if (!isActive) return null;

  return (
    <div className="admin-dashboard" style={{
      color: 'var(--text-primary, #cbd5e1)',
      fontFamily: '"Outfit", "Inter", sans-serif',
      padding: '24px',
      background: 'radial-gradient(circle at 50% 0%, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.2) 100%)',
      borderRadius: '16px',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      minHeight: 'calc(100vh - 120px)'
    }}>
      {/* HEADER SECTION */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            padding: '10px',
            borderRadius: '12px',
            color: '#0f172a',
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)'
          }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px' }}>Quản Trị Hệ Thống</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Giám sát tài nguyên, lưu lượng truy cập và chi phí AI thời gian thực</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#94a3b8' }}>
            <span>Tự động tải lại:</span>
            <select 
              value={refreshInterval} 
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer'
              }}
            >
              <option value={5}>5 giây</option>
              <option value={10}>10 giây</option>
              <option value={30}>30 giây</option>
              <option value={60}>1 phút</option>
            </select>
          </div>
          <button 
            onClick={fetchData} 
            className="btn-refresh" 
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {/* NOTIFICATIONS / MESSAGES */}
      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '14px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          border: '1px solid',
          background: message.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          borderColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)',
          color: message.type === 'error' ? '#f87171' : message.type === 'success' ? '#34d399' : '#60a5fa'
        }}>
          {message.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        paddingBottom: '8px'
      }}>
        {[
          { id: 'overview', label: 'Tài nguyên & Hệ thống', icon: <Cpu size={16} /> },
          { id: 'traffic', label: 'Lưu lượng API (60p)', icon: <Activity size={16} /> },
          { id: 'ai', label: 'Token & Chi phí AI', icon: <DollarSign size={16} /> },
          { id: 'pedagogical', label: 'Phân tích Sư phạm & SFT', icon: <BarChart2 size={16} /> },
          { id: 'memory', label: 'Bộ nhớ Agent', icon: <DatabaseZap size={16} /> },
          { id: 'alerts', label: 'Cấu hình Cảnh báo', icon: <Settings size={16} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === tab.id ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: activeTab === tab.id ? '#fbbf24' : '#94a3b8',
              transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading && !metrics ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', flexDirection: 'column', gap: '12px' }}>
          <RefreshCw className="animate-spin" size={32} style={{ color: '#fbbf24' }} />
          <span>Đang thu thập thông số hệ thống...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: SYSTEM OVERVIEW */}
          {activeTab === 'overview' && metrics && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* TOP CARDS */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                {/* CPU CARD */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Tải CPU</span>
                    <Cpu size={20} style={{ color: '#60a5fa' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9' }}>{metrics.cpu.percent}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${metrics.cpu.percent}%`,
                      height: '100%',
                      background: metrics.cpu.status === 'danger' ? '#ef4444' : metrics.cpu.status === 'warning' ? '#fbbf24' : '#3b82f6',
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>

                {/* RAM CARD */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Bộ nhớ RAM</span>
                    <HardDrive size={20} style={{ color: '#a78bfa' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9' }}>{metrics.ram.percent}%</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{metrics.ram.used_gb}/{metrics.ram.total_gb} GB</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${metrics.ram.percent}%`,
                      height: '100%',
                      background: metrics.ram.status === 'danger' ? '#ef4444' : '#a78bfa',
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>

                {/* DISK CARD */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Dung lượng Đĩa</span>
                    <HardDrive size={20} style={{ color: '#34d399' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9' }}>{metrics.disk.percent}%</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{metrics.disk.used_gb}/{metrics.disk.total_gb} GB</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${metrics.disk.percent}%`,
                      height: '100%',
                      background: metrics.disk.status === 'danger' ? '#ef4444' : '#10b981',
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>

                {/* DATABASE SIZE CARD */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Cơ sở Dữ liệu</span>
                    <Database size={20} style={{ color: '#f43f5e' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '32px', fontWeight: 800, color: '#f1f5f9' }}>{metrics.db.size_mb} MB</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{metrics.db.type}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> Tự động nén định kỳ WAL
                  </div>
                </div>
              </div>

              {/* HISTORICAL TIMELINE CHARTS */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '16px',
                marginTop: '8px'
              }}>
                <div style={{ ...cardStyle, background: 'rgba(30, 41, 59, 0.2)' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cpu size={16} style={{ color: '#60a5fa' }} /> Lịch sử Tải CPU (60 phút)
                  </h3>
                  {renderLineChart(metrics.system_history || [], 'cpu_percent', '#60a5fa', 'cpu-history-grad', '#60a5fa')}
                </div>
                <div style={{ ...cardStyle, background: 'rgba(30, 41, 59, 0.2)' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HardDrive size={16} style={{ color: '#a78bfa' }} /> Lịch sử Bộ nhớ RAM (60 phút)
                  </h3>
                  {renderLineChart(metrics.system_history || [], 'ram_percent', '#a78bfa', 'ram-history-grad', '#a78bfa')}
                </div>
              </div>

              {/* ACTION PANEL */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    background: 'rgba(244, 63, 94, 0.1)',
                    color: '#f43f5e',
                    padding: '12px',
                    borderRadius: '10px'
                  }}>
                    <DatabaseZap size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Tối ưu hóa và nén cơ sở dữ liệu</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Giải phóng dung lượng đĩa ảo dư thừa bằng lệnh SQLite VACUUM.</p>
                  </div>
                </div>
                <button
                  onClick={handleOptimizeDb}
                  disabled={optimizing}
                  style={{
                    background: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
                    border: 'none',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: optimizing ? 'not-allowed' : 'pointer',
                    opacity: optimizing ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(244, 63, 94, 0.2)'
                  }}
                >
                  <RefreshCw size={14} className={optimizing ? 'animate-spin' : ''} /> {optimizing ? 'Đang thực thi...' : 'Chạy VACUUM DB'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TRAFFIC DETAILS */}
          {activeTab === 'traffic' && traffic && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Lưu lượng requests</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, margin: '8px 0 0 0', color: '#fbbf24' }}>{traffic.total_requests} reqs</h3>
                  <span style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'block' }}>Tốc độ trung bình: {traffic.requests_per_minute} rpm</span>
                </div>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Độ trễ trung bình / Median (p50)</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, margin: '8px 0 0 0', color: '#60a5fa' }}>{traffic.average_latency_ms} ms / {traffic.p50_latency_ms || 0} ms</h3>
                  <span style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'block' }}>Median (p50) đại diện cho số đông người dùng</span>
                </div>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Độ trễ giới hạn (p90 / p99)</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, margin: '8px 0 0 0', color: '#f43f5e' }}>{traffic.p90_latency_ms || 0} ms / {traffic.p99_latency_ms || 0} ms</h3>
                  <span style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'block' }}>p99: Độ trễ tối đa của 1% người dùng chậm nhất</span>
                </div>
              </div>

              {/* RPM TIMELINE CHART */}
              {metrics && metrics.system_history && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '20px'
                }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={16} style={{ color: '#10b981' }} /> Lịch sử Tốc độ Request Per Minute (Past 60m)
                  </h3>
                  {renderLineChart(metrics.system_history, 'rpm', '#10b981', 'rpm-history-grad', '#10b981', 0)}
                </div>
              )}

              {/* MOCK GRAPH FOR TRAFFIC BUCKET (SVG GRAPH) */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} style={{ color: '#fbbf24' }} /> Phân bố mã trạng thái HTTP Response
                </h3>
                
                <div style={{ display: 'flex', alignItems: 'flex-end', height: '140px', gap: '30px', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {Object.entries(traffic.status_codes).map(([key, val]: any) => {
                    const maxVal = Math.max(...(Object.values(traffic.status_codes) as number[]), 1);
                    const heightPercent = Math.max((val / maxVal) * 100, 5);
                    const barColor = key === '2xx' ? '#10b981' : key === '3xx' ? '#3b82f6' : key === '4xx' ? '#fbbf24' : '#ef4444';
                    
                    return (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <span style={{ fontSize: '12px', marginBottom: '8px', color: '#cbd5e1' }}>{val}</span>
                        <div style={{
                          width: '100%',
                          maxWidth: '60px',
                          height: `${heightPercent}px`,
                          background: barColor,
                          borderRadius: '4px 4px 0 0',
                          boxShadow: `0 0 10px ${barColor}30`,
                          transition: 'height 0.5s ease-in-out'
                        }} />
                        <span style={{ fontSize: '12px', marginTop: '8px', fontWeight: 'bold', color: '#94a3b8' }}>{key}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SLOW ENDPOINTS TABLE */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} style={{ color: '#f43f5e' }} /> Top 5 API có độ trễ lớn nhất
                </h3>
                {traffic.slow_endpoints.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Chưa ghi nhận cuộc gọi API nào gần đây.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#94a3b8' }}>
                          <th style={{ padding: '10px' }}>Endpoint Route</th>
                          <th style={{ padding: '10px' }}>Số cuộc gọi</th>
                          <th style={{ padding: '10px' }}>Độ trễ trung bình</th>
                          <th style={{ padding: '10px' }}>Độ trễ tối đa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traffic.slow_endpoints.map((ep: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.02)' }}>
                            <td style={{ padding: '12px 10px', fontFamily: 'monospace', color: '#38bdf8' }}>{ep.endpoint}</td>
                            <td style={{ padding: '12px 10px' }}>{ep.calls}</td>
                            <td style={{ padding: '12px 10px', color: '#fbbf24', fontWeight: 600 }}>{ep.avg_latency_ms} ms</td>
                            <td style={{ padding: '12px 10px', color: '#ef4444' }}>{ep.max_latency_ms} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AI COSTS & TELEMETRY */}
          {activeTab === 'ai' && aiCosts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Chi phí LLM ước tính (tổng)</span>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 0 0', color: '#fbbf24' }}>
                    ${aiCosts.estimated_cost_usd}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>Giả định $0.00015 / 1K Tokens</span>
                </div>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Tổng số Tokens tiêu thụ</span>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 0 0', color: '#818cf8' }}>
                    {aiCosts.total_tokens.toLocaleString()}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>
                    Prompt: {aiCosts.prompt_tokens.toLocaleString()} | Comp: {aiCosts.completion_tokens.toLocaleString()}
                  </span>
                </div>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Độ trễ trung bình của Agent</span>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 0 0', color: '#34d399' }}>
                    {(aiCosts.avg_latency_ms / 1000).toFixed(2)} s
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>Tính từ LangGraph nodes</span>
                </div>
              </div>

              {/* DAILY TOKEN CONSUMPTION CHART (SVG) */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={16} style={{ color: '#818cf8' }} /> Biểu đồ lượng Tokens tiêu thụ theo ngày
                </h3>

                {aiCosts.daily_usage.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Chưa ghi nhận lượt gọi LLM nào từ DB.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '180px', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                      {aiCosts.daily_usage.map((row: any, idx: number) => {
                        const maxTokens = Math.max(...aiCosts.daily_usage.map((d: any) => d.tokens), 1);
                        const percent = (row.tokens / maxTokens) * 100;
                        
                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '40px' }}>
                            <span style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
                              {row.tokens > 1000 ? `${(row.tokens / 1000).toFixed(1)}k` : row.tokens}
                            </span>
                            <div style={{
                              width: '100%',
                              height: `${Math.max(percent, 4)}%`,
                              background: 'linear-gradient(to top, #312e81 0%, #6366f1 100%)',
                              borderRadius: '4px 4px 0 0',
                              boxShadow: '0 0 10px rgba(99, 102, 241, 0.2)'
                            }} />
                            <span style={{ fontSize: '10px', marginTop: '6px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {row.date.split('-').slice(1).join('/')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PEDAGOGICAL ANALYTICS & SFT DATASET */}
          {activeTab === 'pedagogical' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Tổng số Event & Traces SFT</span>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 0 0', color: '#fbbf24' }}>
                    {sftData ? sftData.total_records : 0}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>Dữ liệu SFT đóng gói (Cặp đề xuất & sửa đổi)</span>
                </div>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Tỷ lệ giữ nguyên / sửa đổi (Edit Ratio)</span>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 0 0', color: '#3b82f6' }}>
                    {sftData ? `${(getAverageEditRatio() * 100).toFixed(1)}%` : '0%'}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>Tương đương mức độ hài lòng về chất lượng AI</span>
                </div>
                <div style={cardStyle}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Trạng thái NER Anonymization</span>
                  <h3 style={{ fontSize: '28px', fontWeight: 800, margin: '8px 0 0 0', color: '#10b981' }}>
                    Sẵn sàng
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', display: 'block' }}>Mã hóa Emails, IDs, SĐT & Tên riêng khi xuất</span>
                </div>
              </div>

              {/* BLOOM LEVELS DISTRIBUTION (SVG BAR CHART) */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={16} style={{ color: '#fbbf24' }} /> Biểu đồ phân bổ chuẩn Bloom trong học liệu AI
                </h3>

                {(!sftData || sftData.total_records === 0) ? (
                  <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Chưa có đủ dữ liệu học liệu SFT được lưu vết để phân tích Bloom.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', height: '180px', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                      {getBloomDistribution().map((val: number, idx: number) => {
                        const bloomNames = ['L1: Nhớ', 'L2: Hiểu', 'L3: Vận dụng', 'L4: Phân tích', 'L5: Đánh giá', 'L6: Sáng tạo'];
                        const maxVal = Math.max(...getBloomDistribution(), 1);
                        const percent = (val / maxVal) * 100;
                        
                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '40px' }}>
                            <span style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
                              {val}
                            </span>
                            <div style={{
                              width: '100%',
                              height: `${Math.max(percent, 4)}%`,
                              background: 'linear-gradient(to top, #d97706 0%, #fbbf24 100%)',
                              borderRadius: '4px 4px 0 0',
                              boxShadow: '0 0 10px rgba(245, 158, 11, 0.2)'
                            }} />
                            <span style={{ fontSize: '10px', marginTop: '6px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {bloomNames[idx]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION EXPORT PANEL */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    padding: '12px',
                    borderRadius: '10px'
                  }}>
                    <Download size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Xuất bộ dữ liệu SFT & DPO Dataset</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                      Xuất file dữ liệu định dạng `.jsonl` phục vụ fine-tuning mô hình AI sư phạm của VinUni.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadSftDataset}
                  disabled={!sftData || sftData.total_records === 0}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: (!sftData || sftData.total_records === 0) ? 'not-allowed' : 'pointer',
                    opacity: (!sftData || sftData.total_records === 0) ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                  }}
                >
                  <Download size={14} /> Xuất JSONL (NER Anonymized)
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: ALERTS CONFIGURATION */}
          {activeTab === 'alerts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '24px',
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24' }}>
                  <Settings size={18} /> DevOps Alerting Webhooks Configuration
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
                  <div>
                    <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Slack Webhook URL:</label>
                    <input
                      type="text"
                      readOnly
                      value={localAlertConfig.slack_webhook_url}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#94a3b8',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Telegram Bot Token:</label>
                      <input
                        type="text"
                        readOnly
                        value={localAlertConfig.telegram_bot_token}
                        style={{
                          width: '100%',
                          background: 'rgba(15, 23, 42, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: '#94a3b8',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Telegram Chat ID:</label>
                      <input
                        type="text"
                        readOnly
                        value={localAlertConfig.telegram_chat_id}
                        style={{
                          width: '100%',
                          background: 'rgba(15, 23, 42, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: '#94a3b8',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        disabled
                        checked={localAlertConfig.enable_alerting}
                        style={{ width: '16px', height: '16px', accentColor: '#fbbf24' }}
                      />
                      <span style={{ fontSize: '13px', color: '#f1f5f9' }}>Kích hoạt cảnh báo hệ thống</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '8px' }}>
                    <div>
                      <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Ngưỡng Cảnh báo CPU:</label>
                      <input
                        type="number"
                        disabled
                        value={localAlertConfig.alert_cpu_threshold}
                        style={{
                          width: '100%',
                          background: 'rgba(15, 23, 42, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: '#f8fafc',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Ngưỡng Cảnh báo RAM:</label>
                      <input
                        type="number"
                        disabled
                        value={localAlertConfig.alert_ram_threshold}
                        style={{
                          width: '100%',
                          background: 'rgba(15, 23, 42, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: '#f8fafc',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    * LƯU Ý: Các thông số webhook và ngưỡng trên được thiết lập cố định qua file cấu hình môi trường `.env` hoặc `.env.local` của hệ thống để bảo mật thông tin hạ tầng.
                  </div>
                </div>
              </div>

              {/* SIMULATE ALERT BUTTON PANEL */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    padding: '12px',
                    borderRadius: '10px'
                  }}>
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Kiểm tra & Mô phỏng gửi cảnh báo (Webhook test)</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                      Gửi ngay một tin nhắn cảnh báo mẫu qua Slack Webhook và Telegram Bot để kiểm tra tính chính xác của cấu hình.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSimulateAlert}
                  disabled={simulatingAlert}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    border: 'none',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: simulatingAlert ? 'not-allowed' : 'pointer',
                    opacity: simulatingAlert ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                  }}
                >
                  <RefreshCw size={14} className={simulatingAlert ? 'animate-spin' : ''} /> {simulatingAlert ? 'Đang gửi...' : 'Mô phỏng Cảnh báo (Simulate)'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: AGENT MEMORY */}
          {activeTab === 'memory' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '24px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#6366f1' }}>
                    <DatabaseZap size={18} /> Quản lý Bộ nhớ Agent (Episodic Memory)
                  </h3>
                  <button 
                    onClick={fetchMemories}
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#a5b4fc',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RefreshCw size={12} className={loadingMemories ? 'animate-spin' : ''} /> Tải lại bộ nhớ
                  </button>
                </div>

                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: 0, marginBottom: '20px' }}>
                  Hệ thống tự động lưu lại các mẫu slide và kịch bản sư phạm được chỉnh sửa với mức độ Levenshtein &gt; 20% hoặc có đổi Layout từ giảng viên.
                  Mô hình AI sử dụng các episodic memory này để học hỏi phong cách thiết kế slide cá nhân hóa của từng giảng viên (Few-shot learning).
                </p>

                {loadingMemories && memories.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '40px', color: '#64748b' }}>
                    Đang tải dữ liệu bộ nhớ Agent...
                  </div>
                ) : memories.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', color: '#64748b' }}>
                    <DatabaseZap size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '14px' }}>Chưa ghi nhận episodic memory nào từ các hoạt động của giảng viên.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                          <th style={{ padding: '12px 8px', fontWeight: 600 }}>Giảng viên</th>
                          <th style={{ padding: '12px 8px', fontWeight: 600 }}>Yêu cầu (Prompt)</th>
                          <th style={{ padding: '12px 8px', fontWeight: 600 }}>Layout</th>
                          <th style={{ padding: '12px 8px', fontWeight: 600 }}>Nội dung học tập (Slide)</th>
                          <th style={{ padding: '12px 8px', fontWeight: 600, textAlign: 'right' }}>Hành động</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memories.map((mem) => (
                          <tr key={mem.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                            <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', fontWeight: 500, color: '#f8fafc' }}>
                              {mem.user_email}
                            </td>
                            <td style={{ padding: '12px 8px', color: '#cbd5e1', maxWidth: '200px', wordBreak: 'break-word' }}>
                              "{mem.prompt}"
                            </td>
                            <td style={{ padding: '12px 8px' }}>
                              <span style={{
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: '#a5b4fc',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                fontSize: '11px',
                                fontFamily: 'monospace'
                              }}>{mem.layout}</span>
                            </td>
                            <td style={{ padding: '12px 8px', maxWidth: '350px' }}>
                              <div style={{
                                background: 'rgba(15, 23, 42, 0.4)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                borderRadius: '6px',
                                padding: '8px',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                maxHeight: '100px',
                                overflowY: 'auto',
                                color: '#94a3b8',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                              }}>
                                {mem.content}
                              </div>
                            </td>
                            <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleDeleteMemory(mem.id)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#f87171',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  transition: 'all 0.2s'
                                }}
                              >
                                Xóa
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'rgba(30, 41, 59, 0.25)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  borderRadius: '12px',
  padding: '20px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between'
};
