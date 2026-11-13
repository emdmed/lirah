import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { planFilesDir } from '../plans/planModel';
import { slugify } from '../plans/planPrompts';

// The tabs in planning mode, and the draft folder each one has open (kept
// while the mode is off, so coming back shows the same draft). Module-level,
// like the Zen drawers, so the plans pane, the palette and `lirah plans draft`
// can switch a tab into it. Not saved: a restart opens tabs on the terminal.
let tabs = new Set();
const folders = new Map();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function setPlanningMode(tabId, on) {
  if (tabs.has(tabId) === on) return;
  tabs = new Set(tabs);
  if (on) tabs.add(tabId);
  else tabs.delete(tabId);
  emit();
}

export const isPlanningMode = (tabId) => tabs.has(tabId);

export const togglePlanningMode = (tabId) => setPlanningMode(tabId, !tabs.has(tabId));

export function setPlanningFolder(tabId, folder) {
  folders.set(tabId, folder);
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePlanningMode(tabId) {
  return useSyncExternalStore(subscribe, () => tabs.has(tabId));
}

export function usePlanningFolder(tabId) {
  return useSyncExternalStore(subscribe, () => folders.get(tabId) ?? null);
}

// Beside the .md parts (the join reads only .md): the repo the draft is for, null when started from the workspace terminal.
export const DRAFT_META = '.draft.json';

/** The repo a draft folder was started for, or null (none recorded). */
export async function draftRepo(folder) {
  try {
    return JSON.parse(await invoke('read_file_content', { path: `${folder}/${DRAFT_META}` })).repo || null;
  } catch {
    return null;
  }
}

/**
 * Opens a draft folder named after `title` in the tab's planning mode, first
 * writing its plan.md (the title, which the joined plan is named after) and
 * the repo it is for. An existing draft of that name is opened, never
 * overwritten. Returns its path.
 */
export async function startDraft(tabId, title, repo = null) {
  const name = title.trim();
  if (!name) throw new Error('A draft needs a title');
  const path = `${planFilesDir(await invoke('get_home_dir'), Date.now())}/${slugify(name).replace(/-/g, '_') || 'draft'}_plan`;
  const existing = await invoke('read_directory', { path }).catch(() => []);
  if (existing.length === 0) {
    await invoke('write_file_content', { path: `${path}/plan.md`, content: `# ${name}\n` });
    await invoke('write_file_content', { path: `${path}/${DRAFT_META}`, content: `${JSON.stringify({ repo })}\n` });
  }
  openDraft(tabId, path);
  return path;
}

/** Shows the draft folder `path` in the tab's planning mode. */
export function openDraft(tabId, path) {
  setPlanningFolder(tabId, path);
  setPlanningMode(tabId, true);
}

// Parts sent to the agent and not written yet, per draft folder, so the row
// lights at once instead of when the file lands; and the mockup choice per draft.
const sent = new Map();
const mockups = new Map();

export function markPartSent(folder, part) {
  sent.set(folder, new Set([...(sent.get(folder) || []), part]));
  emit();
}

/** Drops the parts whose file now exists from the sent set. */
export function settleSentParts(folder, written) {
  const parts = sent.get(folder);
  if (!parts || ![...parts].some((p) => written.includes(p))) return;
  sent.set(folder, new Set([...parts].filter((p) => !written.includes(p))));
  emit();
}

const NONE = new Set();
export const useSentParts = (folder) => useSyncExternalStore(subscribe, () => sent.get(folder) || NONE);

export const setDraftMockup = (folder, on) => { mockups.set(folder, on); emit(); };
export const useDraftMockup = (folder) => useSyncExternalStore(subscribe, () => mockups.get(folder) ?? true);
