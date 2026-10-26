// Lirah compaction hook (Claude Code UserPromptSubmit). Keeps the project's
// compaction artifact fresh and points the agent at it. Does nothing unless the
// Lirah tab running this agent has compaction switched on.
//
// Lirah writes this file next to the engine (compaction.js) under
// ~/.lirah/compaction. `node hook.js --session-start` runs on SessionStart and
// starts that build early; `node hook.js --build <project> <fingerprint>` is the
// background build it starts for itself when a rebuild outlives the prompt.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DIR = dirname(SELF);
const ENGINE = join(DIR, 'compaction.js');
// A rebuild inside the prompt gets this long; past it, it finishes in the background.
const BUILD_BUDGET_MS = 6000;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', 'build', 'out', 'coverage', '__pycache__', 'venv', 'bin', 'obj']);
const SOURCE_EXT = /\.(?:[mc]?[jt]sx?|py|cs|rs|css|scss|sass|less|md)$/;
const SOURCE_NAMES = new Set(['package.json', 'tsconfig.json', 'jsconfig.json']);

const toolsDir = (project) => join(project, '.orchestration', 'tools');
const fingerprintFile = (project) => join(toolsDir(project), '.compaction_fingerprint');
const lockFile = (project) => join(toolsDir(project), '.compaction_building');

function runEngine(project, timeout) {
  const r = spawnSync(process.execPath, [ENGINE, project], { stdio: 'ignore', timeout });
  return r.status === 0;
}

// Background build: run to completion, then record what it indexed.
if (process.argv[2] === '--build') {
  const [, , , project, fingerprint] = process.argv;
  if (runEngine(project)) writeFileSync(fingerprintFile(project), fingerprint + '\n');
  try { unlinkSync(lockFile(project)); } catch {}
  process.exit(0);
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const readText = (path) => { try { return readFileSync(path, 'utf8').trim(); } catch { return ''; } };

async function readPayload() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

// Files the user attached in Lirah (prompt box, or the context mirrored for a
// prompt typed in the terminal by agent_state_hook.js) already say where to
// look, so such a prompt gets no compaction and no guard. The markers are
// buildPrompt.js's FILES and ELEMENTS sections.
const ATTACHED_FILES_RE = /^(CAN_MODIFY|DO_NOT_MODIFY|USE_AS_EXAMPLE): |^ELEMENTS from /m;
function hasAttachedFiles(prompt, session) {
  if (ATTACHED_FILES_RE.test(String(prompt || ''))) return true;
  const contextDir = process.env.LIRAH_PROMPT_CONTEXT;
  return !!contextDir && ATTACHED_FILES_RE.test(readText(join(contextDir, `${session}.md`)));
}

// The guard (guard.js) keeps per-session state under sessions/<id>. Each new
// task re-locks its gate and lists the files the prompt names, which it lets the
// agent open without grepping the index first. A continuation keeps all of it.
// Returns the state directory.
const SESSION_TTL_MS = 2 * 24 * 3600 * 1000;
const PROMPT_FILES_MAX = 20;
function sessionState(payload) {
  const sessions = join(DIR, 'sessions');
  try {
    for (const name of readdirSync(sessions)) {
      const path = join(sessions, name);
      if (Date.now() - statSync(path).mtimeMs > SESSION_TTL_MS) rmSync(path, { recursive: true, force: true });
    }
  } catch {}
  const id = String(payload.session_id || 'default').replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  const state = join(sessions, id);
  mkdirSync(state, { recursive: true });
  return state;
}

function resetGuard(state, prompt, project) {
  for (const name of ['unlocked', 'attached_files']) { try { unlinkSync(join(state, name)); } catch {} }
  writeFileSync(join(state, 'prompt_files'), promptFiles(prompt, project).map((f) => f + '\n').join(''));
}

// A short go-ahead after a task ("yes", "go ahead", "continue") is not a new
// task: it keeps the gate open, so the agent isn't re-locked mid-task. Needs an
// earlier prompt this session, at most 6 words, and no new identifiers (every
// word of 3+ letters is a stop word or an action verb). From classify.sh.
const GO_AHEAD_RE = /^\s*(yes|yeah|yep|y|ok|okay|sure|go|go ahead|continue|proceed|do it|please do|sounds good|lgtm|approved|ship it|carry on|keep going)\b/;
const NON_IDENTIFIERS = new Set(('the a an is are was were be been being to for in on it its this that with from by at of and or not but so if do does did has have had '
  + 'can could will would shall should may might must into than then also just only very too quite yes yeah yep okay sure ahead continue proceed please sounds '
  + 'good lgtm approved ship carry keep going thanks fix broken error crash bug build create add implement new clean improve restructure rename refactor slow '
  + 'optimize performance speed review check merge pull request test tests spec coverage document readme explain plan generate typo bump update change wording '
  + 'label what how does describe tell show look read view open print list all them those these that one ones now next same way both rest').split(' '));
function isContinuation(prompt, state) {
  if (!existsSync(join(state, 'prompted'))) return false;
  const text = String(prompt || '').toLowerCase().trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6 || !GO_AHEAD_RE.test(text)) return false;
  return words.every((w) => {
    const clean = w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    return clean.length < 3 || NON_IDENTIFIERS.has(clean);
  });
}

