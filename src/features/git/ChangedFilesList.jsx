import { useEffect, useMemo, useRef } from 'react';
import { cn } from '../../lib/utils';
import { STATUS_COLOR } from './statusColor';
import { getRelativePath, splitDirName } from '../../utils/pathUtils';

const pathOf = (f) => (typeof f === 'string' ? f : f.path);

/**
 * The diff's changed files down the side, grouped under their folders, the
 * current one marked; click one to show its diff. `files` are absolute paths
 * or { path, status } with a `git diff --name-status` letter.
 */
export function ChangedFilesList({ files, current, repoPath, onSelect }) {
  const currentRef = useRef(null);
  const groups = useMemo(() => {
    const byDir = new Map();
    for (const f of files) {
      const path = pathOf(f);
      const { dir, name } = splitDirName(repoPath ? getRelativePath(path, repoPath) : path);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push({ path, name, status: f.status });
    }
    // Folders in the order their first file comes, so the list reads like Ctrl+[ / ] steps.
    return [...byDir];
  }, [files, repoPath]);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <nav aria-label="Changed files" className="w-64 shrink-0 overflow-y-auto py-1 shadow-[inset_-1px_0_0_0_var(--tui-line)] font-mono text-xs">
      {groups.map(([dir, entries]) => (
        <div key={dir} className="pb-1">
          {dir && <div className="truncate px-3 py-0.5 text-[11px] text-muted-foreground" title={dir}>{dir}</div>}
          {entries.map((e) => (
            <button
              key={e.path}
              ref={e.path === current ? currentRef : undefined}
              type="button"
              aria-current={e.path === current ? 'true' : undefined}
              onClick={() => onSelect(e.path)}
              title={e.path}
              className={cn(
                'flex w-full items-baseline gap-2 py-0.5 pr-3 text-left outline-none hover:bg-foreground/5 focus-visible:shadow-[inset_0_0_0_1px_var(--ins-lamp)]',
                dir ? 'pl-5' : 'pl-3',
                e.path === current ? 'ins-row-selected text-foreground' : 'text-muted-foreground',
              )}
            >
              {e.status && <span className="w-3 shrink-0 text-center" style={{ color: STATUS_COLOR[e.status] }}>{e.status}</span>}
              <span className="min-w-0 truncate">{e.name}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
