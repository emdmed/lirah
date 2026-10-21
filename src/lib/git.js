import { invoke } from '@tauri-apps/api/core';

// Thin wrappers over the run_git_command Tauri command. None of them swallow
// errors: each caller decides whether a failure matters.
//
// run_git_command only fails when git writes to stderr, and some failures exit
// non-zero silently (their output comes back as ''), so read the state back
// rather than trusting a call that didn't throw.

export function git(repoPath, args) {
  return invoke('run_git_command', { repoPath, args });
}

/** The command's output as trimmed, non-empty lines. */
export async function gitLines(repoPath, args) {
  return (await git(repoPath, args)).split('\n').map((l) => l.trim()).filter(Boolean);
}

/** The top of the git repo `path` is in, or null. */
export async function repoTop(path) {
  return (await git(path, ['rev-parse', '--show-toplevel'])).trim() || null;
}

/** The checked-out branch, or 'HEAD' when detached. */
export async function currentBranch(path) {
  return (await git(path, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

/** Changed files in the work tree; `untracked: false` counts tracked changes only. */
export async function dirtyCount(path, { untracked = true } = {}) {
  const args = untracked ? ['status', '--porcelain'] : ['status', '--porcelain', '--untracked-files=no'];
  return (await gitLines(path, args)).length;
}

/**
 * Add a worktree at `path`: detached at HEAD, on an existing `branch`, or on a
 * new `branch` made from `base` when `create` is set.
 */
export function worktreeAdd(repoPath, { path, branch, create = false, base = 'HEAD', detach = false }) {
  if (detach) return git(repoPath, ['worktree', 'add', '--detach', path]);
  if (create) return git(repoPath, ['worktree', 'add', '-b', branch, path, base]);
  return git(repoPath, ['worktree', 'add', path, branch]);
}

/** Force-remove the worktree at `path`, then prune, which runs even if the remove failed. */
export async function worktreeRemove(repoPath, path) {
  try {
    await git(repoPath, ['worktree', 'remove', '--force', path]);
  } finally {
    await git(repoPath, ['worktree', 'prune']);
  }
}
