'use client';

import React from 'react';
import { FileText } from 'lucide-react';

interface MarkdownChatRendererProps {
  content: string;
  onCitationClick?: (fileName: string, pageNum: string) => void;
}

export default function MarkdownChatRenderer({
  content,
  onCitationClick
}: MarkdownChatRendererProps) {
  if (!content) return null;

  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const codeLines = part.split('\n');
          const firstLine = codeLines[0].slice(3).trim();
          const codeContent = codeLines.slice(1, -1).join('\n');
          return (
            <pre
              key={index}
              className="chatbot-code-block"
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
                overflowX: 'auto',
                margin: '8px 0',
                fontFamily: 'Consolas, Courier New, monospace',
                fontSize: '13px',
                textAlign: 'left'
              }}
            >
              {firstLine && (
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid var(--border-color)',
                    paddingBottom: '4px',
                    marginBottom: '6px'
                  }}
                >
                  {firstLine}
                </div>
              )}
              <code>{codeContent}</code>
            </pre>
          );
        }

        const lines = part.split('\n');
        let inTable = false;
        let tableHeaders: string[] = [];
        let tableRows: string[][] = [];
        const parsedElements: React.ReactNode[] = [];

        const parseInline = (str: string): React.ReactNode[] => {
          let segments: React.ReactNode[] = [str];

          segments = segments.flatMap(seg => {
            if (typeof seg !== 'string') return seg;
            const matches = seg.split(/(\*\*.*?\*\*)/g);
            return matches.map((m, idx) => {
              if (m.startsWith('**') && m.endsWith('**')) {
                return <strong key={idx}>{m.slice(2, -2)}</strong>;
              }
              return m;
            });
          });

          segments = segments.flatMap(seg => {
            if (typeof seg !== 'string') return seg;
            const matches = seg.split(/(\*.*?\*)/g);
            return matches.map((m, idx) => {
              if (m.startsWith('*') && m.endsWith('*') && !m.startsWith('**')) {
                return <em key={idx}>{m.slice(1, -1)}</em>;
              }
              return m;
            });
          });

          segments = segments.flatMap(seg => {
            if (typeof seg !== 'string') return seg;
            const matches = seg.split(/(`.*?`)/g);
            return matches.map((m, idx) => {
              if (m.startsWith('`') && m.endsWith('`')) {
                return (
                  <code
                    key={idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      fontFamily: 'Consolas, monospace',
                      fontSize: '12px'
                    }}
                  >
                    {m.slice(1, -1)}
                  </code>
                );
              }
              return m;
            });
          });

          segments = segments.flatMap(seg => {
            if (typeof seg !== 'string') return seg;
            const matches = seg.split(/(\[(?:Nguồn|Ref):\s*[^\]]+?\s*-\s*(?:Trang|Page):\s*[^\]]+?\])/gi);
            return matches.map((m, idx) => {
              if (/^\[(?:Nguồn|Ref):\s*[^\]]+?\s*-\s*(?:Trang|Page):\s*[^\]]+?\]$/i.test(m)) {
                const cleaned = m.slice(1, -1);
                const parts = cleaned.split(/-\s*(?:Trang|Page):\s*/i);
                const fileName = parts[0]?.replace(/^(Nguồn|Ref):\s*/i, '').trim();
                const pageNum = parts[1]?.trim() || '';
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onCitationClick && onCitationClick(fileName, pageNum)}
                    title={`Xem đoạn trích gốc từ ${fileName} - Trang ${pageNum}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(212, 163, 89, 0.15)',
                      border: '1px solid rgba(212, 163, 89, 0.3)',
                      color: '#fcd34d',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      margin: '0 4px',
                      verticalAlign: 'middle',
                      transition: 'all 0.2s'
                    }}
                  >
                    <FileText size={12} /> {fileName} (Trang {pageNum})
                  </button>
                );
              }
              return m;
            });
          });

          return segments;
        };

        const flushTable = (key: number) => {
          if (!inTable) return null;
          inTable = false;
          const headers = tableHeaders;
          const rows = tableRows;
          tableHeaders = [];
          tableRows = [];

          if (headers.length === 0 && rows.length === 0) return null;

          return (
            <div key={`table-${key}`} style={{ overflowX: 'auto', margin: '12px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', border: '1px solid var(--border-color)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)' }}>
                    {headers.map((h, hIdx) => (
                      <th key={hIdx} style={{ border: '1px solid var(--border-color)', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>
                        {parseInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ border: '1px solid var(--border-color)', padding: '8px 12px' }}>
                          {parseInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            const columns = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
            if (columns.every(col => col.startsWith('-') || col.replace(/-/g, '').trim() === '')) {
              continue;
            }
            if (!inTable) {
              inTable = true;
              tableHeaders = columns;
            } else {
              tableRows.push(columns);
            }
            continue;
          } else if (inTable) {
            const tbl = flushTable(i);
            if (tbl) parsedElements.push(tbl);
          }

          if (line.startsWith('# ')) {
            parsedElements.push(<h3 key={i} style={{ fontSize: '18px', fontWeight: 'bold', margin: '14px 0 8px 0', color: 'var(--vinuni-gold)' }}>{parseInline(line.slice(2))}</h3>);
          } else if (line.startsWith('## ')) {
            parsedElements.push(<h4 key={i} style={{ fontSize: '16px', fontWeight: 'bold', margin: '12px 0 6px 0', color: 'var(--vinuni-gold)' }}>{parseInline(line.slice(3))}</h4>);
          } else if (line.startsWith('### ')) {
            parsedElements.push(<h5 key={i} style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 4px 0' }}>{parseInline(line.slice(4))}</h5>);
          } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            parsedElements.push(
              <li key={i} style={{ listStyleType: 'disc', margin: '4px 0 4px 24px', textAlign: 'left' }}>
                {parseInline(line.trim().slice(2))}
              </li>
            );
          } else if (/^\d+\.\s/.test(line.trim())) {
            const dotIdx = line.trim().indexOf('.');
            parsedElements.push(
              <li key={i} style={{ listStyleType: 'decimal', margin: '4px 0 4px 28px', textAlign: 'left' }}>
                {parseInline(line.trim().slice(dotIdx + 1).trim())}
              </li>
            );
          } else if (line.trim() === '') {
            parsedElements.push(<div key={i} style={{ height: '6px' }} />);
          } else {
            parsedElements.push(<p key={i} style={{ margin: '4px 0', textAlign: 'left', lineHeight: '1.5' }}>{parseInline(line)}</p>);
          }
        }

        if (inTable) {
          const tbl = flushTable(lines.length);
          if (tbl) parsedElements.push(tbl);
        }

        return <div key={index}>{parsedElements}</div>;
      })}
    </>
  );
}
