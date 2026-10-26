// parse-utils.js — Shared parsing utilities for compaction/dep-graph/symbols tools
// Zero dependencies — uses only built-in Node.js modules

import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Replace string literals, template literals, and comments with
 * whitespace-preserving placeholders. Keeps line numbers intact so
 * downstream regex still reports correct line numbers.
 *
 * @param {string} code  — raw source code
 * @param {string} language — 'js'|'ts'|'cs'|'py'|'rs'
 * @returns {string} cleaned code with strings/comments blanked
 */
export function stripCommentsAndStrings(code, language) {
  const chars = code.split('');
  const len = chars.length;
  let i = 0;
  const result = [];

  // '…' / "…" from chars[at] (a quote); single-line. Returns the index after it.
  const scanQuoted = (at) => {
    const quote = chars[at];
    result.push(' ');
    let k = at + 1;
    while (k < len) {
      if (chars[k] === '\\') { result.push(' ', chars[k + 1] === '\n' ? '\n' : ' '); k += 2; continue; }
      if (chars[k] === '\n') { result.push('\n'); return k + 1; } // unterminated
      if (chars[k] === quote) { result.push(' '); return k + 1; }
      result.push(' '); k++;
    }
    return k;
  };
  // `…` from chars[at]: text is blanked, ${…} expressions are kept (imports stay
  // visible) and scanned as code, so nested templates, strings and braces inside
  // them don't end the literal early or late. Returns the index after the closing `.
  const scanTemplate = (at) => {
    result.push(' ');
    let k = at + 1;
    while (k < len) {
      const c = chars[k];
      if (c === '\\') { result.push(' ', chars[k + 1] === '\n' ? '\n' : ' '); k += 2; continue; }
      if (c === '\n') { result.push('\n'); k++; continue; }
      if (c === '`') { result.push(' '); return k + 1; }
      if (c === '$' && chars[k + 1] === '{') { result.push(' ', ' '); k = scanExpression(k + 2); continue; }
      result.push(' '); k++;
    }
    return k;
  };
  const scanExpression = (at) => {
    let depth = 0, k = at;
    while (k < len) {
      const c = chars[k];
      if (c === '`') { k = scanTemplate(k); continue; }
      if (c === '"' || c === "'") { k = scanQuoted(k); continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0) { result.push(' '); return k + 1; } depth--; }
      result.push(c); k++;
    }
    return k;
  };
  // A `/` starts a regex literal (not division) after an operator, opening
  // bracket, comma, keyword or line start.
  const isRegexStart = (at) => {
    if (chars[at + 1] === '/' || chars[at + 1] === '*') return false;
    let k = at - 1;
    while (k >= 0 && (chars[k] === ' ' || chars[k] === '\t')) k--;
    if (k < 0 || chars[k] === '\n') return true;
    if ('(,=:[!&|?{};+-*%>~^'.includes(chars[k])) return true; // not '<': </div> is JSX
    const word = code.slice(Math.max(0, k - 9), k + 1).match(/(?:^|[^\w$])(return|typeof|case|do|else|in|of|void|yield|await)$/);
    return !!word;
  };
  // End index (after flags) of a regex literal starting at `at`, or -1 when the
  // line has no closing / (then it was division after all).
  const regexEnd = (at) => {
    let k = at + 1, inClass = false;
    while (k < len && chars[k] !== '\n') {
      const c = chars[k];
      if (c === '\\') { k += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { k++; while (k < len && /[a-z]/i.test(chars[k])) k++; return k; }
      k++;
    }
    return -1;
  };

  while (i < len) {
    const ch = chars[i];
    const next = i + 1 < len ? chars[i + 1] : '';

    // Python: # line comments
    if (language === 'py' && ch === '#') {
      while (i < len && chars[i] !== '\n') { result.push(' '); i++; }
      continue;
    }

    // Python: triple-quoted strings
    if (language === 'py' && (ch === '"' || ch === "'")) {
      const q = ch;
      if (i + 2 < len && chars[i + 1] === q && chars[i + 2] === q) {
        result.push(' ', ' ', ' ');
        i += 3;
        while (i < len) {
          if (chars[i] === '\n') { result.push('\n'); i++; }
          else if (chars[i] === q && i + 2 < len && chars[i + 1] === q && chars[i + 2] === q) {
            result.push(' ', ' ', ' '); i += 3; break;
          } else { result.push(' '); i++; }
        }
        continue;
      }
    }

    // Rust: block comments nest — /* a /* b */ c */
    if (language === 'rs' && ch === '/' && next === '*') {
      result.push(' ', ' ');
      i += 2;
      let depth = 1;
      while (i < len && depth > 0) {
        if (chars[i] === '\n') { result.push('\n'); i++; }
        else if (chars[i] === '/' && chars[i + 1] === '*') { depth++; result.push(' ', ' '); i += 2; }
        else if (chars[i] === '*' && chars[i + 1] === '/') { depth--; result.push(' ', ' '); i += 2; }
        else { result.push(' '); i++; }
      }
      continue;
    }

    // Rust: raw strings r"..." / r#"..."# / br#"..."# (may span lines, no escapes)
    if (language === 'rs' && (ch === 'r' || (ch === 'b' && next === 'r')) && !/[\w]/.test(chars[i - 1] || '')) {
      let j = i + (ch === 'b' ? 2 : 1);
      let hashes = 0;
      while (chars[j] === '#') { hashes++; j++; }
      if (chars[j] === '"') {
        for (let k = i; k <= j; k++) result.push(' ');
        i = j + 1;
        const closing = '"' + '#'.repeat(hashes);
        while (i < len) {
          if (chars[i] === '\n') { result.push('\n'); i++; continue; }
          if (chars.slice(i, i + closing.length).join('') === closing) {
            for (let k = 0; k < closing.length; k++) result.push(' ');
            i += closing.length;
            break;
          }
          result.push(' '); i++;
        }
        continue;
      }
    }

    // Rust: '…' is a char literal ('a', '\n', '\u{1F600}') or a lifetime ('a, 'static).
    // Only blank char literals; lifetimes are code.
    if (language === 'rs' && ch === "'") {
      const m = code.slice(i, i + 12).match(/^'(\\(u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.)|[^\\'\n]{1,2})'/);
      if (m) {
        for (let k = 0; k < m[0].length; k++) result.push(' ');
        i += m[0].length;
        continue;
      }
      result.push(ch); i++;
      continue;
    }

    // Rust: "..." strings may span lines
    if (language === 'rs' && ch === '"') {
      result.push(' ');
      i++;
      while (i < len) {
        if (chars[i] === '\\') { result.push(' '); i++; if (chars[i] === '\n') result.push('\n'); else result.push(' '); i++; continue; }
        if (chars[i] === '\n') { result.push('\n'); i++; continue; }
        if (chars[i] === '"') { result.push(' '); i++; break; }
        result.push(' '); i++;
      }
      continue;
    }

    // C-style line comments: //
    if ((language !== 'py') && ch === '/' && next === '/') {
      while (i < len && chars[i] !== '\n') { result.push(' '); i++; }
      continue;
    }

    // C-style block comments: /* ... */
    if ((language !== 'py') && ch === '/' && next === '*') {
      result.push(' ', ' ');
      i += 2;
      while (i < len) {
        if (chars[i] === '\n') { result.push('\n'); i++; }
        else if (chars[i] === '*' && i + 1 < len && chars[i + 1] === '/') {
          result.push(' ', ' '); i += 2; break;
        } else { result.push(' '); i++; }
      }
      continue;
    }

    // JS/TS template literals (nested in ${…} too) and regex literals
    if ((language === 'js' || language === 'ts') && ch === '`') { i = scanTemplate(i); continue; }
    if ((language === 'js' || language === 'ts') && ch === '/' && isRegexStart(i)) {
      const end = regexEnd(i);
      if (end > i) { for (let k = i; k < end; k++) result.push(' '); i = end; continue; }
    }

    // C# verbatim strings: @"..."
    if (language === 'cs' && ch === '@' && next === '"') {
      result.push(' ', ' ');
      i += 2;
      while (i < len) {
        if (chars[i] === '\n') { result.push('\n'); i++; }
        else if (chars[i] === '"' && i + 1 < len && chars[i + 1] === '"') {
          result.push(' ', ' '); i += 2;
        } else if (chars[i] === '"') {
          result.push(' '); i++; break;
        } else { result.push(' '); i++; }
      }
      continue;
    }

    // Regular string literals: "..." or '...'
    if (ch === '"' || ch === "'") { i = scanQuoted(i); continue; }

    result.push(ch);
    i++;
  }

  return result.join('');
}

