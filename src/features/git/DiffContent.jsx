import React, { useMemo, useState, useEffect, useRef, memo, useCallback } from 'react';
import { diffLines, diffWords } from 'diff';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useFigureCompact } from '../../components/instrument/figure';
import { Fig25DiffMap, MAP_COMPACT_W, MAP_W } from './Fig25DiffMap';

const LINE_HEIGHT = 24;
const MAP_WIDE_HOST = 900; // narrower diffs get the map's marks only
const CONTEXT_LINES = 3; // Lines of context to show around changes
const VIRTUALIZATION_BUFFER = 10; // Extra lines to render above/below viewport

/**
 * Word-level diff of a modified line pair, computed on first render of either
 * side and cached on the pair, so a large diff only pays for the rows shown.
 */
function wordDiffOf(pair) {
  if (!pair.parts) pair.parts = computeWordDiff(pair.oldStr, pair.newStr);
  return pair.parts;
}

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
  // Column headers. Default to the git working-tree comparison this view was
  // built for; a race compare passes the two candidate names instead.
  oldLabel,
  newLabel,
  // Called whenever the line selection changes, with the resolved line range and
  // its text — the anchor a review note is pinned to. Null when nothing is
  // selected. Must be stable (useCallback) to avoid a render loop.
  onSelectionChange,
  // Review notes on this file ({ id, fromLine, toLine, note }), drawn on the
  // diff map; onRemoveNote(id) drops one from there.
  notes,
  onRemoveNote,
}) {
  const compact = useFigureCompact();
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
            // Modified line - word diff deferred until the row renders
            const wordDiff = { oldStr: oldLine, newStr: newLine, parts: null };
            oldLines.push({
              content: oldLine,
              type: 'modified-old',
              lineNum: oldLineNum++,
              wordDiff
            });
            newLines.push({
              content: newLine,
              type: 'modified-new',
              lineNum: newLineNum++,
              wordDiff
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

  // Report the current selection upward as a line range + snippet. The new side
  // is authoritative (it's what the agent wrote); deleted lines fall back to the
  // old side so a note can still be pinned to them.
  useEffect(() => {
    if (!onSelectionChange) return;
    const indexes = [...selectedLines].sort((a, b) => a - b);
    if (indexes.length === 0) {
      onSelectionChange(null);
      return;
    }
    const pick = (i) => {
      const next = newLines[i];
      if (next && next.type !== 'empty') return next;
      return oldLines[i];
    };
    const picked = indexes.map(pick).filter(Boolean);
    const nums = picked.map((l) => l.lineNum).filter((n) => typeof n === 'number');
    if (nums.length === 0) {
      onSelectionChange(null);
      return;
    }
    onSelectionChange({
      fromLine: nums[0],
      toLine: nums[nums.length - 1],
      snippet: picked.map((l) => l.content ?? '').join('\n').slice(0, 600),
    });
  }, [selectedLines, oldLines, newLines, onSelectionChange]);

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

  // FIG 25 data: each change's size and file line range, the folds that are
  // collapsed, the rows on screen and the notes' rows.
  const mapChunks = useMemo(() => diffChunks.map((c) => {
    let added = 0;
    let removed = 0;
    const nums = [];
    const oldNums = [];
    for (let i = c.start; i <= c.end; i++) {
      const n = newLines[i];
      const o = oldLines[i];
      if (n?.type === 'added' || n?.type === 'modified-new') added++;
      if (o?.type === 'removed' || o?.type === 'modified-old') removed++;
      if (n && n.type !== 'empty' && n.lineNum) nums.push(n.lineNum);
      if (o && o.type !== 'empty' && o.lineNum) oldNums.push(o.lineNum);
    }
    const side = nums.length ? nums : oldNums;
    return { ...c, added, removed, from: side[0] ?? c.start + 1, to: side[side.length - 1] ?? c.end + 1 };
  }), [diffChunks, oldLines, newLines]);

  const mapFolds = useMemo(
    () => collapsibleRegions.filter((r) => collapsedRegions.has(r.id)),
    [collapsibleRegions, collapsedRegions],
  );

  const mapNotes = useMemo(() => {
    if (!notes?.length) return [];
    const rowOf = (lines, num) => lines.findIndex((l) => l && l.type !== 'empty' && l.lineNum === num);
    return notes.map((n) => {
      let row = rowOf(newLines, n.fromLine);
      if (row < 0) row = rowOf(oldLines, n.fromLine);
      return row < 0 ? null : { id: n.id, row, from: n.fromLine, to: n.toLine, note: n.note };
    }).filter(Boolean);
  }, [notes, oldLines, newLines]);

  // visibleRange counts rendered rows (a fold is one row); the map needs
  // file rows.
  const mapView = useMemo(() => {
    if (visibleLines.length === 0) return null;
    const first = visibleLines[Math.min(visibleRange.start, visibleLines.length - 1)];
    const last = visibleLines[Math.min(Math.max(visibleRange.end - 1, 0), visibleLines.length - 1)];
    const end = last.type === 'collapsed' ? last.lineIndex + last.hiddenCount : last.lineIndex + 1;
    return { start: first.lineIndex, end };
  }, [visibleLines, visibleRange]);

  const jumpToRow = useCallback((row) => {
    let k = 0;
    while (k + 1 < visibleLines.length && visibleLines[k + 1].lineIndex <= row) k++;
    container?.scrollTo({ top: k * LINE_HEIGHT, behavior: 'smooth' });
  }, [visibleLines, container]);

  // The full map needs a wide host; a narrow one gets its marks only.
  const rootRef = useRef(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= MAP_WIDE_HOST));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <div ref={rootRef} className="flex font-mono text-sm relative">
      {/* FIG 25: the diff map, a line ruler with every change on it. */}
      {mapChunks.length > 0 && (
        <div
          className="flex-shrink-0 self-start border-r edge-engraved px-2 pb-2"
          style={{ position: 'sticky', top: 28, width: (wide && !compact ? MAP_W : MAP_COMPACT_W) + 16 }}
        >
          <Fig25DiffMap
            totalLines={maxLines}
            chunks={mapChunks}
            folds={mapFolds}
            view={mapView}
            notes={mapNotes}
            onJump={jumpToRow}
            onRemoveNote={onRemoveNote}
            marksOnly={!wide}
          />
        </div>
      )}

      {/* Old file (left side) */}
      <div className="flex-1 border-r edge-engraved overflow-x-auto">
        <div className="sticky top-0 bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground border-b edge-engraved z-10">
          {oldLabel || (isNewFile ? '(new file)' : 'HEAD')}
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
                  chunkIndex={chunkIndex}
                  side="old"
                  onCopy={copyChunk}
                  isCopied={copiedChunk === `${chunkIndex}-old`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* New file (right side) */}
      <div className="flex-1 overflow-x-auto">
        <div className="sticky top-0 bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground border-b edge-engraved z-10">
          {newLabel || (isDeletedFile ? '(deleted)' : 'Working Tree')}
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
                  chunkIndex={chunkIndex}
                  side="new"
                  onCopy={copyChunk}
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
 * Collapsed region placeholder
 */
const CollapsedRegionPlaceholder = memo(function CollapsedRegionPlaceholder({ hiddenCount, onExpand }) {
  return (
    <div
      className="flex items-center justify-center h-6 bg-muted/30 border-y edge-engraved cursor-pointer hover:bg-muted/50 transition-colors"
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
  chunkIndex,
  side,
  onCopy,
  isCopied,
}) {
  let bgColor = '';
  let gutterSymbol = '';
  let gutterColor = '';

  if (type === 'added') {
    bgColor = 'color-mix(in srgb, var(--ins-ok) 15%, transparent)';
    gutterSymbol = '+';
    gutterColor = 'text-git-added';
  } else if (type === 'removed') {
    bgColor = 'color-mix(in srgb, var(--ins-fault) 15%, transparent)';
    gutterSymbol = '-';
    gutterColor = 'text-git-deleted';
  } else if (type === 'modified-old') {
    bgColor = 'color-mix(in srgb, var(--ins-fault) 15%, transparent)';
    gutterSymbol = '~';
    gutterColor = 'text-git-deleted';
  } else if (type === 'modified-new') {
    bgColor = 'color-mix(in srgb, var(--ins-ok) 15%, transparent)';
    gutterSymbol = '~';
    gutterColor = 'text-git-added';
  } else if (type === 'empty') {
    bgColor = 'color-mix(in srgb, var(--ins-faint) 8%, transparent)';
  }

  if (isSelected) {
    bgColor = 'color-mix(in srgb, var(--color-status-info) 25%, transparent)';
  }

  // `wordDiff` is the modified line's pair, shared with the other side.
  const wordParts = wordDiff
    ? wordDiffOf(wordDiff)[type === 'modified-old' ? 'oldParts' : 'newParts']
    : null;

  // Render content - plain text with word-level diff highlighting only
  const renderContent = () => {
    if (!content || type === 'empty') {
      return <span>{' '}</span>;
    }

    // If we have word-level diff, render with highlights
    if (wordParts && wordParts.length > 0) {
      return (
        <span>
          {wordParts.map((part, i) => (
            <span
              key={i}
              className={part.highlight ? 'rounded-sm' : ''}
              style={part.highlight ? {
                backgroundColor: type === 'modified-old'
                  ? 'color-mix(in srgb, var(--ins-fault) 30%, transparent)'
                  : 'color-mix(in srgb, var(--ins-ok) 30%, transparent)'
              } : undefined}
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
      <div className="w-10 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r edge-engraved">
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
            onCopy(chunkIndex, side);
          }}
        >
          {isCopied ? (
            <Check className="w-3 h-3" style={{ color: 'var(--color-status-success)' }} />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </Button>
      )}
    </div>
  );
});
