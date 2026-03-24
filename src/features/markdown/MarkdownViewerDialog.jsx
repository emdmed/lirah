import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { RetroSpinner } from '../../components/ui/RetroSpinner';
import { basename } from '../../utils/pathUtils';

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-sketch flex-shrink-0">
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

        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} className="ml-2">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RetroSpinner size={24} lineWidth={2} />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-400">
            <p className="font-medium">Failed to load file</p>
            <p className="text-xs mt-1 text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-foreground prose-headings:font-semibold prose-headings:border-b prose-headings:border-sketch prose-headings:pb-1
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-strong:text-foreground
            prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-muted/30 prose-pre:border prose-pre:border-sketch prose-pre:rounded
            prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground
            prose-li:text-muted-foreground
            prose-table:text-sm prose-th:text-foreground prose-td:text-muted-foreground prose-th:border-sketch prose-td:border-sketch
            prose-hr:border-sketch
            [&_input[type=checkbox]]:mr-2 [&_input[type=checkbox]]:accent-primary
          ">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});
