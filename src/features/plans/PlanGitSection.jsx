import { useEffect, useState } from 'react';
import { basename } from '../../utils/pathUtils';
import { cn } from '../../lib/utils';
import { FolderX, SquareTerminal, X } from 'lucide-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { ToggleSwitch } from '../../components/instrument/ToggleSwitch';
import { useBookmarks } from '../bookmarks/BookmarksContext';
import { listBranches, planGit } from './planGit';
import { AUTOPILOT_STATUS } from './planModel';
import { Fig21PlanGit, middleTruncate } from './Fig21PlanGit';

const SELECT = 'h-6 min-w-0 pl-1.5 font-mono text-[10px] text-foreground';

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
      className={`${SELECT} max-w-[60%]`}
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
  const running = plan.autopilot?.status === AUTOPILOT_STATUS.RUNNING;
  const removed = !!cfg.removedAt;
  const candidates = bookmarks.filter((b) => !cfg.repos.some((r) => r.root === b.path || b.path.startsWith(`${r.root}/`)));
  const where = cfg.worktrees ? 'worktrees' : 'in place';
  // A lone repo's line only earns its place when it says more than its name:
  // a base to pick, a branch ← base, or a worktree path.
  const multi = cfg.repos.length > 1;
  const solo = cfg.repos[0];
  const showRepos = multi || (locked
    ? !!(cfg.branch || solo?.base || (cfg.worktrees && solo?.workPath && solo.workPath !== solo.root))
    : !!cfg.branch.trim());
  // Until the first chunk is sent the config is only a choice: one line with
  // today's defaults, and the form opens when you ask for it.
  const [editing, setEditing] = useState(false);
  const open = !locked && editing;
  const branch = cfg.branch.trim();
  // The branch leads: it's the part that names this plan's work.
  const parts = [
    { text: branch ? middleTruncate(branch) : 'current branch', strong: !!branch },
    { text: where },
    multi && { text: `${cfg.repos.length} repos` },
    locked && removed && { text: 'removed' },
  ].filter(Boolean);
  const headline = [branch || 'current branch', where, multi && `${cfg.repos.length} repos`, locked && removed && 'removed'].filter(Boolean).join(' · ');

  const headlineRow = (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="ins-legend w-9 shrink-0">git</span>
      <span className="min-w-0 flex-1 truncate" title={locked ? headline : `${headline}. Set up when the first chunk is sent.`}>
        {parts.map((part, i) => (
          <span key={part.text} className={part.strong ? 'text-foreground' : 'text-muted-foreground'}>{i > 0 && ' · '}{part.text}</span>
        ))}
      </span>
      {!locked && (
        <PanelButton
          onClick={() => setEditing((v) => !v)}
          aria-expanded={open}
          className="shrink-0"
          title={open ? 'Close the git setup' : 'Choose worktrees, a plan branch and base branches. Applied when the first chunk is sent.'}
        >
          {open ? 'close' : 'set up'}
        </PanelButton>
      )}
    </div>
  );
  const repoRows = (
    <div className="flex min-w-0 flex-col gap-1">
      {cfg.repos.map((repo, i) => (
        <div key={repo.root} className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn('min-w-0 flex-1 truncate font-mono text-[10px]', locked ? 'text-muted-foreground' : 'text-foreground')} title={repo.root}>
              {basename(repo.root)}
              {i === 0 && multi && <span className="text-muted-foreground"> · primary</span>}
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
  );
  // Locked text, kept for narrow panes.
  const summary = (
    <>
      {headlineRow}
      {showRepos && repoRows}
    </>
  );

  return (
    // Settled config is a metadata line; only the open form gets a well.
    <div className={cn('flex min-w-0 flex-col gap-1.5 text-[11px]', open && 'ins-well -mx-1 px-2 py-1.5')}>
      {/* While auto-pilot runs, the chunk list shows the commits landing. */}
      {locked && !removed && !running ? <Fig21PlanGit plan={plan} fallback={summary} /> : running ? headlineRow : (
        <>
          {headlineRow}
          {locked && showRepos && repoRows}
        </>
      )}

      {open && (
        <>
          <label className="flex items-start gap-2 text-[10px] leading-snug text-muted-foreground">
            <ToggleSwitch
              checked={cfg.worktrees}
              onChange={(worktrees) => onChange({ worktrees })}
              label="Run in worktrees"
              tone="lamp"
            />
            <span className="min-w-0">
              <span className="text-foreground">worktrees</span>
              {cfg.worktrees ? ' · separate checkouts, yours stays untouched' : ' · off: switches branch in your checkout'}
            </span>
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <span className="ins-legend w-12 shrink-0">branch</span>
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

      {!locked && open && showRepos && repoRows}

      {open && candidates.length > 0 && (
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
