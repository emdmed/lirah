import { CalRecipe } from '@/components/instrument/calibrated';
import { FIGURES, figNumber } from '@/components/instrument/figure';
import { basename } from '../../utils/pathUtils';
import { shortcutKeys } from '../../lib/shortcuts';
import { CHUNK_STATUS, planProgress } from './planModel';
import { chunkCommitsByRepo, planGit, workPath } from './planGit';

// FIG.21: where a plan's commits went, as the calibrated merge recipe, one
// per repo (primary first, up to three). The base lane, the plan branch off
// it with one node per chunk that committed there, a box saying where the
// work happens (in place or the worktree folder), and the lamp verdict at the
// merge: ready to merge once every chunk is done, else how far along it is.
// The branch draws in when it first shows and again each time a chunk
// commits. The base's own progress since the branch isn't tracked, so the merge is
// drawn without it. Compact, narrow, or before any chunk has committed, it
// shows `fallback` (the text rows).

const MIN_W = 440; // 85% of the recipe's 520: legends stay above 9px
const MAX_LANES = 3;
const BOX_CHARS = 12; // the recipe's 100-unit box holds about this many

/** Long names lose their middle, not their end: the end tells plan-a from plan-b. */
export function middleTruncate(text, max = 36) {
  if (text.length <= max) return text;
  if (max < 2) return '…';
  const keep = max - 1;
  const head = Math.ceil(keep * 0.45);
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`;
}

// A worktree path in at most `max` chars: under ~, then without the plan's
// folder (~/.lirah/plan-worktrees/…/repo), then just the repo folder.
export function shortWorkPath(path, max) {
  const i = path.indexOf('/.lirah/');
  const tilde = i >= 0 ? `~${path.slice(i)}` : path;
  const repo = tilde.slice(tilde.lastIndexOf('/') + 1);
  const options = [tilde, `~/.lirah/plan-worktrees/…/${repo}`, `~/…/${repo}`];
  return options.find((o) => o.length <= max && (o === tilde || tilde.includes('/plan-worktrees/')))
    ?? `…/${middleTruncate(repo, Math.max(1, max - 2))}`;
}

/**
 * The figure's data, pure: per repo (primary first), the base, where it is
 * worked, and the chunk numbers that committed there, in plan order.
 */
export function planGitLanes(plan) {
  const cfg = planGit(plan);
  const lanes = cfg.repos.map((repo) => ({
    root: repo.root,
    base: repo.base || 'HEAD',
    worktree: cfg.worktrees && workPath(repo) !== repo.root ? workPath(repo) : null,
    chunks: plan.chunks
      .filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && chunkCommitsByRepo(plan, c)[repo.root]?.length > 0)
      .map((c) => c.n),
  }));
  const { done, total } = planProgress(plan);
  return { branch: cfg.branch.trim(), multi: lanes.length > 1, lanes, ready: total > 0 && done === total };
}

/** One repo lane as merge-recipe data. */
function laneData(d, lane, i, progress) {
  const branch = d.branch || 'current branch';
  // One repo: the branch names the lane. Several: each lane is its repo,
  // and the first (the primary) also carries the branch.
  const name = d.multi ? `${basename(lane.root)}${i === 0 ? ` · ${branch}` : ''}` : branch;
  const keys = (shortcutKeys('merge') ?? ['alt', 'M']).join(' ').toLowerCase();
  return {
    base: middleTruncate(lane.base, 14),
    branch: middleTruncate(name, 52),
    commits: lane.chunks.length,
    noun: 'chunks',
    baseAhead: 0,
    files: lane.worktree
      ? ['worktree', shortWorkPath(lane.worktree, BOX_CHARS)]
      : ['in place', 'no worktree'],
    verdict: d.ready ? ['ready', `${keys} to merge`] : ['merge', `${progress.done}/${progress.total} chunks`],
    label: `${basename(lane.root)}: ${name} off ${lane.base}, ${lane.chunks.length} chunk${lane.chunks.length === 1 ? '' : 's'} committed${lane.chunks.length ? ` (${lane.chunks.join(', ')})` : ''}${lane.worktree ? `, in the worktree ${lane.worktree}` : ', in place'}${d.ready ? ', ready to merge' : ''}.`,
  };
}

/**
 * The locked git summary as one merge drawing per repo. Narrower than MIN_W,
 * compact, or before any chunk has committed, it shows `fallback`.
 */
export function Fig21PlanGit({ plan, fallback }) {
  const d = planGitLanes(plan);
  const progress = planProgress(plan);
  const shown = d.lanes.slice(0, MAX_LANES).filter((l) => l.chunks.length > 0);
  if (!shown.length) return <div className="min-w-0">{fallback}</div>;
  const more = d.lanes.length - Math.min(d.lanes.length, MAX_LANES);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {shown.map((lane, i) => {
        const data = laneData(d, lane, i, progress);
        return (
          <div key={lane.root} className="min-w-0" title={data.label}>
            <CalRecipe recipe="merge" replayKey={lane.chunks.length} title={i === 0 ? FIGURES[figNumber('plan-git')].title : undefined} data={data} minWidth={MIN_W} fallback={i === 0 ? fallback : null} />
          </div>
        );
      })}
      {more > 0 && (
        <span className="font-[family-name:var(--font-legend)] text-[11px] text-muted-foreground">{`+${more} repo${more === 1 ? '' : 's'}`}</span>
      )}
    </div>
  );
}
