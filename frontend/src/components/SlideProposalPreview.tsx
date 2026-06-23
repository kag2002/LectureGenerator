import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import client from '../api/client';
import { parseMarkdownToSlidesJS, optimizeSlideItemsJS, splitBulletText, THEMES, Slide, SlideItem } from '../utils/slideParser';
import { renderBoldRuns, renderMarkdownInline } from '../utils/markdown';
import { 
  Loader2, BookOpen, BarChart2, Presentation, LayoutGrid, Plus, 
  ChevronLeft, ChevronRight, Sparkles, X, Check, AlertTriangle, 
  Maximize2, Minimize2, Settings, Play, GitFork, CheckCircle2, Layers 
} from 'lucide-react';
import MermaidDiagram from './MermaidDiagram';
import { 
  ReactFlow, 
  Background, 
  Handle, 
  Position, 
  BaseEdge, 
  EdgeLabelRenderer, 
  getSmoothStepPath,
  ReactFlowProvider,
  useReactFlow,
  type EdgeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- Read-Only Custom Modern Node Design for Preview ---
const ReadOnlyCustomNode = ({ data }: any) => {
  const type = data.type || 'process';
  
  // Theme styling configurations based on node type
  let borderStyle = '1px solid rgba(255,255,255,0.15)';
  let bgStyle = 'rgba(15, 23, 42, 0.9)'; // Slate 900 Glassmorphic
  let accentColor = '#8C6239'; // Default gold accent
  let IconComponent = Settings;
  let labelType = 'Tiến trình';

  if (type === 'input') {
    accentColor = '#10B981'; // Green
    bgStyle = 'rgba(16, 185, 129, 0.08)';
    borderStyle = `1px solid ${accentColor}`;
    IconComponent = Play;
    labelType = 'Đầu vào';
  } else if (type === 'decision') {
    accentColor = '#FF9100'; // Amber
    bgStyle = 'rgba(255, 145, 0, 0.08)';
    borderStyle = `1px solid ${accentColor}`;
    IconComponent = GitFork;
    labelType = 'Quyết định';
  } else if (type === 'output') {
    accentColor = '#3b82f6'; // Blue
    bgStyle = 'rgba(59, 130, 246, 0.08)';
    borderStyle = `1px solid ${accentColor}`;
    IconComponent = CheckCircle2;
    labelType = 'Kết quả';
  } else {
    IconComponent = Layers;
  }

  // Base layout styles
  const baseNodeStyle: React.CSSProperties = {
    padding: '12px 18px',
    background: bgStyle,
    color: '#f8fafc',
    fontSize: '13px',
    fontWeight: 'bold',
    minWidth: '160px',
    maxWidth: '220px',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    position: 'relative',
    backdropFilter: 'blur(12px)',
  };

  // Render Decision Node as a beautiful diamond shape
  if (type === 'decision') {
    return (
      <div style={{
        width: '110px',
        height: '110px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontSize: '12px',
        fontWeight: 'bold',
      }}>
        {/* Rotated Diamond Background */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: bgStyle,
          border: borderStyle,
          borderRadius: '8px',
          transform: 'rotate(45deg)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 1,
        }} />
        
        {/* Hidden handles for connection rendering */}
        <Handle type="target" position={Position.Top} id="t-top" style={{ opacity: 0, pointerEvents: 'none' }} />
        <Handle type="target" position={Position.Left} id="t-left" style={{ opacity: 0, pointerEvents: 'none' }} />
        <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ opacity: 0, pointerEvents: 'none' }} />
        <Handle type="source" position={Position.Right} id="s-right" style={{ opacity: 0, pointerEvents: 'none' }} />

        {/* Upright Text Container */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          padding: '8px',
          textAlign: 'center',
          maxWidth: '85px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', textTransform: 'uppercase', color: accentColor, letterSpacing: '0.5px' }}>
            <IconComponent size={10} />
            <span>{labelType}</span>
          </div>

          <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', userSelect: 'none', fontSize: '12px', lineHeight: '1.2' }}>
            {data.label}
          </div>
        </div>
      </div>
    );
  }

  // Oval shape for Input/Output Nodes, Rounded Rectangle for Process Node
  const nodeStyle: React.CSSProperties = {
    ...baseNodeStyle,
    borderRadius: (type === 'input' || type === 'output') ? '24px' : '8px',
    border: borderStyle,
    borderLeft: `5px solid ${accentColor}`,
  };

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Top} id="t-top" style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Left} id="t-left" style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="s-bottom" style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right} id="s-right" style={{ opacity: 0, pointerEvents: 'none' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '9px', textTransform: 'uppercase', color: accentColor, letterSpacing: '0.5px' }}>
          <IconComponent size={10} />
          <span>{labelType}</span>
        </div>

        <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', userSelect: 'none', fontSize: '13px', lineHeight: '1.3' }}>
          {data.label}
        </div>
      </div>
    </div>
  );
};

