/**
 * Guardrail: one path convention (see src/utils/pathUtils.js, src-tauri/src/paths.rs).
 *
 * The app keeps every path as `/`-separated with an uppercase drive letter and
 * no `\\?\` prefix. Ad-hoc separator logic breaks on Windows, so this fails on:
 *   - JS/JSX in src/ (outside pathUtils.js and tests): split('/'),
 *     lastIndexOf('/'), startsWith('/'), replace(/\\/g, ...)
 *   - Rust in src-tauri/src (outside paths.rs): canonicalize(), which yields
 *     `\\?\C:\...` on Windows; use paths::canonical
 * Strict, no baseline. Opt out on one line with `// paths-ok: <reason>`
 * (same line, in JS and in Rust).
 *
 *   node scripts/check-paths.mjs [--root <dir>]   (or: npm run check:paths)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const Q = `['"\`]`;
const JS_PATTERNS = [
  { name: "split('/')", re: new RegExp(`\\.split\\(\\s*${Q}/${Q}\\s*\\)`) },
  { name: "lastIndexOf('/')", re: new RegExp(`\\.lastIndexOf\\(\\s*${Q}/${Q}\\s*\\)`) },
  { name: "startsWith('/')", re: new RegExp(`\\.startsWith\\(\\s*${Q}/${Q}\\s*\\)`) },
  { name: 'replace(/\\\\/g, ...)', re: /\.replace\(\s*\/\\\\\/g\s*,/ },
];
const RUST_PATTERNS = [{ name: 'canonicalize()', re: /\bcanonicalize\s*\(/ }];
const OPT_OUT = /\/\/\s*paths-ok:\s*\S/;

/** Blank out Rust comments and string/char literals, keeping offsets and newlines. */
function stripRustNonCode(src) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const rest = src.slice(i);
    let m;
    if (rest.startsWith('//')) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (rest.startsWith('/*')) {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if ((m = rest.match(/^r(#*)"/))) {
      const close = '"' + m[1];
      const end = src.indexOf(close, i + m[0].length);
      const stop = end === -1 ? src.length : end + close.length;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (rest[0] === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += blank(src.slice(i, j + 1));
      i = j + 1;
    } else if ((m = rest.match(/^'(?:\\.|[^\\'])'/))) {
      out += blank(m[0]);
      i += m[0].length;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

function hits(src, code, patterns) {
  const lines = src.split('\n');
  const found = [];
  code.split('\n').forEach((line, i) => {
    if (OPT_OUT.test(lines[i])) return;
    for (const p of patterns) if (p.re.test(line)) found.push({ line: i + 1, name: p.name });
  });
  return found;
}

/** Violations in one JS/JSX source: [{line, name}]. Whole-line comments are skipped. */
export function scanJs(src) {
  const code = src
    .split('\n')
    .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
    .join('\n');
  return hits(src, code, JS_PATTERNS);
}

/** Violations in one Rust source: [{line, name}]. */
export function scanRust(src) {
  return hits(src, stripRustNonCode(src), RUST_PATTERNS);
}

function walk(dir, keep) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p, keep);
    return keep(e.name, p) ? [p] : [];
  });
}

export function scanRepo(root) {
  const out = [];
  const jsOk = (n, p) =>
    /\.jsx?$/.test(n) &&
    !/\.test\.jsx?$/.test(n) &&
    !/[\\/]__tests__[\\/]/.test(p) &&
    !/[\\/]utils[\\/]pathUtils\.js$/.test(p);
  const rsOk = (n, p) => n.endsWith('.rs') && !/[\\/]paths(_tests)?\.rs$/.test(p);
  for (const [dir, ok, scan] of [
    [join(root, 'src'), jsOk, scanJs],
    [join(root, 'src-tauri', 'src'), rsOk, scanRust],
  ]) {
    let files = [];
    try {
      files = walk(dir, ok);
    } catch {
      // dir absent (fixture roots)
    }
    for (const f of files) {
      const file = relative(root, f).replace(/\\/g, '/'); // paths-ok: display only
      for (const h of scan(readFileSync(f, 'utf8'))) out.push({ file, ...h });
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? process.argv[i + 1] : fileURLToPath(new URL('..', import.meta.url));
  const v = scanRepo(root);
  if (v.length) {
    console.log('Ad-hoc path handling (use the path helpers: normalizePath/toNative in JS, canonical/to_app in Rust):\n');
    const perFile = new Map();
    for (const x of v) {
      console.log(`  ${x.file}:${x.line}  ${x.name}`);
      perFile.set(x.file, (perFile.get(x.file) || 0) + 1);
    }
    console.log('\nPer file:');
    for (const [f, n] of perFile) console.log(`  ${n}  ${f}`);
    console.log('\nIf a site is truly not a path, add `// paths-ok: <reason>` on that line.');
    console.log(`\n${v.length} VIOLATION(S) in ${perFile.size} file(s)`);
    process.exit(1);
  }
  console.log('ALL PASS: no ad-hoc path handling');
}
