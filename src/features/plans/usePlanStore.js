import { useCallback, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { repoFiles } from '../../lib/fileStore';
import { normalizeLoadedPlan } from './planModel';

// The plans state and its files: one <repoRoot>/lirah/plans/<plan-id>/plan.json
// per plan, in the repo it belongs to (plan.repoRoot). The folder listing is the
// index. In memory plans are grouped by repo root.

const PERSIST_DEBOUNCE = 400;

// The repoFiles base; equal to what watch_repo_plans returns and its events carry.
export const plansBase = (repoRoot) => `${repoRoot}/lirah/plans`;
const planFile = (id) => `${id}/plan.json`;
const byNewest = (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0);

// A repo's plans; folders without a plan.json (and .md, .gitignore) are skipped.
async function loadRepoPlans(repoRoot) {
  const files = repoFiles(plansBase(repoRoot));
  // The store rejects an empty rel, so list from the repo root. Plan ids have no dot; files do.
  const names = (await repoFiles(repoRoot).list('lirah/plans').catch(() => [])).filter((n) => !n.includes('.'));
  const docs = await Promise.all(names.map((id) => files.load(planFile(id), null).catch((e) => {
    console.error(`Failed to read plan ${plansBase(repoRoot)}/${planFile(id)}:`, e);
    return null;
  })));
  return docs.filter((doc) => doc?.repoRoot).map(({ version, revision, ...plan }) => plan).sort(byNewest);
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
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  const getHome = useCallback(async () => {
    if (!homeRef.current) homeRef.current = await invoke('get_home_dir');
    return homeRef.current;
  }, []);

  const loadRepo = useCallback(async (repoRoot) => {
    if (!repoRoot || stateRef.current[repoRoot]) return;
    // Creates the folder (saves need it) and reports CLI edits to it.
    await invoke('watch_repo_plans', { repoRoot }).catch((e) => console.error(`Failed to watch plans of ${repoRoot}:`, e));
    const plans = (await loadRepoPlans(repoRoot).catch((e) => {
      console.error(`Failed to load plans of ${repoRoot}:`, e);
      return [];
    })).map(normalizeLoadedPlan);
    if (stateRef.current[repoRoot]) return;
    stateRef.current = { ...stateRef.current, [repoRoot]: plans };
    setPlansByRepo(stateRef.current);
    onLoadRef.current?.(repoRoot, plans);
    // A plan changed on disk (`lirah plans import/revise/done`): swap it into
    // the loaded repos, and run onLoad for its queued work.
    repoFiles(plansBase(repoRoot)).onExternalChange(
      (rel) => /^[^/]+\/plan\.json$/.test(rel),
      (doc, rel) => {
        const [id] = rel.split('/');
        const { version, revision, ...raw } = doc ?? {};
        // Not normalizeLoadedPlan: that is for startup (it fails running splits, pauses autopilot).
        const plan = doc?.repoRoot ? raw : null;
        const roots = Object.keys(stateRef.current).filter((root) =>
          root === plan?.repoRoot || stateRef.current[root].some((p) => p.id === id));
        if (!roots.length) return;
        stateRef.current = {
          ...stateRef.current,
          ...Object.fromEntries(roots.map((root) => {
            const rest = stateRef.current[root].filter((p) => p.id !== id);
            return [root, root === plan?.repoRoot ? [plan, ...rest].sort(byNewest) : rest];
          })),
        };
        setPlansByRepo(stateRef.current);
        if (plan && stateRef.current[plan.repoRoot]) onLoadRef.current?.(plan.repoRoot, [plan]);
      },
    );
  }, []);

  // Changed plans are saved (debounced per file); removed plans lose their folder.
  // The ref is updated at once, not on the next render, so a chain of awaits
  // (auto-pilot: check a chunk, then pick the next) reads its own writes.
  const mutate = useCallback((repoRoot, fn) => {
    const prev = stateRef.current[repoRoot] || [];
    const next = fn(prev);
    stateRef.current = { ...stateRef.current, [repoRoot]: next };
    setPlansByRepo(stateRef.current);
    const was = new Map(prev.map((p) => [p.id, p]));
    for (const plan of next) {
      if (was.get(plan.id) === plan) continue;
      repoFiles(plansBase(plan.repoRoot)).save(planFile(plan.id), plan, { debounce: PERSIST_DEBOUNCE })
        .catch((e) => console.error('Failed to save plan:', e));
    }
    const kept = new Set(next.map((p) => p.id));
    for (const plan of prev) {
      if (kept.has(plan.id)) continue;
      repoFiles(plansBase(plan.repoRoot)).remove(plan.id).catch((e) => console.error('Failed to delete plan folder:', e));
    }
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