// --- Read-Only Custom Edge Design for Preview ---
const ReadOnlyEditableEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{
          ...style,
          stroke: style.stroke || '#8C6239',
          strokeWidth: style.strokeWidth || 2,
        }} 
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
          >
            <div
              style={{
                background: '#0B132B',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                padding: '2px 8px',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 'bold',
                userSelect: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            >
              <span>{label}</span>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// --- Read-Only Canvas Component wrapping ReactFlow and triggering fitView ---
interface ReadOnlyFlowCanvasProps {
  nodes: any[];
  edges: any[];
  nodeTypes: any;
  edgeTypes: any;
}

const ReadOnlyFlowCanvas = ({ nodes, edges, nodeTypes, edgeTypes }: ReadOnlyFlowCanvasProps) => {
  const { fitView } = useReactFlow();

  useEffect(() => {
    // Fit view after a brief timeout to make sure dimensions are ready in the DOM
    const timer = setTimeout(() => {
      fitView({ padding: 0.15 });
    }, 150);
    return () => clearTimeout(timer);
  }, [nodes, edges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
      preventScrolling={true}
      zoomOnDoubleClick={false}
      fitView
    >
      <Background color="rgba(255,255,255,0.05)" gap={12} size={1} />
    </ReactFlow>
  );
};

export interface SlideProposalPreviewProps {
  mdContent: string;
  apiStatus: string;
  themeName?: string;
  onCitationClick?: (citation: string) => void;
  isFullscreen?: boolean;
  onInsertSlide?: (slideMarkdown: string) => void;
  chapterId?: number;
  onSaveRevisedSlide?: (slideIndex: number, newSlideMarkdown: string) => void;
  created_by?: string | null;
  activeSlideIndex?: number;
  onActiveSlideIndexChange?: (index: number) => void;
  diagramLayouts?: string | null;
}

export default function SlideProposalPreview({
  mdContent,
  apiStatus,
  themeName = 'warm_academic',
  onCitationClick,
  isFullscreen = false,
  onInsertSlide,
  chapterId,
  onSaveRevisedSlide,
  created_by,
  activeSlideIndex,
  onActiveSlideIndexChange,
  diagramLayouts = null
}: SlideProposalPreviewProps) {
  const slides = parseMarkdownToSlidesJS(mdContent);
  const [localIndex, setLocalIndex] = useState(0);

  const nodeTypes = useMemo(() => ({
    custom: ReadOnlyCustomNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    editable: ReadOnlyEditableEdge,
  }), []);

  const getCustomLayoutForSlide = (slideIdx: number): { nodes: any[]; edges: any[] } | null => {
    if (!diagramLayouts) return null;
    try {
      const parsed = JSON.parse(diagramLayouts);
      const slideLayout = parsed[`slide_${slideIdx}`];
      if (slideLayout && slideLayout.nodes && slideLayout.edges) {
        return slideLayout;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const currentIndex = activeSlideIndex !== undefined ? activeSlideIndex : localIndex;

  const setCurrentIndex = (index: number | ((prev: number) => number)) => {
    const nextIndex = typeof index === 'function' ? index(currentIndex) : index;
    if (onActiveSlideIndexChange) {
      onActiveSlideIndexChange(nextIndex);
    } else {
      setLocalIndex(nextIndex);
    }
  };
  const [viewMode, setViewMode] = useState<'slideshow' | 'grid'>('slideshow');
  const [isSlideFullscreen, setIsSlideFullscreen] = useState(false);

  // Thêm slide ảo đang tải vào cuối danh sách khi AI đang chạy
  const isGenerating = apiStatus === 'generating';
  const displaySlides = isGenerating
    ? [
      ...slides,
      {
        title: "Đang soạn thảo slide tiếp theo...",
        layout: "standard_list",
        items: [],
        citations: [],
        rawMarkdown: "",
        isLoadingPlaceholder: true,
      } as any,
    ]
    : slides;

  // States for single slide revision
  const [isReviseModalOpen, setIsReviseModalOpen] = useState(false);
  const [reviseSlideIndex, setReviseSlideIndex] = useState<number | null>(null);
  const [revisePrompt, setRevisePrompt] = useState('');
  const [revisedMarkdown, setRevisedMarkdown] = useState('');
  const [changesSummary, setChangesSummary] = useState('');
  const [pedagogicalFeedback, setPedagogicalFeedback] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [reviseError, setReviseError] = useState('');

  const handleReviseSingleSlide = async () => {
    if (!revisePrompt.trim() || reviseSlideIndex === null || !chapterId) return;
    setIsRevising(true);
    setReviseError('');
    const targetSlide = slides[reviseSlideIndex];
    try {
      const res = await client.post(`/api/courses/chapters/${chapterId}/revise-single-slide`, {
        current_slide_content: targetSlide.rawMarkdown,
        prompt: revisePrompt
      });
      const data = res.data;
      setRevisedMarkdown(data.revised_slide);
      setChangesSummary(data.changes_summary);
      setPedagogicalFeedback(data.pedagogical_feedback);
    } catch (err: any) {
      console.error(err);
      setReviseError(err.response?.data?.detail || 'Lỗi khi tinh chỉnh slide với AI.');
    } finally {
      setIsRevising(false);
    }
  };

  useEffect(() => {
    // Không reset về slide 0 khi đang stream hoặc khi parent đang điều khiển chỉ mục slide
    if (activeSlideIndex === undefined && apiStatus !== 'generating') {
      setCurrentIndex(0);
    }
  }, [mdContent, activeSlideIndex, apiStatus]);

  if (displaySlides.length === 0) {
    return <div className="planner-empty-state">Không có slide đề xuất.</div>;
  }

  const safeIndex = currentIndex >= displaySlides.length ? 0 : currentIndex;
  const slide = displaySlides[safeIndex];

  const theme = THEMES[themeName] || THEMES.warm_academic;

  const renderSlideContent = (s: Slide, idx: number, isThumbnail = false) => {
    if ((s as any).isLoadingPlaceholder) {
      return (
        <div
          className={`slide-frame loading-placeholder ${isThumbnail ? 'thumbnail-view' : 'full-view'} ${!isThumbnail && isFullscreen ? 'fullscreen' : ''}`}
          style={{
            borderColor: isThumbnail ? 'rgba(255, 255, 255, 0.08)' : undefined
          }}
        >
          <div className="slide-loading-content">
            <Loader2 className="animate-spin slide-loading-spinner" size={isThumbnail ? 16 : 28} />
            <div>
              <div className="slide-loading-title">
                Đang soạn thảo slide {idx + 1}...
              </div>
              {!isThumbnail && (
                <div className="slide-loading-desc">
                  AI đang tra cứu dữ liệu RAG môn học và tối ưu cấu trúc sư phạm.
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    const slideLayout = s.layout || 'standard_list';
    const optimizedItems = optimizeSlideItemsJS(s.items);
    const tableItem = optimizedItems.find(item => item.type === 'table');
    const textItems = optimizedItems.filter(item => item.type === 'text');
    const nonImgItems = textItems.filter(item => !(item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')')));
    const hasNonBullet = nonImgItems.some(item => item.bullet === false);

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
          <div className="slide-metric-number" style={{ color: theme.titleColor, fontSize: isThumbnail ? '20px' : '6cqw', fontWeight: '800', marginBottom: '1cqw' }}>
            {numberText}
          </div>
          {labelText && (
            <div className="slide-metric-label" style={{ color: theme.textColor, fontSize: isThumbnail ? '8px' : '1.8cqw', fontWeight: '600', textAlign: 'center' }}>
              {isThumbnail ? labelText.replace(/\*\*/g, '') : renderMarkdownInline(labelText, theme.titleColor)}
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
                      fontSize: isThumbnail ? '6px' : (cleanTextItems.length > 3 ? '1.5cqw' : '1.8cqw'),
                      ...(hideBullet ? { listStyleType: 'none', marginLeft: isThumbnail ? '-5px' : '-2cqw' } : {})
                    }}
                  >
                    {isThumbnail ? (item.rawText || '').replace(/\*\*/g, '') : renderMarkdownInline(item.rawText || '', theme.titleColor)}
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
          <div className="pros-column" style={{ background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)', borderLeft: `5px solid #10B981`, padding: isThumbnail ? '4px' : '1.5cqw', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#10B981', fontWeight: 'bold', fontSize: isThumbnail ? '6px' : '1.6cqw', marginBottom: '0.5cqw', display: 'flex', alignItems: 'center', gap: '0.5cqw' }}>
              ▲ Ưu điểm & Lợi ích
            </div>
            <ul className="slide-bullet-list full-view" style={{ color: theme.textColor, margin: 0, paddingLeft: isThumbnail ? '4px' : '1.5cqw' }}>
              {pros.map((p, idx) => (
                <li key={idx} style={{ fontSize: isThumbnail ? '5px' : '1.3cqw', marginBottom: '0.3cqw' }}>
                  {isThumbnail ? p.replace(/\*\*/g, '') : renderMarkdownInline(p, theme.titleColor)}
                </li>
              ))}
            </ul>
          </div>
          <div className="cons-column" style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderLeft: `5px solid #EF4444`, padding: isThumbnail ? '4px' : '1.5cqw', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#EF4444', fontWeight: 'bold', fontSize: isThumbnail ? '6px' : '1.6cqw', marginBottom: '0.5cqw', display: 'flex', alignItems: 'center', gap: '0.5cqw' }}>
              ▼ Nhược điểm & Hạn chế
            </div>
            <ul className="slide-bullet-list full-view" style={{ color: theme.textColor, margin: 0, paddingLeft: isThumbnail ? '4px' : '1.5cqw' }}>
              {cons.map((c, idx) => (
                <li key={idx} style={{ fontSize: isThumbnail ? '5px' : '1.3cqw', marginBottom: '0.3cqw' }}>
                  {isThumbnail ? c.replace(/\*\*/g, '') : renderMarkdownInline(c, theme.titleColor)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    } else if (s.svgContent) {
      if (textItems.length > 0) {
        bodySection = isThumbnail ? (
          <div className="slide-split-svg-text thumbnail-view">
            <div className="slide-svg-text-col" style={{ color: theme.textColor }}>
              {textItems[0].rawText ? textItems[0].rawText.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '').substring(0, 35) : ''}...
            </div>
            <div className="slide-body-svg thumbnail-view" style={{ color: theme.titleColor }}>
              <BarChart2 size={10} aria-hidden="true" /> [SVG]
            </div>
          </div>
        ) : (
          <div className="slide-split-svg-text full-view">
            <div className="slide-svg-text-col">
              <ul className="slide-bullet-list full-view" style={{ color: theme.textColor }}>
                {textItems.map((item, itemIdx) => {
                  const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                  const hideBullet = isImgOnly || item.bullet === false || textItems.length === 1 || hasNonBullet;
                  return (
                    <li
                      key={itemIdx}
                      style={{
                        fontSize: textItems.length > 3 ? '1.5cqw' : '1.8cqw',
                        ...(hideBullet ? { listStyleType: 'none', marginLeft: '-2.5cqw' } : {})
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
        bodySection = isThumbnail ? (
          <div className="slide-body-svg thumbnail-view" style={{ color: theme.titleColor }}>
            <BarChart2 size={12} aria-hidden="true" /> [Biểu đồ SVG]
          </div>
        ) : (
          <div
            className="svg-slide-container slide-body-svg full-view"
            dangerouslySetInnerHTML={{ __html: s.svgContent }}
          />
        );
      }
    } else if (s.mermaidContent) {
      const customLayout = getCustomLayoutForSlide(idx);
      if (textItems.length > 0) {
        bodySection = isThumbnail ? (
          <div className="slide-split-svg-text thumbnail-view">
            <div className="slide-svg-text-col" style={{ color: theme.textColor }}>
              {textItems[0].rawText ? textItems[0].rawText.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '').substring(0, 35) : ''}...
            </div>
            <div className="slide-body-svg thumbnail-view" style={{ color: theme.titleColor }}>
              <Presentation size={10} aria-hidden="true" /> [Sơ đồ{customLayout ? ' tùy chỉnh' : ''}]
            </div>
          </div>
        ) : (
          <div className="slide-split-svg-text full-view">
            <div className="slide-svg-text-col">
              <ul className="slide-bullet-list full-view" style={{ color: theme.textColor }}>
                {textItems.map((item, itemIdx) => {
                  const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                  const hideBullet = isImgOnly || item.bullet === false || textItems.length === 1 || hasNonBullet;
                  return (
                    <li
                      key={itemIdx}
                      style={{
                        fontSize: textItems.length > 3 ? '1.5cqw' : '1.8cqw',
                        ...(hideBullet ? { listStyleType: 'none', marginLeft: '-2.5cqw' } : {})
                      }}
                    >
                      {renderMarkdownInline(item.rawText || '', theme.titleColor)}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="slide-svg-graphic-col" style={{ position: 'relative', alignSelf: 'stretch' }}>
              {customLayout ? (
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                  <ReactFlowProvider>
                    <ReadOnlyFlowCanvas
                      nodes={customLayout.nodes}
                      edges={customLayout.edges}
                      nodeTypes={nodeTypes}
                      edgeTypes={edgeTypes}
                    />
                  </ReactFlowProvider>
                  <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--vinuni-gold)', zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    ✨ Bố cục tùy chỉnh
                  </div>
                </div>
              ) : (
                <MermaidDiagram code={s.mermaidContent} themeName={themeName} />
              )}
            </div>
          </div>
        );
      } else {
        bodySection = isThumbnail ? (
          <div className="slide-body-svg thumbnail-view" style={{ color: theme.titleColor }}>
            <Presentation size={12} aria-hidden="true" /> [Sơ đồ Mermaid{customLayout ? ' (Tùy chỉnh)' : ''}]
          </div>
        ) : (
          <div className="slide-body-svg full-view" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
            {customLayout ? (
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <ReactFlowProvider>
                  <ReadOnlyFlowCanvas
                    nodes={customLayout.nodes}
                    edges={customLayout.edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                  />
                </ReactFlowProvider>
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--vinuni-gold)', zIndex: 10, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  ✨ Bố cục tùy chỉnh
                </div>
              </div>
            ) : (
              <MermaidDiagram code={s.mermaidContent} themeName={themeName} />
            )}
          </div>
        );
      }
    } else if (tableItem) {
      bodySection = (
        <div className={`slide-body-table-container ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          <table className={`slide-table ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
            <thead>
              <tr>
                {tableItem.rows?.[0].map((cell, cIdx) => (
                  <th key={cIdx} style={{ background: theme.accents[0] + '40', color: theme.accents[0] }}>
                    {isThumbnail ? cell.replace(/\*\*/g, '') : renderBoldRuns(cell, theme.titleColor)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableItem.rows?.slice(1, isThumbnail ? 3 : undefined).map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ color: theme.textColor }}>
                      {isThumbnail ? cell.replace(/\*\*/g, '') : renderBoldRuns(cell, theme.titleColor)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (useCardLayout) {
      let gridStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' };
      if (!isThumbnail) {
        if (textItems.length === 2) {
          gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5cqw', flex: 1, alignItems: 'stretch' };
        } else if (textItems.length === 3) {
          gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.2cqw', flex: 1, alignItems: 'stretch' };
        } else if (textItems.length === 4) {
          gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1.2cqw', flex: 1, alignItems: 'stretch' };
        }
      } else {
        gridStyle = {};
      }

      bodySection = (
        <div
          className={`slide-card-grid-container ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
          style={!isThumbnail ? gridStyle : undefined}
        >
          {textItems.slice(0, isThumbnail ? 2 : undefined).map((item, itemIdx) => {
            const borderAccent = accentColors[itemIdx % accentColors.length];
            const { title, body } = splitBulletText(item.rawText || '');

            return (
              <div
                key={itemIdx}
                className={`slide-card-item ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
                style={{
                  background: theme.cardBg,
                  borderLeftColor: borderAccent
                }}
              >
                {title && (
                  <div className={`slide-card-item-title ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
                    {title}
                  </div>
                )}
                <div className={`slide-card-item-body ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
                  {isThumbnail ? body.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(body, theme.titleColor)}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else if (slideLayout === 'timeline_flow') {
      bodySection = (
        <div className={`slide-timeline-flow ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          {textItems.slice(0, isThumbnail ? 3 : 4).map((item, itemIdx) => {
            const borderAccent = accentColors[itemIdx % accentColors.length];
            const { title, body } = splitBulletText(item.rawText || '');
            return (
              <React.Fragment key={itemIdx}>
                {itemIdx > 0 && (
                  <div className={`slide-timeline-arrow ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
                    ➔
                  </div>
                )}
                <div
                  className={`slide-timeline-node ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
                  style={{
                    background: theme.cardBg,
                    borderTopColor: borderAccent
                  }}
                >
                  <div className={`slide-timeline-step-num ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ background: borderAccent }}>
                    {itemIdx + 1}
                  </div>
                  {title && (
                    <div className={`slide-timeline-node-title ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
                      {title}
                    </div>
                  )}
                  <div className={`slide-timeline-node-body ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
                    {isThumbnail ? body.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(body, theme.titleColor)}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      );
    } else if (slideLayout === 'three_column') {
      bodySection = (
        <div className={`slide-three-columns ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          {textItems.slice(0, 3).map((item, itemIdx) => {
            const borderAccent = accentColors[itemIdx % accentColors.length];
            const { title, body } = splitBulletText(item.rawText || '');
            return (
              <div
                key={itemIdx}
                className={`slide-column-3 ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
                style={{
                  background: theme.cardBg,
                  borderTopColor: borderAccent
                }}
              >
                {title && (
                  <div className={`slide-column-3-title ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
                    {title}
                  </div>
                )}
                <div className={`slide-column-3-body ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
                  {isThumbnail ? body.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(body, theme.titleColor)}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else if (slideLayout === 'quadrant_matrix') {
      bodySection = (
        <div className={`slide-quadrant-matrix ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          {textItems.slice(0, 4).map((item, itemIdx) => {
            const borderAccent = accentColors[itemIdx % accentColors.length];
            const { title, body } = splitBulletText(item.rawText || '');
            return (
              <div
                key={itemIdx}
                className={`slide-quadrant-item ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
                style={{
                  background: theme.cardBg,
                  borderLeftColor: borderAccent
                }}
              >
                {title && (
                  <div className={`slide-quadrant-title ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
                    {title}
                  </div>
                )}
                <div className={`slide-quadrant-body ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
                  {isThumbnail ? body.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(body, theme.titleColor)}
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
        <div className={`slide-split-intro ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          {introItem && (
            <div
              className={`slide-split-left ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
              style={{
                background: theme.cardBg,
                borderLeftColor: theme.accents[0]
              }}
            >
              {introTitle && (
                <div className={`slide-split-intro-title ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
                  {introTitle}
                </div>
              )}
              <div className={`slide-split-intro-body ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
                {isThumbnail ? introBody.replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(introBody, theme.titleColor)}
              </div>
            </div>
          )}
          <div className={`slide-split-right ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
            <ul className={`slide-split-list ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
              {rightSideItems.slice(0, isThumbnail ? 2 : undefined).map((item, itemIdx) => {
                const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                const hideBullet = isImgOnly || item.bullet === false || rightSideItems.length === 1 || hasNonBullet;
                return (
                  <li
                    key={itemIdx}
                    style={hideBullet ? { listStyleType: 'none', marginLeft: isThumbnail ? '-4px' : '-2cqw' } : undefined}
                  >
                    {isThumbnail ? (item.rawText || '').replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(item.rawText || '', theme.titleColor)}
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

      let textLength = 0;
      textItems.forEach(item => { textLength += (item.rawText || '').length; });
      let colFontSize = isThumbnail ? '6px' : '1.7cqw';
      if (!isThumbnail) {
        if (textLength > 600) colFontSize = '1.5cqw';
        else if (textLength > 300) colFontSize = '1.7cqw';
        else if (textLength > 150) colFontSize = '1.9cqw';
        else colFontSize = '2.2cqw';
      }

      bodySection = (
        <div className={`slide-two-columns ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          <div className={`slide-column left ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
            <ul style={{ color: theme.textColor }}>
              {leftItems.map((item, itemIdx) => {
                const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                const hideBullet = isImgOnly || item.bullet === false || leftItems.length === 1 || hasNonBullet;
                return (
                  <li
                    key={itemIdx}
                    style={{
                      ...(!isThumbnail ? { fontSize: colFontSize } : {}),
                      ...(hideBullet ? { listStyleType: 'none', marginLeft: isThumbnail ? '-5px' : '-1.5cqw' } : {})
                    }}
                  >
                    {isThumbnail ? (item.rawText || '').replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(item.rawText || '', theme.titleColor)}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className={`slide-column right ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
            <ul style={{ color: theme.textColor }}>
              {rightItems.map((item, itemIdx) => {
                const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
                const hideBullet = isImgOnly || item.bullet === false || rightItems.length === 1 || hasNonBullet;
                return (
                  <li
                    key={itemIdx}
                    style={{
                      ...(!isThumbnail ? { fontSize: colFontSize } : {}),
                      ...(hideBullet ? { listStyleType: 'none', marginLeft: isThumbnail ? '-5px' : '-1.5cqw' } : {})
                    }}
                  >
                    {isThumbnail ? (item.rawText || '').replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(item.rawText || '', theme.titleColor)}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      );
    } else if (slideLayout === 'visual_highlight') {
      bodySection = (
        <div className={`slide-visual-highlight ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          {textItems.map((item, itemIdx) => (
            <div
              key={itemIdx}
              className={`slide-visual-highlight-text ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
              style={{ color: theme.titleColor }}
            >
              {isThumbnail ? (item.rawText || '').replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(item.rawText || '', theme.titleColor)}
            </div>
          ))}
        </div>
      );
    } else {
      let textLength = 0;
      textItems.forEach(item => { textLength += (item.rawText || '').length; });
      let fontSize = isThumbnail ? '8px' : '2.2cqw';
      if (!isThumbnail) {
        if (textLength > 800) fontSize = '1.5cqw';
        else if (textLength > 500) fontSize = '1.7cqw';
        else if (textLength > 300) fontSize = '1.9cqw';
        else {
          const numParas = textItems.length;
          if (numParas > 8) fontSize = '1.6cqw';
          else if (numParas > 5) fontSize = '1.8cqw';
          else fontSize = '2.2cqw';
        }
      }

      bodySection = (
        <div className={`slide-bullet-list-container ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
          <ul className={`slide-bullet-list ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.textColor }}>
            {textItems.slice(0, isThumbnail ? 3 : undefined).map((item, itemIdx) => {
              const isImgOnly = item.rawText?.trim().startsWith('![') && item.rawText?.trim().endsWith(')');
              const hideBullet = isImgOnly || item.bullet === false || textItems.length === 1 || hasNonBullet;
              return (
                <li
                  key={itemIdx}
                  style={{
                    ...(!isThumbnail ? { fontSize: fontSize } : {}),
                    ...(hideBullet ? { listStyleType: 'none', marginLeft: isThumbnail ? '-10px' : '-2.5cqw' } : {})
                  }}
                >
                  {isThumbnail ? (item.rawText || '').replace(/!\[.*?\]\(.*?\)/g, '[Hình ảnh]').replace(/\*\*/g, '') : renderMarkdownInline(item.rawText || '', theme.titleColor)}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    return (
      <div
        className={`slide-frame ${isThumbnail ? 'thumbnail-view' : 'full-view'} ${!isThumbnail && isFullscreen ? 'fullscreen' : ''}`}
        style={{
          background: theme.bg,
          backgroundImage: theme.bgGradient,
          borderColor: isThumbnail ? 'rgba(255, 255, 255, 0.08)' : undefined
        }}
      >
        <div className="slide-content-wrapper">
          <h4 className={`slide-title ${isThumbnail ? 'thumbnail-view' : 'full-view'}`} style={{ color: theme.titleColor }}>
            {s.title}
          </h4>
          <div
            className={`slide-divider ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
            style={{ background: theme.divider }}
          />

          {bodySection}
        </div>

        <div className="slide-footer">
          <div className={`slide-citations-list ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
            {s.citations.length > 0 && <BookOpen size={isThumbnail ? 8 : 12} style={{ color: '#818cf8', flexShrink: 0 }} aria-hidden="true" />}
            {s.citations.map((cit, citIdx) => (
              <button
                key={citIdx}
                type="button"
                disabled={isThumbnail}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onCitationClick) onCitationClick(cit);
                }}
                className={`slide-citation-btn ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}
              >
                {cit}
              </button>
            ))}
          </div>
          <div className={`slide-page-number ${isThumbnail ? 'thumbnail-view' : 'full-view'}`}>
            {idx + 1}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`slide-proposal-wrapper ${viewMode === 'grid' ? 'grid-view' : ''}`}
      style={created_by === 'odin_autopilot' ? {
        border: '2px dashed var(--vinuni-gold)',
        borderRadius: '8px',
        position: 'relative',
        margin: '2px',
      } : undefined}
    >
      <div className="slide-proposal-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', alignItems: 'stretch' }}>
        {/* Row 1: View Modes & Slide Navigation */}
        <div className="slide-toolbar-main-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', width: '100%' }}>
          <div className="slide-view-mode-group" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setViewMode('slideshow')}
              className={`slide-view-mode-btn ${viewMode === 'slideshow' ? 'active' : 'inactive'}`}
            >
              <Presentation size={12} style={{ marginRight: '4px' }} aria-hidden="true" /> Trình chiếu
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`slide-view-mode-btn ${viewMode === 'grid' ? 'active' : 'inactive'}`}
            >
              <LayoutGrid size={12} style={{ marginRight: '4px' }} aria-hidden="true" /> Tổng quan ({slides.length})
            </button>
            {created_by === 'odin_autopilot' && (
              <div style={{
                background: 'var(--vinuni-gold)',
                color: '#000',
                fontSize: '9px',
                fontWeight: '800',
                padding: '2px 6px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                <Sparkles size={8} />
                Tạo bởi AI
              </div>
            )}
          </div>

          {viewMode === 'slideshow' && (
            <div className="slide-toolbar-navigation-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                disabled={safeIndex === 0}
                onClick={() => setCurrentIndex(safeIndex - 1)}
                className="slide-nav-btn"
                style={{ padding: '4px 8px' }}
              >
                <ChevronLeft size={12} aria-hidden="true" /> Trước
              </button>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', minWidth: '45px', textAlign: 'center' }}>
                {safeIndex + 1} / {displaySlides.length}
              </span>
              <button
                type="button"
                disabled={safeIndex === displaySlides.length - 1}
                onClick={() => setCurrentIndex(safeIndex + 1)}
                className="slide-nav-btn"
                style={{ padding: '4px 8px' }}
              >
                Sau <ChevronRight size={12} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Row 2: Action Buttons */}
        {viewMode === 'slideshow' && !(slide as any).isLoadingPlaceholder && (
          <div className="slide-toolbar-actions-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setIsSlideFullscreen(true)}
              className="slide-action-btn-zoom"
              title="Phóng to slide toàn màn hình"
            >
              <Maximize2 size={12} style={{ marginRight: '4px' }} aria-hidden="true" /> Phóng to
            </button>
            
            {chapterId && onSaveRevisedSlide && (
              <button
                type="button"
                onClick={() => {
                  setReviseSlideIndex(safeIndex);
                  setRevisePrompt('');
                  setRevisedMarkdown('');
                  setChangesSummary('');
                  setPedagogicalFeedback('');
                  setReviseError('');
                  setIsReviseModalOpen(true);
                }}
                className="slide-action-btn-revise"
                style={{ 
                  background: 'rgba(124, 77, 255, 0.1)',
                  border: '1px solid rgba(124, 77, 255, 0.3)',
                  color: '#b388ff',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                <Sparkles size={12} style={{ marginRight: '4px' }} aria-hidden="true" /> Tinh chỉnh Slide bằng AI
              </button>
            )}
            
            {onInsertSlide && (
              <button
                type="button"
                onClick={() => onInsertSlide(slide.rawMarkdown)}
                className="slide-action-btn-insert"
              >
                <Plus size={12} style={{ marginRight: '4px' }} aria-hidden="true" /> Chèn slide này
              </button>
            )}
          </div>
        )}
      </div>

      {viewMode === 'slideshow' ? (
        <div className="slide-slideshow-container">
          {renderSlideContent(slide, safeIndex, false)}
        </div>
      ) : (
        <div className="slide-grid-container">
          {displaySlides.map((s, idx) => (
            <div
              key={idx}
              className="slide-thumbnail-wrapper"
              onClick={() => {
                if ((s as any).isLoadingPlaceholder) return;
                setCurrentIndex(idx);
                setViewMode('slideshow');
              }}
              style={(s as any).isLoadingPlaceholder ? { cursor: 'default' } : undefined}
            >
              {chapterId && onSaveRevisedSlide && !(s as any).isLoadingPlaceholder && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReviseSlideIndex(idx);
                    setRevisePrompt('');
                    setRevisedMarkdown('');
                    setChangesSummary('');
                    setPedagogicalFeedback('');
                    setReviseError('');
                    setIsReviseModalOpen(true);
                  }}
                  className="slide-thumbnail-revise-btn"
                  title="Hiệu chỉnh slide bằng AI"
                >
                  <Sparkles size={10} aria-hidden="true" />
                </button>
              )}
              {onInsertSlide && !(s as any).isLoadingPlaceholder && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertSlide(s.rawMarkdown);
                  }}
                  className="slide-thumbnail-insert-btn"
                >
                  <Plus size={10} aria-hidden="true" /> Chèn
                </button>
              )}
              <div>
                {renderSlideContent(s, idx, true)}
              </div>
            </div>
          ))}
        </div>
      )}

      {isReviseModalOpen && reviseSlideIndex !== null && typeof document !== 'undefined' && createPortal(
        <div className="slide-revise-modal-overlay" onClick={() => !isRevising && setIsReviseModalOpen(false)}>
          <div className="slide-revise-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="slide-revise-modal-header">
              <h3 className="slide-revise-modal-title">
                <Sparkles size={16} style={{ marginRight: '6px', color: '#818cf8' }} /> Không gian Hiệu chỉnh Slide {reviseSlideIndex + 1} bằng AI
              </h3>
              <button
                type="button"
                onClick={() => setIsReviseModalOpen(false)}
                className="slide-revise-modal-close-btn"
                title="Đóng cửa sổ"
                disabled={isRevising}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="slide-revise-modal-body">
              <div className="slide-revise-modal-left">
                <div className="slide-revise-original-section">
                  <div className="slide-revise-section-title">Bản slide hiện tại</div>
                  <div className="slide-revise-original-container">
                    {renderSlideContent(slides[reviseSlideIndex], reviseSlideIndex, false)}
                  </div>
                </div>

                <div className="slide-revise-prompt-wrapper">
                  <div className="slide-revise-section-title">Nhập yêu cầu tinh chỉnh</div>
                  <textarea
                    value={revisePrompt}
                    onChange={(e) => setRevisePrompt(e.target.value)}
                    placeholder="Ví dụ: Thêm ví dụ thực tế về AVL rotation hoặc chèn thêm hình ảnh sơ đồ minh họa..."
                    className="slide-revise-prompt-input"
                    disabled={isRevising}
                  />
                  <button
                    type="button"
                    onClick={handleReviseSingleSlide}
                    disabled={isRevising || !revisePrompt.trim()}
                    className="slide-revise-btn-trigger-ai"
                  >
                    {isRevising ? (
                      <>
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Đang cập nhật...
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} aria-hidden="true" /> Xem trước bản sửa
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="slide-revise-modal-right">
                <div className="slide-revise-section-title">Bản xem trước slide đã tinh chỉnh</div>
                <div className="slide-revise-preview-pane">
                  {isRevising ? (
                    <div className="slide-revise-preview-placeholder">
                      <Loader2 size={24} className="animate-spin" aria-hidden="true" /> Đang cập nhật slide...
                    </div>
                  ) : revisedMarkdown ? (
                    (() => {
                      const revised = parseMarkdownToSlidesJS(revisedMarkdown);
                      return renderSlideContent(revised[0] || slides[reviseSlideIndex], reviseSlideIndex, false);
                    })()
                  ) : (
                    <div className="slide-revise-preview-placeholder">
                      Nhập yêu cầu của Thầy/Cô ở cột bên trái và bấm "Xem trước bản sửa" để xem kết quả trực quan tại đây.
                    </div>
                  )}
                </div>

                {changesSummary && !isRevising && (
                  <div className="slide-revise-feedback-box" style={{ marginTop: '8px' }}>
                    <div className="slide-revise-feedback-title">
                      <AlertTriangle size={14} style={{ color: '#d97706' }} /> Tóm tắt thay đổi:
                    </div>
                    <div>{changesSummary}</div>
                  </div>
                )}

                {pedagogicalFeedback && !isRevising && (
                  <div className="slide-revise-feedback-box" style={{ marginTop: '8px' }}>
                    <div className="slide-revise-feedback-title">
                      <Check size={14} /> Nhận xét & đánh giá sư phạm từ trợ lý AI:
                    </div>
                    <div>{pedagogicalFeedback}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="slide-revise-modal-footer">
              <button
                type="button"
                onClick={() => setIsReviseModalOpen(false)}
                className="slide-revise-footer-btn-cancel"
                disabled={isRevising}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onSaveRevisedSlide && revisedMarkdown) {
                    onSaveRevisedSlide(reviseSlideIndex, revisedMarkdown);
                    setIsReviseModalOpen(false);
                  }
                }}
                disabled={isRevising || !revisedMarkdown}
                className="slide-revise-footer-btn-apply"
              >
                Đồng ý thay thế
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isSlideFullscreen && typeof document !== 'undefined' && createPortal(
        <div className="slide-fullscreen-overlay" onClick={() => setIsSlideFullscreen(false)}>
          <div className="slide-fullscreen-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsSlideFullscreen(false)}
              className="slide-fullscreen-close-btn"
              title="Thoát chế độ phóng to"
            >
              <X size={20} aria-hidden="true" />
            </button>
            {renderSlideContent(slide, safeIndex, false)}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
