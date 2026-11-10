import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createEmitter } from '../../lib/createStore';
import { isAbsolute, pathSegments } from '../../utils/pathUtils';

// Each tab's feature context: `selected` (feature id shown in the explorer and
// tree) and `pinned` ([{ id, name, files }], sent as FEATURE lines). Module
// state, like linked repos, so the FEATURES tab and context pane can share it.
// `marked` is the file list the tree marks (the selected feature's), or null.

const EMPTY = { selected: null, pinned: [], marked: null };
const byTab = new Map(); // tabId -> { selected, pinned, marked }
const { subscribe, emit } = createEmitter();

function update(tabId, patch) {
  const next = { ...getTabFeatures(tabId), ...patch };
  if (next.selected || next.pinned.length || next.marked) byTab.set(tabId, next);
  else byTab.delete(tabId);
  emit();
}

export function getTabFeatures(tabId) {
  return byTab.get(tabId) || EMPTY;
}

// A new selection drops the tree marks; the open FEATURES pane re-marks it.
export function selectFeature(tabId, id) {
  const selected = id ?? null;
  if (selected !== getTabFeatures(tabId).selected) update(tabId, { selected, marked: null });
}

/** Marks these project-relative files in the tab's tree (null clears). */
export function markFeatureInTree(tabId, files) {
  update(tabId, { marked: files || null });
}

/** Tree marks for project-relative files: absolute folder path -> feature files under it, and the file set. */
export function treeMarks(projectPath, files) {
  const root = projectPath.replace(/\/+$/, '');
  const folders = new Map();
  const fileSet = new Set();
  for (const rel of files) {
    const parts = pathSegments(rel);
    fileSet.add(`${root}/${parts.join('/')}`);
    for (let i = 1; i < parts.length; i++) {
      const dir = `${root}/${parts.slice(0, i).join('/')}`;
      folders.set(dir, (folders.get(dir) || 0) + 1);
    }
  }
  return { folders, files: fileSet };
}

/**
 * Pins a map feature; only its files that exist under projectPath are kept.
 * shortcut: existence is checked at pin time, so a file deleted afterwards is
 * still sent; re-check on send if that ever matters.
 */
export async function pinFeature(tabId, projectPath, feature) {
  const rel = (Array.isArray(feature.files) ? feature.files : [])
    .filter((p) => typeof p === 'string' && !isAbsolute(p) && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..'));
  const found = await Promise.all(rel.map((p) => invoke('path_exists', { path: `${projectPath}/${p}` }).catch(() => false)));
  const pinned = getTabFeatures(tabId).pinned.filter((f) => f.id !== feature.id);
  update(tabId, { pinned: [...pinned, { id: feature.id, name: String(feature.name || feature.id), files: rel.filter((_, i) => found[i]) }] });
}

/** Pins the feature, or unpins it if it is already pinned. */
export function togglePinFeature(tabId, projectPath, feature) {
  if (!getTabFeatures(tabId).pinned.some((f) => f.id === feature.id)) return pinFeature(tabId, projectPath, feature);
  unpinFeature(tabId, feature.id);
  return Promise.resolve();
}

export function unpinFeature(tabId, id) {
  update(tabId, { pinned: getTabFeatures(tabId).pinned.filter((f) => f.id !== id) });
}

export function clearTabFeatures(tabId) {
  if (byTab.has(tabId)) { byTab.delete(tabId); emit(); }
}

export function useTabFeatures(tabId) {
  const getSnapshot = useCallback(() => getTabFeatures(tabId), [tabId]);
  const { selected, pinned, marked } = useSyncExternalStore(subscribe, getSnapshot);
  const clear = useCallback(() => clearTabFeatures(tabId), [tabId]);
  return useMemo(
    () => ({ selectedFeature: selected, pinnedFeatures: pinned, markedFiles: marked, clearFeatures: clear }),
    [selected, pinned, marked, clear],
  );
}
