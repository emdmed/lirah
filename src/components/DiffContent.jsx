import React, { useMemo, useState, useEffect, useRef, memo, useCallback } from 'react';
import { diffLines, diffWords } from 'diff';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from './ui/button';

const LINE_HEIGHT = 24;
const CONTEXT_LINES = 3; // Lines of context to show around changes
const VIRTUALIZATION_BUFFER = 10; // Extra lines to render above/below viewport

/**
 * Compute word-level diff between two strings
 */
function computeWordDiff(oldStr, newStr) {
  const changes = diffWords(oldStr, newStr);
  const oldParts = [];
  const newParts = [];

  changes.forEach((change) => {
    if (change.added) {
      newParts.push({ text: change.value, highlight: true });
    } else if (change.removed) {
      oldParts.push({ text: change.value, highlight: true });
    } else {
      oldParts.push({ text: change.value, highlight: false });
      newParts.push({ text: change.value, highlight: false });
    }
  });

  return { oldParts, newParts };
}

/**
 * Renders a side-by-side diff view showing old and new file versions
 */
export function DiffContent({
  oldContent,
  newContent,
  isNewFile,
  isDeletedFile,
  scrollContainerRef,
}) {
  const [collapsedRegions, setCollapsedRegions] = useState(new Set());
  const [selectedLines, setSelectedLines] = useState(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState(null);
  const [copiedChunk, setCopiedChunk] = useState(null);
  const contentRef = useRef(null);

  // Compute the diff with word-level highlighting for modified lines
  const diffResult = useMemo(() => {
    if (isNewFile) {
      const lines = newContent.split('\n');
      return {
        oldLines: lines.map(() => ({ content: '', type: 'empty', wordDiff: null })),
        newLines: lines.map((content, i) => ({
          content,
          type: 'added',
          lineNum: i + 1,
          wordDiff: null
        })),
      };
    }

    if (isDeletedFile) {
      const lines = oldContent.split('\n');
      return {
        oldLines: lines.map((content, i) => ({
          content,
          type: 'removed',
          lineNum: i + 1,
          wordDiff: null
        })),
        newLines: lines.map(() => ({ content: '', type: 'empty', wordDiff: null })),
      };
    }

    const changes = diffLines(oldContent, newContent);
    const oldLines = [];
    const newLines = [];
    let oldLineNum = 1;
    let newLineNum = 1;

    // Process changes and detect modifications (removed followed by added)
    let i = 0;
    while (i < changes.length) {
      const change = changes[i];
      const nextChange = changes[i + 1];

      // Check if this is a modification (removed followed by added)
      if (change.removed && nextChange?.added) {
        const removedLines = change.value.split('\n');
        const addedLines = nextChange.value.split('\n');

        if (removedLines[removedLines.length - 1] === '') removedLines.pop();
        if (addedLines[addedLines.length - 1] === '') addedLines.pop();

        // Pair up lines for word-level diff
        const maxLen = Math.max(removedLines.length, addedLines.length);

        for (let j = 0; j < maxLen; j++) {
          const oldLine = removedLines[j];
          const newLine = addedLines[j];

          if (oldLine !== undefined && newLine !== undefined) {
            // Modified line - compute word diff
            const wordDiff = computeWordDiff(oldLine, newLine);
            oldLines.push({
              content: oldLine,
              type: 'modified-old',
              lineNum: oldLineNum++,
              wordDiff: wordDiff.oldParts
            });
            newLines.push({
              content: newLine,
              type: 'modified-new',
              lineNum: newLineNum++,
              wordDiff: wordDiff.newParts
            });
          } else if (oldLine !== undefined) {
            // Only removed
            oldLines.push({ content: oldLine, type: 'removed', lineNum: oldLineNum++, wordDiff: null });
            newLines.push({ content: '', type: 'empty', wordDiff: null });
          } else {
            // Only added
            oldLines.push({ content: '', type: 'empty', wordDiff: null });
            newLines.push({ content: newLine, type: 'added', lineNum: newLineNum++, wordDiff: null });
          }
        }

        i += 2; // Skip both changes
      } else if (change.added) {
        const lines = change.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        lines.forEach((content) => {
          oldLines.push({ content: '', type: 'empty', wordDiff: null });
          newLines.push({ content, type: 'added', lineNum: newLineNum++, wordDiff: null });
        });
        i++;
      } else if (change.removed) {
        const lines = change.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        lines.forEach((content) => {
          oldLines.push({ content, type: 'removed', lineNum: oldLineNum++, wordDiff: null });
          newLines.push({ content: '', type: 'empty', wordDiff: null });
        });
        i++;
      } else {
        const lines = change.value.split('\n');
        if (lines[lines.length - 1] === '') lines.pop();

        lines.forEach((content) => {
          oldLines.push({ content, type: 'unchanged', lineNum: oldLineNum++, wordDiff: null });
          newLines.push({ content, type: 'unchanged', lineNum: newLineNum++, wordDiff: null });
        });
        i++;
      }
    }

    return { oldLines, newLines };
  }, [oldContent, newContent, isNewFile, isDeletedFile]);

  const { oldLines, newLines } = diffResult;
  const maxLines = Math.max(oldLines.length, newLines.length);

  // Collect diff chunks (groups of consecutive changed lines)
  const diffChunks = useMemo(() => {
    const chunks = [];
    let currentChunk = null;

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      const isDiff = oldLine?.type !== 'unchanged' && oldLine?.type !== 'empty' ||
                     newLine?.type !== 'unchanged' && newLine?.type !== 'empty';

      if (isDiff) {
        if (currentChunk === null) {
          currentChunk = { start: i, end: i };
        } else {
          currentChunk.end = i;
        }
      } else if (currentChunk !== null) {
        chunks.push(currentChunk);
        currentChunk = null;
      }
    }

    if (currentChunk !== null) {
      chunks.push(currentChunk);
    }

    return chunks;
  }, [oldLines, newLines, maxLines]);

  // Pre-compute line-to-chunk lookup array for O(1) access
  const lineToChunk = useMemo(() => {
    const map = new Array(maxLines).fill(-1);
    diffChunks.forEach((chunk, i) => {
      for (let j = chunk.start; j <= chunk.end; j++) {
        map[j] = i;
      }
    });
    return map;
  }, [diffChunks, maxLines]);

  // Compute collapsible regions (unchanged lines between diff chunks)
  const collapsibleRegions = useMemo(() => {
    const regions = [];

    if (diffChunks.length === 0) return regions;

    // Region before first chunk
    const firstChunkStart = diffChunks[0].start;
    if (firstChunkStart > CONTEXT_LINES * 2) {
      regions.push({
        id: 'start',
        start: 0,
        end: firstChunkStart - CONTEXT_LINES - 1,
        displayStart: CONTEXT_LINES,
        displayEnd: firstChunkStart - CONTEXT_LINES - 1,
      });
    }

    // Regions between chunks
    for (let i = 0; i < diffChunks.length - 1; i++) {
      const currentChunkEnd = diffChunks[i].end;
      const nextChunkStart = diffChunks[i + 1].start;
      const gapSize = nextChunkStart - currentChunkEnd - 1;

      if (gapSize > CONTEXT_LINES * 2) {
        regions.push({
          id: `gap-${i}`,
          start: currentChunkEnd + CONTEXT_LINES + 1,
          end: nextChunkStart - CONTEXT_LINES - 1,
          displayStart: currentChunkEnd + CONTEXT_LINES + 1,
          displayEnd: nextChunkStart - CONTEXT_LINES - 1,
        });
      }
    }

    // Region after last chunk
    const lastChunkEnd = diffChunks[diffChunks.length - 1].end;
    if (maxLines - lastChunkEnd - 1 > CONTEXT_LINES * 2) {
      regions.push({
        id: 'end',
        start: lastChunkEnd + CONTEXT_LINES + 1,
        end: maxLines - 1,
        displayStart: lastChunkEnd + CONTEXT_LINES + 1,
        displayEnd: maxLines - CONTEXT_LINES - 1,
      });
    }

    return regions;
  }, [diffChunks, maxLines]);

  // Initialize collapsed regions
  useEffect(() => {
    if (collapsibleRegions.length > 0 && collapsedRegions.size === 0) {
      setCollapsedRegions(new Set(collapsibleRegions.map(r => r.id)));
    }
  }, [collapsibleRegions]);

  // Compute which lines to render (accounting for collapsed regions)
  const visibleLines = useMemo(() => {
    const lines = [];
    let i = 0;

    while (i < maxLines) {
      // Check if this line starts a collapsed region
      const collapsedRegion = collapsibleRegions.find(
        r => collapsedRegions.has(r.id) && i === r.start
      );

      if (collapsedRegion) {
        // Add a collapse placeholder
        lines.push({
          type: 'collapsed',
          regionId: collapsedRegion.id,
          hiddenCount: collapsedRegion.end - collapsedRegion.start + 1,
          lineIndex: i,
        });
        i = collapsedRegion.end + 1;
      } else {
        lines.push({
          type: 'line',
          lineIndex: i,
          oldLine: oldLines[i],
          newLine: newLines[i],
        });
        i++;
      }
    }

    return lines;
  }, [maxLines, oldLines, newLines, collapsibleRegions, collapsedRegions]);

  // Track scroll position for virtualization
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const scrollThrottleRef = useRef(null);
  const [container, setContainer] = useState(null);

  useEffect(() => {
    const checkContainer = () => {
      if (scrollContainerRef?.current && scrollContainerRef.current !== container) {
        setContainer(scrollContainerRef.current);
      }
    };

    checkContainer();
    const timeout = setTimeout(checkContainer, 50);
    return () => clearTimeout(timeout);
  }, [scrollContainerRef, container]);

  useEffect(() => {
    if (!container) return;

    const calculateVisibleRange = () => {
      const scrollTop = container.scrollTop;
      const viewportHeight = container.clientHeight;

      const startLine = Math.floor(scrollTop / LINE_HEIGHT);
      const visibleLinesCount = Math.ceil(viewportHeight / LINE_HEIGHT);
      const endLine = startLine + visibleLinesCount;

      setVisibleRange(prev => {
        if (prev.start === startLine && prev.end === endLine) {
          return prev;
        }
        return { start: startLine, end: endLine };
      });
    };

    const handleScroll = () => {
      if (scrollThrottleRef.current) return;

      scrollThrottleRef.current = requestAnimationFrame(() => {
        calculateVisibleRange();
        scrollThrottleRef.current = null;
      });
    };

    calculateVisibleRange();

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollThrottleRef.current) {
        cancelAnimationFrame(scrollThrottleRef.current);
      }
    };
  }, [container]);

  // Handle line selection via event delegation
  const handleLineClick = useCallback((lineIndex, e) => {
    if (e.shiftKey && selectionAnchor !== null) {
      // Range selection
      const start = Math.min(selectionAnchor, lineIndex);
      const end = Math.max(selectionAnchor, lineIndex);
      const newSelection = new Set();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedLines(newSelection);
    } else {
      // Single selection or toggle
      setSelectionAnchor(lineIndex);
      setSelectedLines(prev => {
        const newSet = new Set(prev);
        if (newSet.has(lineIndex)) {
          newSet.delete(lineIndex);
        } else {
          newSet.clear();
          newSet.add(lineIndex);
        }
        return newSet;
      });
    }
  }, [selectionAnchor]);

  // Event delegation handler for container clicks
  const handleContainerClick = useCallback((e) => {
    const lineEl = e.target.closest('[data-line-index]');
    if (!lineEl) return;
    const lineIndex = parseInt(lineEl.dataset.lineIndex, 10);
    if (!isNaN(lineIndex)) {
      handleLineClick(lineIndex, e);
    }
  }, [handleLineClick]);

  // Toggle collapsed region
  const toggleRegion = useCallback((regionId) => {
    setCollapsedRegions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(regionId)) {
        newSet.delete(regionId);
      } else {
        newSet.add(regionId);
      }
      return newSet;
    });
  }, []);

  // Copy chunk content
  const copyChunk = useCallback(async (chunkIndex, side) => {
    const chunk = diffChunks[chunkIndex];
    if (!chunk) return;

    const lines = [];
    for (let i = chunk.start; i <= chunk.end; i++) {
      const line = side === 'old' ? oldLines[i] : newLines[i];
      if (line && line.type !== 'empty') {
        lines.push(line.content);
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedChunk(`${chunkIndex}-${side}`);
      setTimeout(() => setCopiedChunk(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [diffChunks, oldLines, newLines]);

  if (!oldContent && !newContent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No content to display.
      </div>
    );
  }

  // Calculate virtualization bounds
  const startIdx = Math.max(0, visibleRange.start - VIRTUALIZATION_BUFFER);
  const endIdx = Math.min(visibleLines.length, visibleRange.end + VIRTUALIZATION_BUFFER);
  const virtualizedLines = visibleLines.slice(startIdx, endIdx);
  const totalHeight = visibleLines.length * LINE_HEIGHT;
  const offsetY = startIdx * LINE_HEIGHT;

  return (
    <div className="flex font-mono text-sm relative">
      {/* Minimap */}
      <DiffMinimap
        diffChunks={diffChunks}
        totalLines={maxLines}
        visibleRange={visibleRange}
        onClickPosition={(lineIndex) => {
          container?.scrollTo({
            top: lineIndex * LINE_HEIGHT,
            behavior: 'smooth'
          });
        }}
      />

      {/* Old file (left side) */}
      <div className="flex-1 border-r border-border overflow-x-auto">
        <div className="sticky top-0 bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border-b border-border z-10">
          {isNewFile ? '(new file)' : 'HEAD'}
        </div>
        <div
          className="min-w-max relative"
          ref={contentRef}
          style={{ height: totalHeight }}
          onClick={handleContainerClick}
        >
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {virtualizedLines.map((item) => {
              if (item.type === 'collapsed') {
                return (
                  <CollapsedRegionPlaceholder
                    key={`collapsed-old-${item.regionId}`}
                    hiddenCount={item.hiddenCount}
                    onExpand={() => toggleRegion(item.regionId)}
                  />
                );
              }

              const line = item.oldLine || { content: '', type: 'empty' };
              const chunkIndex = lineToChunk[item.lineIndex];
              const isChunkStart = chunkIndex >= 0 && diffChunks[chunkIndex].start === item.lineIndex;

              return (
                <DiffLine
                  key={`old-${item.lineIndex}`}
                  lineNum={line.lineNum}
                  content={line.content}
                  type={line.type}
                  wordDiff={line.wordDiff}
                  isSelected={selectedLines.has(item.lineIndex)}
                  lineIndex={item.lineIndex}
                  showCopyButton={isChunkStart}
                  onCopy={() => copyChunk(chunkIndex, 'old')}
                  isCopied={copiedChunk === `${chunkIndex}-old`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* New file (right side) */}
      <div className="flex-1 overflow-x-auto">
        <div className="sticky top-0 bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border-b border-border z-10">
          {isDeletedFile ? '(deleted)' : 'Working Tree'}
        </div>
        <div
          className="min-w-max relative"
          style={{ height: totalHeight }}
          onClick={handleContainerClick}
        >
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {virtualizedLines.map((item) => {
              if (item.type === 'collapsed') {
                return (
                  <CollapsedRegionPlaceholder
                    key={`collapsed-new-${item.regionId}`}
                    hiddenCount={item.hiddenCount}
                    onExpand={() => toggleRegion(item.regionId)}
                  />
                );
              }

              const line = item.newLine || { content: '', type: 'empty' };
              const chunkIndex = lineToChunk[item.lineIndex];
              const isChunkStart = chunkIndex >= 0 && diffChunks[chunkIndex].start === item.lineIndex;

              return (
                <DiffLine
                  key={`new-${item.lineIndex}`}
                  lineNum={line.lineNum}
                  content={line.content}
                  type={line.type}
                  wordDiff={line.wordDiff}
                  isSelected={selectedLines.has(item.lineIndex)}
                  lineIndex={item.lineIndex}
                  showCopyButton={isChunkStart}
                  onCopy={() => copyChunk(chunkIndex, 'new')}
                  isCopied={copiedChunk === `${chunkIndex}-new`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Minimap showing diff chunk positions
 */
const DiffMinimap = memo(function DiffMinimap({ diffChunks, totalLines, visibleRange, onClickPosition }) {
  const minimapHeight = 200;
  const lineToY = (line) => (line / totalLines) * minimapHeight;

  return (
    <div
      className="w-3 flex-shrink-0 bg-muted/30 border-r border-border relative cursor-pointer"
      style={{ height: `${minimapHeight}px`, position: 'sticky', top: '28px' }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const lineIndex = Math.floor((y / minimapHeight) * totalLines);
        onClickPosition(lineIndex);
      }}
    >
      {/* Viewport indicator */}
      <div
        className="absolute left-0 right-0 bg-foreground/10 border-y border-foreground/20"
        style={{
          top: `${lineToY(visibleRange.start)}px`,
          height: `${Math.max(4, lineToY(visibleRange.end) - lineToY(visibleRange.start))}px`,
        }}
      />

      {/* Diff chunk markers */}
      {diffChunks.map((chunk, i) => (
        <div
          key={i}
          className="absolute left-0.5 right-0.5 rounded-sm"
          style={{
            top: `${lineToY(chunk.start)}px`,
            height: `${Math.max(2, lineToY(chunk.end + 1) - lineToY(chunk.start))}px`,
            backgroundColor: 'rgba(152, 187, 108, 0.6)',
          }}
        />
      ))}
    </div>
  );
});

/**
 * Collapsed region placeholder
 */
const CollapsedRegionPlaceholder = memo(function CollapsedRegionPlaceholder({ hiddenCount, onExpand }) {
  return (
    <div
      className="flex items-center justify-center h-6 bg-muted/50 border-y border-border/50 cursor-pointer hover:bg-muted transition-colors"
      onClick={onExpand}
    >
      <ChevronDown className="w-3 h-3 mr-1 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        {hiddenCount} unchanged {hiddenCount === 1 ? 'line' : 'lines'}
      </span>
    </div>
  );
});

/**
 * Single line in the diff view - memoized to prevent re-renders on scroll
 * Uses data attributes for event delegation instead of individual handlers
 */
const DiffLine = memo(function DiffLine({
  lineNum,
  content,
  type,
  wordDiff,
  isSelected,
  lineIndex,
  showCopyButton,
  onCopy,
  isCopied,
}) {
  let bgColor = '';
  let gutterSymbol = '';
  let gutterColor = '';

  if (type === 'added') {
    bgColor = 'rgba(152, 187, 108, 0.15)';
    gutterSymbol = '+';
    gutterColor = 'text-green-500';
  } else if (type === 'removed') {
    bgColor = 'rgba(195, 64, 67, 0.15)';
    gutterSymbol = '-';
    gutterColor = 'text-red-500';
  } else if (type === 'modified-old') {
    bgColor = 'rgba(195, 64, 67, 0.15)';
    gutterSymbol = '~';
    gutterColor = 'text-yellow-500';
  } else if (type === 'modified-new') {
    bgColor = 'rgba(152, 187, 108, 0.15)';
    gutterSymbol = '~';
    gutterColor = 'text-yellow-500';
  } else if (type === 'empty') {
    bgColor = 'rgba(128, 128, 128, 0.05)';
  }

  if (isSelected) {
    bgColor = 'rgba(126, 156, 216, 0.25)';
  }

  // Render content - plain text with word-level diff highlighting only
  const renderContent = () => {
    if (!content || type === 'empty') {
      return <span>{' '}</span>;
    }

    // If we have word-level diff, render with highlights
    if (wordDiff && wordDiff.length > 0) {
      return (
        <span>
          {wordDiff.map((part, i) => (
            <span
              key={i}
              className={part.highlight ? (
                type === 'modified-old'
                  ? 'bg-red-500/30 rounded-sm'
                  : 'bg-green-500/30 rounded-sm'
              ) : ''}
            >
              {part.text}
            </span>
          ))}
        </span>
      );
    }

    // Plain text - no syntax highlighting
    return <span>{content}</span>;
  };

  return (
    <div
      className="flex h-6 leading-6 group relative"
      style={{ backgroundColor: bgColor }}
      data-line-index={lineIndex}
    >
      {/* Gutter symbol */}
      <div className={`w-4 flex-shrink-0 text-center select-none ${gutterColor}`}>
        {gutterSymbol}
      </div>
      {/* Line number */}
      <div className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground/70 select-none border-r border-border/50">
        {lineNum || ''}
      </div>
      {/* Content */}
      <div className="px-2 whitespace-pre overflow-hidden flex-1">
        {renderContent()}
      </div>
      {/* Copy button - CSS hover controlled */}
      {showCopyButton && (
        <Button
          variant="ghost"
          size="xs"
          className="absolute right-1 top-0.5 h-5 opacity-0 group-hover:opacity-100 transition-opacity"
          title={isCopied ? 'Copied!' : 'Copy chunk'}
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
        >
          {isCopied ? (
            <Check className="w-3 h-3 text-green-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </Button>
      )}
    </div>
  );
});
