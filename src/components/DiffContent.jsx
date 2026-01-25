import React, { useMemo, useState, useEffect, useRef, memo } from 'react';
import { diffLines } from 'diff';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';

// Import language support
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';

// Register languages
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('toml', toml);

// Kanagawa-inspired syntax theme
const kanagawaTheme = {
  'code[class*="language-"]': {
    color: '#DCD7BA',
    background: 'transparent',
  },
  'pre[class*="language-"]': {
    color: '#DCD7BA',
    background: 'transparent',
  },
  comment: { color: '#727169' },
  prolog: { color: '#727169' },
  doctype: { color: '#727169' },
  cdata: { color: '#727169' },
  punctuation: { color: '#9CABCA' },
  property: { color: '#7E9CD8' },
  tag: { color: '#7E9CD8' },
  boolean: { color: '#FF9E3B' },
  number: { color: '#D27E99' },
  constant: { color: '#FFA066' },
  symbol: { color: '#D27E99' },
  selector: { color: '#98BB6C' },
  'attr-name': { color: '#7FB4CA' },
  string: { color: '#98BB6C' },
  char: { color: '#98BB6C' },
  builtin: { color: '#7FB4CA' },
  inserted: { color: '#98BB6C' },
  operator: { color: '#C0A36E' },
  entity: { color: '#7E9CD8' },
  url: { color: '#7FB4CA' },
  variable: { color: '#DCD7BA' },
  atrule: { color: '#7E9CD8' },
  'attr-value': { color: '#98BB6C' },
  keyword: { color: '#957FB8' },
  function: { color: '#7E9CD8' },
  'class-name': { color: '#7FB4CA' },
  regex: { color: '#E6C384' },
  important: { color: '#FF9E3B' },
  deleted: { color: '#C34043' },
};

/**
 * Renders a side-by-side diff view showing old and new file versions
 * @param {string} oldContent - Original file content (from git HEAD)
 * @param {string} newContent - Current file content (working tree)
 * @param {boolean} isNewFile - Whether this is a newly created file
 * @param {boolean} isDeletedFile - Whether this file has been deleted
 * @param {string} language - Programming language for syntax highlighting
 * @param {React.RefObject} scrollContainerRef - Ref to the scroll container for tracking position
 */
