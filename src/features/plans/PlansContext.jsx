import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { errorMessage } from '../../lib/errorMessage';
import { basename } from '../../utils/pathUtils';
import { invoke } from '@tauri-apps/api/core';
import { currentBranch, repoTop } from '../../lib/git';
import { shortId } from '../../lib/ids';
import {
  AUTOPILOT_STATUS, CHUNK_STATUS, defaultGitConfig, newChunks, renumber, runRank, SPLIT_STATUS, toImplemented, toInProgress,
  toRolledBack, UNTITLED_PLAN,
} from './planModel';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { getTabPrompt } from '../tabs/tabPrompts';
import { usePlanStore } from './usePlanStore';
import { useAutopilot } from './useAutopilot';
import {
  captureBaseShas, chunkCommits, commitChunk as commitChunkChanges, commitDecisions, rollbackChunk as revertChunk, strayCommits,
} from './planGitOps';
import {
  chunkBases, cleanupGit, defaultBranch, planGit, prepareGit, withRepos,
} from './planGit';
import {
  buildChunkPrompt,
  buildFixPrompt,
  buildPlanFixPrompt,
  buildSplitPrompt,
  markdownTitle,
  parseSplitResult,
  slugify,
} from './planPrompts';

// Plans live in ~/.lirah/plans/<repo>-<hash>/plans.json, one file per repo,
// never inside the repo itself. Chunks are implemented by the tab's live agent,
// one commit each (found again by its Plan-Chunk trailer), so review is that
// commit's diff and rollback is `git revert`.
//
// A plan's git settings (plan.git, see planGit.js) can add more repos, a
// branch for the plan and worktrees; chunks are then checked, committed and
// rolled back in every repo, each keyed by its root. A chunk's commits in an
// open tab's repo the plan doesn't list are found too, and that repo joins it.
//
// A chunk that needs no commit (a check, a test run) is done when the agent
// says so with a PLAN-STATUS: done line, or when you mark it done.
//
// Auto-pilot, which chains the chunks in one tab, lives in useAutopilot.js.
// With plan.clearBetweenChunks it clears the agent's context before each
// chunk after the first, so a chunk knows earlier ones only from its prompt
// (their titles and Decision: lines) and the code.

const PlansActionsContext = createContext(null);
const PlansStateContext = createContext(null);

