import { it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each base-plugin hook, installed as Lirah installs it, run with its
// settings.json switch off and on: off it does nothing, on it acts as before.
const SRC = dirname(fileURLToPath(import.meta.url));
const SESSION = 'pty-1';
let home, lirah, project;

const setSwitches = (settings) => writeFileSync(join(lirah, 'settings.json'), JSON.stringify(settings));
const run = (script, payload, extraEnv = {}) => execFileSync('node', [script], {
  cwd: project,
  input: JSON.stringify(payload),
  encoding: 'utf8',
  env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, LIRAH_PTY_SESSION: SESSION, CLAUDE_PROJECT_DIR: project, ...extraEnv },
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lirah-hooks-home-'));
  project = mkdtempSync(join(tmpdir(), 'lirah-hooks-proj-'));
  lirah = join(home, '.lirah');
  for (const d of ['hooks', 'events', 'compaction/on']) mkdirSync(join(lirah, d), { recursive: true });
  copyFileSync(join(SRC, 'agent_state_hook.js'), join(lirah, 'hooks/agent-state.js'));
  copyFileSync(join(SRC, 'compaction/hook.js'), join(lirah, 'compaction/hook.js'));
  copyFileSync(join(SRC, 'compaction/guard.js'), join(lirah, 'compaction/guard.js'));
  for (const d of ['hooks', 'compaction']) writeFileSync(join(lirah, d, 'package.json'), '{"type":"module"}\n');
  writeFileSync(join(lirah, 'compaction/on', SESSION), ''); // compaction on for this tab
  mkdirSync(join(project, '.orchestration/tools'), { recursive: true });
  writeFileSync(join(project, '.orchestration/tools/compacted_x.md'), 'src/a.js:1 a\n');
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const agentState = () => {
  const log = join(lirah, 'events', `${SESSION}.jsonl`);
  rmSync(log, { force: true });
  run(join(lirah, 'hooks/agent-state.js'), { hook_event_name: 'Stop' }, { LIRAH_AGENT_EVENTS: join(lirah, 'events') });
  return existsSync(log) && readFileSync(log, 'utf8').includes('"Stop"');
};
// A prompt with attached files: the hook only records the prompt in its session state.
const compactionHook = () => {
  const marker = join(lirah, 'compaction/sessions/c1/prompted');
  rmSync(marker, { force: true });
  run(join(lirah, 'compaction/hook.js'), { session_id: 'c1', prompt: 'CAN_MODIFY: src/a.js' });
  return existsSync(marker);
};
// Reading source before grepping the index is held back.
const guard = () => run(join(lirah, 'compaction/guard.js'), {
  session_id: 'g1', tool_name: 'Read', tool_input: { file_path: join(project, 'src/a.js') },
}).includes('"deny"');

const all = () => ({ agentState: agentState(), compactionHook: compactionHook(), guard: guard() });

it('runs every hook with no settings file or the switches on', () => {
  expect(all()).toEqual({ agentState: true, compactionHook: true, guard: true });
  setSwitches({ agentStateHook: true, compactionHook: true });
  expect(all()).toEqual({ agentState: true, compactionHook: true, guard: true });
});

it('agentStateHook off silences only the agent-state hook', () => {
  setSwitches({ agentStateHook: false });
  expect(all()).toEqual({ agentState: false, compactionHook: true, guard: true });
});

it('compactionHook off silences only the compaction hook and guard', () => {
  setSwitches({ compactionHook: false });
  expect(all()).toEqual({ agentState: true, compactionHook: false, guard: false });
});
