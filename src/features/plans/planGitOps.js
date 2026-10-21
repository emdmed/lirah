// The git work done per chunk once a plan is set up: finding a chunk's
// commits, recording where it started, committing or reverting it, and the
// commit ranges a review diffs. Setup and teardown stay in planGit.js. These
// only talk to git; the callers keep the plan state.
import { errorMessage } from '../../lib/errorMessage';
import { git, gitLines } from '../../lib/git';
import { basename } from '../../utils/pathUtils';
import { chunkBases, chunkCommitsByRepo, planGit, workPath } from './planGit';
import { CHUNK_STATUS } from './planModel';
import { chunkCommitMessage, chunkTrailer } from './planPrompts';

/** The chunk's commits since it started, by repo root (oldest first), found by its trailer. */
export async function chunkCommits(plan, chunk) {
  const bases = chunkBases(plan, chunk);
  const commitsByRepo = {};
  for (const repo of planGit(plan).repos) {
    const base = bases[repo.root];
    if (!base) continue;
    const out = await git(workPath(repo), [
      'log', `${base}..HEAD`, '--format=%H', '--fixed-strings', `--grep=${chunkTrailer(plan, chunk)}`,
    ]);
    const shas = out.split('\n').map((l) => l.trim()).filter(Boolean).reverse();
    if (shas.length > 0) commitsByRepo[repo.root] = shas;
  }
  return commitsByRepo;
}

/** Each repo's HEAD in the plan's git settings `cfg`, before a chunk starts. Throws for a repo with no commits. */
export async function captureBaseShas(cfg) {
  const baseShas = {};
  for (const repo of cfg.repos) {
    const sha = (await git(workPath(repo), ['rev-parse', 'HEAD']).catch(() => '')).trim();
    if (!sha) throw new Error(`${basename(repo.root)} has no commits yet`);
    baseShas[repo.root] = sha;
  }
  return baseShas;
}

/** Commit everything in each repo with changes as this chunk. */
export async function commitChunk(plan, chunk) {
  for (const repo of planGit(plan).repos) {
    const path = workPath(repo);
    if (!(await git(path, ['status', '--porcelain'])).trim()) continue;
    await git(path, ['add', '-A']);
    await git(path, ['commit', '-m', chunkCommitMessage(plan, chunk), '-m', chunkTrailer(plan, chunk)]);
  }
}

/**
 * git revert the chunk's commits in each repo, newest first. A failed revert is
 * aborted and reported with the repos already reverted. Returns the revert shas.
 */
export async function rollbackChunk(plan, chunk) {
  const byRepo = chunkCommitsByRepo(plan, chunk);
  const revertShas = [];
  const reverted = [];
  for (const repo of planGit(plan).repos) {
    const commits = byRepo[repo.root];
    if (!commits?.length) continue;
    const path = workPath(repo);
    const before = (await git(path, ['rev-parse', 'HEAD'])).trim();
    try {
      await git(path, ['revert', '--no-edit', ...[...commits].reverse()]);
    } catch (e) {
      await git(path, ['revert', '--abort']).catch(() => {});
      const msg = errorMessage(e).trim() || 'git revert failed';
      throw new Error(reverted.length
        ? `${basename(repo.root)}: ${msg} (already reverted in ${reverted.join(', ')})`
        : `${basename(repo.root)}: ${msg}`);
    }
    revertShas.push(...(await git(path, ['rev-list', `${before}..HEAD`]))
      .split('\n').map((l) => l.trim()).filter(Boolean));
    reverted.push(basename(repo.root));
  }
  if (revertShas.length === 0) throw new Error('git revert made no commit');
  return revertShas;
}

/** One review range per repo the chunk committed in: its commits, from the parent of the first. */
export function chunkReviewRanges(plan, chunk) {
  const byRepo = chunkCommitsByRepo(plan, chunk);
  return planGit(plan).repos
    .filter((r) => byRepo[r.root]?.length)
    .map((r) => ({ path: workPath(r), commits: byRepo[r.root], baseRef: `${byRepo[r.root][0]}^`, headRef: byRepo[r.root].at(-1) }));
}

/**
 * The whole plan as one review, per repo: from before the first implemented
 * chunk that committed there to the last chunk's last commit there.
 */
export function planReviewRanges(plan) {
  const chunks = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED && c.commits?.length > 0);
  const ranges = [];
  for (const repo of planGit(plan).repos) {
    const mine = chunks.filter((c) => chunkCommitsByRepo(plan, c)[repo.root]?.length && chunkBases(plan, c)[repo.root]);
    if (mine.length === 0) continue;
    const first = mine.reduce((a, c) => ((c.startedAt ?? 0) < (a.startedAt ?? 0) ? c : a));
    const last = mine.reduce((a, c) => ((c.doneAt ?? 0) > (a.doneAt ?? 0) ? c : a));
    ranges.push({
      path: workPath(repo),
      commits: mine.flatMap((c) => chunkCommitsByRepo(plan, c)[repo.root]),
      baseRef: chunkBases(plan, first)[repo.root],
      headRef: chunkCommitsByRepo(plan, last)[repo.root].at(-1),
    });
  }
  return ranges;
}

// The files that commit ranges touched, one range per repo, for one review.
// Only files the commits themselves touched: unrelated commits can land
// between a chunk and its fix.
export async function reviewOf(ranges) {
  const files = [];
  for (const r of ranges) {
    const rels = await gitLines(r.path, ['show', '--name-only', '--format=', ...r.commits]);
    for (const rel of new Set(rels)) files.push(`${r.path}/${rel}`);
  }
  return { files, filePath: files[0], ranges };
}
