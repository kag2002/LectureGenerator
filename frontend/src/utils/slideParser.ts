export interface SlideItem {
  type: 'text' | 'table';
  rawText?: string;
  bullet?: boolean;
  rows?: string[][];
}

export interface Slide {
  title: string;
  items: SlideItem[];
  citations: string[];
  layout: string | null;
  svgContent: string | null;
  rawMarkdown: string;
}

export interface ThemeColors {
  name: string;
  bg: string;
  bgGradient: string;
  titleColor: string;
  textColor: string;
  divider: string;
  accents: string[];
  cardBg: string;
}

/**
 * Bộ chủ đề giao diện slide (themes).
 */
export const THEMES: Record<string, ThemeColors> = {
  deep_space: {
    name: "Deep Space (Tối)",
    bg: '#070a13',
    bgGradient: 'radial-gradient(circle at top right, rgba(124, 77, 255, 0.08), transparent)',
    titleColor: '#00D2FF',
    textColor: '#E2E8F0',
    divider: 'linear-gradient(90deg, #7C4DFF, #00D2FF)',
    accents: ["#7C4DFF", "#00D2FF", "#10B981", "#FFC000"],
    cardBg: 'rgba(18, 20, 38, 0.5)',
  },
  warm_academic: {
    name: "Warm Academic (Sáng)",
    bg: '#FAF6EE',
    bgGradient: 'radial-gradient(circle at top right, rgba(140, 98, 57, 0.1), transparent)',
    titleColor: '#1A365D',
    textColor: '#2D3748',
    divider: 'linear-gradient(90deg, #8C6239, #1A365D)',
    accents: ["#8C6239", "#1A365D", "#9A3412", "#D97706"],
    cardBg: 'rgba(255, 255, 255, 0.7)',
  },
  mint_techno: {
    name: "Mint Techno (Tối)",
    bg: '#0B132B',
    bgGradient: 'radial-gradient(circle at top right, rgba(29, 233, 182, 0.08), transparent)',
    titleColor: '#1DE9B6',
    textColor: '#E2E8F0',
    divider: 'linear-gradient(90deg, #00B0FF, #1DE9B6)',
    accents: ["#00B0FF", "#1DE9B6", "#00E5FF", "#76FF03"],
    cardBg: 'rgba(28, 37, 65, 0.5)',
  },
  sunset_crimson: {
    name: "Sunset Crimson (Tối)",
    bg: '#1A0813',
    bgGradient: 'radial-gradient(circle at top right, rgba(255, 64, 129, 0.08), transparent)',
    titleColor: '#FF5252',
    textColor: '#F8FAFC',
    divider: 'linear-gradient(90deg, #FF4081, #FF9100)',
    accents: ["#FF4081", "#FF9100", "#FF5252", "#E040FB"],
    cardBg: 'rgba(59, 15, 37, 0.4)',
  },
  mckinsey_consulting: {
    name: "McKinsey Consulting (Tối)",
    bg: '#041E42',
    bgGradient: 'radial-gradient(circle at top right, rgba(0, 163, 166, 0.08), transparent)',
    titleColor: '#00A3A6',
    textColor: '#FFFFFF',
    divider: 'linear-gradient(90deg, #00A3A6, #4A90E2)',
    accents: ["#00A3A6", "#007A87", "#4A90E2", "#F5A623"],
    cardBg: 'rgba(11, 37, 69, 0.5)',
  }
};

/**
 * Trích xuất và loại bỏ citation tag từ một dòng text.
 */
export function extractAndCleanCitations(lineText: string): { cleanedText: string; citation: string | null } {
  const pattern = /\s*\[(nguồn|source|ref|trang|page)\s*:\s*([^\]]+)\]/i;
  const match = lineText.match(pattern);
  let citation: string | null = null;
  let cleanedText = lineText;
  if (match) {
    const fullMatch = match[0];
    const prefix = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const detail = match[2].trim();
    citation = `${prefix}: ${detail}`;
    cleanedText = lineText.replace(fullMatch, '').trim();
  }
  return { cleanedText, citation };
}

export function extractAndCleanLayout(lineText: string): { cleanedText: string; layout: string | null } {
  const pattern = /\s*\[Layout\s*:\s*([^\]]+)\]/i;
  const match = lineText.match(pattern);
  let layout: string | null = null;
  let cleanedText = lineText;
  if (match) {
    layout = match[1].trim();
    cleanedText = lineText.replace(match[0], '').trim();
  }
  return { cleanedText, layout };
}

