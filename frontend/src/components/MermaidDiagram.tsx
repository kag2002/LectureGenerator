import React, { useState, useEffect } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  code: string;
  themeName: string;
}

export default function MermaidDiagram({ code, themeName }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    
    // Map theme name to mermaid theme
    let mTheme: any = 'default';
    if (['deep_space', 'mint_techno', 'sunset_crimson', 'mckinsey_consulting'].includes(themeName)) {
      mTheme = 'dark';
    } else if (themeName === 'warm_academic') {
      mTheme = 'neutral';
    }

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: mTheme,
        securityLevel: 'loose',
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
        }
      });

      // Generate a unique ID for this diagram
      const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
      
      // Clean up markdown block headers/footers if passed by accident
      let cleanCode = code.trim();
      if (cleanCode.startsWith('```mermaid')) {
        cleanCode = cleanCode.substring(10);
      }
      if (cleanCode.endsWith('```')) {
        cleanCode = cleanCode.substring(0, cleanCode.length - 3);
      }
      cleanCode = cleanCode.trim();

      mermaid.render(uniqueId, cleanCode)
        .then(({ svg: renderedSvg }) => {
          if (isMounted) {
            setSvg(renderedSvg);
            setError('');
          }
        })
        .catch((err) => {
          console.error('Mermaid render error:', err);
          if (isMounted) {
            setError(err.message || 'Lỗi cú pháp vẽ sơ đồ');
          }
        });
    } catch (e: any) {
      console.error('Mermaid initialization or execution error:', e);
      if (isMounted) {
        setError(e.message || 'Lỗi khi khởi chạy trình vẽ sơ đồ');
      }
    }

    return () => {
      isMounted = false;
    };
  }, [code, themeName]);

  if (error) {
    const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    return (
      <div 
        style={{ 
          color: '#f87171', 
          fontFamily: 'monospace', 
          fontSize: '11px', 
          padding: '12px', 
          background: 'rgba(239, 68, 68, 0.05)', 
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          width: '100%',
          maxHeight: '100%',
          overflow: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>⚠️ {error}</div>
        <div style={{ whiteSpace: 'pre-wrap', opacity: 0.8, fontSize: '10px' }}>{code}</div>
      </div>
    );
  }

  if (!svg) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '13px' }}>
        Đang vẽ sơ đồ...
      </div>
    );
  }

  return (
    <div 
      className="mermaid-svg-wrapper" 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        overflow: 'hidden'
      }}
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}
