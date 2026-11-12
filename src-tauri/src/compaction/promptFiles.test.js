import { it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The compaction hook records the files a prompt names in sessions/<id>/prompt_files.
// A prompt typed on Windows names them with backslashes.
const SRC = dirname(fileURLToPath(import.meta.url));
const SESSION = 'pty-1';
let home, project, dir;

const git = (...args) => execFileSync('git', ['-C', project, ...args], { stdio: 'ignore' });
const runHook = (prompt) => {
  // CAN_MODIFY marker: the hook records the named files and stops, no index build.
  execFileSync('node', [join(dir, 'hook.js')], {
    cwd: project,
    input: JSON.stringify({ session_id: 'c1', prompt: `CAN_MODIFY: none\n${prompt}` }),
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, LIRAH_PTY_SESSION: SESSION, CLAUDE_PROJECT_DIR: project },
  });
  return readFileSync(join(dir, 'sessions/c1/prompt_files'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, '/'));
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lirah-pf-home-'));
  project = mkdtempSync(join(tmpdir(), 'lirah-pf-proj-'));
  dir = join(home, '.lirah/compaction');
  mkdirSync(join(dir, 'on'), { recursive: true });
  copyFileSync(join(SRC, 'hook.js'), join(dir, 'hook.js'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  writeFileSync(join(dir, 'on', SESSION), '');
  git('init', '-q');
  // Four files with one name, so a bare basename matches too many to be used.
  for (const d of ['a', 'b', 'c', 'd']) {
    mkdirSync(join(project, 'src', d), { recursive: true });
    writeFileSync(join(project, 'src', d, 'index.js'), 'x\n');
  }
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const expected = () => [join(project, 'src', 'b', 'index.js').replace(/\\/g, '/')];

it('resolves a project-relative path written with backslashes', () => {
  expect(runHook('fix src\\b\\index.js please')).toEqual(expected());
});

it('resolves an absolute native path', () => {
  expect(runHook(`fix ${project}\\src\\b\\index.js please`)).toEqual(expected());
});

it('still resolves forward-slash paths', () => {
  expect(runHook('fix src/b/index.js please')).toEqual(expected());
});
