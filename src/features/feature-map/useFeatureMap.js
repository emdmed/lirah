import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { buildFeatureMapPrompt, buildFeatureMapUpdatePrompt } from '../compact/featureMapPrompt';

// One build per project, shared by every caller (the FEATURES tab, the palette).
const building = new Set();
const buildErrors = new Map();
const listeners = new Set();
let version = 0;
const notify = () => { version += 1; listeners.forEach((f) => f()); };
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

/** Starts a map build; throws if one is already running for this project. Resolves to the Rust summary. */
export function buildFeatureMap(projectDir, rebuild = false) {
  if (building.has(projectDir)) throw new Error('the feature map is already being built');
  building.add(projectDir);
  buildErrors.delete(projectDir);
  notify();
  const updatePrompt = rebuild ? null : buildFeatureMapUpdatePrompt();
  return invoke('build_feature_map', { projectDir, prompt: buildFeatureMapPrompt(), updatePrompt })
    .catch((e) => { buildErrors.set(projectDir, String(e)); throw e; })
    .finally(() => { building.delete(projectDir); notify(); });
}

export function featureMapStatus({ map, commitsBehind, newFiles }, isBuilding, error) {
  if (isBuilding) return 'building';
  if (error) return 'failed';
  if (!map) return 'none';
  return commitsBehind > 0 || newFiles > 0 ? 'stale' : 'fresh';
}

/** The project's feature map and its build state: { map, head, commitsBehind, newFiles, status, error, build(rebuild) }. */
export function useFeatureMap(projectPath) {
  const [data, setData] = useState({ map: null, head: null, commitsBehind: null, newFiles: null });
  const [loadError, setLoadError] = useState(null);
  const v = useSyncExternalStore(subscribe, () => version);
  const isBuilding = building.has(projectPath);
  const buildError = buildErrors.get(projectPath) ?? null;

  // Reloads on mount and after every build ends (v changes when a build starts or stops).
  useEffect(() => {
    if (!projectPath || isBuilding) return undefined;
    let live = true;
    invoke('read_feature_map', { projectDir: projectPath })
      .then((d) => { if (live) { setData(d); setLoadError(null); } })
      .catch((e) => { if (live) setLoadError(String(e)); });
    return () => { live = false; };
  }, [projectPath, isBuilding, v]);

  const error = buildError ?? loadError;
  const build = useCallback((rebuild) => buildFeatureMap(projectPath, rebuild), [projectPath]);
  return { ...data, status: featureMapStatus(data, isBuilding, error), error, build };
}
