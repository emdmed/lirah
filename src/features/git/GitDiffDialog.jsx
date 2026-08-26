import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffContent } from './DiffContent';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { ChevronLeft, ChevronRight, X, Pin, PinOff, MessageSquarePlus, Send, Trash2, Loader2 } from 'lucide-react';
import { RetroSpinner } from '../../components/ui/RetroSpinner';
import { basename } from '../../utils/pathUtils';
import { usePinnedFiles } from '../pinned-files';

/**
 * Overlay that shows side-by-side git diff, rendered over the terminal area
 * @param {boolean} open - Whether overlay is visible
 * @param {function} onOpenChange - Callback when open state changes
 * @param {string} filePath - Absolute path to the file
 * @param {string} repoPath - Path to the git repository root
 * @param {Array} changedFiles - Optional list of all changed files for navigation
 * @param {function} onFileChange - Optional callback when navigating to a different file
 * @param {Array} annotations - Review notes already pinned to this diff (all files)
 * @param {function} onAddAnnotation - Enables the review-notes bar when provided
 * @param {function} onRemoveAnnotation - Drops one note by id
 * @param {function} onSendAnnotations - Ships the collected notes back to the agent
 * @param {boolean} sendingAnnotations - True while that send is in flight
 */
export function GitDiffDialog({
  open,
  onOpenChange,
  filePath,
  repoPath,
  changedFiles = [],
  onFileChange,
  annotations = [],
  onAddAnnotation,
  onRemoveAnnotation,
  onSendAnnotations,
  sendingAnnotations = false,
}) {
  const [diffResult, setDiffResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scrollContainerRef = useRef(null);

  // Review notes: a line selection in the diff plus free text, collected here
  // and sent back to the agent that produced the diff.
  const [selection, setSelection] = useState(null);
  const [noteText, setNoteText] = useState('');
  const annotationsEnabled = typeof onAddAnnotation === 'function';
  const handleSelectionChange = useCallback((next) => setSelection(next), []);

  // A stale selection from the previous file would pin a note to the wrong lines.
  useEffect(() => {
    setSelection(null);
    setNoteText('');
  }, [filePath]);

  const { isPinned, togglePin } = usePinnedFiles();
  const pinned = filePath ? isPinned(filePath) : false;
  const handleTogglePin = useCallback(() => {
    if (filePath) togglePin(filePath);
  }, [filePath, togglePin]);

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

  // Keyboard shortcuts for file navigation and closing
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
  }, [open, hasMultipleFiles, goToPrevFile, goToNextFile, onOpenChange]);

  const fileName = filePath ? basename(filePath) : '';
  const relativePath = filePath && repoPath
    ? filePath.replace(repoPath + '/', '')
    : filePath;

  // Notes are collected across the whole review; only this file's show inline.
  const fileNotes = annotations.filter((n) => n.filePath === filePath);

  const addNote = () => {
    if (!selection || !noteText.trim()) return;
    onAddAnnotation({
      filePath,
      relPath: relativePath,
      fromLine: selection.fromLine,
      toLine: selection.toLine,
      snippet: selection.snippet,
      note: noteText.trim(),
    });
    setNoteText('');
  };

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b edge-engraved flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm flex items-center gap-2">
            <span className="truncate">{fileName}</span>
            {diffResult?.is_new_file && (
              <span className="text-xs text-git-added font-normal">(new file)</span>
            )}
            {diffResult?.is_deleted_file && (
              <span className="text-xs text-git-deleted font-normal">(deleted)</span>
            )}
          </div>
          <div className="font-mono text-xs text-muted-foreground truncate">
            {relativePath}
            {diffResult && (
              <span className="ml-2">
                <span className="text-git-added">+{diffResult.added_lines}</span>
                {' '}
                <span className="text-git-deleted">-{diffResult.deleted_lines}</span>
              </span>
            )}
          </div>
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

        {/* Pin toggle */}
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

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onOpenChange(false)}
          className="ml-2"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Diff content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RetroSpinner size={24} lineWidth={2} />
          </div>
        ) : error ? (
          <div className="p-4 text-center text-destructive">
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
            onSelectionChange={annotationsEnabled ? handleSelectionChange : undefined}
          />
        ) : null}
      </div>

      {/* Review notes: pin feedback to lines, then send it all back to the agent */}
      {annotationsEnabled && (
        <div className="flex-shrink-0 border-t edge-engraved bg-muted/20">
          {fileNotes.length > 0 && (
            <div className="max-h-28 overflow-y-auto px-3 pt-2">
              {fileNotes.map((n) => (
                <div key={n.id} className="flex items-start gap-2 py-0.5 text-xs">
                  <span className="font-mono text-muted-foreground shrink-0">
                    L{n.fromLine}
                    {n.toLine !== n.fromLine ? `-${n.toLine}` : ''}
                  </span>
                  <span className="flex-1 min-w-0 break-words">{n.note}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemoveAnnotation?.(n.id)}
                    title="Remove note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              {selection
                ? `L${selection.fromLine}${selection.toLine !== selection.fromLine ? `-${selection.toLine}` : ''}`
                : 'select lines'}
            </span>
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addNote();
                }
              }}
              disabled={!selection}
              placeholder={
                selection
                  ? 'What should the agent change here? (Enter to pin)'
                  : 'Click a diff line (shift-click for a range) to attach a note'
              }
              className="flex-1 min-w-0 h-7 rounded border edge-engraved bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!selection || !noteText.trim()}
              onClick={addNote}
              title="Pin this note to the selected lines"
            >
              <MessageSquarePlus className="w-3 h-3 mr-1" />
              Add
            </Button>
            <Button
              size="sm"
              disabled={annotations.length === 0 || sendingAnnotations}
              onClick={() => onSendAnnotations?.()}
              title="Re-run the agent in this worktree with every note attached"
            >
              {sendingAnnotations ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Send className="w-3 h-3 mr-1" />
              )}
              Send {annotations.length || ''}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
