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
  s = s.replace(/^[a-z]:/, (d) => d.toUpperCase());
  const t = s.replace(/\/+$/, '');
  if (t === '' && s) return '/'; // the unix root keeps its slash
  return /^[A-Za-z]:$/.test(t) && s.length > t.length ? `${t}/` : t; // so does a drive root
}

/** Native style, for the few edges that need it (shell, file manager). Not for app state. */
export function toNative(p, windows = IS_WINDOWS) {
  return windows && p ? normalizePath(p).replace(/\//g, '\\') : p;
}

/** `rel` under `base`, in the canonical form. */
export function joinPath(base, rel) {
  return `${normalizePath(base).replace(/\/$/, '')}/${normalizePath(rel).replace(/^(?:\.\/)+|^\/+/, '')}`;
}

/** Rooted: `/x`, `\x`, `C:\x` or `C:/x`. */
export function isAbsolute(p) {
  return /^(?:[A-Za-z]:)?[\\/]/.test(p);
}

/** Directory part (with its trailing `/`, '' when none) and file name, canonical. */
export function splitDirName(p) {
  const n = normalizePath(p) ?? '';
  const i = n.lastIndexOf('/');
  return { dir: n.slice(0, i + 1), name: n.slice(i + 1) };
}

/** The folder holding `p`, without trailing `/` ('' when none). */
export function parentDir(p) {
  return splitDirName(p).dir.replace(/\/$/, '');
}

/** Non-empty segments of `p` (a drive letter is the first one). */
export function pathSegments(p) {
  return (normalizePath(p) ?? '').split('/').filter(Boolean);
}

/** The deepest folder holding all `paths` (`/` or a drive root at worst). */
export function commonFolder(paths) {
  const parts = paths.map(pathSegments);
  const shared = [];
  for (let i = 0; parts.every((p) => i < p.length && p[i] === parts[0][i]); i++) shared.push(parts[0][i]);
  if (/^[A-Za-z]:$/.test(shared[0] ?? '')) return shared.length > 1 ? shared.join('/') : `${shared[0]}/`;
  return `/${shared.join('/')}`;
}

/** Every folder above `p`, nearest first (never the bare root). */
export function ancestorDirs(p) {
  const n = normalizePath(p) ?? '';
  const out = [];
  for (let i = n.lastIndexOf('/'); i > 0; i = n.lastIndexOf('/', i - 1)) out.push(n.slice(0, i));
  return out;
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
  const cwdDir = normalizedCwd.replace(/\/$/, '');
  if (normalizedFile.startsWith(cwdDir + '/')) {
    return normalizedFile.slice(cwdDir.length + 1);
  }
  if (normalizedFile === normalizedCwd) return '.';
  return absolutePath;
}
