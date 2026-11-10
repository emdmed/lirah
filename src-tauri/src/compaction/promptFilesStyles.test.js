import { it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// promptFiles on prompts as a Linux/macOS user types them: a ':' is only part
// of a path right after a single drive letter, and a backslash is only a
// separator on Windows.
const SRC = dirname(fileURLToPath(import.meta.url));
const SESSION = 'pty-1';
let home, project, dir;

const runHook = (prompt) => {
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
const at = (...parts) => join(project, ...parts).replace(/\\/g, '/');

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lirah-pf2-home-'));
  project = mkdtempSync(join(tmpdir(), 'lirah-pf2-proj-'));
  dir = join(home, '.lirah/compaction');
  mkdirSync(join(dir, 'on'), { recursive: true });
  copyFileSync(join(SRC, 'hook.js'), join(dir, 'hook.js'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  writeFileSync(join(dir, 'on', SESSION), '');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'src', 'a.js'), 'x\n');
  writeFileSync(join(project, 'app.js'), 'x\n');
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

it('finds the file in "see:src/a.js" (colon glued to a word)', () => {
  expect(runHook('see:src/a.js')).toEqual([at('src', 'a.js')]);
});

it('finds the file in "Error:app.js"', () => {
  expect(runHook('Error:app.js')).toEqual([at('app.js')]);
});

// A file whose name holds a backslash exists only off Windows.
it.skipIf(process.platform === 'win32')('does not rewrite a backslash in a non-Windows prompt', () => {
  writeFileSync(join(project, 'foo\\bar.js'), 'x\n');
  expect(runHook('look at foo\\bar.js')).toEqual([at('foo\\bar.js')]);
});
