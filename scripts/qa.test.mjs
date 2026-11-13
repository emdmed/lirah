// node --test scripts/qa.test.mjs — findInstance against a fake registry and a fake control socket.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const root = mkdtempSync(join(tmpdir(), 'qa-test-'));
process.env.TMPDIR = root; // qa.mjs puts its registry under os.tmpdir()
const { findInstance } = await import('./qa.mjs');
const instanceFile = join(root, 'lirah-qa/instance.json');
const home = join(root, 'home');
const controlDir = join(home, '.lirah/control');
const control = join(controlDir, `${process.pid}.sock`); // named after a live pid, like the Rust side's
let server, group, token;

before(async () => {
  mkdirSync(controlDir, { recursive: true });
  mkdirSync(join(root, 'lirah-qa'));
  group = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' }); // a live process group
  server = net.createServer((s) => s.on('data', (d) => {
    const { cmd } = JSON.parse(d);
    s.end(JSON.stringify(cmd === 'qa.whoami' ? { ok: true, data: { pid: process.pid, home, qa: true, token } } : { ok: true, data: {} }) + '\n');
  }));
  await new Promise((ok) => server.listen(control, ok));
});
after(() => { server.close(); process.kill(-group.pid); rmSync(root, { recursive: true, force: true }); });
beforeEach(() => { token = 'good'; });

const register = (over = {}) => writeFileSync(instanceFile, JSON.stringify({ pid: group.pid, pgid: group.pid, home, control, token: 'good', ...over }));

test('accepts a live instance answering with our token and home', async () => {
  register({ control: join(controlDir, '1.sock') }); // stale path: rediscovered and saved
  const inst = await findInstance();
  assert.equal(inst?.home, home);
  assert.equal(inst.env.LIRAH_CONTROL, control);
  assert.equal(JSON.parse(readFileSync(instanceFile, 'utf8')).control, control);
});

test('rejects a dead process group', async () => {
  const dead = spawn('true', { detached: true });
  await new Promise((ok) => dead.on('exit', ok));
  register({ pid: dead.pid, pgid: dead.pid });
  assert.equal(await findInstance(), null);
  assert.ok(!existsSync(instanceFile));
});

test('rejects a socket answering with another token', async () => {
  token = 'someone-else';
  register();
  assert.equal(await findInstance(), null);
  assert.ok(!existsSync(instanceFile));
});

test('rejects a home without a control socket', async () => {
  register({ home: join(root, 'elsewhere') });
  assert.equal(await findInstance(), null);
  assert.ok(!existsSync(instanceFile));
});

test('no registry: nothing to reuse', async () => {
  rmSync(instanceFile, { force: true });
  assert.equal(await findInstance(), null);
});
