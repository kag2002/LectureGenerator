'use client';

import React from 'react';
import { AlertTriangle, X, Loader2, Check } from 'lucide-react';

interface DirtyWarningModalProps {
  show: boolean;
  isSavingDirty: boolean;
  onGoBack: () => void;
  onDiscardAndContinue: () => void;
  onSaveAndContinue: () => Promise<void>;
  hasSaveCallback: boolean;
}

export default function DirtyWarningModal({
  show,
  isSavingDirty,
  onGoBack,
  onDiscardAndContinue,
  onSaveAndContinue,
  hasSaveCallback
}: DirtyWarningModalProps) {
  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(9, 13, 26, 0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 11100,
      fontFamily: '"Outfit", "Inter", sans-serif',
    }}>
      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        borderRadius: '16px',
        width: '460px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, var(--vinuni-navy-dark) 0%, var(--vinuni-navy) 100%)',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fbbf24'
          }}>
            <AlertTriangle size={18} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--vinuni-gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Cảnh báo: Thay đổi chưa lưu
            </h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Phát hiện dữ liệu nháp chưa được lưu lại</span>
          </div>
          <button 
            onClick={onGoBack}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
            Thầy/Cô đang có các chỉnh sửa chưa lưu trên trang này. Nếu tiếp tục điều hướng hoặc thực hiện hành động tự động từ AI, toàn bộ các chỉnh sửa chưa lưu này sẽ bị mất.
          </p>
        </div>

        {/* Footer Buttons */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.2)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            disabled={isSavingDirty}
            onClick={onGoBack}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Quay lại sửa tiếp
          </button>
          
          <button
            disabled={isSavingDirty}
            onClick={onDiscardAndContinue}
            style={{
              background: 'rgba(244, 63, 94, 0.06)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              color: '#fda4af',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Ghi đè & Bỏ nháp
          </button>

          {hasSaveCallback && (
            <button
              disabled={isSavingDirty}
              onClick={onSaveAndContinue}
              style={{
                background: 'linear-gradient(135deg, var(--vinuni-gold) 0%, #b8860b 100%)',
                color: 'var(--vinuni-navy)',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: '800',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(212, 163, 89, 0.2)',
                transition: 'all 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isSavingDirty ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <Check size={12} />
                  <span>Lưu lại & Tiếp tục</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
