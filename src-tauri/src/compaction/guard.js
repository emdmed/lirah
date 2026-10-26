// Lirah compaction guard (Claude Code PreToolUse). Makes the agent use the
// project index before reading code, for Lirah tabs with compaction on:
//
// 1. Index first: reading or searching source is held back each prompt until
//    the agent has grepped the compaction artifact with specific terms.
//    hook.js re-locks it on every prompt.
// 2. Grep-only: the artifact is never loaded whole (Read, cat, head, ...).
// 3. Capped: a grep of the artifact is rewritten to print at most
//    CAP_LINES lines of at most CAP_CHARS characters.
//
// Stands down for a prompt that carries files attached in Lirah (hook.js marks
// it). A port of guard-explore.sh from agentic-orchestration-worflows, and stands
// down where those hooks are installed. Any failure lets the call through.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const CAP_LINES = 60;
const CAP_CHARS = 300;

const ARTIFACT_RE = /compacted_[^\s'"]*\.md|compacted_\*/;
// Files that aren't code: config, docs, lockfiles. Reading them needs no index.
const SAFE_PATH_RE = /(\.orchestration\/|\.patterns\/|CLAUDE\.md$)|\.(json|ya?ml|toml|md|txt|env|lock|config|gitignore|eslintrc|prettierrc)$/;
const SOURCE_EXT = 'tsx?|jsx?|mjs|cjs|mts|cts|cs|py|rs|go|vue|svelte|css|scss|sass|less|html|sh|java|kt|rb|php|swift|c|cc|cpp|h|hpp';
const NAMES_SOURCE_RE = new RegExp(`\\.(${SOURCE_EXT})(['"\`:)]|\\s|$)`);
const GENERIC_TERMS = new Set(('get set add new data info item items list value values name names type types file files path paths id ids key keys util utils '
  + 'helper helpers index main app config test tests error errors handler handlers manager service services model models func function fn const class '
  + 'import export return string number object array true false null undefined src lib default props state component components event events the and for with from').split(' '));
const DUMP_VERBS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'sed', 'awk', 'xxd', 'od', 'strings', 'view', 'vim', 'vi', 'nano']);
const GREP_VERBS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag']);
const SEARCH_VERBS = new Set([...GREP_VERBS, 'cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'sed', 'awk', 'find']);
// Commands that may share a call with an auto-approved (capped) index grep.
const READONLY_VERBS = new Set([...GREP_VERBS, 'cut', 'head', 'tail', 'sort', 'uniq', 'wc', 'tr', 'cd', 'echo', 'printf', 'ls', 'pwd', 'stat', 'file', 'true', '']);

export const sessionDir = (id) => join(DIR, 'sessions', id);

const out = (decision) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }) + '\n');
const deny = (reason) => out({ permissionDecision: 'deny', permissionDecisionReason: reason });
const allowWith = (updatedInput) => out({ permissionDecision: 'allow', permissionDecisionReason: 'compaction grep (output capped)', updatedInput });

// Split a shell command on ; && || and |, outside quotes. A segment fed by a
// pipe keeps a leading "|".
export function splitSegments(cmd) {
  const segs = [];
  let cur = '';
  let q = '';
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const d = cmd.slice(i, i + 2);
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (d === '&&' || d === '||') { segs.push(cur); cur = ''; i++; continue; }
    if (c === ';' || c === '\n') { segs.push(cur); cur = ''; continue; }
    if (c === '|') { segs.push(cur); cur = '|'; continue; }
    cur += c;
  }
  segs.push(cur);
  return segs.filter((s) => s.replace('|', '').trim());
}

