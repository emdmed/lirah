// Lirah compaction hook (Claude Code UserPromptSubmit). Keeps the project's
// compaction artifact fresh and points the agent at it. Does nothing unless the
// Lirah tab running this agent has compaction switched on.
//
// Lirah writes this file next to the engine (compaction.js) under
// ~/.lirah/compaction. `node hook.js --build <project> <fingerprint>` is the
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

// The guard (guard.js) keeps per-session state under sessions/<id>. Each prompt
// re-locks its gate and lists the files the prompt names, which it lets the
// agent open without grepping the index first. Returns the state directory.
const SESSION_TTL_MS = 2 * 24 * 3600 * 1000;
function resetGuard(payload, project) {
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
  for (const name of ['unlocked', 'attached_files']) { try { unlinkSync(join(state, name)); } catch {} }
  const named = new Set();
  for (const [token] of String(payload.prompt || '').matchAll(/[\w.@~/-]*[\w-]\.[A-Za-z]\w*/g)) {
    const path = isAbsolute(token) ? resolve(token) : resolve(project, token);
    try { if (statSync(path).isFile()) named.add(path); } catch {}
  }
  writeFileSync(join(state, 'prompt_files'), [...named].join('\n') + (named.size ? '\n' : ''));
  return state;
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
  return `GREP: grep -i -E 'term1|term2' ${rel} — use up to 8 specific identifiers or domain words from the task (not generic words like data/file/handler). Never Read or cat the artifact whole: grep it. Each hit is path:line: kind: symbol, or path:start-end: for a multi-line symbol; Read that source path at that line (for start-end, exactly that range). A 'used-by:' line names an importer with the members it uses, their lines and the enclosing function — for relative and aliased imports these are every caller, so don't re-grep to confirm them. Search source only for what the index cannot show.`;
}

async function main() {
  const payload = await readPayload();
  const session = process.env.LIRAH_PTY_SESSION;
  if (!session || !/^[A-Za-z0-9-]+$/.test(session) || !existsSync(join(DIR, 'on', session))) return;

  const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!existsSync(project)) return;
  // The orchestration hooks already do this for the project; don't do it twice.
  if (existsSync(join(project, '.orchestration', 'orchestration.md'))) return;
  if (existsSync(join(project, '.orchestration', 'disabled'))) return;

  let guardState = null;
  try { guardState = resetGuard(payload, project); } catch {}
  if (hasAttachedFiles(payload.prompt, session)) {
    // Tells guard.js to stand down until the next prompt.
    if (guardState) try { writeFileSync(join(guardState, 'attached_files'), ''); } catch {}
    return;
  }

  mkdirSync(toolsDir(project), { recursive: true });
  excludeFromGit(project);

  // A build started by an earlier prompt is usually done in well under a second.
  for (let i = 0; i < 30 && building(project); i++) sleep(100);

  // Rebuild when there is no artifact, a source is newer than it, or the set of
  // files changed (deletes and moves don't show up as newer files).
  let artifact = latestArtifact(project);
  const { fingerprint, newest } = scanSources(project);
  let state = 'current';
  if (!artifact || newest > artifact.mtimeMs || fingerprint !== readText(fingerprintFile(project))) {
    if (!building(project) && runEngine(project, BUILD_BUDGET_MS)) {
      writeFileSync(fingerprintFile(project), fingerprint + '\n');
      state = 'refreshed';
    } else {
      buildInBackground(project, fingerprint);
      state = 'refreshing in the background (large project); it may miss the newest edits';
    }
    artifact = latestArtifact(project);
  }

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
main().catch(() => {}).finally(() => process.exit(0));
