import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { list, load, onExternalChange, remove, save } from '../../lib/fileStore';
import { getSavedWorkspaces } from '../../lib/workspaceStore';
import { normalizeLoadedPlan } from './planModel';

// The plans state and its files: one ~/.lirah/workspaces/<id>/plans/<plan-id>/plan.json
// per plan, in the folder of the workspace it was made in (plan.workspaceId).
// The folder listing is the index. In memory plans are grouped by repo root.

const PERSIST_DEBOUNCE = 400;

const plansDir = (ws) => `workspaces/${ws}/plans`;
const planFile = (ws, id) => `${plansDir(ws)}/${id}/plan.json`;

// Every saved workspace's plans, grouped by repoRoot.
async function loadAllPlans() {
  const byRepo = new Map();
  for (const { id: ws } of getSavedWorkspaces().workspaces) {
    const ids = await list(plansDir(ws)).catch(() => []);
    const docs = await Promise.all(ids.map((id) => load(planFile(ws, id)).catch((e) => {
      console.error(`Failed to read plan ${planFile(ws, id)}:`, e);
      return null;
    })));
    for (const doc of docs) {
      if (!doc?.repoRoot) continue;
      const { version, revision, ...plan } = doc;
      byRepo.set(plan.repoRoot, [...(byRepo.get(plan.repoRoot) ?? []), { ...plan, workspaceId: ws }]);
    }
  }
  for (const plans of byRepo.values()) plans.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return byRepo;
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
  const allRef = useRef(null); // Promise of loadAllPlans()
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  const getHome = useCallback(async () => {
    if (!homeRef.current) homeRef.current = await invoke('get_home_dir');
    return homeRef.current;
  }, []);

  const loadRepo = useCallback(async (repoRoot) => {
    if (!repoRoot || stateRef.current[repoRoot]) return;
    allRef.current ??= loadAllPlans().catch((e) => {
      console.error('Failed to load plans:', e);
      return new Map();
    });
    const all = await allRef.current;
    if (stateRef.current[repoRoot]) return;
    const plans = (all.get(repoRoot) ?? []).map(normalizeLoadedPlan);
    stateRef.current = { ...stateRef.current, [repoRoot]: plans };
    setPlansByRepo(stateRef.current);
    onLoadRef.current?.(repoRoot, plans);
  }, []);

  // A plan changed on disk (`lirah plans import/revise/done`): swap it into its
  // repo's list if that repo is loaded, and run onLoad for its queued work.
  useEffect(() => onExternalChange(
    (rel) => /^workspaces\/[^/]+\/plans\/[^/]+\/plan\.json$/.test(rel),
    (doc, rel) => {
      const [, ws, , id] = rel.split('/');
      const { version, revision, ...raw } = doc ?? {};
      // Not normalizeLoadedPlan: that is for startup (it fails running splits, pauses autopilot).
      const plan = doc?.repoRoot ? { ...raw, workspaceId: ws } : null;
      const roots = Object.keys(stateRef.current).filter((root) =>
        root === plan?.repoRoot || stateRef.current[root].some((p) => p.id === id));
      if (!roots.length) return;
      stateRef.current = {
        ...stateRef.current,
        ...Object.fromEntries(roots.map((root) => {
          const rest = stateRef.current[root].filter((p) => p.id !== id);
          return [root, root === plan?.repoRoot ? [plan, ...rest].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)) : rest];
        })),
      };
      setPlansByRepo(stateRef.current);
      if (plan && stateRef.current[plan.repoRoot]) onLoadRef.current?.(plan.repoRoot, [plan]);
    },
  ), []);

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
      save(planFile(plan.workspaceId, plan.id), plan, { debounce: PERSIST_DEBOUNCE })
        .catch((e) => console.error('Failed to save plan:', e));
    }
    const kept = new Set(next.map((p) => p.id));
    for (const plan of prev) {
      if (kept.has(plan.id)) continue;
      remove(`${plansDir(plan.workspaceId)}/${plan.id}`).catch((e) => console.error('Failed to delete plan folder:', e));
    }
  }, []);

  // Plans of deleted workspaces leave the state (their folder is gone already), so nothing saves them again.
  const keepWorkspaces = useCallback((ids) => {
    const live = new Set(ids);
    const entries = Object.entries(stateRef.current);
    if (entries.every(([, plans]) => plans.every((p) => live.has(p.workspaceId)))) return;
    stateRef.current = Object.fromEntries(entries.map(([root, plans]) => [root, plans.filter((p) => live.has(p.workspaceId))]));
    setPlansByRepo(stateRef.current);
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
    plansByRepo, stateRef, getHome, loadRepo, mutate, keepWorkspaces, updatePlan, updateChunk, findPlan, findChunk,
  };
}
