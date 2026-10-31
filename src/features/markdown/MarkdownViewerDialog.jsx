import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { ChevronLeft, ChevronRight, Pin, PinOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Scanner } from '../../components/instrument/Scanner';
import { Position } from '../../components/instrument/Position';
import { basename } from '../../utils/pathUtils';
import { usePinnedFiles } from '../pinned-files';
import './markdown.css';

const REMARK_PLUGINS = [remarkGfm];
const EMPTY_FILES = [];

/**
 * Formatted markdown in a full-size dialog: a pane that takes over the
 * window, with the file name as its legend and file-to-file keys in the
 * bottom frame line.
 * @param {boolean} open - Whether overlay is visible
 * @param {function} onOpenChange - Callback when open state changes
 * @param {string} filePath - Absolute path to the markdown file
 * @param {string} repoPath - Path to the project root (for relative path display)
 * @param {Array} markdownFiles - List of all markdown file paths for navigation
 * @param {function} onFileChange - Callback when navigating to a different file
 */
export const MarkdownViewerDialog = memo(function MarkdownViewerDialog({
  open,
  onOpenChange,
  filePath,
  repoPath,
  markdownFiles = EMPTY_FILES,
  onFileChange,
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bodyRef = useRef(null);

  const { isPinned, togglePin } = usePinnedFiles();
  const pinned = filePath ? isPinned(filePath) : false;
  const handleTogglePin = useCallback(() => {
    if (filePath) togglePin(filePath);
  }, [filePath, togglePin]);

  const currentFileIndex = useMemo(() => {
    if (!markdownFiles.length || !filePath) return -1;
    return markdownFiles.indexOf(filePath);
  }, [markdownFiles, filePath]);

  const hasMultipleFiles = markdownFiles.length > 1;
  const canGoPrev = currentFileIndex > 0;
  const canGoNext = currentFileIndex < markdownFiles.length - 1;

  useEffect(() => {
    if (open && filePath) {
      setLoading(true);
      setError(null);
      invoke('read_file_content', { path: filePath })
        .then(setContent)
        .catch(err => {
          console.error('Failed to read markdown file:', err);
          setError(err.toString());
        })
        .finally(() => setLoading(false));
    } else {
      setContent('');
      setError(null);
    }
  }, [open, filePath]);

  const goToPrev = useCallback(() => {
    if (canGoPrev && onFileChange) onFileChange(markdownFiles[currentFileIndex - 1]);
  }, [canGoPrev, onFileChange, markdownFiles, currentFileIndex]);

  const goToNext = useCallback(() => {
    if (canGoNext && onFileChange) onFileChange(markdownFiles[currentFileIndex + 1]);
  }, [canGoNext, onFileChange, markdownFiles, currentFileIndex]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Esc is the dialog's own (Radix closes it).
      if (!hasMultipleFiles) return;

      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        goToPrev();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasMultipleFiles, goToPrev, goToNext]);

  const fileName = filePath ? basename(filePath) : '';
  const relativePath = filePath && repoPath
    ? filePath.replace(repoPath + '/', '')
    : filePath;

  const hints = hasMultipleFiles
    ? [{ keys: ['^', '['], label: 'prev file' }, { keys: ['^', ']'], label: 'next file' }]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      size="full"
      status={hasMultipleFiles ? <Position index={currentFileIndex} count={markdownFiles.length} /> : null}
      hints={hints}
      className="flex flex-col gap-0 px-0"
      onOpenAutoFocus={(e) => {
        // Land on the document so arrow keys and PgUp/PgDn scroll it.
        e.preventDefault();
        bodyRef.current?.focus();
      }}
    >
      <DialogTitle>{fileName || 'Markdown'}</DialogTitle>
      <DialogDescription className="sr-only">Rendered markdown of {relativePath}</DialogDescription>

      {/* Path and file controls */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2 edge-b-engraved flex-shrink-0">
        <div className="flex-1 min-w-0 font-mono text-xs text-muted-foreground truncate">{relativePath}</div>

        {hasMultipleFiles && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={!canGoPrev} onClick={goToPrev} aria-label="Previous file">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous file (Ctrl+[)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={!canGoNext} onClick={goToNext} aria-label="Next file">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next file (Ctrl+])</TooltipContent>
            </Tooltip>
          </div>
        )}

        {filePath && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleTogglePin}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin from sidebar' : 'Pin to top of sidebar'}
                className={pinned ? 'text-[var(--ins-lamp)]' : ''}
              >
                {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{pinned ? 'Unpin from sidebar' : 'Pin to top of sidebar'}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Content */}
      <div ref={bodyRef} tabIndex={-1} className="flex-1 min-h-0 overflow-auto px-8 py-6 outline-none">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Scanner size="lg" />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-destructive">
            <p className="font-medium">Failed to load file</p>
            <p className="text-xs mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </DialogContent>
    </Dialog>
  );
});