/**
 * Read lines starting at `startLine` until `openChar`/`closeChar` are balanced.
 * Handles nested brackets. Counts brackets only in non-string/comment context
 * (assumes input has already been pre-processed with stripCommentsAndStrings, or
 * caller accepts approximate matching).
 *
 * @param {string[]} lines
 * @param {number} startLine — index into lines array
 * @param {string} openChar
 * @param {string} closeChar
 * @returns {{ text: string, endIndex: number }}
 */
export function readUntilBalanced(lines, startLine, openChar = '(', closeChar = ')') {
  let depth = 0;
  let result = '';
  let i = startLine;
  for (; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === openChar) depth++;
      else if (ch === closeChar) depth--;
    }
    result += (result ? ' ' : '') + line.trim();
    if (depth <= 0) break;
  }
  return { text: result, endIndex: i };
}

/**
 * Extract a balanced `<...>` generic expression from `text` starting at `startIndex`.
 * Handles nested generics like `Map<string, List<int>>`.
 *
 * Heuristic: only starts counting if text[startIndex] === '<'.
 *
 * @param {string} text
 * @param {number} startIndex — position of the opening `<`
 * @returns {{ generic: string, endIndex: number } | null}
 */
export function extractBalancedGenerics(text, startIndex) {
  if (startIndex >= text.length || text[startIndex] !== '<') return null;

  let depth = 0;
  let i = startIndex;
  for (; i < text.length; i++) {
    if (text[i] === '<') depth++;
    else if (text[i] === '>') {
      depth--;
      if (depth === 0) {
        return { generic: text.slice(startIndex, i + 1), endIndex: i };
      }
    }
  }
  // Unbalanced — return what we have
  return { generic: text.slice(startIndex, i), endIndex: i - 1 };
}

