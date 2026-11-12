// The end of a plan's life, which happens outside Lirah: its PR on GitHub and
// its merge into the base branch. Found here and saved on the plan (plan.pr,
// plan.merged), since branches are deleted after shipping.
import { useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { dirtyCount, git } from '../../lib/git';
import { chunkCommitsByRepo, planGit, workPath } from './planGit';
import { planFixCommits } from './planGitOps';
import { chunkTrailer, planFixTrailer } from './planPrompts';
import { CHUNK_STATUS, PLAN_STAGE, planStage } from './planModel';

const firstLine = async (root, args) => (await git(root, args)).split('\n')[0].trim();

// The branch the plan merges into in `repo`: its base, else main or master.
async function baseRef(repo, branch) {
  for (const ref of [repo.base, 'main', 'master']) {
    if (!ref || ref === branch || ref === 'HEAD') continue;
    if (await firstLine(repo.root, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`])) return ref;
  }
  return null;
}

/**
 * { at, sha } once every committed chunk's trailer (and the fix trailer, when
 * the plan has fix commits there) is on its repo's base branch, else null. Trailers survive merges, rebases and squash merges alike.
 */
export async function detectMerge(plan, now = Date.now()) {
  const cfg = planGit(plan);
  const committed = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && c.commits?.length);
  if (committed.length === 0) return null;
  let merge = null;
  for (const repo of cfg.repos) {
    const chunks = committed.filter((c) => chunkCommitsByRepo(plan, c)[repo.root]?.length);
    if (chunks.length === 0) continue;
    const base = await baseRef(repo, cfg.branch);
    if (!base) return null;
    for (const chunk of chunks) {
      const hit = await firstLine(repo.root, ['log', base, '-1', '--fixed-strings', `--grep=${chunkTrailer(plan, chunk)}`, '--format=%H']);
      if (!hit) return null;
    }
    if (planFixCommits(plan, repo.root).length > 0
      && !(await firstLine(repo.root, ['log', base, '-1', '--fixed-strings', `--grep=${planFixTrailer(plan)}`, '--format=%H']))) return null;
    if (!merge && cfg.branch) {
      // A --no-ff merge dates the merge; a fast-forward or squash leaves only "now".
      const line = await firstLine(repo.root, ['log', base, '-1', '--merges', '--fixed-strings', `--grep=Merge branch '${cfg.branch}'`, '--format=%H %ct']);
      if (line) merge = { sha: line.split(' ')[0], at: Number(line.split(' ')[1]) * 1000 };
    }
  }
  return merge ?? { sha: null, at: now };
}

/** The newest PR of the plan's branch ({ number, url, state, createdAt, mergedAt }), or null. Throws when gh can't be used. */
export async function fetchPr(plan) {
  const branch = planGit(plan).branch;
  if (!branch) return null;
  const list = JSON.parse(await invoke('gh_pr_for_branch', { repoPath: plan.repoRoot, branch }));
  return list[0] ?? null;
}

// Removal is forced, so a worktree holding uncommitted work keeps it (and is left for the user).
async function canRemoveWorktrees(plan) {
  const cfg = planGit(plan);
  if (!cfg.worktrees || cfg.removedAt) return false;
  for (const repo of cfg.repos) {
    if (workPath(repo) === repo.root) continue;
    if (await dirtyCount(workPath(repo)).catch(() => 1)) return false;
  }
  return true;
}

const MAIN_BRANCHES = new Set(['main', 'master']);
const FOCUS_THROTTLE_MS = 60_000;
let ghWarned = false;

/** Whether the plan's PR or merge is still worth polling for. Shelved plans are left alone. */
export const awaitsLifecycle = (plan) => !plan.shelved
  && [PLAN_STAGE.IMPLEMENTED, PLAN_STAGE.PR_OPEN].includes(planStage(plan));

/** Whether a focus event should check again, given when the last check started. */
export const focusDue = (lastCheckAt, now = Date.now()) => now - lastCheckAt >= FOCUS_THROTTLE_MS;

/**
 * Keeps plan.pr and plan.merged current for the repo's implemented plans:
 * checked when they change, when the window gets focus (a PR merged in the
 * browser, at most once a minute) and on every commit to main or master. A merged plan's worktrees
 * are removed, unless one has uncommitted changes.
 * shortcut: runs only while the plans pane shows the repo; move it to PlansProvider if merges go unnoticed.
 */
export function usePlanLifecycleSync(repoRoot, plans, updatePlan, removeWorktrees) {
  const waiting = useMemo(() => (plans || []).filter(awaitsLifecycle), [plans]);
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;
  const key = waiting.map((p) => p.id).join(',');

  useEffect(() => {
    if (!repoRoot || !key) return;
    let cancelled = false;
    let running = false;
    let lastCheckAt = -Infinity;

    const check = async () => {
      if (running) return;
      running = true;
      lastCheckAt = Date.now();
      try {
        for (const plan of waitingRef.current) {
          let pr = plan.pr ?? null;
          try {
            pr = await fetchPr(plan);
          } catch (e) {
            if (!ghWarned) console.warn('Plan PRs not tracked:', e);
            ghWarned = true;
          }
          const merged = pr?.state === 'MERGED'
            ? { sha: null, at: Date.parse(pr.mergedAt) || Date.now() }
            : await detectMerge(plan).catch(() => null);
          if (cancelled) return;
          const patch = {
            ...(JSON.stringify(pr) !== JSON.stringify(plan.pr ?? null) && { pr }),
            ...(merged && { merged }),
          };
          if (Object.keys(patch).length > 0) updatePlan(repoRoot, plan.id, patch);
          if (merged && await canRemoveWorktrees(plan)) await removeWorktrees(repoRoot, plan.id).catch(() => {});
        }
      } finally {
        running = false;
      }
    };

    const onFocus = () => focusDue(lastCheckAt) && check();
    check();
    window.addEventListener('focus', onFocus);
    // Commit watchers are ref-counted per repo; the stop is chained onto the start.
    const started = invoke('start_commit_watcher', { repoPath: repoRoot }).then(() => true, () => false);
    const unlisten = listen('commit-detected', ({ payload }) => {
      if (payload.repo_path === repoRoot && MAIN_BRANCHES.has(payload.branch)) check();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      unlisten.then((fn) => fn());
      started.then((ok) => ok && invoke('stop_commit_watcher', { repoPath: repoRoot }).catch(() => {}));
    };
  }, [repoRoot, key, updatePlan]);
}