/**
 * Tách một bullet text thành phần title và body dựa trên các pattern.
 */
export function splitBulletText(textStr: string): { title: string; body: string } {
  textStr = textStr.trim();
  // 1. Match bold prefix: **Title**: Body
  const boldMatch = textStr.match(/^\*\*(.*?)\*\*\s*[:\-—]?\s*(.*)$/);
  if (boldMatch) {
    const title = boldMatch[1].trim();
    const body = boldMatch[2].trim();
    if (title && body) return { title, body };
  }
  // 2. Match colon prefix: Title: Body
  if (textStr.includes(':')) {
    const idx = textStr.indexOf(':');
    const prefix = textStr.substring(0, idx).trim();
    const suffix = textStr.substring(idx + 1).trim();
    if (prefix.length > 0 && prefix.length < 25 && suffix) {
      return { title: prefix, body: suffix };
    }
  }
  // 3. Match dash prefix: Title - Body
  const separators = [' — ', ' - ', ' – '];
  for (const sep of separators) {
    if (textStr.includes(sep)) {
      const idx = textStr.indexOf(sep);
      const prefix = textStr.substring(0, idx).trim();
      const suffix = textStr.substring(idx + sep.length).trim();
      if (prefix.length > 0 && prefix.length < 25 && suffix) {
        return { title: prefix, body: suffix };
      }
    }
  }
  return { title: "", body: textStr };
}

/**
 * Tối ưu hóa layout slide items bằng cách nhóm các mục ưu/nhược điểm.
 */
export function optimizeSlideItemsJS(items: SlideItem[]): SlideItem[] {
  const textItems = items.filter(item => item.type === 'text');
  if (textItems.length > 2) {
    const pros: string[] = [];
    const cons: string[] = [];
    const others: SlideItem[] = [];
    for (const item of textItems) {
      const rawText = item.rawText || '';
      const raw = rawText.toLowerCase();
      const { title } = splitBulletText(rawText);
      const tLower = title.toLowerCase();
      const isPro = ["ưu điểm", "pro", "lợi ích", "advantages", "thuận lợi", "tích cực", "mặt tốt"].some(k => tLower.includes(k) || raw.substring(0, 20).includes(k));
      const isCon = ["nhược điểm", "con", "hạn chế", "disadvantages", "khó khăn", "tiêu cực", "mặt xấu"].some(k => tLower.includes(k) || raw.substring(0, 20).includes(k));
      if (isPro) {
        pros.push(rawText);
      } else if (isCon) {
        cons.push(rawText);
      } else {
        others.push(item);
      }
    }
    if (pros.length > 0 && cons.length > 0) {
      const newItems = [...others];
      const prosText = `**Ưu điểm & Lợi ích**:\n` + pros.map(p => `* ${p}`).join('\n');
      newItems.push({
        type: 'text',
        rawText: prosText,
        bullet: false
      });
      const consText = `**Nhược điểm & Hạn chế**:\n` + cons.map(c => `* ${c}`).join('\n');
      newItems.push({
        type: 'text',
        rawText: consText,
        bullet: false
      });
      // Append non-text items
      items.forEach(item => {
        if (item.type !== 'text') {
          newItems.push(item);
        }
      });
      return newItems;
    }
  }
  return items;
}

interface RawSlide {
  title: string;
  lines: string[];
  rawLines: string[];
}

/**
 * Phân tích nội dung Markdown thô thành mảng cấu trúc slide.
 */
