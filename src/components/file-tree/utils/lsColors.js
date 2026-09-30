/**
 * `ls --color` conventions for the file panes: build output, dependencies and
 * dotfiles recede so the files you actually edit stand out.
 */
const DIMMED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'target', 'out', 'coverage', '.git', '.next', '.cache', '__pycache__',
]);

export function isDimmedEntry(name) {
  if (!name) return false;
  return name.startsWith('.') || DIMMED_DIRS.has(name);
}

/** Text class for a file from its git stats: untracked green, changed yellow. */
export function gitColorClass(stats) {
  if (!stats) return '';
  if (stats.status === 'untracked') return 'text-git-added';
  if (stats.status === 'deleted') return 'text-git-deleted';
  if (stats.status || stats.added > 0 || stats.deleted > 0) return 'text-[var(--color-status-warning)]';
  return '';
}
