'use client';
 
import dynamic from 'next/dynamic';
import React from 'react';
import { UILockProvider } from '../context/UILockContext';
import { AIProvider } from '../context/AIContext';
import { QueueProvider } from '../context/QueueContext';
 
const DynamicApp = dynamic(() => import('@/App'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at 10% 20%, rgb(15, 23, 42) 0%, rgb(9, 13, 26) 90%)',
      color: '#94a3b8',
      fontFamily: '"Inter", sans-serif',
      fontSize: '16px'
    }}>
      Đang tải ứng dụng Next.js...
    </div>
  )
});
 
export default function Home() {
  return (
    <UILockProvider>
      <AIProvider>
        <QueueProvider>
          <DynamicApp />
        </QueueProvider>
      </AIProvider>
    </UILockProvider>
  );
}
