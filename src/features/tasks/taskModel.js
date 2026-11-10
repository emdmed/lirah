// Tasks: quick notes for a backlog, each one a step away from a plan. Pure
// helpers only; the store and the pane do the I/O.

import { shortId } from '../../lib/ids';
import { lastSepIndex } from '../../utils/pathUtils';
import { slugify } from '../plans/planPrompts';

export const TASK_STATUS = {
  BACKLOG: 'backlog',
  PLANNING: 'planning', // the prompt went to an agent, the plan file isn't there yet
  PLANNED: 'planned', // the plan file was written (and maybe imported as a plan)
  DONE: 'done',
};

const STATUSES = new Set(Object.values(TASK_STATUS));

// The global list's scope key. Workspace lists are keyed by the workspace id.
export const GLOBAL = 'global';

export function newTask({ title, notes = '', repos = [] }) {
  const now = Date.now();
  return {
    id: shortId('t'),
    title: String(title || '').trim(),
    notes: String(notes || '').trim(),
    status: TASK_STATUS.BACKLOG,
    repos: cleanRepos(repos), // the repo roots (or folders) the task is about
    planPath: null, // where the agent was asked to save the plan
    planId: null, // the plan it was imported as
    planTabId: null, // the tab whose agent writes the plan
    autoChunk: false, // import the plan and split it into chunks once written
    createdAt: now,
    updatedAt: now,
  };
}

const cleanRepos = (repos) => (Array.isArray(repos) ? [...new Set(repos.filter((r) => typeof r === 'string' && r))] : []);

/** A task read from disk, with every field present and of the right type. */
export function normalizeTask(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const now = Date.now();
  return {
    id: typeof t.id === 'string' && t.id ? t.id : shortId('t'),
    title: typeof t.title === 'string' ? t.title : '',
    notes: typeof t.notes === 'string' ? t.notes : '',
    status: STATUSES.has(t.status) ? t.status : TASK_STATUS.BACKLOG,
    repos: cleanRepos(t.repos),
    planPath: typeof t.planPath === 'string' ? t.planPath : null,
    planId: typeof t.planId === 'string' ? t.planId : null,
    planTabId: typeof t.planTabId === 'string' ? t.planTabId : null,
    autoChunk: t.autoChunk === true,
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : now,
    updatedAt: Number.isFinite(t.updatedAt) ? t.updatedAt : now,
  };
}

export const isOpen = (task) => task.status !== TASK_STATUS.DONE;

/** `add_dark_mode_plan.md`: matches the `*_plan.md` files the plans pane imports. */
export function planFileName(task) {
  return `${slugify(task.title).replace(/-/g, '_') || 'task'}_plan.md`;
}

/** Where a task's plan file goes: `<root>/lirah/plans/<title>_plan.md`. */
export const planFilePath = (root, task) => `${root}/lirah/plans/${planFileName(task)}`;

/** The repo a plan file belongs to: its folder, minus a trailing `lirah/plans` (older files sit at the root). */
export function planRootOf(planPath) {
  const dir = planPath.slice(0, lastSepIndex(planPath));
  return dir.replace(/[\\/]lirah[\\/]plans$/, '');
}

/**
 * Move one of `ids` (the rows on screen, in order) from index `from` to `to`
 * among them. Rows not on screen keep their places in `list`.
 */
export function reorderSubset(list, ids, from, to) {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return list;
  const order = [...ids];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const shown = new Set(ids);
  const byId = new Map(list.map((t) => [t.id, t]));
  let next = 0;
  return list.map((t) => (shown.has(t.id) ? byId.get(order[next++]) : t));
}

/** One textarea's text → { title, notes }: the first line (a leading `#` dropped) is the title. */
export function splitTaskText(text) {
  const [first = '', ...rest] = String(text || '').trim().split('\n');
  return { title: first.replace(/^#+\s*/, '').trim(), notes: rest.join('\n').trim() };
}

/** What the editor shows: the title, then the notes. */
export const taskText = (task) => (task.notes ? `${task.title}\n\n${task.notes}` : task.title);

/** What the formatter is told when the setting is empty: a user story. */
export const DEFAULT_FORMAT_INSTRUCTIONS = [
  'Rewrite this task as a user story:',
  '- `As a <who>, I want <what>, so that <why>.`',
  '- then `## Acceptance criteria` as a `- [ ]` checklist',
  'Keep every detail, name, number and link from the task. Invent nothing; if the who or why is unclear, use the most plausible reading.',
].join('\n');

// `instructions` is the user's formatting prompt (empty: the user story). The
// title line is always asked for: the row and parseFormatted depend on it.
export function buildFormatPrompt(text, instructions) {
  return [
    instructions?.trim() || DEFAULT_FORMAT_INSTRUCTIONS,
    'Output only markdown, nothing before or after it. The first line must be `# ` and a short title (under 60 characters).',
    `Task:\n\n${text}`,
  ].join('\n\n');
}

/** The model's reply → { title, notes }, or null when it holds no `# ` heading. */
export function parseFormatted(stdout) {
  const lines = String(stdout || '').replace(/```(markdown|md)?/g, '').split('\n');
  const start = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (start < 0) return null;
  const parsed = splitTaskText(lines.slice(start).join('\n'));
  return parsed.title ? parsed : null;
}