export function PlansProvider({ children }) {
  const {
    plansByRepo, stateRef, getHome, loadRepo, mutate, updatePlan, updateChunk, findPlan, findChunk,
  } = usePlanStore({
    // Chunks that finished while the app was closed.
    onLoad: (repoRoot, plans) => {
      for (const plan of plans) {
        for (const chunk of plan.chunks) {
          if (chunk.status === CHUNK_STATUS.IN_PROGRESS || chunk.awaitingFix) checkChunk(repoRoot, plan.id, chunk.id);
        }
      }
    },
  });
  const checkingRef = useRef(new Set()); // chunk ids being checked
  const toast = useToast();
  const { tabs, switchTab } = useTabManager();
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const tabRootsRef = useRef(new Map()); // tab folder -> repo root; misses aren't kept

  // The repos of the open tabs, where an agent may commit outside the plan's repos.
  const tabRepoRoots = useCallback(async () => {
    const cache = tabRootsRef.current;
    const paths = [...new Set(tabsRef.current.map((t) => t.projectPath).filter(Boolean))];
    await Promise.all(paths.filter((p) => !cache.has(p)).map(async (p) => {
      const root = await repoTop(p).catch(() => null);
      if (root) cache.set(p, root);
    }));
    return paths.map((p) => cache.get(p)).filter(Boolean);
  }, []);

  // Look for the chunk's commits since it was started. Found → implemented;
  // not found while in progress → the agent stopped without committing.
  const checkChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    const bases = plan && chunk ? chunkBases(plan, chunk) : {};
    if (!plan || Object.keys(bases).length === 0 || checkingRef.current.has(chunkId)) return { found: false };
    checkingRef.current.add(chunkId);
    try {
      const commitsByRepo = await chunkCommits(plan, chunk);
      const strays = await strayCommits(plan, chunk, await tabRepoRoots());
      const strayBases = {};
      for (const [root, { shas, base }] of Object.entries(strays)) {
        commitsByRepo[root] = shas;
        if (base) strayBases[root] = base;
      }
      const commits = Object.values(commitsByRepo).flat();
      if (commits.length > 0) {
        // Only commits not read before (a fix commit on an implemented chunk):
        // decisions you edited in the row stay as you left them.
        const seen = new Set(chunk.status === CHUNK_STATUS.IMPLEMENTED ? chunk.commits ?? [] : []);
        const fresh = Object.fromEntries(Object.entries(commitsByRepo)
          .map(([root, shas]) => [root, shas.filter((sha) => !seen.has(sha))]));
        const found = await commitDecisions(plan, fresh);
        const strayRoots = Object.keys(strays);
        updatePlan(repoRoot, planId, (p) => ({
          // Repos the agent committed in join the plan: later chunks are checked, reviewed and rolled back there too.
          ...(strayRoots.length > 0 && { git: withRepos(planGit(p), strayRoots) }),
          chunks: p.chunks.map((c) => (c.id !== chunkId ? c : {
            ...c,
            ...toImplemented(c, {
              commits,
              commitsByRepo,
              decisions: seen.size > 0
                ? [...(c.decisions ?? []), ...found.filter((d) => !c.decisions?.includes(d))]
                : found,
            }),
            baseShas: { ...chunkBases(p, c), ...strayBases },
          })),
        }));
        return { found: true, commits };
      }
      // Read fresh: the chunk may have been marked done while git ran.
      updatePlan(repoRoot, planId, (p) => ({
        chunks: p.chunks.map((c) => (c.id !== chunkId ? c : {
          ...c, needsCommit: c.status === CHUNK_STATUS.IN_PROGRESS, awaitingFix: false,
        })),
      }));
      return { found: false };
    } catch (e) {
      console.error('Plan chunk check failed:', e);
      return { found: false, error: String(e) };
    } finally {
      checkingRef.current.delete(chunkId);
    }
  }, [findChunk, updatePlan, tabRepoRoots]);

  // An in-progress chunk done with nothing to commit; `result` is what the
  // agent said it did, `decisions` the Decision: lines of its reply. Commits
  // found first win.
  const markChunkDone = useCallback(async (repoRoot, planId, chunkId, result = null, decisions = []) => {
    const res = await checkChunk(repoRoot, planId, chunkId);
    if (res.found || res.error) return res;
    const { chunk } = findChunk(repoRoot, planId, chunkId);
    if (chunk?.status !== CHUNK_STATUS.IN_PROGRESS) return res;
    updateChunk(repoRoot, planId, chunkId, toImplemented(chunk, { commits: [], commitsByRepo: {}, result, decisions }));
    return { found: false, done: true };
  }, [checkChunk, findChunk, updateChunk]);

  const runSplit = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan) return;
    updatePlan(repoRoot, planId, { split: SPLIT_STATUS.RUNNING, splitError: null });
    try {
      const out = await invoke('split_plan', { projectDir: repoRoot, prompt: buildSplitPrompt(plan.source) });
      const result = parseSplitResult(out);
      updatePlan(repoRoot, planId, (p) => {
        const title = p.title || result.title || UNTITLED_PLAN;
        const slug = slugify(title);
        // The branch follows the title until you name it yourself.
        const gitCfg = p.git && !p.git.preparedAt && p.git.branch === defaultBranch(p.slug)
          ? { ...p.git, branch: defaultBranch(slug) } : p.git;
        return {
          title,
          slug,
          git: gitCfg,
          summary: result.summary,
          chunks: newChunks(result.chunks),
          split: SPLIT_STATUS.DONE,
          splitError: null,
        };
      });
    } catch (e) {
      updatePlan(repoRoot, planId, { split: SPLIT_STATUS.FAILED, splitError: errorMessage(e) });
    }
  }, [findPlan, updatePlan]);

  const createPlan = useCallback(async (repoRoot, { source, importedFrom = null }) => {
    await loadRepo(repoRoot);
    const title = markdownTitle(source);
    const slug = slugify(title);
    const plan = {
      id: shortId('p'),
      slug,
      title: title || '',
      summary: '',
      repoRoot,
      source,
      importedFrom,
      split: SPLIT_STATUS.RUNNING,
      splitError: null,
      chunks: [],
      git: defaultGitConfig(repoRoot, slug, await currentBranch(repoRoot).catch(() => '')),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mutate(repoRoot, (plans) => [plan, ...plans]);
    runSplit(repoRoot, plan.id);
    return plan.id;
  }, [loadRepo, mutate, runSplit]);

  // A plan file edited after import: take the new text and split it again.
  const replaceSource = useCallback((repoRoot, planId, { source, importedFrom }) => {
    updatePlan(repoRoot, planId, { source, importedFrom, chunks: [], autopilot: null });
    runSplit(repoRoot, planId);
  }, [updatePlan, runSplit]);

  // Its worktrees go with it (uncommitted work in them too); branches stay.
  const deletePlan = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    if (plan) await cleanupGit(plan).catch((e) => toast.error(`Worktrees not removed: ${e?.message || e}`));
    mutate(repoRoot, (plans) => plans.filter((p) => p.id !== planId));
  }, [findPlan, mutate, toast]);

  // --- Git settings ---

  // Editable until the first chunk is sent.
  const setGitConfig = useCallback((repoRoot, planId, patch) => {
    updatePlan(repoRoot, planId, (p) => {
      const cfg = planGit(p);
      if (cfg.preparedAt) return {};
      return { git: { ...cfg, ...(typeof patch === 'function' ? patch(cfg) : patch) } };
    });
  }, [updatePlan]);

  const addPlanRepo = useCallback(async (repoRoot, planId, path) => {
    const root = await repoTop(path).catch(() => null);
    if (!root) throw new Error(`${basename(path)} is not a git repository`);
    const base = await currentBranch(root).catch(() => '');
    setGitConfig(repoRoot, planId, (cfg) => (cfg.repos.some((r) => r.root === root) ? {} : {
      repos: [...cfg.repos, { root, base, workPath: null, prepared: false }],
    }));
  }, [setGitConfig]);

  const removePlanRepo = useCallback((repoRoot, planId, root) => {
    if (root === repoRoot) return; // The primary repo holds the plan.
    setGitConfig(repoRoot, planId, (cfg) => ({ repos: cfg.repos.filter((r) => r.root !== root) }));
  }, [setGitConfig]);

  // Branches and worktrees, made once before the first chunk goes out.
  const ensureGit = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan) throw new Error('Plan not found');
    const cfg = planGit(plan);
    if (cfg.preparedAt) return cfg;
    const save = (git) => updatePlan(repoRoot, planId, { git });
    return prepareGit(await getHome(), plan, save);
  }, [findPlan, updatePlan, getHome]);

  const removeWorktrees = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan) return;
    await cleanupGit(plan);
    updatePlan(repoRoot, planId, (p) => ({ git: { ...planGit(p), removedAt: Date.now() } }));
  }, [findPlan, updatePlan]);

  const moveChunk = useCallback((repoRoot, planId, chunkId, delta) => {
    updatePlan(repoRoot, planId, (p) => {
      const i = p.chunks.findIndex((c) => c.id === chunkId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= p.chunks.length) return {};
      const chunks = [...p.chunks];
      [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
      return { chunks: renumber(chunks) };
    });
  }, [updatePlan]);

  const deleteChunk = useCallback((repoRoot, planId, chunkId) => {
    updatePlan(repoRoot, planId, (p) => ({ chunks: renumber(p.chunks.filter((c) => c.id !== chunkId)) }));
  }, [updatePlan]);

  const sendToTab = useCallback(async (tabId, text) => {
    const send = getTabPrompt(tabId)?.send;
    if (!send) throw new Error('That tab is closed');
    await send(text);
  }, []);

  // Clears the agent's context in the tab: /clear, or /new in opencode.
  const clearTabContext = useCallback(async (tabId) => {
    const clear = getTabPrompt(tabId)?.clearContext;
    if (!clear) throw new Error('That tab is closed');
    return clear();
  }, []);

  const implementChunk = useCallback(async (repoRoot, planId, chunkId, tabId, { autopilot = false } = {}) => {
    if (!findChunk(repoRoot, planId, chunkId).chunk) throw new Error('Chunk not found');
    const cfg = await ensureGit(repoRoot, planId);
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (cfg.removedAt) throw new Error('The plan\'s worktrees were removed');
    const baseShas = await captureBaseShas(cfg);
    await sendToTab(tabId, buildChunkPrompt(plan, chunk, { autopilot }));
    updateChunk(repoRoot, planId, chunkId, toInProgress({ tabId, baseShas, primaryRoot: repoRoot }));
  }, [findChunk, ensureGit, sendToTab, updateChunk]);

  const sendFix = useCallback(async (repoRoot, planId, chunkId, notes, tabId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk || notes.length === 0) return;
    await sendToTab(tabId, buildFixPrompt(plan, chunk, notes));
    updateChunk(repoRoot, planId, chunkId, { awaitingFix: true, tabId });
  }, [findChunk, sendToTab, updateChunk]);

  // Review notes on the whole plan's diff: one fix commit, not tied to a chunk.
  const sendPlanFix = useCallback(async (repoRoot, planId, notes, tabId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan || notes.length === 0) return;
    await sendToTab(tabId, buildPlanFixPrompt(plan, notes));
  }, [findPlan, sendToTab]);

  // Fallback when the agent didn't commit: commit everything as this chunk.
  const commitChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk) return { found: false };
    await commitChunkChanges(plan, chunk);
    return checkChunk(repoRoot, planId, chunkId);
  }, [findChunk, checkChunk]);

  const rollbackChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk?.commits?.length) throw new Error('This chunk has no commits to roll back');
    const revertShas = await revertChunk(plan, chunk);
    updateChunk(repoRoot, planId, chunkId, toRolledBack(revertShas));
  }, [findChunk, updateChunk]);

  // --- Auto-pilot ---

  const {
    startAutopilot, resumeAutopilot, stopAutopilot, dismissAutopilot, revealRun,
  } = useAutopilot({
    stateRef, findPlan, updatePlan, checkChunk, markChunkDone, implementChunk, sendToTab, clearTabContext, tabs, switchTab, toast,
  });

  const actions = useMemo(() => ({
    loadRepo,
    createPlan,
    replaceSource,
    runSplit,
    deletePlan,
    updatePlan,
    updateChunk,
    moveChunk,
    deleteChunk,
    implementChunk,
    checkChunk,
    markChunkDone,
    commitChunk,
    rollbackChunk,
    sendFix,
    sendPlanFix,
    startAutopilot,
    resumeAutopilot,
    stopAutopilot,
    dismissAutopilot,
    revealRun,
    setGitConfig,
    addPlanRepo,
    removePlanRepo,
    ensureGit,
    removeWorktrees,
  }), [loadRepo, createPlan, replaceSource, runSplit, deletePlan, updatePlan, updateChunk, moveChunk, deleteChunk,
    implementChunk, checkChunk, markChunkDone, commitChunk, rollbackChunk, sendFix, startAutopilot, resumeAutopilot, stopAutopilot,
    dismissAutopilot, revealRun, sendPlanFix, setGitConfig, addPlanRepo, removePlanRepo, ensureGit, removeWorktrees]);

  return (
    <PlansActionsContext.Provider value={actions}>
      <PlansStateContext.Provider value={plansByRepo}>{children}</PlansStateContext.Provider>
    </PlansActionsContext.Provider>
  );
}

