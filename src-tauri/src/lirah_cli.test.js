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

const lirah = (...args) => lirahIn(project, ...args);
const lirahIn = (cwd, ...args) => execFileSync('node', [CLI, ...args], {
  cwd,
  encoding: 'utf8',
  env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home },
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

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

it('imports a plan with its split queued, and re-chunks it', () => {
  writeFileSync(join(project, 'x_plan.md'), '# Do X\n\nsteps');
  const id = /imported (p\w+);/.exec(lirah('plans', 'import', 'x_plan.md'))[1];
  const plan = file(`plans/${thisMonth()}/${id}/plan.json`);
  expect(plan).toMatchObject({ title: 'Do X', slug: 'do-x', repoRoot: project, workspaceId: 'w1', split: 'queued', chunks: [] });
  expect(plan.git.branch).toBe('plan/do-x');
  expect(lirah('plans', 'import', 'x_plan.md')).toContain(`already imported as ${id}`);
  expect(lirah('plans', 'show', '1')).toContain('Do X');
  writeFileSync(join(project, 'x_plan.md'), '# Do X\n\nmore steps');
  lirah('plans', 'rechunk', id);
  const after = file(`plans/${thisMonth()}/${id}/plan.json`);
  expect(after.source).toContain('more steps');
  expect(after.revisions).toHaveLength(1);
});

it('imports a draft folder as one plan, plan.md first', () => {
  const dir = join(project, 'big_plan');
  mkdirSync(dir);
  writeFileSync(join(dir, 'qa.md'), '## QA\n\ncheck it');
  writeFileSync(join(dir, 'architecture.md'), '## Arch');
  writeFileSync(join(dir, 'plan.md'), '# Big thing');
  writeFileSync(join(dir, 'shot.png'), 'x');
  const id = /imported (p\w+);/.exec(lirah('plans', 'import', 'big_plan'))[1];
  const plan = file(`plans/${thisMonth()}/${id}/plan.json`);
  expect(plan.title).toBe('Big thing');
  expect(plan.importedFrom.path).toBe(dir);
  expect(plan.source).toBe('<!-- file: plan.md -->\n# Big thing\n\n<!-- file: architecture.md -->\n## Arch\n\n<!-- file: qa.md -->\n## QA\n\ncheck it');
  expect(lirah('plans', 'revise', id, 'more QA')).toContain(`the draft folder ${dir}`);
});

it('asks the app to mark an in-progress chunk done', () => {
  put('plans/2026-11/p1/plan.json', {
    id: 'p1', title: 'P', repoRoot: project, split: 'done', createdAt: new Date(2026, 10, 5).getTime(),
    chunks: [{ id: 'c1', n: 1, title: 'A', status: 'in-progress' }, { id: 'c2', n: 2, title: 'B', status: 'pending' }],
  });
  expect(lirah('plans', 'done', 'p1', '1', '--result', 'checked')).toContain('will be marked done');
  expect(file('plans/2026-11/p1/plan.json').chunks[0].doneRequested).toEqual({ result: 'checked' });
  expect(() => lirah('plans', 'done', 'p1', '2')).toThrow(/only a chunk in progress/);
});

it('writes the files even while a Lirah it cannot reach is running (the app reloads them)', () => {
  put(`control/${process.pid}.sock`, {});
  expect(lirah('tasks', 'add', 'From outside')).toMatch(/added task/);
  expect(file('workspaces/w1/tasks.json').tasks[0].title).toBe('From outside');
});

it('sets the theme and settings in settings.json, keeping other keys', () => {
  put('settings.json', { version: 1, revision: 3, bookmarks: [{ id: 'b' }], theme: 'nord' });
  expect(lirah('theme', 'get').trim()).toBe('nord');
  expect(lirah('theme', 'set', 'Rose Pine').trim()).toBe('theme = rose-pine');
  expect(lirah('settings', 'set', 'scrollback', '50000').trim()).toBe('scrollback = 50000');
  expect(lirah('settings', 'set', 'autoLaunchCli', 'off').trim()).toBe('autoLaunchCli = false');
  expect(file('settings.json')).toMatchObject({ revision: 6, bookmarks: [{ id: 'b' }], theme: 'rose-pine', scrollback: 50000, autoLaunchCli: false });
  expect(lirah('settings', 'get', 'figures').trim()).toBe('full');
  expect(() => lirah('settings', 'set', 'figures', 'tiny')).toThrow(/must be one of full, compact/);
});

it('refuses sensitive settings without the app', () => {
  expect(() => lirah('settings', 'set', 'sandboxEnabled', 'on')).toThrow(/sensitive setting.*while Lirah is running/);
  expect(() => lirah('settings', 'reset', 'agentControl')).toThrow(/sensitive setting/);
});

it('edits startup projects in settings.json', () => {
  expect(lirah('startup', 'add', project, '--name', 'P', '--launch')).toMatch(/added .* as "P", launching its agent/);
  expect(lirah('startup', 'mode', 'projects').trim()).toBe('startup mode = projects');
  expect(file('settings.json')).toMatchObject({ startupMode: 'projects', startupProjects: [{ path: project, name: 'P', launch: true }] });
  expect(lirah('startup', 'remove', project).trim()).toBe(`removed ${project}`);
  expect(lirah('startup', 'clear').trim()).toBe('no startup projects to clear');
});

it('finds the owning repo from inside a plan worktree, whatever the drive letter case', () => {
  const wt = join(home, '.lirah', 'plan-worktrees', 'pw1');
  const cwd = wt.replace(/^[a-z]:/i, (d) => d[0] === d[0].toUpperCase() ? d.toLowerCase() : d.toUpperCase());
  put('plan-worktrees/pw1/.lirah-plan.json', { repoRoot: project });
  put('workspaces/w1/workspace.json', { id: 'w1', name: 'W', tabs: [{ id: 'tab1', projectPath: cwd }] });
  lirahIn(cwd, 'tasks', 'add', 'From a worktree');
  expect(file('workspaces/w1/tasks.json').tasks[0].repos).toEqual([project]);
});
