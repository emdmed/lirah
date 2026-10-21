import { useEffect, useState } from 'react';
import { basename } from '../../utils/pathUtils';
import { cn } from '../../lib/utils';
import { FolderX, SquareTerminal, X } from 'lucide-react';
import { Lamp } from '../../components/instrument/Lamp';
import { PanelButton } from '../../components/instrument/PanelButton';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { useBookmarks } from '../bookmarks/BookmarksContext';
import { listBranches, planGit } from './planGit';

const SELECT = 'ins-well h-6 min-w-0 px-1 text-[10px] text-foreground outline-none';

function BaseSelect({ root, value, onChange }) {
  const [branches, setBranches] = useState(null);
  useEffect(() => {
    let cancelled = false;
    listBranches(root)
      .then((list) => !cancelled && setBranches(list))
      .catch(() => !cancelled && setBranches([]));
    return () => {
      cancelled = true;
    };
  }, [root]);
  // The saved base stays selectable even before (or without) the list.
  const options = branches ? [...new Set([value, ...branches].filter(Boolean))] : [value].filter(Boolean);
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`${SELECT} max-w-[55%]`}
      title="Base branch: the plan branch starts from here"
      aria-label={`Base branch for ${basename(root)}`}
    >
      {!value && <option value="">HEAD</option>}
      {options.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
}

/** How the plan uses git: worktrees or not, the branch, and each repo's base. */
export function PlanGitSection({ plan, busy, onChange, onAddRepo, onRemoveRepo, onOpenTab, onRemoveWorktrees }) {
  const cfg = planGit(plan);
  const { bookmarks } = useBookmarks();
  const locked = !!cfg.preparedAt;
  const removed = !!cfg.removedAt;
  const candidates = bookmarks.filter((b) => !cfg.repos.some((r) => r.root === b.path || b.path.startsWith(`${r.root}/`)));
  const where = cfg.worktrees ? 'worktrees' : 'in place';
  const headline = locked
    ? [cfg.branch || 'current branch', where, removed && 'removed'].filter(Boolean).join(' · ')
    : 'set up when the first chunk is sent';

  return (
    // Settled config is a metadata line; only the editable form gets a well.
    <div className={cn('flex min-w-0 flex-col gap-1.5 text-[11px]', !locked && 'ins-well px-2 py-1.5')}>
      <div className="flex min-w-0 items-center gap-2">
        {!locked && <Lamp state="off" label="git not set up yet" />}
        <span className="engraved-label shrink-0">git</span>
        <span className={cn('min-w-0 truncate', locked ? 'text-muted-foreground' : 'text-foreground')} title={headline}>{headline}</span>
      </div>

      {!locked && (
        <>
          <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <ToggleSwitch
              checked={cfg.worktrees}
              onChange={(worktrees) => onChange({ worktrees })}
              label="Run in worktrees"
              tone="lamp"
            />
            <span>worktrees</span>
            <span className="min-w-0 truncate">
              {cfg.worktrees ? '· separate checkouts, yours stays untouched' : '· switches branch in your checkout'}
            </span>
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <span className="engraved-label w-12 shrink-0">branch</span>
            <input
              value={cfg.branch}
              onChange={(e) => onChange({ branch: e.target.value })}
              placeholder={cfg.worktrees ? 'required' : 'empty: stay on the current branch'}
              spellCheck={false}
              className="ins-well h-6 min-w-0 flex-1 px-1.5 font-mono text-[10px] text-foreground outline-none"
              aria-label="Branch for the plan, in every repo"
            />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        {cfg.repos.map((repo, i) => (
          <div key={repo.root} className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('min-w-0 flex-1 truncate font-mono text-[10px]', locked ? 'text-muted-foreground' : 'text-foreground')} title={repo.root}>
                {basename(repo.root)}
                {i === 0 && <span className="text-faint"> · primary</span>}
              </span>
              {locked ? (
                // With no branch the headline already says "current branch".
                (cfg.branch || repo.base) && (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {cfg.branch ? `${cfg.branch} ← ${repo.base || 'HEAD'}` : repo.base}
                  </span>
                )
              ) : (
                <>
                  {cfg.branch.trim() && (
                    <BaseSelect root={repo.root} value={repo.base} onChange={(base) => onChange((c) => ({
                      repos: c.repos.map((r) => (r.root === repo.root ? { ...r, base } : r)),
                    }))} />
                  )}
                  {i > 0 && (
                    <PanelButton icon={X} onClick={() => onRemoveRepo(repo.root)} title="Remove from the plan" aria-label={`Remove ${basename(repo.root)}`} />
                  )}
                </>
              )}
            </div>
            {locked && cfg.worktrees && repo.workPath && repo.workPath !== repo.root && (
              <span className="truncate font-mono text-[10px] text-muted-foreground" title={repo.workPath}>{repo.workPath}</span>
            )}
          </div>
        ))}
      </div>

      {!locked && candidates.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && onAddRepo(e.target.value)}
          disabled={busy}
          className={`${SELECT} self-start`}
          aria-label="Add a repo from your bookmarks"
        >
          <option value="">+ repo from bookmarks</option>
          {candidates.map((b) => <option key={b.id} value={b.path}>{b.name}</option>)}
        </select>
      )}

      {locked && cfg.worktrees && !removed && (
        <div className="flex flex-wrap items-center gap-1.5">
          <PanelButton icon={SquareTerminal} onClick={onOpenTab} title={`Open a tab in ${cfg.workDir}`}>open tab</PanelButton>
          <PanelButton icon={FolderX} onClick={onRemoveWorktrees} disabled={busy} title="Remove the worktrees (the branches stay)">
            remove worktrees
          </PanelButton>
        </div>
      )}
    </div>
  );
}
