'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 520;
const PANEL_MIN_PX = 260; // Minimum px for AI or Editor panel

/**
 * Hook to manage resizable 3-column layout.
 * Uses a flex container. The sidebar has a fixed px width.
 * The AI and Editor panels share the remaining space via a ratio.
 * Safe for SSR: all browser API calls are inside useEffect.
 */
export function useResizablePanels(showSidebar: boolean, showAIProposal: boolean) {
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [aiRatio, setAiRatio] = useState(0.5); // proportion of flex area given to AI panel
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'sidebar' | 'ai' | null>(null);
  const startXRef = useRef(0);
  const startSidebarWidthRef = useRef(360);
  const startAiRatioRef = useRef(0.5);

  const onMouseDownSidebar = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    draggingRef.current = 'sidebar';
    setIsDragging(true);
    startXRef.current = e.clientX;
    startSidebarWidthRef.current = sidebarWidth;
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
  }, [sidebarWidth]);

  const onMouseDownAI = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    draggingRef.current = 'ai';
    setIsDragging(true);
    startXRef.current = e.clientX;
    startAiRatioRef.current = aiRatio;
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
  }, [aiRatio]);

  useEffect(() => {
    // Guard: this effect only runs in the browser
    if (typeof window === 'undefined') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const containerWidth = containerRef.current.offsetWidth;

      if (draggingRef.current === 'sidebar') {
        const delta = e.clientX - startXRef.current;
        const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startSidebarWidthRef.current + delta));
        setSidebarWidth(newWidth);
      } else if (draggingRef.current === 'ai') {
        // Compute the available width for AI+Editor columns
        const sidebarPx = showSidebar ? sidebarWidth : 0;
        const flexArea = containerWidth - sidebarPx - 24; // 24px for handle widths
        if (flexArea <= 0) return;

        const delta = e.clientX - startXRef.current;
        const deltaRatio = delta / flexArea;
        const minRatio = PANEL_MIN_PX / flexArea;
        const maxRatio = 1 - minRatio;
        const newRatio = Math.min(maxRatio, Math.max(minRatio, startAiRatioRef.current + deltaRatio));
        setAiRatio(newRatio);
      }
    };

    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showSidebar, sidebarWidth]);

  return {
    containerRef,
    onMouseDownSidebar,
    onMouseDownAI,
    sidebarWidth,
    aiRatio,
    isDragging
  };
}
