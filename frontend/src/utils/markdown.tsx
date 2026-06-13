import React from 'react';

/**
 * Chuyển đổi chuỗi Markdown thô sang HTML inline-styled.
 * Hỗ trợ: tables, headers, bold, bullet lists, paragraphs.
 */
export function renderMarkdown(md: string): string {
  if (!md) return '';
  
  // Clean HTML tags to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // 1. Parse Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableRows: string[][] = [];
  let newLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (/^[\s:\-|]+$/.test(line)) {
        continue;
      }
      const cols = line.split('|').slice(1, -1).map(c => c.trim());
      tableRows.push(cols);
      inTable = true;
    } else {
      if (inTable) {
        let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:15px 0; font-size:13px; background:var(--markdown-bg); border: 1px solid var(--markdown-border);">';
        tableRows.forEach((row, rIdx) => {
          tableHtml += '<tr>';
          row.forEach(cell => {
            const tag = rIdx === 0 ? 'th' : 'td';
            const cellStyle = rIdx === 0 
              ? 'background:var(--markdown-table-header-bg); color:var(--markdown-h2); font-weight:700; border:1px solid var(--markdown-border); padding:10px 14px; text-align:left; font-family:\'Lora\', serif;'
              : 'border:1px solid var(--markdown-border); padding:10px 14px; color:var(--markdown-text);';
            tableHtml += `<${tag} style="${cellStyle}">${cell}</${tag}>`;
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</table>';
        newLines.push(tableHtml);
        tableRows = [];
        inTable = false;
      }
      newLines.push(lines[i]);
    }
  }
  if (inTable) {
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:15px 0; font-size:13px; background:var(--markdown-bg); border: 1px solid var(--markdown-border);">';
    tableRows.forEach((row, rIdx) => {
      tableHtml += '<tr>';
      row.forEach(cell => {
        const tag = rIdx === 0 ? 'th' : 'td';
        const cellStyle = rIdx === 0 
          ? 'background:var(--markdown-table-header-bg); color:var(--markdown-h2); font-weight:700; border:1px solid var(--markdown-border); padding:10px 14px; text-align:left; font-family:\'Lora\', serif;'
          : 'border:1px solid var(--markdown-border); padding:10px 14px; color:var(--markdown-text);';
        tableHtml += `<${tag} style="${cellStyle}">${cell}</${tag}>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</table>';
    newLines.push(tableHtml);
  }
  
  html = newLines.join('\n');
  
  // 2. Parse Headers
  html = html.replace(/^# (.*?)$/gm, '<h1 style="color:var(--markdown-h1); font-family:\'Lora\', serif; font-size:19px; font-weight:700; margin-top:18px; margin-bottom:12px; border-bottom:1px solid var(--markdown-border); padding-bottom:6px;">$1</h1>');
  html = html.replace(/^## (.*?)$/gm, '<h2 style="color:var(--markdown-h2); font-family:\'Lora\', serif; font-size:16px; font-weight:700; margin-top:16px; margin-bottom:10px;">$1</h2>');
  html = html.replace(/^### (.*?)$/gm, '<h3 style="color:var(--markdown-h3); font-family:\'Lora\', serif; font-size:14px; font-weight:700; margin-top:14px; margin-bottom:8px;">$1</h3>');
  
  // 3. Parse bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--markdown-bold); font-weight:700;">$1</strong>');
  
  // 4. Parse bullets
  const lines2 = html.split('\n');
  let inList = false;
  let finalLines: string[] = [];
  
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i];
    const match = line.match(/^([-*+•])\s*(.*)$/);
    if (match) {
      if (!inList) {
        finalLines.push('<ul style="margin:12px 0; padding-left:20px; list-style-type:disc; color:var(--markdown-text-muted);">');
        inList = true;
      }
      finalLines.push(`<li style="margin-bottom:6px; line-height:145%;">${match[2]}</li>`);
    } else {
      if (inList) {
        finalLines.push('</ul>');
        inList = false;
      }
      finalLines.push(line);
    }
  }
  if (inList) {
    finalLines.push('</ul>');
  }
  
  html = finalLines.join('\n');
  
  // 5. Clean up simple newlines
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<u') || trimmed.startsWith('</u') || trimmed.startsWith('<l') || trimmed.startsWith('<t') || trimmed.startsWith('</t') || trimmed.startsWith('<r') || trimmed.startsWith('<p')) {
      return line;
    }
    return `<p style="margin:10px 0; line-height:1.6; color:var(--markdown-text);">${line}</p>`;
  }).join('\n');
  
  // Support inline HTML br mapping if they are present in markdown output
  html = html.replace(/&lt;br\s*\/?&gt;/g, '<br/>');
  
  return html;
}

export interface MarkdownPreviewProps {
  content: string;
  style?: React.CSSProperties;
}

/**
 * Component hiển thị nội dung Markdown đã được render thành HTML.
 */
export function MarkdownPreview({ content, style }: MarkdownPreviewProps) {
  const htmlContent = renderMarkdown(content);
  return (
    <div 
      className="markdown-preview-container"
      style={{
        padding: '24px 28px',
        background: 'var(--markdown-bg)',
        borderRadius: '16px',
        border: '1px solid var(--markdown-border)',
        color: 'var(--markdown-text)',
        fontSize: '14.5px',
        lineHeight: '1.65',
        overflowY: 'auto',
        minHeight: '220px',
        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02), var(--shadow-sm)',
        transition: 'all 0.3s ease',
        ...style
      }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}

/**
 * Render chuỗi text có chứa cặp ** thành React elements kèm style bold.
 */
export function renderBoldRuns(text: string, boldColor = 'var(--markdown-bold)'): React.ReactNode[] | string {
  if (!text) return '';
  const parts = text.split('**');
  return parts.map((part, idx) => {
    if (idx % 2 === 1) {
      return <strong key={idx} style={{ color: boldColor, fontWeight: '700' }}>{part}</strong>;
    }
    return part;
  });
}

/**
 * Render chuỗi text hỗ trợ cả bold (**) và ảnh (![alt](src)) thành React elements.
 */
export function renderMarkdownInline(text: string, boldColor = 'var(--markdown-bold)'): React.ReactNode {
  if (!text) return '';
  const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
  if (!text.match(imgRegex)) {
    return renderBoldRuns(text, boldColor);
  }

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  const regex = /!\[(.*?)\]\((.*?)\)/g;
  while ((match = regex.exec(text)) !== null) {
    const precedingText = text.substring(lastIndex, match.index);
    if (precedingText) {
      const runs = renderBoldRuns(precedingText, boldColor);
      if (Array.isArray(runs)) {
        elements.push(...runs);
      } else {
        elements.push(runs);
      }
    }

    const alt = match[1];
    const src = match[2];
    elements.push(
      <div key={`img-${match.index}`} className="slide-image-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '8px 0', width: '100%' }}>
        <img
          src={src}
          alt={alt}
          className="slide-embedded-image"
          style={{
            maxWidth: '100%',
            maxHeight: '180px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            objectFit: 'contain'
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {alt && <span className="slide-image-caption" style={{ fontSize: '0.85em', opacity: 0.8, marginTop: '4px', fontStyle: 'italic' }}>{alt}</span>}
      </div>
    );
    lastIndex = regex.lastIndex;
  }

  const remainingText = text.substring(lastIndex);
  if (remainingText) {
    const runs = renderBoldRuns(remainingText, boldColor);
    if (Array.isArray(runs)) {
      elements.push(...runs);
    } else {
      elements.push(runs);
    }
  }

  return <>{elements}</>;
}

