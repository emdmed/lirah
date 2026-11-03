// Tasks: quick notes for a backlog, each one a step away from a plan. Pure
// helpers only; the store and the pane do the I/O.

import { shortId } from '../../lib/ids';
import { slugify } from '../plans/planPrompts';

export const TASK_STATUS = {
  BACKLOG: 'backlog',
  PLANNING: 'planning', // the prompt went to an agent, the plan file isn't there yet
  PLANNED: 'planned', // the plan file was written (and maybe imported as a plan)
  DONE: 'done',
};

const STATUSES = new Set(Object.values(TASK_STATUS));

// The global list's scope key. Project lists are keyed by their folder.
export const GLOBAL = 'global';

export function newTask({ title, notes = '' }) {
  const now = Date.now();
  return {
    id: shortId('t'),
    title: String(title || '').trim(),
    notes: String(notes || '').trim(),
    status: TASK_STATUS.BACKLOG,
    planPath: null, // where the agent was asked to save the plan
    planId: null, // the plan it was imported as
    planTabId: null, // the tab whose agent writes the plan
    autoChunk: false, // import the plan and split it into chunks once written
    createdAt: now,
    updatedAt: now,
  };
}

/** A task read from disk, with every field present and of the right type. */
export function normalizeTask(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const now = Date.now();
  return {
    id: typeof t.id === 'string' && t.id ? t.id : shortId('t'),
    title: typeof t.title === 'string' ? t.title : '',
    notes: typeof t.notes === 'string' ? t.notes : '',
    status: STATUSES.has(t.status) ? t.status : TASK_STATUS.BACKLOG,
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
