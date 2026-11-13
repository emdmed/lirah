#!/usr/bin/env node
// Agentic QA: start a throwaway Lirah instance and have a cheap model (Haiku)
// walk the recipes listed in qa/index.md through `lirah qa ...`.
//
//   npm run qa                    run every recipe in qa/index.md
//   npm run qa -- tasks theme     run recipes whose file name contains a word
//   npm run qa -- --up            attach to or start the instance, print its wrapper path and exit
//   npm run qa -- --status        show the registered instance and what it answers to qa.whoami
//   npm run qa -- --down          stop the instance and drop its registry entry
//   npm run qa -- --fresh         --down, then start a new instance
//
// Env: QA_MODEL (default haiku). See qa/README.md.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, openSync, closeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';

const repo = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const filters = argv.filter((a) => !a.startsWith('--'));

const freePort = () => new Promise((ok) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Run from inside a Lirah tab, LIRAH_* point at the user's real app: drop them.
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('LIRAH_')));
// Registry of the running instance, shared by every runner on this machine.
const registry = join(tmpdir(), 'lirah-qa');
const instanceFile = join(registry, 'instance.json');
const lockFile = join(registry, 'instance.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

/** One runner starts an instance at a time: wait for another runner's startup, clearing a dead one's lock. */
async function takeLock() {
  mkdirSync(registry, { recursive: true });
  for (;;) {
    try { const fd = openSync(lockFile, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const holder = Number(readFileSync(lockFile, 'utf8').trim() || 0);
    if (holder && !alive(holder)) { rmSync(lockFile, { force: true }); continue; }
    await sleep(1000);
  }
}

/** One JSON request straight to a control socket; resolves to the reply, rejects on no answer. */
export function ask(control, cmd, args = {}, timeout = 5000) {
  return new Promise((ok, fail) => {
    let buf = '';
    const s = net.connect(control);
    s.setEncoding('utf8');
    s.setTimeout(timeout, () => { s.destroy(); fail(new Error(`${cmd}: no answer`)); });
    s.on('connect', () => s.write(JSON.stringify({ session: null, cmd, args }) + '\n'));
    s.on('error', (e) => fail(new Error(`${cmd}: ${e.code || e.message}`)));
    s.on('data', (d) => (buf += d));
    s.on('end', () => { try { ok(JSON.parse(buf)); } catch { fail(new Error(`${cmd}: bad reply`)); } });
  });
}

// A `lirah` pinned to this instance: real LIRAH_* exported in the caller's shell can't redirect it.
function pin(home, control) {
  const bin = join(home, 'qa-bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'lirah'), `#!/bin/sh\nunset LIRAH_PTY_SESSION LIRAH_WORKSPACE\nHOME='${home}' LIRAH_CONTROL='${control}' exec node '${join(repo, 'src-tauri/src/lirah_cli.js')}' "$@"\n`, { mode: 0o755 });
  return { ...baseEnv, PATH: `${bin}:${process.env.PATH}`, LIRAH_CONTROL: control };
}

const stopper = (pid) => () => {
  try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ }
  try { if (JSON.parse(readFileSync(instanceFile, 'utf8')).pid === pid) rmSync(instanceFile); } catch { /* not ours or gone */ }
};

// The socket is named after the Rust pid, which changes when tauri dev rebuilds and restarts it.
const liveSocket = (home) => {
  const dir = join(home, '.lirah/control');
  const sock = existsSync(dir) && readdirSync(dir).find((f) => f.endsWith('.sock') && alive(Number(f.slice(0, -5))));
  return sock ? join(dir, sock) : null;
};
const readRegistry = () => { try { return JSON.parse(readFileSync(instanceFile, 'utf8')); } catch { return null; } };

/** Kill the registered instance's process group (SIGKILL after 10s) and remove instance.json. */
export async function down() {
  const reg = readRegistry();
  if (!reg) { console.log('qa: no instance registered'); return; }
  try { process.kill(-reg.pgid, 'SIGTERM'); } catch { /* already gone */ }
  for (let i = 0; i < 20 && alive(-reg.pgid); i++) await sleep(500);
  try { process.kill(-reg.pgid, 'SIGKILL'); } catch { /* gone */ }
  rmSync(instanceFile, { force: true });
  console.log(`qa: stopped instance pid ${reg.pid} (profile left in ${reg.home})`);
}

/** The registered instance if it is alive, ours (token + home) and answering; otherwise null, dropping a stale registry. */
export async function findInstance() {
  const reg = readRegistry();
  if (!reg) return null;
  try {
    if (!alive(-reg.pgid)) throw new Error(`process group ${reg.pgid} is gone`);
    const control = liveSocket(reg.home);
    if (!control) throw new Error(`no live control socket in ${reg.home}/.lirah/control`);
    const who = await ask(control, 'qa.whoami');
    if (!who.ok || who.data?.qa !== true) throw new Error(`whoami refused: ${who.error || 'not a QA instance'}`);
    if (who.data.token !== reg.token) throw new Error('token mismatch: the socket belongs to another instance');
    if (who.data.home !== reg.home) throw new Error(`home mismatch: ${who.data.home}`);
    const snap = await ask(control, 'qa', { _: ['snapshot'] });
    if (!snap.ok) throw new Error(`frontend not answering: ${snap.error}`);
    if (control !== reg.control) writeFileSync(instanceFile, JSON.stringify({ ...reg, control }));
    return { pid: reg.pid, home: reg.home, env: pin(reg.home, control), stop: stopper(reg.pid), log: join(reg.home, 'app.log'), token: reg.token };
  } catch (e) {
    console.log(`qa: not reusing instance pid ${reg.pid} (${e.message})`);
    rmSync(instanceFile, { force: true });
    return null;
  }
}

/** Attach to the registered instance or start one; resolves to { home, env, stop, log, token }. */
export async function getInstance() {
  await takeLock();
  try {
    const found = await findInstance();
    if (found) { console.log(`qa: using instance pid ${found.pid}, home ${found.home}`); return found; }
    console.log('qa: starting an instance (first run compiles Rust, can take minutes)');
    return await boot();
  } finally { rmSync(lockFile, { force: true }); }
}

async function boot() {
  const home = mkdtempSync(join(tmpdir(), 'lirah-qa-'));
  const port = await freePort();
  const token = randomBytes(16).toString('hex');
  const realHome = homedir();
  // Seed the profile: tabs open a plain shell (no agent), plus a small git project to work on.
  const project = join(home, 'project');
  mkdirSync(join(home, '.lirah'));
  const now = Date.now();
  writeFileSync(join(home, '.lirah/settings.json'), JSON.stringify({
    autoLaunchCli: false,
    bookmarks: [{ id: 'qa-project', name: 'project', path: project, createdAt: now, lastAccessedAt: now }],
  }));
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'README.md'), '# QA fixture\n\nA small project for QA flows.\n');
  writeFileSync(join(project, 'src/index.js'), 'export const greet = (name) => `Hello, ${name}!`;\n');
  writeFileSync(join(project, 'src/util.js'), 'export const add = (a, b) => a + b;\n');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@example.com', ...a], { cwd: project, stdio: 'ignore' });
  git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-qm', 'initial commit');
  const appEnv = {
    ...baseEnv,
    HOME: home, // the app keeps everything under $HOME/.lirah: a fresh, throwaway profile
    CARGO_HOME: process.env.CARGO_HOME || join(realHome, '.cargo'),
    RUSTUP_HOME: process.env.RUSTUP_HOME || join(realHome, '.rustup'),
    LIRAH_QA: '1',
    LIRAH_QA_TOKEN: token, // qa.whoami echoes it, so a runner can tell its instance from any other Lirah
    LIRAH_DEV_PORT: String(port),
  };
  const config = JSON.stringify({ build: { devUrl: `http://localhost:${port}` } });
  const log = join(home, 'app.log');
  // Output goes straight to the file, not through this process, so the instance can outlive the runner.
  const logFd = openSync(log, 'a');
  const app = spawn(join(repo, 'node_modules/.bin/tauri'), ['dev', '--config', config], {
    cwd: repo, env: appEnv, detached: true, stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);
  let exited = false;
  app.on('exit', () => { exited = true; });
  const tail = () => readFileSync(log, 'utf8').slice(-3000);
  const stop = stopper(app.pid);
  const controlDir = join(home, '.lirah/control');

  // First run compiles the Rust side, so allow a while.
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    if (exited) { stop(); throw new Error(`app exited during startup; log: ${log}\n${tail()}`); }
    if (Date.now() > deadline) { stop(); throw new Error(`app did not come up in 15 min; log: ${log}`); }
    const sock = existsSync(controlDir) && readdirSync(controlDir).find((f) => f.endsWith('.sock'));
    if (sock) {
      const env = pin(home, join(controlDir, sock));
      try { // the frontend answers once React has mounted
        execFileSync(join(home, 'qa-bin/lirah'), ['qa', 'snapshot'], { env, stdio: 'pipe', timeout: 5000 });
        await sleep(1500); // let startup tabs settle
        writeFileSync(instanceFile, JSON.stringify({ pid: app.pid, pgid: app.pid, home, control: env.LIRAH_CONTROL, port, token, startedAt: Date.now() }));
        return { home, env, stop, log, token };
      } catch { /* not ready yet */ }
    }
    await sleep(1000);
  }
}

const RESULT = JSON.stringify({
  type: 'object', required: ['pass', 'summary', 'steps'],
  properties: {
    pass: { type: 'boolean' },
    summary: { type: 'string' },
    steps: { type: 'array', items: { type: 'object', required: ['step', 'ok', 'evidence'],
      properties: { step: { type: 'string' }, ok: { type: 'boolean' }, evidence: { type: 'string' } } } },
  },
});

function runFlow(file, inst) {
  // The agent's shell has the real $HOME: point ~/ at the QA profile instead.
  const local = (text) => text.replaceAll('~/', `${inst.home}/`);
  const system = local(readFileSync(join(repo, 'qa/AGENT.md'), 'utf8'));
  const flow = local(readFileSync(join(repo, 'qa/recipes', file), 'utf8'));
  const args = ['-p', '--model', process.env.QA_MODEL || 'haiku', '--setting-sources', '', '--system-prompt', system,
    '--tools', 'Bash', '--allowedTools', 'Bash(lirah:*)', 'Bash(sleep:*)', '--output-format', 'json',
    '--json-schema', RESULT, '--max-budget-usd', '0.50'];
  return new Promise((done) => {
    const p = spawn('claude', args, { cwd: inst.home, env: { ...inst.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stdin.end(`Run this QA recipe and report the result.\n\n${flow}`);
    p.on('close', () => {
      try {
        const r = JSON.parse(out);
        done({ file, cost: r.total_cost_usd || 0, result: r.structured_output, error: r.is_error ? r.result : !r.structured_output && 'no structured result' });
      } catch { done({ file, cost: 0, error: out.slice(0, 500) || 'claude produced no output' }); }
    });
  });
}

// Imported by qa.test.mjs: only run when executed.
if (import.meta.filename === resolve(process.argv[1] ?? '')) {
if (flag('--status')) {
  const reg = readRegistry();
  if (!reg) { console.log('qa: no instance registered'); process.exit(1); }
  console.log(JSON.stringify(reg, null, 2));
  const control = alive(-reg.pgid) && liveSocket(reg.home);
  const who = control ? await ask(control, 'qa.whoami').catch((e) => ({ ok: false, error: e.message })) : { ok: false, error: 'no live process group or control socket' };
  const ours = who.ok && who.data?.token === reg.token && who.data?.home === reg.home;
  console.log(`whoami: ${JSON.stringify(who)}\nqa: ${ours ? 'instance is up and verified' : 'instance is not usable'}`);
  process.exit(ours ? 0 : 1);
}
if (flag('--down') || flag('--fresh')) await down();
if (flag('--down')) process.exit(0);
if (flag('--up') || flag('--fresh')) {
  const inst = await getInstance();
  console.log(`qa: up. In your shell:\n  export PATH="${inst.env.PATH.split(':')[0]}:$PATH"\n  lirah qa snapshot\nIt keeps running; \`npm run qa -- --down\` stops it.`);
  process.exit(0);
}

// qa/index.md is the list of record: a recipe runs only once it is linked there.
const flows = [...readFileSync(join(repo, 'qa/index.md'), 'utf8').matchAll(/\]\(recipes\/([^)]+\.md)\)/g)].map((m) => m[1])
  .filter((f) => !filters.length || filters.some((w) => f.includes(w)));
if (!flows.length) { console.log('qa: no recipes in qa/index.md match'); process.exit(1); }

let failed = 0, cost = 0;
for (const file of flows) {
  process.stdout.write(`qa: ${file} ... `);
  let inst;
  try { inst = await getInstance(); } catch (e) { console.log(`could not start the app: ${e.message}`); process.exit(1); }
  const r = await runFlow(file, inst);
  inst.stop();
  cost += r.cost;
  if (r.error || !r.result?.pass) failed++;
  if (r.error) { console.log(`ERROR (${r.error})`); continue; }
  console.log(`${r.result.pass ? 'PASS' : 'FAIL'} — ${r.result.summary}`);
  for (const s of r.result.steps.filter((x) => !x.ok)) console.log(`    ✗ ${s.step}\n      ${s.evidence}`);
  if (r.result.pass) rmSync(inst.home, { recursive: true, force: true });
  else console.log(`    app log and profile kept in ${inst.home}`);
}
console.log(`qa: ${flows.length - failed}/${flows.length} recipes passed, cost $${cost.toFixed(4)}`);
process.exit(failed ? 1 : 0);
}