export function DiffContent({ oldContent, newContent, isNewFile, isDeletedFile, language, scrollContainerRef }) {
  // Compute the diff
  const diffResult = useMemo(() => {
    if (isNewFile) {
      // New file: all lines are additions
      const lines = newContent.split('\n');
      return {
        oldLines: lines.map(() => ({ content: '', type: 'empty' })),
        newLines: lines.map((content, i) => ({
          content,
          type: 'added',
          lineNum: i + 1
        })),
      };
    }

    if (isDeletedFile) {
      // Deleted file: all lines are deletions
      const lines = oldContent.split('\n');
      return {
        oldLines: lines.map((content, i) => ({
          content,
          type: 'removed',
          lineNum: i + 1
        })),
        newLines: lines.map(() => ({ content: '', type: 'empty' })),
      };
    }

    // Use diff library to compute changes
    const changes = diffLines(oldContent, newContent);

    const oldLines = [];
    const newLines = [];
    let oldLineNum = 1;
    let newLineNum = 1;

    changes.forEach((change) => {
      const lines = change.value.split('\n');
      // Remove last empty element if the value ends with \n
      if (lines[lines.length - 1] === '') {
        lines.pop();
      }

      if (change.added) {
        // Added lines: show empty on left, content on right
        lines.forEach((content) => {
          oldLines.push({ content: '', type: 'empty' });
          newLines.push({ content, type: 'added', lineNum: newLineNum++ });
        });
      } else if (change.removed) {
        // Removed lines: show content on left, empty on right
        lines.forEach((content) => {
          oldLines.push({ content, type: 'removed', lineNum: oldLineNum++ });
          newLines.push({ content: '', type: 'empty' });
        });
      } else {
        // Unchanged lines: show on both sides
        lines.forEach((content) => {
          oldLines.push({ content, type: 'unchanged', lineNum: oldLineNum++ });
          newLines.push({ content, type: 'unchanged', lineNum: newLineNum++ });
        });
      }
    });

    return { oldLines, newLines };
  }, [oldContent, newContent, isNewFile, isDeletedFile]);

  if (!oldContent && !newContent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No content to display.
      </div>
    );
  }

  const { oldLines, newLines } = diffResult;
  const maxLines = Math.max(oldLines.length, newLines.length);

  // Collect indices of diff lines (added or removed)
  const diffIndices = useMemo(() => {
    const indices = [];
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      if (oldLine?.type === 'removed' || newLine?.type === 'added') {
        indices.push(i);
      }
    }
    return indices;
  }, [oldLines, newLines, maxLines]);

  // Track scroll position to calculate distance to nearest diff
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const scrollThrottleRef = useRef(null);
  const [containerReady, setContainerReady] = useState(false);

  const LINE_HEIGHT = 24; // h-6 = 24px

  // Check when container ref becomes available
  useEffect(() => {
    if (scrollContainerRef?.current && !containerReady) {
      setContainerReady(true);
    }
  });

  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleScroll = () => {
      // Throttle with requestAnimationFrame
      if (scrollThrottleRef.current) return;

      scrollThrottleRef.current = requestAnimationFrame(() => {
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        const startLine = Math.floor(scrollTop / LINE_HEIGHT);
        const visibleLines = Math.ceil(viewportHeight / LINE_HEIGHT);
        const endLine = startLine + visibleLines;

        setVisibleRange({ start: startLine, end: endLine });
        scrollThrottleRef.current = null;
      });
    };

    // Initial calculation
    handleScroll();

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollThrottleRef.current) {
        cancelAnimationFrame(scrollThrottleRef.current);
      }
    };
  }, [containerReady]);

  // Calculate distance to nearest diff outside the current viewport
  const nearestDiffInfo = useMemo(() => {
    if (diffIndices.length === 0) return null;

    const { start, end } = visibleRange;

    // Find nearest diff above and below the viewport
    let nearestAbove = null;
    let nearestBelow = null;

    for (const idx of diffIndices) {
      if (idx < start) {
        nearestAbove = idx;
      } else if (idx > end && nearestBelow === null) {
        nearestBelow = idx;
        break;
      }
    }

    // Prioritize showing next diff below, then above
    if (nearestBelow !== null) {
      return { distance: nearestBelow - end, direction: 'down' };
    } else if (nearestAbove !== null) {
      return { distance: start - nearestAbove, direction: 'up' };
    }

    // All diffs are currently visible
    return null;
  }, [diffIndices, visibleRange]);

  return (
    <div className="flex font-mono text-sm relative">
      {/* Old file (left side) */}
      <div className="flex-1 border-r border-border overflow-x-auto">
        <div className="sticky top-0 bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border-b border-border">
          {isNewFile ? '(new file)' : 'HEAD'}
        </div>
        <div className="min-w-max">
          {Array.from({ length: maxLines }).map((_, i) => {
            const line = oldLines[i] || { content: '', type: 'empty' };
            return (
              <DiffLine
                key={`old-${i}`}
                lineNum={line.lineNum}
                content={line.content}
                type={line.type}
                language={language}
              />
            );
          })}
        </div>
      </div>

      {/* New file (right side) */}
      <div className="flex-1 overflow-x-auto">
        <div className="sticky top-0 bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border-b border-border">
          {isDeletedFile ? '(deleted)' : 'Working Tree'}
        </div>
        <div className="min-w-max">
          {Array.from({ length: maxLines }).map((_, i) => {
            const line = newLines[i] || { content: '', type: 'empty' };
            return (
              <DiffLine
                key={`new-${i}`}
                lineNum={line.lineNum}
                content={line.content}
                type={line.type}
                language={language}
              />
            );
          })}
        </div>
      </div>

      {/* Distance to nearest diff indicator */}
      {nearestDiffInfo && nearestDiffInfo.distance > 0 && (
        <div className="fixed bottom-4 right-8 bg-muted/90 backdrop-blur-sm border border-border rounded-md px-3 py-2 text-xs font-mono shadow-lg z-10">
          <span className="text-muted-foreground">
            {nearestDiffInfo.direction === 'up' ? '↑' : '↓'}{' '}
            <span className="text-foreground font-medium">{nearestDiffInfo.distance}</span>{' '}
            {nearestDiffInfo.distance === 1 ? 'line' : 'lines'} to next change
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Single line in the diff view - memoized to prevent re-renders on scroll
 */
const DiffLine = memo(function DiffLine({ lineNum, content, type, language }) {
  let bgColor = '';

  if (type === 'added') {
    bgColor = 'rgba(152, 187, 108, 0.15)';
  } else if (type === 'removed') {
    bgColor = 'rgba(195, 64, 67, 0.15)';
  } else if (type === 'empty') {
    bgColor = 'rgba(128, 128, 128, 0.05)';
  }

  // Render syntax-highlighted content
  const renderContent = () => {
    if (!content || type === 'empty') {
      return <span>{' '}</span>;
    }

    if (!language) {
      return <span>{content}</span>;
    }

    return (
      <SyntaxHighlighter
        language={language}
        style={kanagawaTheme}
        customStyle={{
          margin: 0,
          padding: 0,
          background: 'transparent',
          display: 'inline',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'optimizeLegibility',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'inherit',
            fontSize: 'inherit',
          },
        }}
        PreTag="span"
        CodeTag="span"
      >
        {content}
      </SyntaxHighlighter>
    );
  };

  return (
    <div
      className="flex h-6 leading-6"
      style={{ backgroundColor: bgColor }}
    >
      {/* Line number */}
      <div className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground/50 select-none border-r border-border/50">
        {lineNum || ''}
      </div>
      {/* Content */}
      <div className="px-2 whitespace-pre overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
});

