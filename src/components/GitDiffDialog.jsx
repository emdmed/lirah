import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { DiffContent } from './DiffContent';
import { Button } from './ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Dialog that shows side-by-side git diff for a specific file
 * @param {boolean} open - Whether dialog is open
 * @param {function} onOpenChange - Callback when open state changes
 * @param {string} filePath - Absolute path to the file
 * @param {string} repoPath - Path to the git repository root
 * @param {Array} changedFiles - Optional list of all changed files for navigation
 * @param {function} onFileChange - Optional callback when navigating to a different file
 */
export function GitDiffDialog({
  open,
  onOpenChange,
  filePath,
  repoPath,
  changedFiles = [],
  onFileChange
}) {
  const [diffResult, setDiffResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scrollContainerRef = useRef(null);

  // Find current file index in changed files list
  const currentFileIndex = useMemo(() => {
    if (!changedFiles.length || !filePath) return -1;
    return changedFiles.findIndex(f => f.path === filePath || f === filePath);
  }, [changedFiles, filePath]);

  const hasMultipleFiles = changedFiles.length > 1;
  const canGoPrevFile = currentFileIndex > 0;
  const canGoNextFile = currentFileIndex < changedFiles.length - 1;

  useEffect(() => {
    if (open && filePath && repoPath) {
      fetchDiff();
    } else {
      // Reset state when dialog closes
      setDiffResult(null);
      setError(null);
    }
  }, [open, filePath, repoPath]);

  const fetchDiff = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke('get_git_diff', {
        filePath,
        repoPath,
      });
      setDiffResult(result);
    } catch (err) {
      console.error('Failed to fetch git diff:', err);
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const goToPrevFile = useCallback(() => {
    if (!canGoPrevFile || !onFileChange) return;
    const prevFile = changedFiles[currentFileIndex - 1];
    onFileChange(typeof prevFile === 'string' ? prevFile : prevFile.path);
  }, [canGoPrevFile, onFileChange, changedFiles, currentFileIndex]);

  const goToNextFile = useCallback(() => {
    if (!canGoNextFile || !onFileChange) return;
    const nextFile = changedFiles[currentFileIndex + 1];
    onFileChange(typeof nextFile === 'string' ? nextFile : nextFile.path);
  }, [canGoNextFile, onFileChange, changedFiles, currentFileIndex]);

  // Keyboard shortcuts for file navigation
  useEffect(() => {
    if (!open || !hasMultipleFiles) return;

    const handleKeyDown = (e) => {
      // Don't capture if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case '[':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            goToPrevFile();
          }
          break;
        case ']':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            goToNextFile();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasMultipleFiles, goToPrevFile, goToNextFile]);

  // Extract filename from path for display
  const fileName = filePath ? filePath.split('/').pop() : '';
  const relativePath = filePath && repoPath
    ? filePath.replace(repoPath + '/', '')
    : filePath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-w-none flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-mono text-sm flex items-center gap-2">
                <span className="truncate">{fileName}</span>
                {diffResult?.is_new_file && (
                  <span className="text-xs text-green-500 font-normal">(new file)</span>
                )}
                {diffResult?.is_deleted_file && (
                  <span className="text-xs text-red-500 font-normal">(deleted)</span>
                )}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs truncate">
                {relativePath}
                {diffResult && (
                  <span className="ml-2">
                    <span className="text-green-500">+{diffResult.added_lines}</span>
                    {' '}
                    <span className="text-red-500">-{diffResult.deleted_lines}</span>
                  </span>
                )}
              </DialogDescription>
            </div>

            {/* File navigation controls */}
            {hasMultipleFiles && (
              <div className="flex items-center gap-1 ml-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canGoPrevFile}
                      onClick={goToPrevFile}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous file (Ctrl+[)</TooltipContent>
                </Tooltip>

                <span className="text-xs text-muted-foreground px-1">
                  {currentFileIndex + 1}/{changedFiles.length}
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canGoNextFile}
                      onClick={goToNextFile}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next file (Ctrl+])</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </DialogHeader>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-auto border border-sketch rounded-none bg-background"
        >
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-400">
              <p className="font-medium">Failed to load diff</p>
              <p className="text-xs mt-1 text-muted-foreground">{error}</p>
            </div>
          ) : diffResult ? (
            <DiffContent
              oldContent={diffResult.old_content}
              newContent={diffResult.new_content}
              isNewFile={diffResult.is_new_file}
              isDeletedFile={diffResult.is_deleted_file}
              scrollContainerRef={scrollContainerRef}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
