export const IS_WINDOWS = navigator.platform.startsWith('Win');
export const IS_MAC = navigator.platform.startsWith('Mac');

/**
 * The one path form the app uses: `/` separators, uppercase drive letter, no
 * `\\?\` prefix, no trailing slash. Every path from outside (agent hooks,
 * backend, user input) goes through here before it is compared or stored.
 */
export function normalizePath(p) {
  if (!p) return p;
  let s = p.replace(/\\/g, '/');
  if (s.startsWith('//?/UNC/')) s = '/' + s.slice(7);
  else if (s.startsWith('//?/')) s = s.slice(4);
  return s.replace(/^[a-z]:/, (d) => d.toUpperCase()).replace(/\/+$/, '');
}

/** Native style, for the few edges that need it (shell, file manager). Not for app state. */
export function toNative(p, windows = IS_WINDOWS) {
  return windows && p ? normalizePath(p).replace(/\//g, '\\') : p;
}

/** Last path segment, ignoring trailing slashes; `fallback` when there is none (e.g. '/'). */
export function basename(p, fallback = '') {
  return p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || fallback;
}

export function lastSepIndex(p) {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
}

export function escapeShellPath(path) {
  path = toNative(path);
  if (IS_WINDOWS) {
    return `"${path.replace(/"/g, '`"')}"`;
  }
  return `'${path.replace(/'/g, "'\\''")}'`;
}

export function getRelativePath(absolutePath, cwdPath) {
  const normalizedCwd = normalizePath(cwdPath);
  const normalizedFile = normalizePath(absolutePath);
  if (normalizedFile.startsWith(normalizedCwd + '/')) {
    return normalizedFile.slice(normalizedCwd.length + 1);
  }
  if (normalizedFile === normalizedCwd) return '.';
  return absolutePath;
}
