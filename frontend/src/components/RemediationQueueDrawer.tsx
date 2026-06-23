'use client';

import React from 'react';
import { useQueue } from '../context/QueueContext';
import { Course } from '@/types';
import { Zap, X, Play, Pause, Check, Loader2, Maximize2, Minimize2 } from 'lucide-react';

interface RemediationQueueDrawerProps {
  selectedCourse: Course;
}

export default function RemediationQueueDrawer({ selectedCourse }: RemediationQueueDrawerProps) {
  const {
    queue,
    isQueueRunning,
    showQueuePanel,
    queueProgressMsg,
    queueMode,
    isQueueMinimized,
    queuePosition,
    isFastMode,
    cancelRef,
    dragRef,
    setIsQueueMinimized,
    setShowQueuePanel,
    setIsFastMode,
    handleMouseDown,
    runGlobalQueue
  } = useQueue();

  if (!showQueuePanel) return null;

  if (isQueueMinimized) {
    /* Minimized state */
    return (
      <div
        ref={dragRef}
        style={{
          position: 'fixed',
          ...(queuePosition
            ? { left: `${queuePosition.x}px`, top: `${queuePosition.y}px` }
            : { right: '24px', bottom: '24px' }),
          width: '240px',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '12px',
          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          fontFamily: '"Outfit", "Inter", sans-serif',
          cursor: 'move',
          userSelect: 'none',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onMouseDown={handleMouseDown}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isQueueRunning ? '#fbbf24' : '#64748b',
            boxShadow: isQueueRunning ? '0 0 8px #fbbf24' : 'none',
            flexShrink: 0
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', textAlign: 'left' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={12} aria-hidden="true" /> Hàng đợi Điểm Mù
            </span>
            <span style={{ fontSize: '11px', color: '#cbd5e1', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              Tiến độ: {queue.filter(q => q.status === 'success').length}/{queue.length} ({Math.round((queue.filter(q => q.status === 'success').length / queue.length) * 100)}%)
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => setIsQueueMinimized(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#cbd5e1',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Mở rộng"
          >
            <Maximize2 size={12} aria-hidden="true" />
          </button>
          <button
            onClick={() => {
              cancelRef.current = true;
              setShowQueuePanel(false);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Đóng"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  /* Maximized state */
  return (
    <div
      ref={dragRef}
      style={{
        position: 'fixed',
        ...(queuePosition
          ? { left: `${queuePosition.x}px`, top: `${queuePosition.y}px` }
          : { right: '24px', bottom: '24px' }),
        width: '400px',
        maxHeight: '520px',
        background: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Outfit", "Inter", sans-serif',
      }}
    >
      {/* Header */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.4)',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          cursor: 'move',
          userSelect: 'none'
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={14} aria-hidden="true" /> Hàng đợi Khắc phục Điểm mù
          </h4>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Khắc phục chuẩn CLO - Bloom ({queueMode === 'questions' ? 'Đề thi' : 'Bài giảng'})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsQueueMinimized(true)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#cbd5e1',
              borderRadius: '4px',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Thu gọn"
          >
            <Minimize2 size={12} aria-hidden="true" />
          </button>
          <button
            onClick={() => {
              cancelRef.current = true;
              setShowQueuePanel(false);
            }}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#cbd5e1',
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Đóng"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body List */}
      <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.4', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'left' }}>
          {queueProgressMsg || 'Hàng đợi đang chờ khởi chạy…'}
        </div>

        {/* Fast Mode Toggle */}
        {queueMode === 'questions' && !isQueueRunning && queue.every(q => q.status !== 'success') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px', margin: '4px 0', textAlign: 'left' }}>
            <input
              type="checkbox"
              id="fast-mode-checkbox"
              checked={isFastMode}
              onChange={(e) => setIsFastMode(e.target.checked)}
              style={{ cursor: 'pointer', width: '14px', height: '14px' }}
            />
            <label htmlFor="fast-mode-checkbox" style={{ fontSize: '12px', color: '#fbbf24', cursor: 'pointer', userSelect: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Bỏ qua bước giải đề thử của Solver giúp rút ngắn thời gian sinh">
              <Zap size={12} /> Chế độ tạo nhanh (Fast Mode - Bỏ qua tự sửa lỗi)
            </label>
          </div>
        )}

        {/* Progress bar */}
        {queue.length > 0 && (
          <div style={{ margin: '5px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              <span>Tiến độ: {queue.filter(q => q.status === 'success').length}/{queue.length}</span>
              <span>{Math.round((queue.filter(q => q.status === 'success').length / queue.length) * 100)}%</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(queue.filter(q => q.status === 'success').length / queue.length) * 100}%`,
                background: 'linear-gradient(90deg, #f59e0b 0%, #10b981 100%)',
                transition: 'width 0.3s ease-in-out'
              }} />
            </div>
          </div>
        )}

        {/* Queue items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
          {queue.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '8px 12px',
                background: item.status === 'generating' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.4)',
                border: item.status === 'generating' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.04)',
                borderRadius: '8px',
                fontSize: '12.5px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '600', color: '#cbd5e1' }}>
                  {item.cloCode} — Bloom B{item.bloomLevel}
                </span>
                <div>
                  {item.status === 'pending' && <span style={{ color: '#94a3b8', fontSize: '11px' }}>Chờ xử lý</span>}
                  {item.status === 'generating' && <span style={{ color: '#fbbf24', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Loader2 size={11} className="animate-spin" aria-hidden="true" /> Đang xử lý</span>}
                  {item.status === 'success' && <span style={{ color: '#10b981', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={11} aria-hidden="true" /> Đã phủ</span>}
                  {item.status === 'failed' && <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><X size={11} aria-hidden="true" /> Lỗi</span>}
                </div>
              </div>

              {/* Real-time Stage message */}
              {item.status === 'generating' && item.activeStageMessage && (
                <div style={{ fontSize: '11px', color: '#fcd34d', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', textAlign: 'left' }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#fbbf24' }} />
                  {item.activeStageMessage}
                </div>
              )}

              {item.errorMsg && (
                <span style={{ fontSize: '10px', color: '#f87171', marginTop: '2px', textAlign: 'left' }}>
                  Lỗi: {item.errorMsg}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(30, 41, 59, 0.2)',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        borderBottomLeftRadius: '16px',
        borderBottomRightRadius: '16px',
      }}>
        {!isQueueRunning ? (
          <button
            onClick={() => {
              cancelRef.current = false;
              runGlobalQueue(queue, queueMode, selectedCourse.id);
            }}
            disabled={queue.length === 0 || queue.every(q => q.status === 'success')}
            className={queue.length > 0 && !queue.every(q => q.status === 'success') ? 'glow-bounce-hint' : ''}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(245, 158, 11, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Play size={12} aria-hidden="true" /> Bắt đầu
          </button>
        ) : (
          <button
            onClick={() => {
              cancelRef.current = true;
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fbbf24',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Pause size={12} aria-hidden="true" /> Tạm dừng
          </button>
        )}
        <button
          onClick={() => {
            cancelRef.current = true;
            setShowQueuePanel(false);
          }}
          style={{
            background: 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#94a3b8',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
