import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createEmitter } from '../../lib/createStore';

// Each tab's feature context: `selected` (feature id shown in the explorer and
// tree) and `pinned` ([{ id, name, files }], sent as FEATURE lines). Module
// state, like linked repos, so the FEATURES tab and context pane can share it.

const EMPTY = { selected: null, pinned: [] };
const byTab = new Map(); // tabId -> { selected, pinned }
const { subscribe, emit } = createEmitter();

function update(tabId, patch) {
  const next = { ...getTabFeatures(tabId), ...patch };
  if (next.selected || next.pinned.length) byTab.set(tabId, next);
  else byTab.delete(tabId);
  emit();
}

export function getTabFeatures(tabId) {
  return byTab.get(tabId) || EMPTY;
}

export function selectFeature(tabId, id) {
  update(tabId, { selected: id ?? null });
}

/**
 * Pins a map feature; only its files that exist under projectPath are kept.
 * shortcut: existence is checked at pin time, so a file deleted afterwards is
 * still sent; re-check on send if that ever matters.
 */
export async function pinFeature(tabId, projectPath, feature) {
  const rel = (Array.isArray(feature.files) ? feature.files : [])
    .filter((p) => typeof p === 'string' && !p.startsWith('/') && !/^[a-zA-Z]:/.test(p) && !p.split(/[\\/]/).includes('..'));
  const found = await Promise.all(rel.map((p) => invoke('path_exists', { path: `${projectPath}/${p}` }).catch(() => false)));
  const pinned = getTabFeatures(tabId).pinned.filter((f) => f.id !== feature.id);
  update(tabId, { pinned: [...pinned, { id: feature.id, name: String(feature.name || feature.id), files: rel.filter((_, i) => found[i]) }] });
}

export function unpinFeature(tabId, id) {
  update(tabId, { pinned: getTabFeatures(tabId).pinned.filter((f) => f.id !== id) });
}

export function clearTabFeatures(tabId) {
  if (byTab.has(tabId)) { byTab.delete(tabId); emit(); }
}

export function useTabFeatures(tabId) {
  const getSnapshot = useCallback(() => getTabFeatures(tabId), [tabId]);
  const { selected, pinned } = useSyncExternalStore(subscribe, getSnapshot);
  const clear = useCallback(() => clearTabFeatures(tabId), [tabId]);
  return useMemo(() => ({ selectedFeature: selected, pinnedFeatures: pinned, clearFeatures: clear }), [selected, pinned, clear]);
}