export function parseMarkdownToSlidesJS(mdContent: string): Slide[] {
  if (!mdContent) return [];
  
  // Strip default emojis to prevent system icons from appearing in slides
  mdContent = mdContent.replace(/[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}☁️⏱️⚡⚠️✅🛡️🧩💾📄✨🎨🔍✍️🖨️]/gu, '');

  const lines = mdContent.replace(/\r\n/g, '\n').split('\n').map(l => l.trim());
  const hashHeaders = lines.filter(line => line.startsWith('#'));
  
  let slidesRaw: RawSlide[] = [];
  
  if (hashHeaders.length > 1) {
    let currentSlide: RawSlide | null = null;
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('#')) {
        const matchHash = line.match(/^#+/);
        const headerLevel = matchHash ? matchHash[0].length : 1;
        const title = line.replace(/^#+\s*/, '').trim();
        if (headerLevel <= 3) {
          const cleanedTitle = title.replace(/^(slide\s+\d+\s*[:.-]?\s*|chương\s+\d+\s*[:.-]?\s*|\d+\s*[:.-]\s*)/i, '').trim();
          if (currentSlide) {
            slidesRaw.push(currentSlide);
          }
          currentSlide = { title: cleanedTitle || title, lines: [], rawLines: [line] };
        }
      } else {
        if (currentSlide) {
          currentSlide.lines.push(line);
          currentSlide.rawLines.push(line);
        }
      }
    }
    if (currentSlide) {
      slidesRaw.push(currentSlide);
    }
  } else {
    const deckTitle = hashHeaders.length > 0 ? hashHeaders[0].replace(/^#+\s*/, '').trim() : "Bài giảng";
    let currentSlide: RawSlide | null = null;
    const processingLines = lines.filter(line => !line.startsWith('#') && line);
    
    for (const line of processingLines) {
      let matchHeader = line.match(/^[-*+•]\s*\*\*(.*?)\*\*\s*$/);
      if (!matchHeader) {
        matchHeader = line.match(/^\*\*(.*?)\*\*\s*$/);
      }
      
      if (matchHeader) {
        const titleText = matchHeader[1].trim();
        if (currentSlide) {
          slidesRaw.push(currentSlide);
        }
        currentSlide = { title: titleText, lines: [], rawLines: [line] };
      } else {
        if (currentSlide) {
          currentSlide.lines.push(line);
          currentSlide.rawLines.push(line);
        } else {
          currentSlide = { title: deckTitle, lines: [line], rawLines: [line] };
        }
      }
    }
    if (currentSlide) {
      slidesRaw.push(currentSlide);
    }
  }
  
  const processedSlides: Slide[] = [];
  for (const slide of slidesRaw) {
    const title = slide.title;
    const bodyItems: SlideItem[] = [];
    const citations: string[] = [];
    
    let inTable = false;
    let tableRows: string[][] = [];
    let slideLayout: string | null = null;
    
    let inSvg = false;
    let svgLines: string[] = [];
    
    for (const line of slide.lines) {
      if (!line) continue;
      
      const lineStripped = line.trim();
      // Skip markdown code block markers
      if (lineStripped === '```' || lineStripped.startsWith('```') || /^[-*+•]\s*```/.test(lineStripped)) {
        continue;
      }

      if (!inSvg && (lineStripped.startsWith('<svg') || lineStripped.includes('<svg') || lineStripped.includes('svg xmlns="http://www.w3.org/2000/svg"'))) {
        inSvg = true;
        const svgStartIdx = line.indexOf('<svg');
        if (svgStartIdx !== -1) {
          let textBefore = line.substring(0, svgStartIdx);
          textBefore = textBefore.replace(/!\[[^\]]*\]\s*\(\s*<?$/, '').trim();
          if (textBefore) {
            let { cleanedText: cb, citation: cit } = extractAndCleanCitations(textBefore);
            if (cit && !citations.includes(cit)) citations.push(cit);
            let layoutRes = extractAndCleanLayout(cb);
            cb = layoutRes.cleanedText;
            if (layoutRes.layout) slideLayout = layoutRes.layout;
            cb = cb.replace(/\[CLO\s*:?\s*[^\]]+\]/gi, '').trim();
            cb = cb.replace(/\[Bloom\s*:?\s*[^\]]+\]/gi, '').trim();
            if (cb && !/^[-*+•\s_=]+$/.test(cb)) {
              let isBullet = false;
              let lineContent = cb;
              const bulletMatch = lineContent.match(/^([-*+•])\s+(.*)$/) || (lineContent.startsWith('•') ? [null, '•', lineContent.slice(1).trim()] : null);
              if (bulletMatch) {
                isBullet = true;
                lineContent = bulletMatch[2];
              }
              if (lineContent.startsWith('>')) {
                lineContent = lineContent.slice(1).trim();
              }
              if (lineContent.startsWith('*') && lineContent.endsWith('*') && !lineContent.startsWith('**')) {
                lineContent = lineContent.slice(1, -1).trim();
              }
              if (lineContent.startsWith('_') && lineContent.endsWith('_') && !lineContent.startsWith('__')) {
                lineContent = lineContent.slice(1, -1).trim();
              }
              if (lineContent) {
                lineContent = capitalizeFirstLetter(lineContent);
                bodyItems.push({
                  type: 'text',
                  rawText: lineContent,
                  bullet: isBullet
                });
              }
            }
          }
          
          let svgPart = lineStripped.substring(lineStripped.indexOf('<svg'));
          if (svgPart.includes('</svg>')) {
            const svgEndIdx = svgPart.indexOf('</svg>');
            svgLines.push(svgPart.substring(0, svgEndIdx + 6));
            inSvg = false;
          } else {
            svgLines.push(svgPart);
          }
        } else {
          // fallback if it has svg without '<'
          const fallbackIdx = lineStripped.indexOf('svg');
          let svgPart = '<' + lineStripped.substring(fallbackIdx);
          if (svgPart.includes('</svg>')) {
            const svgEndIdx = svgPart.indexOf('</svg>');
            svgLines.push(svgPart.substring(0, svgEndIdx + 6));
            inSvg = false;
          } else {
            svgLines.push(svgPart);
          }
        }
        continue;
      } else if (inSvg) {
        if (lineStripped.includes('</svg>')) {
          const svgEndIdx = lineStripped.indexOf('</svg>');
          svgLines.push(lineStripped.substring(0, svgEndIdx + 6));
          inSvg = false;
        } else {
          svgLines.push(line);
        }
        continue;
      }
      
      let { cleanedText, citation } = extractAndCleanCitations(line);
      if (citation && !citations.includes(citation)) {
        citations.push(citation);
      }
      
      let layoutRes = extractAndCleanLayout(cleanedText);
      cleanedText = layoutRes.cleanedText;
      if (layoutRes.layout) {
        slideLayout = layoutRes.layout;
      }
      
      cleanedText = cleanedText.replace(/\[CLO\s*:?\s*[^\]]+\]/gi, '').trim();
      cleanedText = cleanedText.replace(/\[Bloom\s*:?\s*[^\]]+\]/gi, '').trim();
      
      if (!cleanedText) continue;
      
      if (/^[-*+•\s_=]+$/.test(cleanedText)) {
        continue;
      }
      
      if (cleanedText.startsWith('|') && cleanedText.endsWith('|')) {
        if (/^[\s:\-|]+$/.test(cleanedText)) {
          continue;
        }
        const cols = cleanedText.split('|').slice(1, -1).map(c => c.trim());
        tableRows.push(cols);
        inTable = true;
        continue;
      } else {
        if (inTable) {
          bodyItems.push({
            type: 'table',
            rows: tableRows
          });
          tableRows = [];
          inTable = false;
        }
      }
      
      let isBullet = false;
      let lineContent = cleanedText;
      const bulletMatch = lineContent.match(/^([-*+•])\s+(.*)$/) || (lineContent.startsWith('•') ? [null, '•', lineContent.slice(1).trim()] : null);
      if (bulletMatch) {
        isBullet = true;
        lineContent = bulletMatch[2];
      }
      if (lineContent.startsWith('>')) {
        lineContent = lineContent.slice(1).trim();
      }
      
      if (lineContent.startsWith('*') && lineContent.endsWith('*') && !lineContent.startsWith('**')) {
        lineContent = lineContent.slice(1, -1).trim();
      }
      if (lineContent.startsWith('_') && lineContent.endsWith('_') && !lineContent.startsWith('__')) {
        lineContent = lineContent.slice(1, -1).trim();
      }
      
      if (lineContent) {
        lineContent = capitalizeFirstLetter(lineContent);
        bodyItems.push({
          type: 'text',
          rawText: lineContent,
          bullet: isBullet
        });
      }
    }
    
    if (inTable && tableRows.length > 0) {
      bodyItems.push({
        type: 'table',
        rows: tableRows
      });
    }
    
    let rawSvg = svgLines.length > 0 ? svgLines.join('\n') : null;
    if (rawSvg && !rawSvg.includes('viewBox=')) {
      const widthMatch = rawSvg.match(/width=["'](\d+(?:\.\d+)?)["']/);
      const heightMatch = rawSvg.match(/height=["'](\d+(?:\.\d+)?)["']/);
      if (widthMatch && heightMatch) {
        const w = widthMatch[1];
        const h = heightMatch[1];
        rawSvg = rawSvg.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
      }
    }

    processedSlides.push({
      title,
      items: bodyItems,
      citations,
      layout: slideLayout,
      svgContent: rawSvg,
      rawMarkdown: slide.rawLines ? slide.rawLines.join('\n') : ''
    });
  }
  
  return processedSlides;
}

export function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  if (str.startsWith('**')) {
    return '**' + capitalizeFirstLetter(str.slice(2));
  }
  if (str.startsWith('__')) {
    return '__' + capitalizeFirstLetter(str.slice(2));
  }
  if (str.startsWith('*')) {
    return '*' + capitalizeFirstLetter(str.slice(1));
  }
  if (str.startsWith('_')) {
    return '_' + capitalizeFirstLetter(str.slice(1));
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}
