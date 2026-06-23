import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { parseMarkdownToSlidesJS, optimizeSlideItemsJS, splitBulletText, THEMES, Slide, ThemeColors } from './slideParser';
import { renderMarkdownInline } from './markdown';
import MermaidDiagram from '../components/MermaidDiagram';

// Declare module to satisfy TypeScript compiler
declare global {
  interface Window {
    html2canvas?: typeof html2canvas;
  }
}

interface ExportSlidePayload {
  title: string;
  layout: string;
  items: { type: string; rawText?: string; bullet?: boolean }[];
  notes?: string;
  screenshot?: string;
  has_visual?: boolean;
  visual_screenshot?: string;
}

/**
 * Render slide JSX for export inside the hidden container.
 */
function RenderSlideForExport({ s, idx, theme, themeName }: { s: Slide; idx: number; theme: ThemeColors; themeName: string }) {
  const slideLayout = s.layout || 'standard_list';
  const optimizedItems = optimizeSlideItemsJS(s.items);
  const tableItem = optimizedItems.find(item => item.type === 'table');
  const textItems = optimizedItems.filter(item => item.type === 'text');
  
  let useCardLayout = false;
  if (slideLayout === 'card_grid') {
    useCardLayout = true;
  } else if (['standard_list', 'two_column_comparison', 'visual_highlight', 'table', 'timeline_flow', 'three_column', 'quadrant_matrix', 'split_intro', 'metric_callout', 'hero_image_split', 'pros_cons_comparison'].includes(slideLayout)) {
    useCardLayout = false;
  } else {
    useCardLayout = !tableItem && textItems.length >= 1 && textItems.length <= 4;
  }

  const accentColors = theme.accents;
  let bodySection: React.ReactNode = null;

  if (slideLayout === 'metric_callout') {
    const allText = textItems.map(it => it.rawText || '').join(' ').trim();
    let numberText = '';
    let labelText = allText;
    const boldMatch = allText.match(/^\*\*(.*?)\*\*\s*[:\-—]?\s*(.*)$/);
    const colonMatch = !boldMatch && allText.match(/^(.*?)\s*[:\-—]\s*(.*)$/);
    if (boldMatch) {
      numberText = boldMatch[1];
      labelText = boldMatch[2];
    } else if (colonMatch) {
      numberText = colonMatch[1];
      labelText = colonMatch[2];
    } else {
      const spaceIdx = allText.indexOf(' ');
      if (spaceIdx !== -1) {
        numberText = allText.substring(0, spaceIdx);
        labelText = allText.substring(spaceIdx + 1);
      }
    }
    bodySection = (
      <div className="slide-metric-callout full-view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '2cqw' }}>
        <div className="slide-metric-number" style={{ color: theme.titleColor, fontSize: '6cqw', fontWeight: '800', marginBottom: '1cqw' }}>
          {numberText}
        </div>
        {labelText && (
          <div className="slide-metric-label" style={{ color: theme.textColor, fontSize: '1.8cqw', fontWeight: '600', textAlign: 'center' }}>
            {renderMarkdownInline(labelText, theme.titleColor)}
          </div>
        )}
      </div>
    );
  } else if (slideLayout === 'hero_image_split') {
    let imgUrl = "https://images.unsplash.com/photo-placeholder";
    const cleanTextItems: typeof textItems = [];
    textItems.forEach(it => {
      const raw = it.rawText || '';
      const match = raw.match(/!\[.*?\]\((.*?)\)/);
      if (match) {
        imgUrl = match[1];
      }
      const cleanRaw = raw.replace(/!\[.*?\]\((.*?)\)/g, '').trim();
      if (cleanRaw) {
        cleanTextItems.push({
          ...it,
          rawText: cleanRaw
        });
      }
    });
    bodySection = (
      <div className="slide-hero-image-split full-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2cqw', flex: 1, alignItems: 'stretch' }}>
        <div className="slide-hero-image-col" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255,255,255,0.02)' }}>
          <img src={imgUrl} alt="Hero illustration" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
        </div>
        <div className="slide-hero-text-col" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <ul className="slide-bullet-list full-view" style={{ color: theme.textColor }}>
            {cleanTextItems.map((item, itemIdx) => {
              const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
              const hideBullet = isImgOnly || item.bullet === false;
              return (
                <li
                  key={itemIdx}
                  style={{
                    fontSize: cleanTextItems.length > 3 ? '1.5cqw' : '1.8cqw',
                    ...(hideBullet ? { listStyleType: 'none', marginLeft: '-2cqw' } : {})
                  }}
                >
                  {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  } else if (slideLayout === 'pros_cons_comparison') {
    const pros: string[] = [];
    const cons: string[] = [];
    textItems.forEach(item => {
      const raw = item.rawText || '';
      const rawLower = raw.toLowerCase();
      if (["ưu điểm", "pro", "lợi ích", "advantages", "thuận lợi", "tích cực"].some(k => rawLower.includes(k))) {
        pros.push(raw);
      } else if (["nhược điểm", "con", "hạn chế", "disadvantages", "khó khăn", "tiêu cực"].some(k => rawLower.includes(k))) {
        cons.push(raw);
      } else {
        if (pros.length <= cons.length) {
          pros.push(raw);
        } else {
          cons.push(raw);
        }
      }
    });
    bodySection = (
      <div className="slide-pros-cons-comparison full-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5cqw', flex: 1, alignItems: 'stretch' }}>
        <div className="pros-column" style={{ background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)', borderLeft: `5px solid #10B981`, padding: '1.5cqw', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#10B981', fontWeight: 'bold', fontSize: '1.6cqw', marginBottom: '1cqw', display: 'flex', alignItems: 'center', gap: '0.5cqw' }}>
            ▲ Ưu điểm & Lợi ích
          </div>
          <ul className="slide-bullet-list full-view" style={{ color: theme.textColor, margin: 0, paddingLeft: '1.5cqw' }}>
            {pros.map((p, idx) => (
              <li key={idx} style={{ fontSize: '1.3cqw', marginBottom: '0.3cqw' }}>
                {renderMarkdownInline(p, theme.titleColor)}
              </li>
            ))}
          </ul>
        </div>
        <div className="cons-column" style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderLeft: `5px solid #EF4444`, padding: '1.5cqw', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#EF4444', fontWeight: 'bold', fontSize: '1.6cqw', marginBottom: '0.5cqw', display: 'flex', alignItems: 'center', gap: '0.5cqw' }}>
            ▼ Nhược điểm & Hạn chế
          </div>
          <ul className="slide-bullet-list full-view" style={{ color: theme.textColor, margin: 0, paddingLeft: '1.5cqw' }}>
            {cons.map((c, idx) => (
              <li key={idx} style={{ fontSize: '1.3cqw', marginBottom: '0.3cqw' }}>
                {renderMarkdownInline(c, theme.titleColor)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  } else if (s.svgContent) {
    if (textItems.length > 0) {
      bodySection = (
        <div className="slide-split-svg-text full-view">
          <div className="slide-svg-text-col">
            <ul className="slide-bullet-list full-view" style={{ color: theme.textColor }}>
              {textItems.map((item, itemIdx) => {
                const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                return (
                  <li 
                    key={itemIdx} 
                    style={{ 
                      fontSize: textItems.length > 3 ? '18px' : '22px',
                      listStyleType: isImgOnly ? 'none' : 'disc',
                      marginLeft: isImgOnly ? '-20px' : '0px'
                    }}
                  >
                    {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="slide-svg-graphic-col">
            <div 
              className="svg-slide-container slide-body-svg full-view"
              dangerouslySetInnerHTML={{ __html: s.svgContent }}
            />
          </div>
        </div>
      );
    } else {
      bodySection = (
        <div 
          className="svg-slide-container slide-body-svg full-view"
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          dangerouslySetInnerHTML={{ __html: s.svgContent }}
        />
      );
    }
  } else if (s.mermaidContent) {
    if (textItems.length > 0) {
      bodySection = (
        <div className="slide-split-svg-text full-view">
          <div className="slide-svg-text-col">
            <ul className="slide-bullet-list full-view" style={{ color: theme.textColor }}>
              {textItems.map((item, itemIdx) => {
                const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                return (
                  <li 
                    key={itemIdx} 
                    style={{ 
                      fontSize: textItems.length > 3 ? '18px' : '22px',
                      listStyleType: isImgOnly ? 'none' : 'disc',
                      marginLeft: isImgOnly ? '-20px' : '0px'
                    }}
                  >
                    {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="slide-svg-graphic-col">
            <MermaidDiagram code={s.mermaidContent} themeName={themeName} />
          </div>
        </div>
      );
    } else {
      bodySection = (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MermaidDiagram code={s.mermaidContent} themeName={themeName} />
        </div>
      );
    }
  } else if (tableItem) {
    bodySection = (
      <div className="slide-body-table-container full-view">
        <table className="slide-table full-view">
          <thead>
            <tr>
              {tableItem.rows?.[0].map((cell, cIdx) => (
                <th key={cIdx} style={{ background: theme.accents[0] + '40', color: theme.accents[0] }}>
                  {renderMarkdownInline(cell, theme.titleColor)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableItem.rows?.slice(1).map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} style={{ color: theme.textColor }}>
                    {renderMarkdownInline(cell, theme.titleColor)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (useCardLayout) {
    let gridStyle: React.CSSProperties = { display: 'grid', gap: '20px', flex: 1, alignItems: 'stretch' };
    if (textItems.length === 2) {
      gridStyle = { ...gridStyle, gridTemplateColumns: '1fr 1fr' };
    } else if (textItems.length === 3) {
      gridStyle = { ...gridStyle, gridTemplateColumns: '1fr 1fr 1fr' };
    } else if (textItems.length === 4) {
      gridStyle = { ...gridStyle, gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' };
    } else {
      gridStyle = { ...gridStyle, display: 'flex', flexDirection: 'column' };
    }

    bodySection = (
      <div className="slide-card-grid-container full-view" style={gridStyle}>
        {textItems.map((item, itemIdx) => {
          const borderAccent = accentColors[itemIdx % accentColors.length];
          const { title, body } = splitBulletText(item.rawText || '');

          return (
            <div 
              key={itemIdx} 
              className="slide-card-item full-view"
              style={{
                background: theme.cardBg,
                borderLeft: `5px solid ${borderAccent}`
              }}
            >
              {title && (
                <div className="slide-card-item-title full-view" style={{ color: theme.titleColor, fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {title}
                </div>
              )}
              <div className="slide-card-item-body full-view" style={{ color: theme.textColor, fontSize: '16px' }}>
                {renderMarkdownInline(body, theme.titleColor)}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (slideLayout === 'timeline_flow') {
    bodySection = (
      <div className="slide-timeline-flow full-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px' }}>
        {textItems.slice(0, 4).map((item, itemIdx) => {
          const borderAccent = accentColors[itemIdx % accentColors.length];
          const { title, body } = splitBulletText(item.rawText || '');
          return (
            <React.Fragment key={itemIdx}>
              {itemIdx > 0 && (
                <div className="slide-timeline-arrow full-view" style={{ color: theme.titleColor, fontSize: '24px' }}>
                  ➔
                </div>
              )}
              <div 
                className="slide-timeline-node full-view"
                style={{
                  background: theme.cardBg,
                  borderTop: `5px solid ${borderAccent}`,
                  flex: 1,
                  padding: '15px',
                  borderRadius: '8px'
                }}
              >
                <div className="slide-timeline-step-num full-view" style={{ background: borderAccent, color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', marginBottom: '10px' }}>
                  {itemIdx + 1}
                </div>
                {title && (
                  <div className="slide-timeline-node-title full-view" style={{ color: theme.titleColor, fontWeight: 'bold', fontSize: '16px', marginBottom: '6px' }}>
                    {title}
                  </div>
                )}
                <div className="slide-timeline-node-body full-view" style={{ color: theme.textColor, fontSize: '13px' }}>
                  {renderMarkdownInline(body, theme.titleColor)}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  } else if (slideLayout === 'three_column') {
    bodySection = (
      <div className="slide-three-columns full-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        {textItems.slice(0, 3).map((item, itemIdx) => {
          const borderAccent = accentColors[itemIdx % accentColors.length];
          const { title, body } = splitBulletText(item.rawText || '');
          return (
            <div 
              key={itemIdx} 
              className="slide-column-3 full-view"
              style={{
                background: theme.cardBg,
                borderTop: `5px solid ${borderAccent}`,
                padding: '20px',
                borderRadius: '8px'
              }}
            >
              {title && (
                <div className="slide-column-3-title full-view" style={{ color: theme.titleColor, fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>
                  {title}
                </div>
              )}
              <div className="slide-column-3-body full-view" style={{ color: theme.textColor, fontSize: '14px' }}>
                {renderMarkdownInline(body, theme.titleColor)}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (slideLayout === 'quadrant_matrix') {
    bodySection = (
      <div className="slide-quadrant-matrix full-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '15px' }}>
        {textItems.slice(0, 4).map((item, itemIdx) => {
          const borderAccent = accentColors[itemIdx % accentColors.length];
          const { title, body } = splitBulletText(item.rawText || '');
          return (
            <div 
              key={itemIdx} 
              className="slide-quadrant-item full-view"
              style={{
                background: theme.cardBg,
                borderLeft: `5px solid ${borderAccent}`,
                padding: '15px',
                borderRadius: '6px'
              }}
            >
              {title && (
                <div className="slide-quadrant-title full-view" style={{ color: theme.titleColor, fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>
                  {title}
                </div>
              )}
              <div className="slide-quadrant-body full-view" style={{ color: theme.textColor, fontSize: '13px' }}>
                {renderMarkdownInline(body, theme.titleColor)}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (slideLayout === 'split_intro') {
    const introItem = textItems[0];
    const rightSideItems = textItems.slice(1);
    const { title: introTitle, body: introBody } = introItem ? splitBulletText(introItem.rawText || '') : { title: '', body: '' };

    bodySection = (
      <div className="slide-split-intro full-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
        {introItem && (
          <div 
            className="slide-split-left full-view"
            style={{
              background: theme.cardBg,
              borderLeft: `5px solid ${theme.accents[0]}`,
              padding: '20px',
              borderRadius: '8px'
            }}
          >
            {introTitle && (
              <div className="slide-split-intro-title full-view" style={{ color: theme.titleColor, fontSize: '22px', fontWeight: 'bold', marginBottom: '10px' }}>
                {introTitle}
              </div>
            )}
            <div className="slide-split-intro-body full-view" style={{ color: theme.textColor, fontSize: '16px' }}>
              {renderMarkdownInline(introBody, theme.titleColor)}
            </div>
          </div>
        )}
        <div className="slide-split-right full-view">
          <ul className="slide-split-list full-view" style={{ color: theme.textColor }}>
            {rightSideItems.map((item, itemIdx) => {
              const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
              return (
                <li 
                  key={itemIdx}
                  style={{
                    listStyleType: isImgOnly ? 'none' : 'disc',
                    marginLeft: isImgOnly ? '-20px' : '0px',
                    fontSize: '18px',
                    marginBottom: '10px'
                  }}
                >
                  {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  } else if (slideLayout === 'two_column_comparison') {
    const mid = Math.max(1, Math.floor(textItems.length / 2));
    const leftItems = textItems.slice(0, mid);
    const rightItems = textItems.slice(mid);
    const colFontSize = textItems.length > 5 ? '18px' : '22px';
    
    bodySection = (
      <div className="slide-two-columns full-view" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
        <div className="slide-column left full-view">
          <ul style={{ color: theme.textColor }}>
            {leftItems.map((item, itemIdx) => {
              const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
              return (
                <li 
                  key={itemIdx} 
                  style={{
                    fontSize: colFontSize,
                    listStyleType: isImgOnly ? 'none' : 'disc',
                    marginLeft: isImgOnly ? '-20px' : '0px',
                    marginBottom: '8px'
                  }}
                >
                  {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="slide-column right full-view">
          <ul style={{ color: theme.textColor }}>
            {rightItems.map((item, itemIdx) => {
              const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
              return (
                <li 
                  key={itemIdx} 
                  style={{
                    fontSize: colFontSize,
                    listStyleType: isImgOnly ? 'none' : 'disc',
                    marginLeft: isImgOnly ? '-20px' : '0px',
                    marginBottom: '8px'
                  }}
                >
                  {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  } else if (slideLayout === 'visual_highlight') {
    bodySection = (
      <div className="slide-visual-highlight full-view" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '20px' }}>
        {textItems.map((item, itemIdx) => (
          <div 
            key={itemIdx} 
            className="slide-visual-highlight-text full-view" 
            style={{ color: theme.titleColor, fontSize: '30px', fontWeight: 'bold', textAlign: 'center', fontStyle: 'italic' }}
          >
            {renderMarkdownInline(item.rawText || '', theme.titleColor)}
          </div>
        ))}
      </div>
    );
  } else {
    // default: standard list
    const fontSize = textItems.length > 5 ? '18px' : '22px';
    bodySection = (
      <div className="slide-bullet-list-container full-view">
        <ul className="slide-bullet-list full-view" style={{ color: theme.textColor }}>
          {textItems.map((item, itemIdx) => {
            const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
            return (
              <li 
                key={itemIdx} 
                style={{
                  fontSize: fontSize,
                  listStyleType: isImgOnly ? 'none' : 'disc',
                  marginLeft: isImgOnly ? '-20px' : '0px',
                  marginBottom: '10px'
                }}
              >
                {renderMarkdownInline(item.rawText || '', theme.titleColor)}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div 
      className="slide-frame full-view"
      style={{
        background: theme.bg,
        backgroundImage: theme.bgGradient,
        width: '1280px',
        height: '720px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px 80px',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      <div className="slide-content-wrapper" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h4 className="slide-title full-view" style={{ color: theme.titleColor, fontSize: '36px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
          {s.title}
        </h4>
        <div 
          className="slide-divider full-view" 
          style={{ background: theme.divider, height: '4px', borderRadius: '2px', marginBottom: '30px', width: '100%' }} 
        />
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {bodySection}
        </div>
      </div>
      
      <div className="slide-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
        <div className="slide-citations-list full-view" style={{ display: 'flex', gap: '10px', fontSize: '12px', flexWrap: 'wrap', maxWidth: '85%' }}>
          {s.citations.map((cit, citIdx) => (
            <span key={citIdx} style={{ color: '#818cf8' }}>
              {cit}
            </span>
          ))}
        </div>
        <div className="slide-page-number full-view" style={{ fontSize: '14px', color: theme.textColor, opacity: 0.6 }}>
          {idx + 1}
        </div>
      </div>
    </div>
  );
}

/**
 * Sequential canvas slide capture.
 */
export async function captureSlidesCanvas(
  mdContent: string, 
  themeName: string, 
  onProgress?: (msg: string) => void
): Promise<ExportSlidePayload[]> {
  const slides = parseMarkdownToSlidesJS(mdContent);
  if (slides.length === 0) return [];
  
  // 1. Create a hidden container on the body
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '1280px';
  container.style.height = '720px';
  container.style.overflow = 'hidden';
  container.style.zIndex = '-9999';
  document.body.appendChild(container);
  
  const results: ExportSlidePayload[] = [];
  const theme = THEMES[themeName] || THEMES.warm_academic;
  
  // Create React 18/19 Root
  const root = createRoot(container);
  
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    
    if (onProgress) {
      onProgress(`Đang chuẩn bị slide ${i + 1}/${slides.length}...`);
    }
    
    // Render the React component inside the hidden container
    await new Promise<void>((resolve) => {
      root.render(
        <div className="slide-proposal-wrapper" style={{ width: '1280px', height: '720px', padding: 0 }}>
          <RenderSlideForExport s={slide} idx={i} theme={theme} themeName={themeName} />
        </div>
      );
      // Wait for Mermaid or Recharts charts to render (Critique 47)
      setTimeout(resolve, 350);
    });
    
    const slideFrameEl = container.querySelector('.slide-frame');
    if (!slideFrameEl) {
      console.error(`Slide frame element not found for slide ${i + 1}`);
      continue;
    }
    
    if (onProgress) {
      onProgress(`Đang chụp ảnh slide ${i + 1}/${slides.length}...`);
    }
    
    // Capture the entire slide frame
    const canvas = await html2canvas(slideFrameEl as HTMLElement, {
      scale: 2, // High resolution (Critique 21)
      useCORS: true, // CORS image resolution (Critique 11)
      backgroundColor: null,
      logging: false
    });
    const fullScreenshot = canvas.toDataURL('image/jpeg', 0.8); // Compress payload (Critique 6)
    
    let visualScreenshot: string | undefined = undefined;
    let hasVisual = false;
    
    // Locate visual components (Mermaid, Charts, Tables)
    const svgEl = slideFrameEl.querySelector('.svg-slide-container') || 
                  slideFrameEl.querySelector('.slide-body-svg') ||
                  slideFrameEl.querySelector('.slide-body-table-container') ||
                  slideFrameEl.querySelector('.slide-card-grid-container') ||
                  slideFrameEl.querySelector('.slide-timeline-flow') ||
                  slideFrameEl.querySelector('.slide-three-columns') ||
                  slideFrameEl.querySelector('.slide-quadrant-matrix') ||
                  slideFrameEl.querySelector('.slide-split-left') ||
                  slideFrameEl.querySelector('.slide-split-right') ||
                  slideFrameEl.querySelector('.slide-column');
                  
    if (svgEl) {
      hasVisual = true;
      if (onProgress) {
        onProgress(`Đang chụp chi tiết đồ họa slide ${i + 1}/${slides.length}...`);
      }
      try {
        const visualCanvas = await html2canvas(svgEl as HTMLElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: null,
          logging: false
        });
        visualScreenshot = visualCanvas.toDataURL('image/jpeg', 0.8);
      } catch (err) {
        console.error("Error capturing visual component canvas:", err);
      }
    }
    
    results.push({
      title: slide.title,
      layout: slide.layout || 'standard_list',
      items: slide.items.map(it => ({
        type: it.type,
        rawText: it.rawText,
        bullet: it.bullet ?? true
      })),
      notes: slide.notes || '',
      screenshot: fullScreenshot,
      has_visual: hasVisual,
      visual_screenshot: visualScreenshot || fullScreenshot
    });
  }
  
  // Cleanup
  root.unmount();
  document.body.removeChild(container);
  
  return results;
}