// The command a segment runs, with wrappers and env assignments dropped.
function verbOf(seg) {
  const s = seg.replace(/^\|/, '').replace(/^[\s(]+/, '')
    .replace(/^([A-Za-z_]\w*=\S*\s+)+/, '')
    .replace(/^(sudo|command|exec|time|nice)\s+/, '');
  return { s, verb: (s.split(/\s/)[0] || '').split('/').pop() };
}

// Why a compaction grep pattern can't locate anything specific ('' = fine).
export function patternProblem(raw) {
  if (!raw || raw.length <= 1 || /^(\.\*?|\^|\$)$/.test(raw)) return 'the pattern is empty or matches everything';
  const bad = [];
  let count = 0;
  for (const part of raw.split('|')) {
    const term = part.replace(/\.\*/g, ' ').replace(/\\[bBwWsSdD<>]/g, '').replace(/[\][(){}^$*+?\\]/g, '').trim();
    if (!term || /compacted_|\.orchestration|\//.test(term)) continue;
    count++;
    if (term.length < 2) bad.push(`'${term}' is too short`);
    else if (GENERIC_TERMS.has(term.toLowerCase())) bad.push(`'${term}' is too generic`);
  }
  if (bad.length) return bad.join(', ');
  return count > 8 ? `${count} alternatives is too many` : '';
}

// The patterns a Bash grep segment searches for: its quoted strings, else the
// first argument after the flags.
function bashPatterns(seg) {
  const quoted = [...seg.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  if (quoted.length) return quoted.filter((p) => !ARTIFACT_RE.test(p));
  const first = seg.replace(/^\S+\s+/, '').replace(/^(-\S+\s+)*/, '').split(/\s/)[0];
  return first ? [first] : [];
}

// '' when every part of the command is read-only, else the offending part.
export function notReadOnly(cmd) {
  if (/\$\(|`|(^|[^0-9&])>/.test(cmd)) return 'redirection or command substitution';
  for (const raw of splitSegments(cmd)) {
    const s = raw.replace(/^\|/, '').replace(/^[\s(]+/, '').replace(/2>&1|2>\/dev\/null/g, '').replace(/[\s)]+$/, '');
    const verb = s.split(/\s/)[0] || '';
    if (verb === 'find' && !/-(exec|execdir|ok|okdir|delete|fprint|fprintf|fls)\b/.test(s)) continue;
    if (!READONLY_VERBS.has(verb)) return s;
  }
  return '';
}

// Does a Bash command read or search source? A read/search verb naming a source
// file, or a recursive search of the tree. A grep fed by a pipe reads stdin.
export function bashReadsSource(cmd) {
  for (const raw of splitSegments(cmd)) {
    if (/\.orchestration\/|\.patterns\/|compacted_/.test(raw)) continue;
    const piped = raw.startsWith('|');
    const { s, verb } = verbOf(raw);
    if (verb === 'git') { if (/^git(\s+-C\s+\S+)?\s+grep/.test(s)) return true; continue; }
    if (!SEARCH_VERBS.has(verb)) continue;
    if (NAMES_SOURCE_RE.test(s)) return true;
    if (piped) continue;
    if (verb === 'rg' || verb === 'ag') return true;
    if (GREP_VERBS.has(verb) && /\s(-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive)(\s|$)/.test(s)) return true;
  }
  return false;
}

function latestArtifactRel(project) {
  try {
    const names = readdirSync(join(project, '.orchestration', 'tools')).filter((n) => n.startsWith('compacted_') && n.endsWith('.md'));
    return names.length ? `.orchestration/tools/${names.sort().pop()}` : '';
  } catch { return ''; }
}

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

export function decide(input, env) {
  const session = env.LIRAH_PTY_SESSION;
  if (!session || !/^[A-Za-z0-9-]+$/.test(session) || !existsSync(join(DIR, 'on', session))) return;
  const project = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  if (existsSync(join(project, '.orchestration', 'orchestration.md'))) return; // the orchestration guard runs here
  if (existsSync(join(project, '.orchestration', 'disabled'))) return;
  const artifact = latestArtifactRel(project);
  if (!artifact) return; // nothing to grep yet; never deadlock the agent

  const id = String(input.session_id || 'default').replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  const state = sessionDir(id);
  // Files attached in Lirah already say where to look: hook.js skipped compaction.
  if (existsSync(join(state, 'attached_files'))) return;
  const unlockedFile = join(state, 'unlocked');
  let unlocked = existsSync(unlockedFile);
  const unlock = () => { if (!unlocked) { mkdirSync(state, { recursive: true }); writeFileSync(unlockedFile, ''); unlocked = true; } };

  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const grepExample = `grep -i -E 'term1|term2' ${artifact}`;
  const GREP_ONLY = `The compaction index is grep-only, so it isn't loaded whole. Grep it for specific terms instead: ${grepExample}. Each hit is path:line; Read that file at that line.`;
  const GATE = `Grep the compaction index before reading code: ${grepExample}, with identifiers or domain words from the task. Each hit is path:line to Read. Source opens up after one such grep (files named in the prompt are open already).`;
  const notMeaningful = (pat, why) => `Index grep for '${pat}' needs more specific terms: ${why}. Use 1–8 identifiers or domain words from the task, e.g. 'hashFile|manifest'.`;

  const promptFiles = new Set(read(join(state, 'prompt_files')).split('\n').filter(Boolean));
  const abs = (p) => (isAbsolute(p) ? resolve(p) : resolve(project, p));
  const insideProject = (p) => { const r = relative(project, abs(p)); return !r.startsWith('..') && !isAbsolute(r); };
  const openWithoutIndex = (p) => !p || SAFE_PATH_RE.test(p) || promptFiles.has(abs(p)) || !insideProject(p);

  if (tool === 'Read') {
    const p = ti.file_path || '';
    if (ARTIFACT_RE.test(p)) return deny(GREP_ONLY);
    if (!unlocked && !openWithoutIndex(p)) return deny(GATE);
    return;
  }

  if (tool === 'Grep') {
    const target = ti.path || '';
    if (ARTIFACT_RE.test(target) || /\.orchestration\/tools\/?$/.test(target)) {
      const why = patternProblem(ti.pattern || '');
      if (why) return deny(notMeaningful(ti.pattern || '', why));
      unlock();
      const capped = { ...ti };
      if ((capped.output_mode || 'files_with_matches') === 'content') {
        capped.head_limit = Math.min(capped.head_limit || CAP_LINES, CAP_LINES);
        delete capped['-A']; delete capped['-B']; delete capped['-C']; delete capped.context;
      }
      return allowWith(capped);
    }
    const glob = ti.glob || '';
    if (!unlocked && !(target && openWithoutIndex(target)) && !(glob && SAFE_PATH_RE.test(glob))) return deny(GATE);
    return;
  }

  if (tool === 'Glob') {
    const pattern = ti.pattern || '';
    if (unlocked || /\.orchestration|\.patterns/.test(`${pattern} ${ti.path || ''}`) || SAFE_PATH_RE.test(pattern)) return;
    return deny(GATE);
  }

  if (tool === 'Agent' || tool === 'Task') {
    if (!unlocked && ['', 'Explore', 'general-purpose', 'Plan'].includes(ti.subagent_type || '')) return deny(GATE);
    return;
  }

  if (tool === 'Bash') {
    const cmd = ti.command || '';
    let grepsIndex = false;
    if (ARTIFACT_RE.test(cmd)) {
      for (const raw of splitSegments(cmd)) {
        if (!ARTIFACT_RE.test(raw)) continue;
        const { s, verb } = verbOf(raw);
        if (DUMP_VERBS.has(verb)) return deny(GREP_ONLY);
        if (!GREP_VERBS.has(verb)) continue;
        grepsIndex = true;
        for (const pat of bashPatterns(s)) {
          const why = patternProblem(pat);
          if (why) return deny(notMeaningful(pat, why));
        }
      }
    }
    if (grepsIndex) {
      unlock();
      const offending = notReadOnly(cmd);
      if (offending) {
        return deny(`Compaction grep not run: \`${offending}\` can't share a command with it (its output is capped, so only read-only commands like grep, ls, head may join). Run that part as its own call.`);
      }
      const awk = `awk -v n=${CAP_LINES} -v w=${CAP_CHARS} 'NR<=n { print (length($0) > w ? substr($0, 1, w) " …" : $0) } END { if (NR > n) print "[" NR - n " more lines not shown — narrow the pattern]" }'`;
      return allowWith({ ...ti, command: `{ ${cmd}\n} 2>&1 | ${awk}` });
    }
    if (!unlocked && bashReadsSource(cmd)) return deny(GATE);
  }
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  decide(JSON.parse(raw || '{}'), process.env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {}).finally(() => process.exit(0));
}
