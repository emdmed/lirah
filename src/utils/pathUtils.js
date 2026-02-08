export const IS_WINDOWS = navigator.platform.startsWith('Win');

export function normalizePath(p) {
  return p ? p.replace(/\\/g, '/').replace(/\/+$/, '') : p;
}

export function basename(p) {
  return p.split(/[/\\]/).pop();
}

export function lastSepIndex(p) {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
}

export function escapeShellPath(path) {
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
