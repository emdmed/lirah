import { it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { read, write, resolveWorkspace, lirahDir } from './lirah_files.js';

// os.homedir() reads USERPROFILE on Windows, HOME elsewhere.
const oldHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
let home;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lirah-cli-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));
afterAll(() => {
  for (const [k, v] of Object.entries(oldHome)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

it('uses the temp HOME', () => {
  expect(lirahDir()).toBe(join(home, '.lirah'));
});

it('reads null for a missing file and writes with version and revision', () => {
  expect(read('workspaces/w1/tasks.json')).toBeNull();
  const doc = write('workspaces/w1/tasks.json', { tasks: [1] }, 0);
  expect(doc).toEqual({ tasks: [1], version: 1, revision: 1 });
  expect(read('workspaces/w1/tasks.json')).toEqual(doc);
  expect(write('workspaces/w1/tasks.json', { tasks: [] }).revision).toBe(2);
  expect(readdirSync(join(home, '.lirah/workspaces/w1'))).toEqual(['tasks.json']);
});

it('fails with the current doc when the revision moved on', () => {
  write('t.json', { x: 1 }, null);
  write('t.json', { x: 2 }, 1);
  let err;
  try {
    write('t.json', { x: 3 }, 1);
  } catch (e) {
    err = e;
  }
  expect(err.kind).toBe('conflict');
  expect(err.current).toEqual({ x: 2, version: 1, revision: 2 });
  expect(() => write('new.json', {}, 3)).toThrow(expect.objectContaining({ kind: 'conflict', current: null }));
});

it('takes a file without a version as current and ignores a stray temp file', () => {
  mkdirSync(join(home, '.lirah'));
  writeFileSync(join(home, '.lirah/t.json'), '{"x": 1}');
  writeFileSync(join(home, '.lirah/.t.json.tmp-999'), '{"x": 2, "rev');
  expect(read('t.json')).toEqual({ x: 1, version: 1 });
  expect(write('t.json', { x: 3 }, 0).revision).toBe(1);
  expect(JSON.parse(readFileSync(join(home, '.lirah/t.json'), 'utf8')).x).toBe(3);
});

it('rejects bad paths, non-objects and broken files', () => {
  for (const rel of ['', '/etc/x', '../x', 'a/../b', 'a//b']) {
    expect(() => read(rel)).toThrow(expect.objectContaining({ kind: 'io' }));
  }
  expect(() => write('t.json', [1])).toThrow(expect.objectContaining({ kind: 'io' }));
  mkdirSync(join(home, '.lirah'));
  writeFileSync(join(home, '.lirah/bad.json'), '[1]');
  expect(() => read('bad.json')).toThrow(/not a JSON object/);
});

it('resolves the workspace from the env, else the deepest tab containing the cwd', () => {
  expect(resolveWorkspace('/x', {})).toBeNull();
  write('workspaces/index.json', { workspaces: ['w1', 'w2', 'gone'], activeWorkspaceId: 'w1' });
  write('workspaces/w1/workspace.json', { id: 'w1', tabs: [{ id: 'a', projectPath: '/home/x' }] });
  write('workspaces/w2/workspace.json', { id: 'w2', tabs: [{ id: 'b', projectPath: '/home/x/api/' }, { id: 'c' }] });
  expect(resolveWorkspace('/home/x/api/src', {})).toBe('w2');
  expect(resolveWorkspace('/home/x/web', {})).toBe('w1');
  expect(resolveWorkspace('/home/x', {})).toBe('w1');
  expect(resolveWorkspace('/home/xy', {})).toBeNull();
  expect(resolveWorkspace('/home/x/api', { LIRAH_WORKSPACE: 'w1' })).toBe('w1');
  // An id that isn't in the index (a deleted workspace) falls back to the cwd.
  expect(resolveWorkspace('/home/x/api', { LIRAH_WORKSPACE: 'old' })).toBe('w2');
  rmSync(join(home, '.lirah/workspaces/w1'), { recursive: true });
  expect(resolveWorkspace('/home/x/web', {})).toBeNull();
});
