import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, X, Swords } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { RetroSpinner } from '../../components/ui/RetroSpinner';
import { DiffContent } from '../git/DiffContent';
import { cn } from '../../lib/utils';

// Path of a change relative to its candidate's worktree root.
function relTo(job, absPath) {
  return job.cwd && absPath.startsWith(`${job.cwd}/`) ? absPath.slice(job.cwd.length + 1) : absPath;
}

// A candidate's own label is the race label plus its agent; inside the compare
// view the race half is noise, so show the distinguishing tail.
function shortLabel(job) {
  const tail = job.label?.split(' · ').pop();
  return tail || job.cli;
}

/**
 * Diff two race candidates against each other rather than each against HEAD.
 * Both live in their own worktree off the same commit, so reading the same
 * relative path from each gives a true A-vs-B comparison — a file only one of
 * them touched still reads as the untouched HEAD version on the other side.
 *
 * @param {Array} jobs - candidates of one race
 * @param {function} onClose - close the overlay
 */
export function RaceCompareDialog({ jobs, onClose }) {
  const candidates = useMemo(() => jobs.filter((j) => j.cwd && j.changedFiles.length > 0), [jobs]);

  const [aId, setAId] = useState(() => candidates[0]?.id || null);
  const [bId, setBId] = useState(() => candidates[1]?.id || null);
  const a = candidates.find((j) => j.id === aId) || candidates[0] || null;
  const b = candidates.find((j) => j.id === bId) || candidates[1] || null;

  // Every file either side touched, with who touched it.
  const files = useMemo(() => {
    const map = new Map();
    for (const job of [a, b]) {
      if (!job) continue;
      for (const f of job.changedFiles) {
        const rel = relTo(job, f.path);
        if (!map.has(rel)) map.set(rel, new Set());
        map.get(rel).add(job.id);
      }
    }
    return [...map.entries()]
      .map(([path, ids]) => ({ path, ids }))
      .sort((x, y) => x.path.localeCompare(y.path));
  }, [a, b]);

  const [filePath, setFilePath] = useState(null);
  useEffect(() => {
    // Keep the current file when it survives a candidate switch.
    setFilePath((prev) => (prev && files.some((f) => f.path === prev) ? prev : files[0]?.path || null));
  }, [files]);

  const [sides, setSides] = useState({ old: '', new: '' });
  const [loading, setLoading] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (!a || !b || !filePath) {
      setSides({ old: '', new: '' });
      return;
    }
    let cancelled = false;
    setLoading(true);
    const read = async (job) => {
      try {
        return await invoke('read_file_content', { path: `${job.cwd}/${filePath}` });
      } catch {
        return ''; // Created by the other candidate, or deleted by this one.
      }
    };
    (async () => {
      const [oldContent, newContent] = await Promise.all([read(a), read(b)]);
      if (cancelled) return;
      setSides({ old: oldContent, new: newContent });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [a, b, filePath]);

  const fileIndex = files.findIndex((f) => f.path === filePath);
  const goPrev = useCallback(() => {
    if (fileIndex > 0) setFilePath(files[fileIndex - 1].path);
  }, [fileIndex, files]);
  const goNext = useCallback(() => {
    if (fileIndex >= 0 && fileIndex < files.length - 1) setFilePath(files[fileIndex + 1].path);
  }, [fileIndex, files]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        goPrev();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  const identical = !loading && sides.old === sides.new;
  const current = files[fileIndex];

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Header: which two candidates, and which file */}
      <div className="flex items-center justify-between gap-3 border-b border-sketch px-3 py-2 flex-shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Swords className="h-4 w-4 shrink-0 text-primary/80" />
          <CandidatePicker
            candidates={candidates}
            value={a?.id}
            onChange={setAId}
            exclude={b?.id}
          />
          <span className="text-xs text-muted-foreground">vs</span>
          <CandidatePicker
            candidates={candidates}
            value={b?.id}
            onChange={setBId}
            exclude={a?.id}
          />
        </div>

        {files.length > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" disabled={fileIndex <= 0} onClick={goPrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-1 text-xs text-muted-foreground tabular-nums">
              {fileIndex + 1}/{files.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={fileIndex < 0 || fileIndex >= files.length - 1}
              onClick={goNext}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* File strip: who touched what, so single-candidate files are obvious */}
      <div className="flex gap-1 overflow-x-auto border-b border-sketch px-3 py-1 flex-shrink-0">
        {files.map((f) => {
          const inA = a && f.ids.has(a.id);
          const inB = b && f.ids.has(b.id);
          return (
            <button
              key={f.path}
              onClick={() => setFilePath(f.path)}
              title={`${f.path}${inA && inB ? ' — both' : inA ? ` — only ${shortLabel(a)}` : ` — only ${shortLabel(b)}`}`}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] transition-colors',
                f.path === filePath
                  ? 'border-primary/70 bg-primary/10'
                  : 'border-sketch text-muted-foreground hover:bg-muted/40'
              )}
            >
              {f.path.split('/').pop()}
              {!(inA && inB) && (
                <span className="text-[9px] uppercase text-muted-foreground/70">
                  {inA ? 'A' : 'B'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
        {!a || !b ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Need two candidates with changes to compare.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center p-8">
            <RetroSpinner size={24} lineWidth={2} />
          </div>
        ) : !filePath ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Neither candidate changed any files.
          </div>
        ) : identical ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <div className="font-mono text-xs">{filePath}</div>
            <div className="mt-1">Both candidates ended up with identical content here.</div>
          </div>
        ) : (
          <DiffContent
            oldContent={sides.old}
            newContent={sides.new}
            isNewFile={!sides.old && !!sides.new}
            isDeletedFile={!!sides.old && !sides.new}
            scrollContainerRef={scrollContainerRef}
            // A candidate that didn't touch this file is showing HEAD — say so,
            // otherwise its side reads as a deliberate alternative.
            oldLabel={`${shortLabel(a)}${current && !current.ids.has(a.id) ? ' (unchanged)' : ''}`}
            newLabel={`${shortLabel(b)}${current && !current.ids.has(b.id) ? ' (unchanged)' : ''}`}
          />
        )}
      </div>
    </div>
  );
}

function CandidatePicker({ candidates, value, onChange, exclude }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 min-w-0 max-w-[40%] rounded border border-sketch bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
    >
      {candidates.map((j) => (
        <option key={j.id} value={j.id} disabled={j.id === exclude}>
          {shortLabel(j)} ({j.changedFiles.length})
        </option>
      ))}
    </select>
  );
}
