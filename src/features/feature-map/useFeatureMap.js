import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { buildFeatureMapPrompt, buildFeatureMapUpdatePrompt } from '../compact/featureMapPrompt';

// One build per project, shared by every caller (the FEATURES tab, the palette).
const building = new Set();
const buildErrors = new Map();
const listeners = new Set();
let version = 0;
const MIN_BUILDING_MS = 700;
const notify = () => { version += 1; listeners.forEach((f) => f()); };
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

/** Starts a map build; throws if one is already running for this project. Resolves to the Rust summary. */
export function buildFeatureMap(projectDir, rebuild = false) {
  if (building.has(projectDir)) throw new Error('the feature map is already being built');
  building.add(projectDir);
  buildErrors.delete(projectDir);
  notify();
  const updatePrompt = rebuild ? null : buildFeatureMapUpdatePrompt();
  // An update with no new files skips the model and ends in milliseconds; hold the building line long enough to see.
  const minHold = new Promise((r) => setTimeout(r, MIN_BUILDING_MS));
  return Promise.all([invoke('build_feature_map', { projectDir, prompt: buildFeatureMapPrompt(), updatePrompt }), minHold])
    .then(([summary]) => summary)
    .catch((e) => { buildErrors.set(projectDir, String(e)); throw e; })
    .finally(() => { building.delete(projectDir); notify(); });
}

export function featureMapStatus({ map, commitsBehind, newFiles, missingFiles }, isBuilding, error) {
  if (isBuilding) return 'building';
  if (error) return 'failed';
  if (!map) return 'none';
  if (map.gitSha && commitsBehind == null) return 'stale'; // build commit unreachable (rebased, branch deleted)
  return commitsBehind > 0 || newFiles > 0 || missingFiles > 0 ? 'stale' : 'fresh';
}

/** The project's feature map and its build state: { map, head, commitsBehind, newFiles, missingFiles, status, error, build(rebuild), reload() }. */
export function useFeatureMap(projectPath) {
  const [data, setData] = useState({ map: null, head: null, commitsBehind: null, newFiles: null, missingFiles: null });
  const [loadError, setLoadError] = useState(null);
  const [nonce, setNonce] = useState(0);
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
  }, [projectPath, isBuilding, v, nonce]);

  // Commits, checkouts, pulls and new files all move the freshness counts.
  useEffect(() => {
    let unlisten = null;
    let cancelled = false;
    // Payload is the watched folder: this project or a folder inside it. Skip other projects.
    const onEvent = ({ payload }) => {
      if (projectPath && typeof payload === 'string' && !relatedPaths(payload, projectPath)) return;
      setNonce((n) => n + 1);
    };
    listen('git-stats-changed', onEvent).then((fn) => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; unlisten?.(); };
  }, [projectPath]);

  const error = buildError ?? loadError;
  const build = useCallback((rebuild) => buildFeatureMap(projectPath, rebuild), [projectPath]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // Stable between renders so memoized consumers (FeaturesPane) skip unrelated re-renders.
  return useMemo(
    () => ({ ...data, status: featureMapStatus(data, isBuilding, error), error, build, reload }),
    [data, isBuilding, error, build, reload],
  );
}

/** True when one path is the other or contains it. */
export function relatedPaths(a, b) {
  const norm = (p) => p.replace(/[\\/]+$/, '');
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`) || x.startsWith(`${y}\\`) || y.startsWith(`${x}\\`);
}
