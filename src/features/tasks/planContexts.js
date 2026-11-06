// Plan contexts: named instructions put in front of a task when it is sent to
// an agent to plan, e.g. "Create the plan with the grill-me skill". One is the
// default; the plan button's menu picks another for a single send.

import { SETTINGS_DEFAULTS, cleanPlanContexts, getSettings, setSetting, useSetting } from '../settings/settingsStore';
import { shortId } from '../../lib/ids';

// Stored as settings.json's planContexts.
function update(fn) {
  setSetting('planContexts', (prev) => cleanPlanContexts(fn(prev)) ?? SETTINGS_DEFAULTS.planContexts);
}

export const usePlanContexts = () => useSetting('planContexts')[0];
export const getPlanContexts = () => getSettings().planContexts;

/** The context with `id`, or the default. */
export function planContext(id) {
  const { contexts, defaultId } = getSettings().planContexts;
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
