import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DiffContent } from './DiffContent';
import { Button } from '../../components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../components/ui/tooltip';
import { ChevronLeft, ChevronRight, Pin, PinOff, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Scanner } from '../../components/instrument/Scanner';
import { DiffBar } from '../../components/instrument/DiffBar';
import { useFigureCompact } from '../../components/instrument/figure';
import { basename } from '../../utils/pathUtils';
import { usePinnedFiles } from '../pinned-files';

/**
 * Side-by-side git diff in a full-size dialog: a pane that takes over the
 * window. The file name is the legend, counts sit in the status corner and
 * file-to-file keys in the bottom frame line.
 * @param {boolean} open - Whether overlay is visible
 * @param {function} onOpenChange - Callback when open state changes
 * @param {string} filePath - Absolute path to the file
 * @param {string} repoPath - Path to the git repository root
 * @param {string} baseRef - Optional ref for the old side (default HEAD)
 * @param {string} headRef - Optional ref for the new side (default: the working tree)
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
  baseRef,
  headRef,
  changedFiles = [],
  onFileChange,
  annotations = [],
  onAddAnnotation,
  onRemoveAnnotation,
  onSendAnnotations,
  sendingAnnotations = false,
}) {
  const compactFigures = useFigureCompact();
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
  }, [open, filePath, repoPath, baseRef, headRef]);

  const fetchDiff = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await invoke('get_git_diff', {
        filePath,
        repoPath,
        baseRef: baseRef || null,
        headRef: headRef || null,
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
      // Esc is the dialog's own (Radix closes it).
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
  }, [open, hasMultipleFiles, goToPrevFile, goToNextFile]);

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

  const status = (
    <>
      {diffResult && (
        <DiffBar added={diffResult.added_lines} removed={diffResult.deleted_lines} side={64} />
      )}
      {hasMultipleFiles && (
        <span className="tabular-nums">{currentFileIndex + 1}/{changedFiles.length}</span>
      )}
    </>
  );

  const hints = hasMultipleFiles
    ? [{ keys: ['^', '['], label: 'prev file' }, { keys: ['^', ']'], label: 'next file' }]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      size="full"
      status={status}
      hints={hints}
      className="flex flex-col gap-0 px-0"
      onOpenAutoFocus={(e) => {
        // Land on the diff so arrow keys and PgUp/PgDn scroll it.
        e.preventDefault();
        scrollContainerRef.current?.focus();
      }}
    >
      <DialogTitle>{fileName || 'Diff'}</DialogTitle>
      <DialogDescription className="sr-only">Side-by-side diff of {relativePath}</DialogDescription>

      {/* Path and file controls */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2 edge-b-engraved flex-shrink-0">
        <div className="flex-1 min-w-0 font-mono text-xs text-muted-foreground truncate">
          {relativePath}
          {diffResult?.is_new_file && (
            <span className="ml-2 text-git-added">new file</span>
          )}
          {diffResult?.is_deleted_file && (
            <span className="ml-2 text-git-deleted">deleted</span>
          )}
        </div>

        {/* File navigation controls */}
        {hasMultipleFiles && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canGoPrevFile}
                  onClick={goToPrevFile}
                  aria-label="Previous file"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous file (Ctrl+[)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canGoNextFile}
                  onClick={goToNextFile}
                  aria-label="Next file"
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

      {/* Diff content */}
      <div
        ref={scrollContainerRef}
        tabIndex={-1}
        className="flex-1 min-h-0 overflow-auto outline-none"
      >
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Scanner size="lg" />
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
            notes={fileNotes}
            onRemoveNote={onRemoveAnnotation}
          />
        ) : null}
      </div>

      {/* Review notes: pin feedback to lines, then send it all back to the
          agent. In full figures the notes hang off their lines on the diff
          map (FIG 25); compact keeps the list. */}
      {annotationsEnabled && (
        <div className="flex-shrink-0 edge-t-engraved">
          {fileNotes.length > 0 && compactFigures && (
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
              className="ins-well flex-1 min-w-0 h-7 px-2 text-xs text-foreground outline-none focus-visible:outline-1 focus-visible:outline-solid focus-visible:outline-[var(--ins-lamp)] focus-visible:-outline-offset-1 disabled:opacity-60"
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
                <Scanner className="mr-1" />
              ) : (
                <Send className="w-3 h-3 mr-1" />
              )}
              Send {annotations.length || ''}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
    </Dialog>
  );
}