/**
 * Strip type annotations from a parameter string, counting `<>` depth so
 * that `Map<string, number>` isn't split at the inner comma.
 *
 * Handles:  `foo: Map<string, List<number>>, bar: string = 'x'`
 *   →       `foo, bar`
 *
 * @param {string} paramStr
 * @returns {string}
 */
export function simplifyTypeAnnotation(paramStr) {
  if (!paramStr) return '';

  const result = [];
  let i = 0;
  const len = paramStr.length;

  while (i < len) {
    const ch = paramStr[i];

    // Hit a colon — skip the type annotation
    if (ch === ':') {
      i++; // skip ':'
      // Skip whitespace
      while (i < len && paramStr[i] === ' ') i++;
      // Consume the type, respecting <>, (), {} and [] depth — so an object
      // type like `{ retry: number }` is skipped whole, not cut at its `}`
      let angleDepth = 0;
      let parenDepth = 0;
      let braceDepth = 0;
      while (i < len) {
        const c = paramStr[i];
        const nested = angleDepth > 0 || parenDepth > 0 || braceDepth > 0;
        if (c === '<') angleDepth++;
        else if (c === '>' && paramStr[i - 1] === '=') { /* arrow `=>`, not a closer */ }
        else if (c === '>') { if (angleDepth > 0) angleDepth--; else break; }
        else if (c === '(') parenDepth++;
        else if (c === ')') { if (parenDepth > 0) parenDepth--; else break; }
        else if (c === '{' || c === '[') braceDepth++;
        else if (c === '}' || c === ']') { if (braceDepth > 0) braceDepth--; else break; }
        else if (!nested && (c === ',' || (c === '=' && paramStr[i + 1] !== '>'))) break;
        i++;
      }
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join('').replace(/\s+/g, ' ').trim();
}

/**
 * Set of known C# modifiers. Used to consume any number of modifiers before
 * a keyword instead of relying on fixed-order alternation.
 */
export const CS_MODIFIERS = new Set([
  'public', 'private', 'protected', 'internal',
  'static', 'async', 'virtual', 'override', 'abstract',
  'sealed', 'partial', 'readonly', 'new', 'extern',
  'volatile', 'unsafe', 'ref',
]);

/**
 * Consume any number of known C# modifiers from the start of a token array.
 *
 * @param {string[]} tokens — whitespace-split tokens from a trimmed line
 * @returns {{ modifiers: Set<string>, rest: string[] }}
 */
export function consumeModifiers(tokens) {
  const modifiers = new Set();
  let idx = 0;
  while (idx < tokens.length && CS_MODIFIERS.has(tokens[idx])) {
    modifiers.add(tokens[idx]);
    idx++;
  }
  return { modifiers, rest: tokens.slice(idx) };
}

/**
 * Detect language from file extension.
 * @param {string} filePath
 * @returns {'js'|'ts'|'cs'|'py'|'rs'}
 */
export function detectLanguage(filePath) {
  if (filePath.endsWith('.py')) return 'py';
  if (filePath.endsWith('.rs')) return 'rs';
  if (filePath.endsWith('.cs')) return 'cs';
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts')) return 'ts';
  return 'js';
}

// ── Shared infrastructure (file walking, git, timestamps) ──
// Consolidated here so all three tools share one definition instead of three
// drifting copies.

/** Languages the tools can parse, grouped and combined. */
export const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
export const PY_EXTENSIONS = ['.py'];
export const CS_EXTENSIONS = ['.cs'];
// Rust is compaction-only for now: dep-graph/symbols walk ALL_EXTENSIONS with
// JS/Py/C# parsers, so .rs is deliberately kept out of that list.
export const RS_EXTENSIONS = ['.rs'];
export const ALL_EXTENSIONS = [...JS_EXTENSIONS, ...PY_EXTENSIONS, ...CS_EXTENSIONS];

/** Directories never worth walking. */
export const SKIP_DIRECTORIES = new Set([
  'node_modules', 'dist', '.git', 'target', 'build', '.next', '.turbo',
  'out', 'coverage', '.cache', '__pycache__', '.venv', 'venv', '.idea', '.vscode',
  'bin', 'obj',
]);

/**
 * Current git HEAD sha for `dir`, or 'unknown' if not a repo.
 * @param {string} dir
 * @returns {string}
 */
export function getGitSha(dir) {
  try { return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return 'unknown'; }
}

/**
 * Filesystem-safe timestamp: `YYYY-MM-DD_HH-MM-SS` (local time).
 * @returns {string}
 */
export function getDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

/**
 * Recursively collect parseable source file paths under `dir`, skipping
 * SKIP_DIRECTORIES and dot-directories. Returns absolute path strings.
 *
 * Note: compaction.js uses its own walker that returns `{ path, relativePath }`
 * objects filtered by per-language predicates — it intentionally does not use
 * this one.
 *
 * @param {string} dir
 * @param {string} [rootDir]
 * @param {string[]} [files]
 * @returns {string[]}
 */
export function collectFiles(dir, rootDir = dir, files = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        collectFiles(fullPath, rootDir, files);
      }
    } else if (entry.isFile() && ALL_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}
