import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { basename } from '../../utils/pathUtils';
import { hash8 } from '../../lib/ids';
import { lirahDir } from '../../lib/lirahPaths';
import { normalizeLoadedPlan } from './planModel';

// The plans state and its file: ~/.lirah/plans/<repo>-<hash>/plans.json, one
// per repo, loaded on first use and written back debounced.

const PERSIST_DEBOUNCE = 400;

function storePath(home, repoRoot) {
  const name = basename(repoRoot, 'repo');
  return `${lirahDir(home)}/plans/${name}-${hash8(repoRoot)}/plans.json`;
}

/**
 * `onLoad(repoRoot, plans)` runs once a repo's plans are read, e.g. to check
 * chunks that finished while the app was closed.
 */
export function usePlanStore({ onLoad } = {}) {
  const [plansByRepo, setPlansByRepo] = useState({}); // repoRoot -> plan[]
  const stateRef = useRef(plansByRepo);
  stateRef.current = plansByRepo;
  const homeRef = useRef(null);
  const loadingRef = useRef(new Map()); // repoRoot -> Promise
  const dirtyRef = useRef(new Set());
  const saveTimer = useRef(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  const getHome = useCallback(async () => {
    if (!homeRef.current) homeRef.current = await invoke('get_home_dir');
    return homeRef.current;
  }, []);

  const flush = useCallback(async () => {
    saveTimer.current = null;
    const repos = [...dirtyRef.current];
    dirtyRef.current.clear();
    const home = await getHome();
    for (const repoRoot of repos) {
      const plans = stateRef.current[repoRoot];
      if (!plans) continue;
      try {
        await invoke('write_file_content', {
          path: storePath(home, repoRoot),
          content: JSON.stringify({ version: 1, repoRoot, plans }, null, 2),
        });
      } catch (e) {
        console.error('Failed to save plans:', e);
      }
    }
  }, [getHome]);

  // Writes are debounced, after the render that holds the new state.
  useEffect(() => {
    if (dirtyRef.current.size === 0 || saveTimer.current) return;
    saveTimer.current = setTimeout(flush, PERSIST_DEBOUNCE);
  }, [plansByRepo, flush]);

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      flush();
    }
  }, [flush]);

  const loadRepo = useCallback((repoRoot) => {
    if (!repoRoot) return Promise.resolve();
    if (stateRef.current[repoRoot]) return Promise.resolve();
    const pending = loadingRef.current.get(repoRoot);
    if (pending) return pending;
    const promise = (async () => {
      let plans = [];
      try {
        const raw = await invoke('read_file_content', { path: storePath(await getHome(), repoRoot) });
        plans = JSON.parse(raw)?.plans || [];
      } catch {
        // No plans for this repo yet.
      }
      plans = plans.map(normalizeLoadedPlan);
      setPlansByRepo((prev) => (prev[repoRoot] ? prev : { ...prev, [repoRoot]: plans }));
      stateRef.current = { ...stateRef.current, [repoRoot]: stateRef.current[repoRoot] || plans };
      onLoadRef.current?.(repoRoot, plans);
    })().finally(() => loadingRef.current.delete(repoRoot));
    loadingRef.current.set(repoRoot, promise);
    return promise;
  }, [getHome]);

  // The ref is updated at once, not on the next render, so a chain of awaits
  // (auto-pilot: check a chunk, then pick the next) reads its own writes.
  const mutate = useCallback((repoRoot, fn) => {
    dirtyRef.current.add(repoRoot);
    const next = { ...stateRef.current, [repoRoot]: fn(stateRef.current[repoRoot] || []) };
    stateRef.current = next;
    setPlansByRepo(next);
  }, []);

  const updatePlan = useCallback((repoRoot, planId, patch) => {
    mutate(repoRoot, (plans) =>
      plans.map((p) => {
        if (p.id !== planId) return p;
        const next = typeof patch === 'function' ? patch(p) : patch;
        return { ...p, ...next, updatedAt: Date.now() };
      })
    );
  }, [mutate]);

  const updateChunk = useCallback((repoRoot, planId, chunkId, patch) => {
    updatePlan(repoRoot, planId, (p) => ({
      chunks: p.chunks.map((c) => (c.id === chunkId ? { ...c, ...patch } : c)),
    }));
  }, [updatePlan]);

  // Lookups read the ref, so they see writes made earlier in the same chain.
  const findPlan = useCallback((repoRoot, planId) => stateRef.current[repoRoot]?.find((p) => p.id === planId), []);

  const findChunk = useCallback((repoRoot, planId, chunkId) => {
    const plan = findPlan(repoRoot, planId);
    return { plan, chunk: plan?.chunks.find((c) => c.id === chunkId) };
  }, [findPlan]);

  return {
    plansByRepo, stateRef, getHome, loadRepo, mutate, updatePlan, updateChunk, findPlan, findChunk,
  };
}
