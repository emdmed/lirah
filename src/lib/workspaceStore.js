// Workspaces and their tabs, persisted under ~/.lirah/workspaces:
//   index.json            { workspaces: [id, ...], activeWorkspaceId }
//   <id>/workspace.json   { id, name, activeTabId, tabs: [...] }
// The old localStorage keys only seed a missing index and are left as a backup.
import { load, save } from './fileStore';
import { loadJson, loadText } from './storage';

const INDEX = 'workspaces/index.json';
const wsFile = (id) => `workspaces/${id}/workspace.json`;
const OLD_TABS = 'nevo-terminal:tabs';
const OLD_WORKSPACES = 'nevo-terminal:workspaces';

let saved = { workspaces: [], tabs: [], activeTabId: null, activeWorkspaceId: null };
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
  const workspaces = docs.map(({ version, revision, tabs, ...w }) => w);
  const tabs = docs.flatMap((d) => (Array.isArray(d.tabs) ? d.tabs : []).map((t) => ({ ...t, workspaceId: d.id })));
  const active = workspaces.find((w) => w.id === index.activeWorkspaceId);
  const activeTabId = active?.activeTabId ?? tabs.find((t) => t.workspaceId === active?.id)?.id ?? null;
  return { workspaces, tabs, activeTabId, activeWorkspaceId: index.activeWorkspaceId ?? null };
}

/** Load workspaces before render; migrates from localStorage when there is no index yet. */
export async function initWorkspaces() {
  try {
    const index = await load(INDEX);
    if (index) {
      saved = await fromFiles(index);
      return;
    }
    saved = fromLocalStorage();
    saveWorkspaces(saved);
  } catch (error) {
    console.warn(`Failed to load ${INDEX}, using localStorage:`, error);
    saved = fromLocalStorage();
  }
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

/** Write the index and every workspace's file. Workspaces dropped from the index keep their folder. */
export function saveWorkspaces({ workspaces, tabs, activeWorkspaceId }) {
  for (const w of workspaces) {
    const own = tabs.filter((t) => t.workspaceId === w.id).map(({ workspaceId, ...t }) => t);
    saveIfChanged(wsFile(w.id), { ...w, tabs: own });
  }
  saveIfChanged(INDEX, { workspaces: workspaces.map((w) => w.id), activeWorkspaceId });
}