// Files the prompt names. A token with an extension counts when it is a path
// that exists (project-relative or absolute), or the path suffix or basename of
// at most 3 files git knows about ("fix ContextStatus.jsx"). Files that don't
// exist yet (to be created) are skipped. Absolute paths.
function promptFiles(prompt, project) {
  const named = new Set();
  const unresolved = [];
  const tokens = new Set([...String(prompt || '').matchAll(/[\w.@~/-]*[\w-]\.[A-Za-z]\w{0,9}\b/g)].map((m) => m[0]));
  for (const token of [...tokens].slice(0, 50)) {
    const path = isAbsolute(token) ? resolve(token) : resolve(project, token);
    let isFile = false;
    try { isFile = statSync(path).isFile(); } catch {}
    if (isFile) named.add(path);
    else if (!isAbsolute(token) && !token.startsWith('~') && !token.includes('..')) unresolved.push(token.replace(/^\.\//, ''));
  }
  if (unresolved.length) {
    let tracked = [];
    try {
      tracked = execFileSync('git', ['-C', project, 'ls-files', '--cached', '--others', '--exclude-standard'],
        { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 3000 }).toString().split('\n').filter(Boolean);
    } catch {}
    for (const token of unresolved) {
      const matches = tracked.filter((f) => f === token || f.endsWith('/' + token));
      if (matches.length && matches.length <= 3) for (const m of matches) named.add(resolve(project, m));
    }
  }
  return [...named].slice(0, PROMPT_FILES_MAX);
}

// Indexed source files (same rules as the orchestration repo's classify.sh):
// relative paths, sorted, and the newest modification time among them.
function scanSources(project) {
  const files = [];
  let newest = 0;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) walk(path);
      } else if (e.isFile() && (SOURCE_EXT.test(e.name) || SOURCE_NAMES.has(e.name))) {
        files.push(relative(project, path));
        try { newest = Math.max(newest, statSync(path).mtimeMs); } catch {}
      }
    }
  };
  walk(project);
  files.sort();
  return { fingerprint: createHash('sha1').update(files.join('\n')).digest('hex'), newest };
}

function latestArtifact(project) {
  let latest = null;
  let latestTime = 0;
  try {
    for (const name of readdirSync(toolsDir(project))) {
      if (!name.startsWith('compacted_') || !name.endsWith('.md')) continue;
      const path = join(toolsDir(project), name);
      const time = statSync(path).mtimeMs;
      if (time > latestTime) { latest = path; latestTime = time; }
    }
  } catch {}
  return latest && { path: latest, mtimeMs: latestTime };
}

function building(project) {
  const pid = Number(readText(lockFile(project)));
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function buildInBackground(project, fingerprint) {
  if (building(project)) return;
  const child = spawn(process.execPath, [SELF, '--build', project, fingerprint], { detached: true, stdio: 'ignore' });
  child.unref();
  writeFileSync(lockFile(project), String(child.pid));
}

// Keep the generated files out of git.
function excludeFromGit(project) {
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try { git('rev-parse', '--git-dir'); } catch { return; }
  try { git('check-ignore', '-q', '.orchestration/tools/x'); return; } catch {}
  try {
    const exclude = git('rev-parse', '--path-format=absolute', '--git-path', 'info/exclude');
    mkdirSync(dirname(exclude), { recursive: true });
    appendFileSync(exclude, '\n.orchestration/\n');
  } catch {}
}

function grepHint(rel) {
  return `GREP: grep -i -E 'term1|term2' ${rel} — use up to 8 specific identifiers or domain words from the task (not generic words like data/file/handler). Never Read or cat the artifact whole: it is grep-only and greps of it are capped at 60 lines. Each hit is path:line: kind: symbol, or path:start-end: for a multi-line symbol; Read that source path at that line (for start-end, exactly that range: offset start, limit end-start+1). A 'used-by:' line names an importer with the members it uses, their lines and the enclosing function — for relative and aliased imports these are every caller, so don't re-grep or Read those files just to confirm them. Search source only for what the index cannot show; if you need such a search, run it in the same command after the compaction grep.`;
}

// Shared checks: the tab has compaction on and nothing else handles the project.
function activeProject() {
  const session = process.env.LIRAH_PTY_SESSION;
  if (!session || !/^[A-Za-z0-9-]+$/.test(session) || !existsSync(join(DIR, 'on', session))) return null;
  const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!existsSync(project)) return null;
  // The orchestration hooks already do this for the project; don't do it twice.
  if (existsSync(join(project, '.orchestration', 'orchestration.md'))) return null;
  if (existsSync(join(project, '.orchestration', 'disabled'))) return null;
  return { session, project };
}

