'use client';

import React from 'react';
import { Cpu, X } from 'lucide-react';

interface AIActionConfirmModalProps {
  show: boolean;
  pendingAction: {
    view: string;
    action: string;
    params: any;
    message?: string;
  } | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AIActionConfirmModal({ show, pendingAction, onConfirm, onCancel }: AIActionConfirmModalProps) {
  if (!show || !pendingAction) return null;

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
      zIndex: 11000,
      fontFamily: '"Outfit", "Inter", sans-serif',
    }}>
      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
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
            background: 'rgba(212, 163, 89, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--vinuni-gold)'
          }}>
            <Cpu size={18} />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: 'var(--vinuni-gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Xác nhận hành động AI
            </h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Falcon AI đề xuất điều phối quy trình</span>
          </div>
          <button 
            onClick={onCancel}
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
            {pendingAction.message || 'Mascot AI đề xuất thực hiện hành động tự động trên giao diện này.'}
          </p>

          {/* Param Box */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '10px',
            padding: '14px',
            fontSize: '12.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>Chức năng:</span>
              <strong style={{ color: 'var(--vinuni-gold)' }}>
                {pendingAction.action === 'generate_outline' && 'Thiết kế cấu trúc Outline môn học'}
                {pendingAction.action === 'generate_storyboard' && 'Thiết kế dàn ý (Storyboard)'}
                {pendingAction.action === 'generate_materials' && 'Tạo slide bài giảng & giáo án'}
                {pendingAction.action === 'generate_questions' && 'Tạo câu hỏi trắc nghiệm'}
              </strong>
            </div>

            {pendingAction.params?.chapter_title && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Chương học:</span>
                <span style={{ color: '#cbd5e1', fontWeight: '600' }}>
                  {pendingAction.params.chapter_title}
                </span>
              </div>
            )}

            {pendingAction.params?.clo_code && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Chuẩn đầu ra (CLO):</span>
                <span style={{ color: '#cbd5e1', fontWeight: '600' }}>
                  {pendingAction.params.clo_code}
                </span>
              </div>
            )}

            {pendingAction.params?.bloom_level && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Mức Bloom:</span>
                <span style={{
                  color: 'var(--vinuni-gold)',
                  fontWeight: '700',
                  background: 'rgba(212, 163, 89, 0.15)',
                  padding: '1px 6px',
                  borderRadius: '4px'
                }}>
                  Bậc B{pendingAction.params.bloom_level}
                </span>
              </div>
            )}

            {pendingAction.params?.count && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Số lượng câu hỏi:</span>
                <span style={{ color: '#cbd5e1', fontWeight: '600' }}>{pendingAction.params.count} câu</span>
              </div>
            )}
          </div>
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
            onClick={onCancel}
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
            Hủy bỏ
          </button>
          <button
            onClick={onConfirm}
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
              transition: 'all 0.2s'
            }}
          >
            Đồng ý & Thực hiện
          </button>
        </div>
      </div>
    </div>
  );
}
