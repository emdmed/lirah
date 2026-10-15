/**
 * Guardrail: Tauri commands that do IO must not run on the main thread.
 *
 * In Tauri 2 a plain `#[tauri::command] fn` runs on the main thread, which on
 * Linux is the GTK/WebKit UI thread, so a sync command that reads files, walks
 * a tree or spawns a process freezes the window while it runs. This finds
 * every command in src-tauri/src that is neither `async fn` nor
 * `#[tauri::command(async)]` and whose body touches std::fs, std::process
 * Command or walkdir, and fails if there are any.
 *
 *   node scripts/check-async-commands.mjs   (or: npm run check:async-commands)
 *
 * It looks at the command's own body only; a sync command that does its IO
 * through a helper is not caught, so keep IO-doing commands async regardless.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = join(repoRoot, 'src-tauri', 'src');

const IO_PATTERNS = [
  { name: 'std::fs', re: /\bstd::fs\b|(?<![\w:])fs::[a-z_]+\s*\(|\bFile::(?:open|create)\b|\bOpenOptions::new\b/ },
  { name: 'Command', re: /\bCommand::new\b|\bstd::process::Command\b|\.output\(\)|\.spawn\(\)/ },
  { name: 'walkdir', re: /\bWalkDir\b|\bwalkdir::/ },
];

function rustFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return rustFiles(path);
    return entry.name.endsWith('.rs') ? [path] : [];
  });
}

/** Blank out comments and string/char literals, keeping offsets and newlines. */
function stripNonCode(src) {
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

/** Body of the fn whose signature starts at `from`: the matching { ... }. */
function fnBody(code, from) {
  const open = code.indexOf('{', from);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  return code.slice(open);
}

const COMMAND_RE =
  /#\[tauri::command(\s*\(([^)\]]*)\))?\s*\]\s*(?:#\[[^\]]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(async\s+)?fn\s+(\w+)/g;

const violations = [];
let commands = 0;

for (const file of rustFiles(srcRoot)) {
  const code = stripNonCode(readFileSync(file, 'utf8'));
  for (const m of code.matchAll(COMMAND_RE)) {
    commands++;
    const [, , attrArgs = '', asyncKw, name] = m;
    const isAsync = Boolean(asyncKw) || /\basync\b/.test(attrArgs);
    if (isAsync) continue;
    const body = fnBody(code, m.index + m[0].length);
    const hits = IO_PATTERNS.filter((p) => p.re.test(body)).map((p) => p.name);
    if (hits.length) {
      const line = code.slice(0, m.index).split('\n').length;
      violations.push(`${relative(repoRoot, file)}:${line}  ${name}  (${hits.join(', ')})`);
    }
  }
}

if (violations.length) {
  console.log(`Sync #[tauri::command]s that do IO (they block the UI thread):\n`);
  for (const v of violations) console.log(`  ${v}`);
  console.log(`\nMake them \`async fn\` (run the work through crate::ipc::blocking) or mark them #[tauri::command(async)].`);
  console.log(`\n${violations.length} VIOLATION(S) in ${commands} commands`);
  process.exit(1);
}
console.log(`ALL PASS: ${commands} commands, none sync with IO`);