// Is the artifact missing or behind the sources? Rebuild when there is no
// artifact, a source is newer than it, or the set of files changed (deletes and
// moves don't show up as newer files).
function staleness(project) {
  const artifact = latestArtifact(project);
  const { fingerprint, newest } = scanSources(project);
  const stale = !artifact || newest > artifact.mtimeMs || fingerprint !== readText(fingerprintFile(project));
  return { stale, fingerprint };
}

// SessionStart: a new session starts with a clean guard, and the index starts
// building in the background so the first prompt finds it fresh. A resumed or
// compacted session keeps its guard state.
async function sessionStart() {
  const payload = await readPayload();
  const active = activeProject();
  if (!active) return;
  const { project } = active;
  try {
    const state = sessionState(payload);
    if (payload.source !== 'resume' && payload.source !== 'compact') {
      for (const name of ['prompted', 'unlocked', 'attached_files', 'prompt_files']) { try { unlinkSync(join(state, name)); } catch {} }
    }
  } catch {}
  mkdirSync(toolsDir(project), { recursive: true });
  excludeFromGit(project);
  const { stale, fingerprint } = staleness(project);
  if (stale) buildInBackground(project, fingerprint);
}

async function main() {
  const payload = await readPayload();
  const active = activeProject();
  if (!active) return;
  const { session, project } = active;

  let guardState = null;
  try {
    guardState = sessionState(payload);
    if (isContinuation(payload.prompt, guardState)) {
      // Same task: keep the gate, the named files and an attached-files stand-down.
      if (existsSync(join(guardState, 'attached_files'))) return;
    } else {
      resetGuard(guardState, payload.prompt, project);
    }
    writeFileSync(join(guardState, 'prompted'), '');
  } catch {}
  if (hasAttachedFiles(payload.prompt, session)) {
    // Tells guard.js to stand down until the next prompt.
    if (guardState) try { writeFileSync(join(guardState, 'attached_files'), ''); } catch {}
    return;
  }

  mkdirSync(toolsDir(project), { recursive: true });
  excludeFromGit(project);

  // A build started by an earlier prompt is usually done in well under a second.
  for (let i = 0; i < 30 && building(project); i++) sleep(100);

  let state = 'current';
  const { stale, fingerprint } = staleness(project);
  if (stale) {
    if (!building(project) && runEngine(project, BUILD_BUDGET_MS)) {
      writeFileSync(fingerprintFile(project), fingerprint + '\n');
      state = 'refreshed';
    } else {
      buildInBackground(project, fingerprint);
      state = 'refreshing in the background (large project); it may miss the newest edits';
    }
  }
  const artifact = latestArtifact(project);

  const lines = ['<compaction-hook>'];
  if (artifact) {
    const rel = relative(project, artifact.path).split('\\').join('/');
    lines.push(
      `COMPACTION: ${state} → ${rel}`,
      "Before reading source, grep the compaction artifact for the task's identifiers and Read only the lines its hits point to. A guard holds back source reads until you do (files the prompt names are open already).",
      grepHint(rel),
    );
  } else {
    lines.push('COMPACTION: building in the background (large project), no artifact yet. Grep .orchestration/tools/compacted_*.md once it exists.');
  }
  lines.push('</compaction-hook>');
  process.stdout.write(lines.join('\n') + '\n');
}

// A hook that fails must never block the prompt.
(process.argv[2] === '--session-start' ? sessionStart() : main()).catch(() => {}).finally(() => process.exit(0));
