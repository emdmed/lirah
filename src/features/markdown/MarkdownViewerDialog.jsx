import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { ChevronLeft, ChevronRight, X, Pin, PinOff } from 'lucide-react';
import { RetroSpinner } from '../../components/ui/RetroSpinner';
import { basename } from '../../utils/pathUtils';
import { usePinnedFiles } from '../pinned-files';
import './markdown.css';

const REMARK_PLUGINS = [remarkGfm];
const EMPTY_FILES = [];

/**
 * Overlay that renders formatted markdown, displayed over the terminal area
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

      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
        return;
      }

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
  }, [open, hasMultipleFiles, goToPrev, goToNext, onOpenChange]);

  const fileName = filePath ? basename(filePath) : '';
  const relativePath = filePath && repoPath
    ? filePath.replace(repoPath + '/', '')
    : filePath;

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b edge-engraved flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm truncate">{fileName}</div>
          <div className="font-mono text-xs text-muted-foreground truncate">{relativePath}</div>
        </div>

        {hasMultipleFiles && (
          <div className="flex items-center gap-1 ml-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={!canGoPrev} onClick={goToPrev}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous file (Ctrl+[)</TooltipContent>
            </Tooltip>

            <span className="text-xs text-muted-foreground px-1">
              {currentFileIndex + 1}/{markdownFiles.length}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={!canGoNext} onClick={goToNext}>
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
                className={`ml-2 ${pinned ? 'text-primary' : ''}`}
              >
                {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{pinned ? 'Unpin from sidebar' : 'Pin to top of sidebar'}</TooltipContent>
          </Tooltip>
        )}

        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} className="ml-2">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RetroSpinner size={24} lineWidth={2} />
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
    </div>
  );
});
