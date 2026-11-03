// Plan contexts: named instructions put in front of a task when it is sent to
// an agent to plan, e.g. "Create the plan with the grill-me skill". One is the
// default; the plan button's menu picks another for a single send.

import { createStore, useStore } from '../../lib/createStore';
import { loadJson, saveJson } from '../../lib/storage';
import { shortId } from '../../lib/ids';

const STORAGE_KEY = 'lirah:plan-contexts:v1';

const SEED = {
  contexts: [{ id: 'ctx-plan', name: 'Plan', text: 'Write a full implementation plan for this task.' }],
  defaultId: 'ctx-plan',
};

function validate(raw) {
  const contexts = Array.isArray(raw?.contexts)
    ? raw.contexts.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.text === 'string')
    : [];
  if (contexts.length === 0) return SEED;
  const defaultId = contexts.some((c) => c.id === raw.defaultId) ? raw.defaultId : contexts[0].id;
  return { contexts, defaultId };
}

const store = createStore(validate(loadJson(STORAGE_KEY, null)));

function update(fn) {
  store.set((prev) => validate(fn(prev)));
  saveJson(STORAGE_KEY, store.get());
}

export const usePlanContexts = () => useStore(store);
export const getPlanContexts = () => store.get();

/** The context with `id`, or the default. */
export function planContext(id) {
  const { contexts, defaultId } = store.get();
  return contexts.find((c) => c.id === id) || contexts.find((c) => c.id === defaultId) || contexts[0];
}

export function addPlanContext({ name, text }) {
  const id = shortId('ctx');
  update((s) => ({ ...s, contexts: [...s.contexts, { id, name: name.trim(), text: text.trim() }] }));
  return id;
}

export function updatePlanContext(id, patch) {
  update((s) => ({ ...s, contexts: s.contexts.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

/** The last context can't go: there must always be a default. */
export function removePlanContext(id) {
  update((s) => (s.contexts.length > 1 ? { ...s, contexts: s.contexts.filter((c) => c.id !== id) } : s));
}

export function setDefaultPlanContext(id) {
  update((s) => ({ ...s, defaultId: id }));
}
