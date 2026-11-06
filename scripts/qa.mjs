#!/usr/bin/env node
// Agentic QA: start a throwaway Lirah instance and have a cheap model (Haiku)
// walk the recipes listed in qa/index.md through `lirah qa ...`.
//
//   npm run qa                    run every recipe in qa/index.md
//   npm run qa -- tasks theme     run recipes whose file name contains a word
//   npm run qa -- --up            start an instance and keep it up for a hand-driven session
//
// Env: QA_MODEL (default haiku). See qa/README.md.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';

const repo = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const up = argv.includes('--up');
const filters = argv.filter((a) => !a.startsWith('--'));

const freePort = () => new Promise((ok) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Run from inside a Lirah tab, LIRAH_* point at the user's real app: drop them.
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('LIRAH_')));

/** Start an isolated instance; resolves to { home, env, stop }. */
async function startInstance() {
  const home = mkdtempSync(join(tmpdir(), 'lirah-qa-'));
  const port = await freePort();
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
    LIRAH_DEV_PORT: String(port),
  };
  const config = JSON.stringify({ build: { devUrl: `http://localhost:${port}` } });
  const log = join(home, 'app.log');
  const app = spawn(join(repo, 'node_modules/.bin/tauri'), ['dev', '--config', config], {
    cwd: repo, env: appEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  const keep = (d) => { out += d; if (out.length > 200_000) out = out.slice(-100_000); };
  app.stdout.on('data', keep);
  app.stderr.on('data', keep);
  let exited = false;
  app.on('exit', () => { exited = true; });
  const stop = () => {
    try { process.kill(-app.pid, 'SIGTERM'); } catch { /* already gone */ }
    writeFileSync(log, out);
  };

  // A `lirah` that talks to this instance only.
  const bin = join(home, 'qa-bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'lirah'), `#!/bin/sh\nHOME='${home}' exec node '${join(repo, 'src-tauri/src/lirah_cli.js')}' "$@"\n`, { mode: 0o755 });
  const controlDir = join(home, '.lirah/control');
  const env = { ...baseEnv, PATH: `${bin}:${process.env.PATH}`, LIRAH_CONTROL: '' };

  // First run compiles the Rust side, so allow a while.
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    if (exited) { stop(); throw new Error(`app exited during startup; log: ${log}\n${out.slice(-3000)}`); }
    if (Date.now() > deadline) { stop(); throw new Error(`app did not come up in 15 min; log: ${log}`); }
    const sock = existsSync(controlDir) && readdirSync(controlDir).find((f) => f.endsWith('.sock'));
    if (sock) {
      env.LIRAH_CONTROL = join(controlDir, sock);
      try { // the frontend answers once React has mounted
        execFileSync(join(bin, 'lirah'), ['qa', 'snapshot'], { env, stdio: 'pipe', timeout: 5000 });
        await sleep(1500); // let startup tabs settle
        return { home, env, stop, log };
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

if (up) {
  console.log('qa: starting an instance (first run compiles Rust, can take minutes)...');
  const inst = await startInstance();
  console.log(`qa: up. In another shell:\n  export PATH="${inst.env.PATH.split(':')[0]}:$PATH" LIRAH_CONTROL="${inst.env.LIRAH_CONTROL}"\n  lirah qa snapshot\nCtrl+C stops it.`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { inst.stop(); process.exit(0); });
  await new Promise(() => {});
}

// qa/index.md is the list of record: a recipe runs only once it is linked there.
const flows = [...readFileSync(join(repo, 'qa/index.md'), 'utf8').matchAll(/\]\(recipes\/([^)]+\.md)\)/g)].map((m) => m[1])
  .filter((f) => !filters.length || filters.some((w) => f.includes(w)));
if (!flows.length) { console.log('qa: no recipes in qa/index.md match'); process.exit(1); }

let failed = 0, cost = 0;
for (const file of flows) {
  process.stdout.write(`qa: ${file} ... `);
  let inst;
  try { inst = await startInstance(); } catch (e) { console.log(`could not start the app: ${e.message}`); process.exit(1); }
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
