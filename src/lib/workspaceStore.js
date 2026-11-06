// Workspaces and their tabs, persisted under ~/.lirah/workspaces:
//   index.json            { workspaces: [id, ...], activeWorkspaceId }
//   <id>/workspace.json   { id, name, activeTabId, tabs: [...], pins, budgets, terminalSessions, overrides }
// The old localStorage keys only seed a missing index and are left as a backup.
// pins, budgets and terminalSessions are per-workspace data owned by other modules
// (getWorkspaceData/setWorkspaceData); old global pins and budgets seed every
// workspace whose file does not have them yet.
import { load, remove, save } from './fileStore';
import { loadJson, loadText } from './storage';

const INDEX = 'workspaces/index.json';
const wsFile = (id) => `workspaces/${id}/workspace.json`;
const OLD_TABS = 'nevo-terminal:tabs';
const OLD_WORKSPACES = 'nevo-terminal:workspaces';

const OLD_PINS = 'nevo-terminal:pinned-files';
const OLD_BUDGETS = 'lirah:token-budgets:v1';

const EXTRAS = {
  pins: () => [],
  budgets: () => ({ budgets: {}, alertStates: {} }),
  terminalSessions: () => ({}), // tabId -> PTY session id, for reattach after a reload
  overrides: () => ({}), // settings this workspace sets over settings.json (see getEffectiveSettings)
};

let saved = { workspaces: [], tabs: [], activeTabId: null, activeWorkspaceId: null };
let current = saved; // last state passed to saveWorkspaces
const extras = new Map(); // workspace id -> { pins, budgets, terminalSessions }
const lastWritten = new Map(); // rel -> JSON last saved, so unchanged files are not rewritten

// Before workspaces had files: one array of workspaces, one of tabs, two active keys.
function fromLocalStorage() {
  const tabs = loadJson(OLD_TABS, null);
  const workspaces = loadJson(OLD_WORKSPACES, null);
  const activeTabId = loadText(OLD_TABS + ':active') || null;
  return {
    workspaces: (Array.isArray(workspaces) ? workspaces : []).map(({ lastTabId, ...w }) => ({ ...w, activeTabId: lastTabId })),
    tabs: Array.isArray(tabs) ? tabs : [],
    activeTabId,
    activeWorkspaceId: loadText(OLD_WORKSPACES + ':active') || null,
  };
}

async function fromFiles(index) {
  const ids = Array.isArray(index.workspaces) ? index.workspaces : [];
  const docs = (await Promise.all(ids.map((id) => load(wsFile(id))))).filter(Boolean);
  for (const d of docs) extras.set(d.id, { pins: d.pins, budgets: d.budgets, terminalSessions: d.terminalSessions, overrides: d.overrides });
  const workspaces = docs.map(({ version, revision, tabs, pins, budgets, terminalSessions, overrides, ...w }) => w);
  const tabs = docs.flatMap((d) => (Array.isArray(d.tabs) ? d.tabs : []).map((t) => ({ ...t, workspaceId: d.id })));
  const active = workspaces.find((w) => w.id === index.activeWorkspaceId);
  const activeTabId = active?.activeTabId ?? tabs.find((t) => t.workspaceId === active?.id)?.id ?? null;
  return { workspaces, tabs, activeTabId, activeWorkspaceId: index.activeWorkspaceId ?? null };
}

/** Load workspaces before render; migrates from localStorage when there is no index yet. */
export async function initWorkspaces() {
  try {
    const index = await load(INDEX);
    saved = index ? await fromFiles(index) : fromLocalStorage();
  } catch (error) {
    console.warn(`Failed to load ${INDEX}, using localStorage:`, error);
    saved = fromLocalStorage();
  }
  seedOldGlobals();
  current = saved;
  saveWorkspaces(saved);
}

function seedOldGlobals() {
  const pins = loadJson(OLD_PINS, null);
  const budgets = loadJson(OLD_BUDGETS, null);
  for (const w of saved.workspaces) {
    const e = extras.get(w.id) ?? {};
    extras.set(w.id, {
      ...e,
      pins: e.pins ?? (Array.isArray(pins) ? pins : undefined),
      budgets: e.budgets ?? (budgets?.version === 1 ? { budgets: budgets.budgets ?? {}, alertStates: budgets.alertStates ?? {} } : undefined),
    });
  }
}

/** A workspace's pins, budgets, terminalSessions or overrides (a default when unset). */
export function getWorkspaceData(id, key) {
  return extras.get(id)?.[key] ?? EXTRAS[key]();
}

/** Replace one of a workspace's data fields and save its file. */
export function setWorkspaceData(id, key, value) {
  extras.set(id, { ...extras.get(id), [key]: value });
  saveWorkspaces(current);
}

/** Every workspace's value for key, e.g. all terminalSessions maps. */
export function allWorkspaceData(key) {
  return current.workspaces.map((w) => getWorkspaceData(w.id, key));
}

export function workspaceOfTab(tabId) {
  return current.tabs.find((t) => t.id === tabId)?.workspaceId ?? null;
}

/** What initWorkspaces loaded: { workspaces, tabs, activeTabId, activeWorkspaceId }. */
export function getSavedWorkspaces() {
  return saved;
}

function saveIfChanged(rel, doc) {
  const json = JSON.stringify(doc);
  if (lastWritten.get(rel) === json) return;
  lastWritten.set(rel, json);
  save(rel, doc, { debounce: 300 }).catch((error) => console.warn(`Failed to write ${rel}:`, error));
}

/** Delete workspaces/<id>/ and everything in it. Call after the workspace left the state. */
export async function deleteWorkspaceFolder(id) {
  extras.delete(id);
  lastWritten.delete(wsFile(id));
  await remove(wsFile(id)); // drops a pending save that would recreate the folder
  await remove(`workspaces/${id}`);
}

/** Write the index and every workspace's file. Removing a folder is deleteWorkspaceFolder's job. */
export function saveWorkspaces(state) {
  const { workspaces, tabs, activeWorkspaceId } = state;
  current = state;
  for (const w of workspaces) {
    const own = tabs.filter((t) => t.workspaceId === w.id).map(({ workspaceId, ...t }) => t);
    const ids = new Set(own.map((t) => t.id));
    // Sessions of closed tabs are dropped here.
    const terminalSessions = Object.fromEntries(Object.entries(getWorkspaceData(w.id, 'terminalSessions')).filter(([tabId]) => ids.has(tabId)));
    saveIfChanged(wsFile(w.id), {
      ...w,
      tabs: own,
      pins: getWorkspaceData(w.id, 'pins'),
      budgets: getWorkspaceData(w.id, 'budgets'),
      terminalSessions,
      overrides: getWorkspaceData(w.id, 'overrides'),
    });
  }
  saveIfChanged(INDEX, { workspaces: workspaces.map((w) => w.id), activeWorkspaceId });
}
