// Files a shell command reads or writes, best effort, for the file tree's
// agent marks: agents often read with `cat -n f | sed -n 1,80p` instead of
// their Read tool. Not a shell parser; it errs toward missing a file rather
// than marking a wrong one.

import { isAbsolute, normalizePath, joinPath, pathSegments, splitDirName } from '../../utils/pathUtils';

const READERS = new Set([
  'cat', 'head', 'tail', 'sed', 'awk', 'less', 'more', 'wc', 'nl', 'bat',
  'grep', 'egrep', 'rg', 'diff', 'cmp', 'jq', 'sort', 'uniq', 'cut', 'stat', 'file',
]);
// Their first plain argument is a pattern or script, not a file.
const PATTERN_FIRST = new Set(['grep', 'egrep', 'rg', 'sed', 'awk', 'jq']);
// Options that take a value, by command, so the value isn't read as a file.
const VALUE_OPTS = {
  grep: ['-A', '-B', '-C', '-m', '-e', '-f'],
  egrep: ['-A', '-B', '-C', '-m', '-e', '-f'],
  rg: ['-A', '-B', '-C', '-m', '-e', '-f', '-g', '-t', '-T'],
  sed: ['-e', '-f'],
  head: ['-n', '-c'],
  tail: ['-n', '-c'],
  cut: ['-d', '-f', '-c', '-b'],
  sort: ['-k', '-t'],
  awk: ['-F', '-f', '-v'],
};
const GLOB = /[*?[]/;
const PATHLIKE = /^[\w@%+=:,.\\/~*?[\]-]+$/;

// Words of one command, split on unquoted whitespace, with quotes removed.
// Unquoted operators (| && || ; > >>) come back as their own words.
function words(command) {
  const out = [];
  let cur = '';
  let quoted = false;
  let quote = null;
  const push = () => {
    if (cur || quoted) out.push({ text: cur, quoted });
    cur = '';
    quoted = false;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && '$`"\\\n'.includes(command[i + 1] ?? '')) cur += command[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      quoted = true;
    } else if (c === '\\' && i + 1 < command.length) {
      // `C:\x\y` is a path, not escapes; elsewhere a backslash escapes the next character.
      if (/^[A-Za-z]:/.test(cur)) cur += c;
      else cur += command[++i];
    } else if (/\s/.test(c)) {
      push();
      if (c === '\n') out.push({ op: ';' });
    } else if ('|&;><(){}'.includes(c)) {
      push();
      let op = c;
      if ((c === '|' || c === '&' || c === '>') && command[i + 1] === c) op += command[++i];
      out.push({ op });
    } else {
      cur += c;
    }
  }
  push();
  return out;
}

// Canonical result. shortcut: a UNC path loses its leading `//`; upgrade if agents ever name one.
function resolve(base, p) {
  const full = isAbsolute(p) ? normalizePath(p) : joinPath(base, p);
  const root = full.match(/^[A-Za-z]:/)?.[0] ?? '';
  const stack = [];
  for (const part of pathSegments(full.slice(root.length))) {
    if (part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return `${root}/${stack.join('/')}`;
}

// A glob marks the folder it lists: `hooks/*.sh` -> `hooks`.
function target(base, text) {
  if (!PATHLIKE.test(text) || /^\d+$/.test(text) || /^[\w-]+=/.test(text) || text.startsWith('~') || text === '/dev/null') return null;
  if (GLOB.test(text)) {
    const { dir } = splitDirName(text);
    if (!normalizePath(dir) || GLOB.test(dir)) return null;
    return resolve(base, dir);
  }
  return resolve(base, text);
}

// [{ path, kind: 'read'|'edit' }] for `command` run in `cwd` (absolute paths
// only when cwd is unknown).
export function bashFileTargets(command, cwd) {
  if (typeof command !== 'string') return [];
  let base = typeof cwd === 'string' && isAbsolute(cwd) ? normalizePath(cwd) : null;
  const found = new Map();
  const winBase = /^[A-Za-z]:/.test(base ?? '');
  const add = (text, kind) => {
    if (!base && !isAbsolute(text)) return;
    // A backslash separates only in a Windows path; on unix it is part of a name.
    if (text.includes('\\') && !winBase && !/^[A-Za-z]:/.test(text)) return;
    const path = target(base || '/', text);
    if (!path || path === base) return;
    if (found.get(path) !== 'edit') found.set(path, kind);
  };

  let cmd = []; // words of the current simple command
  const flush = () => {
    if (cmd.length === 0) return;
    const [name, ...args] = cmd.map((w) => w.text);
    if (name === 'cd' && args[0] && base) {
      const next = target(base, args[0]);
      if (next) base = next;
    } else if (READERS.has(name) || name === 'tee' || name === 'touch') {
      const inPlace = (name === 'sed' || name === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a));
      const kind = inPlace || name === 'tee' || name === 'touch' ? 'edit' : 'read';
      let skipPattern = PATTERN_FIRST.has(name) && !args.some((a) => a === '-e' || a === '-f');
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('-')) {
          if (VALUE_OPTS[name]?.includes(a)) i++;
          continue;
        }
        if (skipPattern) {
          skipPattern = false;
          continue;
        }
        add(a, kind);
      }
    }
    cmd = [];
  };

  const list = words(command);
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (w.op === '>' || w.op === '>>') {
      const next = list[i + 1];
      if (next && !next.op) {
        add(next.text, 'edit');
        i++;
      }
    } else if (w.op === '<') {
      const next = list[i + 1];
      if (next && !next.op) {
        add(next.text, 'read');
        i++;
      }
    } else if (w.op) {
      flush();
    } else {
      cmd.push(w);
    }
  }
  flush();
  return [...found].map(([path, kind]) => ({ path, kind }));
}
