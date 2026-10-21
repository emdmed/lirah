import { invoke } from '@tauri-apps/api/core';
import { currentBranch, dirtyCount, git, gitLines, worktreeAdd, worktreeRemove } from '../../lib/git';
import { planWorktreesDir, planWorktreesRoot } from '../../lib/lirahPaths';

// How a plan handles git (plan.git): which repos it touches, the base branch
// of each, one branch name for all of them, and whether it runs in worktrees
// (~/.lirah/plan-worktrees/<slug>-<id>/<repo>) or in the repos themselves.
// Set up once, right before the first chunk is sent; locked from then on.
//
// Not under ~/.lirah/worktrees: agent jobs garbage-collect everything there.
const MARKER = '.lirah-plan.json';

export const basename = (path) => path.replace(/\/+$/, '').split('/').pop() || path;

export function defaultBranch(slug) {
  return `plan/${slug}`;
}

/** The plan's git settings; plans from before them run in place, on the current branch. */
export function planGit(plan) {
  if (plan.git) return plan.git;
  return {
    worktrees: false,
    branch: '',
    repos: [{ root: plan.repoRoot, base: '', workPath: plan.repoRoot, prepared: true }],
    workDir: plan.repoRoot,
    preparedAt: plan.createdAt || 1,
  };
}

export const workPath = (repo) => repo.workPath || repo.root;
export const isMultiRepo = (plan) => planGit(plan).repos.length > 1;

/** Each repo's sha from before the chunk started (older chunks: the primary repo's only). */
export function chunkBases(plan, chunk) {
  if (chunk.baseShas) return chunk.baseShas;
  return chunk.baseSha ? { [plan.repoRoot]: chunk.baseSha } : {};
}

/** Each repo's commits for the chunk (older chunks: all in the primary repo). */
export function chunkCommitsByRepo(plan, chunk) {
  if (chunk.commitsByRepo) return chunk.commitsByRepo;
  return chunk.commits?.length ? { [plan.repoRoot]: chunk.commits } : {};
}

export function listBranches(root) {
  return gitLines(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
}

async function branchExists(root, branch) {
  // --quiet: a missing branch exits 1 with nothing on stderr, which comes back as ''.
  return !!(await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).trim();
}

// One folder name per repo, unique within the plan's worktrees folder.
function folderNames(repos) {
  const used = new Map();
  return repos.map((r) => {
    const name = basename(r.root);
    const n = (used.get(name) || 0) + 1;
    used.set(name, n);
    return n === 1 ? name : `${name}-${n}`;
  });
}

function workspaceReadme(plan, cfg) {
  const rows = cfg.repos.map((r) => `- \`${basename(workPath(r))}/\`: ${r.root} on branch \`${cfg.branch}\` (from \`${r.base || 'HEAD'}\`)`);
  return `# ${plan.title || 'Plan'}

Worktrees for this plan. Each folder is a git repository; commit in each one you change.

${rows.join('\n')}
`;
}

const fail = (repo, e) => new Error(`${basename(repo.root)}: ${String(e?.message || e).trim()}`);

/**
 * Set up the plan's branch (and worktrees) in every repo not yet prepared.
 * `save(cfg)` is called after each repo, so a failure part-way keeps what was
 * done and a retry skips it. Returns the prepared settings.
 */
export async function prepareGit(home, plan, save) {
  let cfg = planGit(plan);
  if (cfg.preparedAt) return cfg;
  const set = (patch) => {
    cfg = { ...cfg, ...patch };
    save(cfg);
  };
  const setRepo = (i, patch) => set({ repos: cfg.repos.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const branch = cfg.branch.trim();

  if (cfg.worktrees) {
    if (!branch) throw new Error('Worktrees need a branch name');
    // Kept, so a later re-split (new slug) can't lose track of the folder.
    const dir = cfg.worktreesDir || planWorktreesDir(home, plan);
    if (!cfg.worktreesDir) set({ worktreesDir: dir });
    const names = folderNames(cfg.repos);
    for (const [i, repo] of cfg.repos.entries()) {
      if (repo.prepared) continue;
      const path = `${dir}/${names[i]}`;
      try {
        const create = !(await branchExists(repo.root, branch));
        await worktreeAdd(repo.root, { path, branch, create, base: repo.base || 'HEAD' });
      } catch (e) {
        throw fail(repo, e);
      }
      setRepo(i, { workPath: path, prepared: true });
    }
    await invoke('write_file_content', {
      path: `${dir}/${MARKER}`,
      content: JSON.stringify({ repoRoot: plan.repoRoot, planId: plan.id }, null, 2),
    });
    if (cfg.repos.length > 1) {
      await invoke('write_file_content', { path: `${dir}/CLAUDE.md`, content: workspaceReadme(plan, cfg) });
    }
    set({ branch, workDir: cfg.repos.length > 1 ? dir : cfg.repos[0].workPath, preparedAt: Date.now() });
    return cfg;
  }

  for (const [i, repo] of cfg.repos.entries()) {
    if (repo.prepared) continue;
    if (branch) {
      try {
        if ((await currentBranch(repo.root).catch(() => '')) !== branch) {
          const dirty = await dirtyCount(repo.root);
          if (dirty) throw new Error(`${dirty} uncommitted change${dirty === 1 ? '' : 's'}; commit or stash them before switching to ${branch}`);
          const args = (await branchExists(repo.root, branch))
            ? ['switch', branch]
            : ['switch', '-c', branch, repo.base || 'HEAD'];
          await git(repo.root, args);
        }
      } catch (e) {
        throw fail(repo, e);
      }
    }
    setRepo(i, { workPath: repo.root, prepared: true });
  }
  set({ branch, workDir: plan.repoRoot, preparedAt: Date.now() });
  return cfg;
}

/** Remove the plan's worktrees and their folder. The branches stay. */
export async function cleanupGit(plan) {
  const cfg = planGit(plan);
  // A setup that failed part-way may still have made some worktrees.
  if (!cfg.worktrees || !cfg.worktreesDir || cfg.removedAt) return;
  for (const repo of cfg.repos) {
    if (!repo.workPath || repo.workPath === repo.root) continue;
    await worktreeRemove(repo.root, repo.workPath).catch(() => {});
  }
  await invoke('remove_plan_workdir', { path: cfg.worktreesDir });
}

/** The repo whose plans a folder inside a plan's worktrees belongs to, or null. */
export async function planWorktreeOwner(home, path) {
  const prefix = `${planWorktreesRoot(home)}/`;
  if (!path?.startsWith(prefix)) return null;
  const dir = path.slice(prefix.length).split('/')[0];
  try {
    const raw = await invoke('read_file_content', { path: `${prefix}${dir}/${MARKER}` });
    return JSON.parse(raw)?.repoRoot || null;
  } catch {
    return null;
  }
}

/** Is `path` the plan's working folder, or inside it? */
export function inWorkDir(plan, path) {
  const dir = planGit(plan).workDir;
  return !!dir && !!path && (path === dir || path.startsWith(`${dir}/`));
}