export function usePlansActions() {
  const ctx = useContext(PlansActionsContext);
  if (!ctx) throw new Error('usePlansActions must be used within a PlansProvider');
  return ctx;
}

/** The plans of one repo (loaded on first use) plus the actions. */
export function usePlans(repoRoot) {
  const plansByRepo = useContext(PlansStateContext);
  const actions = usePlansActions();
  const { loadRepo } = actions;
  useEffect(() => {
    loadRepo(repoRoot);
  }, [repoRoot, loadRepo]);
  const plans = (repoRoot && plansByRepo?.[repoRoot]) || null;
  return { plans, loaded: !!plans, ...actions };
}

/** Every loaded repo's plans (repoRoot -> plans). */
export function usePlansByRepo() {
  return useContext(PlansStateContext);
}

const LIVE = new Set([AUTOPILOT_STATUS.RUNNING, AUTOPILOT_STATUS.PAUSED, AUTOPILOT_STATUS.FAILED]);

/** Auto-pilot runs that need watching, across loaded repos, most urgent first. */
export function useAutopilotRuns() {
  const plansByRepo = useContext(PlansStateContext);
  return useMemo(() => {
    const runs = [];
    for (const [repoRoot, plans] of Object.entries(plansByRepo || {})) {
      for (const plan of plans) {
        if (LIVE.has(plan.autopilot?.status)) runs.push({ repoRoot, plan });
      }
    }
    return runs.sort((a, b) => runRank(a.plan) - runRank(b.plan));
  }, [plansByRepo]);
}
