import { it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The CLI with the app closed: no LIRAH_CONTROL, no control socket, files only.
const CLI = join(dirname(fileURLToPath(import.meta.url)), 'lirah_cli.js');
let home;
let project;

const lirah = (...args) => execFileSync('node', [CLI, ...args], {
  cwd: project,
  encoding: 'utf8',
  env: { PATH: process.env.PATH, HOME: home },
});
const file = (rel) => JSON.parse(readFileSync(join(home, '.lirah', rel), 'utf8'));
const put = (rel, doc) => {
  mkdirSync(dirname(join(home, '.lirah', rel)), { recursive: true });
  writeFileSync(join(home, '.lirah', rel), JSON.stringify(doc));
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lirah-cli-home-'));
  project = mkdtempSync(join(tmpdir(), 'lirah-cli-proj-'));
  put('workspaces/index.json', { workspaces: ['w1'], activeWorkspaceId: 'w1' });
  put('workspaces/w1/workspace.json', { id: 'w1', name: 'W', tabs: [{ id: 'tab1', projectPath: project }] });
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

it('adds, lists and finishes a task in the workspace file', () => {
  const out = lirah('tasks', 'add', 'Write docs', '--notes', 'the CLI part');
  const id = /added task (t\w+) to this workspace/.exec(out)[1];
  const { tasks, revision } = file('workspaces/w1/tasks.json');
  expect(revision).toBe(1);
  expect(tasks[0]).toMatchObject({ id, title: 'Write docs', notes: 'the CLI part', status: 'backlog', repos: [project] });
  expect(lirah('tasks', 'list')).toContain(`${id}  backlog  Write docs`);
  expect(lirah('tasks', 'done', id)).toBe(`${id} done\n`);
  expect(file('workspaces/w1/tasks.json').tasks[0].status).toBe('done');
  lirah('tasks', 'add', 'Inbox item', '--global');
  expect(file('tasks/global.json').tasks[0].title).toBe('Inbox item');
});

it('imports a plan with its split queued, and re-chunks it', () => {
  writeFileSync(join(project, 'x_plan.md'), '# Do X\n\nsteps');
  const id = /imported (p\w+);/.exec(lirah('plans', 'import', 'x_plan.md'))[1];
  const plan = file(`workspaces/w1/plans/${id}/plan.json`);
  expect(plan).toMatchObject({ title: 'Do X', slug: 'do-x', repoRoot: project, workspaceId: 'w1', split: 'queued', chunks: [] });
  expect(plan.git.branch).toBe('plan/do-x');
  expect(lirah('plans', 'import', 'x_plan.md')).toContain(`already imported as ${id}`);
  expect(lirah('plans', 'show', '1')).toContain('Do X');
  writeFileSync(join(project, 'x_plan.md'), '# Do X\n\nmore steps');
  lirah('plans', 'rechunk', id);
  const after = file(`workspaces/w1/plans/${id}/plan.json`);
  expect(after.source).toContain('more steps');
  expect(after.revisions).toHaveLength(1);
});

it('asks the app to mark an in-progress chunk done', () => {
  put('workspaces/w1/plans/p1/plan.json', {
    id: 'p1', title: 'P', repoRoot: project, split: 'done', createdAt: 1,
    chunks: [{ id: 'c1', n: 1, title: 'A', status: 'in-progress' }, { id: 'c2', n: 2, title: 'B', status: 'pending' }],
  });
  expect(lirah('plans', 'done', 'p1', '1', '--result', 'checked')).toContain('will be marked done');
  expect(file('workspaces/w1/plans/p1/plan.json').chunks[0].doneRequested).toEqual({ result: 'checked' });
  expect(() => lirah('plans', 'done', 'p1', '2')).toThrow(/only a chunk in progress/);
});

it('refuses to write files while a Lirah is running', () => {
  put(`control/${process.pid}.sock`, {});
  expect(() => lirah('tasks', 'list')).toThrow(/Lirah is running/);
});
