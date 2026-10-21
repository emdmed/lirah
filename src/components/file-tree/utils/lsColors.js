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

/**
 * Tree order: what you edit first, what recedes last. Visible folders, then
 * visible files, then dimmed entries (dotfiles, build output) in the same
 * folders-then-files order; case-insensitive by name within each group.
 */
export function compareTreeEntries(a, b) {
  const dimA = isDimmedEntry(a.name);
  if (dimA !== isDimmedEntry(b.name)) return dimA ? 1 : -1;
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/**
 * Split a file name into base and extension for display (`CHANGELOG`, `.md`).
 * A leading dot is part of the base (`.gitignore` has no extension).
 */
export function splitExtension(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return [name, ''];
  return [name.slice(0, dot), name.slice(dot)];
}
