import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { getTabPrompt } from '../tabs/tabPrompts';
import {
  buildChunkPrompt,
  buildFixPrompt,
  buildSplitPrompt,
  chunkCommitMessage,
  chunkTrailer,
  markdownTitle,
  parseSplitResult,
  slugify,
} from './planPrompts';

// Plans live in ~/.lirah/plans/<repo>-<hash>/plans.json, one file per repo,
// never inside the repo itself. Chunks are implemented by the tab's live agent,
// one commit each (found again by its Plan-Chunk trailer), so review is that
// commit's diff and rollback is `git revert`.

const PlansActionsContext = createContext(null);
const PlansStateContext = createContext(null);

const PERSIST_DEBOUNCE = 400;

function shortId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

/** FNV-1a, as 8 hex chars. Enough to key a repo path or spot an edited file. */
export function hash8(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function storePath(home, repoRoot) {
  const name = repoRoot.replace(/\/+$/, '').split('/').pop() || 'repo';
  return `${home}/.lirah/plans/${name}-${hash8(repoRoot)}/plans.json`;
}

function git(repoRoot, args) {
  return invoke('run_git_command', { repoPath: repoRoot, args });
}

/** Chunks that count toward progress (skipped ones don't), and how many are in. */
export function planProgress(plan) {
  const active = plan.chunks.filter((c) => c.status !== 'skipped');
  return { done: active.filter((c) => c.status === 'implemented').length, total: active.length };
}

export function planStarted(plan) {
  return plan.chunks.some((c) => c.status !== 'pending' && c.status !== 'skipped');
}

function newChunks(chunks) {
  return chunks.map((c, i) => ({
    id: shortId('c'),
    n: i + 1,
    ...c,
    status: 'pending',
    tabId: null,
    baseSha: null,
    commits: [],
    revertShas: [],
    needsCommit: false,
    awaitingFix: false,
    startedAt: null,
    doneAt: null,
  }));
}

const renumber = (chunks) => chunks.map((c, i) => (c.n === i + 1 ? c : { ...c, n: i + 1 }));

export function PlansProvider({ children }) {
  const [plansByRepo, setPlansByRepo] = useState({}); // repoRoot -> plan[]
  const stateRef = useRef(plansByRepo);
  stateRef.current = plansByRepo;
  const homeRef = useRef(null);
  const loadingRef = useRef(new Map()); // repoRoot -> Promise
  const dirtyRef = useRef(new Set());
  const saveTimer = useRef(null);
  const checkingRef = useRef(new Set()); // chunk ids being checked

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

  const mutate = useCallback((repoRoot, fn) => {
    dirtyRef.current.add(repoRoot);
    setPlansByRepo((prev) => ({ ...prev, [repoRoot]: fn(prev[repoRoot] || []) }));
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

  const findChunk = useCallback((repoRoot, planId, chunkId) => {
    const plan = stateRef.current[repoRoot]?.find((p) => p.id === planId);
    return { plan, chunk: plan?.chunks.find((c) => c.id === chunkId) };
  }, []);

  // Look for the chunk's commits since it was started. Found → implemented;
  // not found while in progress → the agent stopped without committing.
  const checkChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!plan || !chunk?.baseSha || checkingRef.current.has(chunkId)) return { found: false };
    checkingRef.current.add(chunkId);
    try {
      const out = await git(repoRoot, [
        'log', `${chunk.baseSha}..HEAD`, '--format=%H', '--fixed-strings', `--grep=${chunkTrailer(plan, chunk)}`,
      ]);
      const commits = out.split('\n').map((l) => l.trim()).filter(Boolean).reverse();
      if (commits.length > 0) {
        updateChunk(repoRoot, planId, chunkId, {
          status: 'implemented',
          commits,
          needsCommit: false,
          awaitingFix: false,
          doneAt: chunk.status === 'implemented' ? chunk.doneAt : Date.now(),
        });
        return { found: true, commits };
      }
      updateChunk(repoRoot, planId, chunkId, {
        needsCommit: chunk.status === 'in-progress',
        awaitingFix: false,
      });
      return { found: false };
    } catch (e) {
      console.error('Plan chunk check failed:', e);
      return { found: false, error: String(e) };
    } finally {
      checkingRef.current.delete(chunkId);
    }
  }, [findChunk, updateChunk]);

  const runSplit = useCallback(async (repoRoot, planId) => {
    const plan = stateRef.current[repoRoot]?.find((p) => p.id === planId);
    if (!plan) return;
    updatePlan(repoRoot, planId, { split: 'running', splitError: null });
    try {
      const out = await invoke('split_plan', { projectDir: repoRoot, prompt: buildSplitPrompt(plan.source) });
      const result = parseSplitResult(out);
      updatePlan(repoRoot, planId, (p) => {
        const title = p.title || result.title || 'Untitled plan';
        return {
          title,
          slug: slugify(title),
          summary: result.summary,
          chunks: newChunks(result.chunks),
          split: 'done',
          splitError: null,
        };
      });
    } catch (e) {
      updatePlan(repoRoot, planId, { split: 'failed', splitError: String(e?.message || e) });
    }
  }, [updatePlan]);

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
      // A split can't survive a restart.
      plans = plans.map((p) =>
        p.split === 'running' ? { ...p, split: 'failed', splitError: 'Interrupted — the app was closed.' } : p
      );
      setPlansByRepo((prev) => (prev[repoRoot] ? prev : { ...prev, [repoRoot]: plans }));
      stateRef.current = { ...stateRef.current, [repoRoot]: stateRef.current[repoRoot] || plans };
      // Chunks that finished while the app was closed.
      for (const plan of plans) {
        for (const chunk of plan.chunks) {
          if (chunk.status === 'in-progress' || chunk.awaitingFix) checkChunk(repoRoot, plan.id, chunk.id);
        }
      }
    })().finally(() => loadingRef.current.delete(repoRoot));
    loadingRef.current.set(repoRoot, promise);
    return promise;
  }, [getHome, checkChunk]);

  const createPlan = useCallback(async (repoRoot, { source, importedFrom = null }) => {
    await loadRepo(repoRoot);
    const title = markdownTitle(source);
    const plan = {
      id: shortId('p'),
      slug: slugify(title),
      title: title || '',
      summary: '',
      repoRoot,
      source,
      importedFrom,
      split: 'running',
      splitError: null,
      chunks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mutate(repoRoot, (plans) => [plan, ...plans]);
    stateRef.current = { ...stateRef.current, [repoRoot]: [plan, ...(stateRef.current[repoRoot] || [])] };
    runSplit(repoRoot, plan.id);
    return plan.id;
  }, [loadRepo, mutate, runSplit]);

  // A plan file edited after import: take the new text and split it again.
  const replaceSource = useCallback((repoRoot, planId, { source, importedFrom }) => {
    updatePlan(repoRoot, planId, { source, importedFrom, chunks: [] });
    stateRef.current = {
      ...stateRef.current,
      [repoRoot]: stateRef.current[repoRoot].map((p) => (p.id === planId ? { ...p, source } : p)),
    };
    runSplit(repoRoot, planId);
  }, [updatePlan, runSplit]);

  const deletePlan = useCallback((repoRoot, planId) => {
    mutate(repoRoot, (plans) => plans.filter((p) => p.id !== planId));
  }, [mutate]);

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

  const implementChunk = useCallback(async (repoRoot, planId, chunkId, tabId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk) throw new Error('Chunk not found');
    const baseSha = (await git(repoRoot, ['rev-parse', 'HEAD'])).trim();
    if (!baseSha) throw new Error('This repo has no commits yet');
    await sendToTab(tabId, buildChunkPrompt(plan, chunk));
    updateChunk(repoRoot, planId, chunkId, {
      status: 'in-progress',
      tabId,
      baseSha,
      commits: [],
      needsCommit: false,
      awaitingFix: false,
      startedAt: Date.now(),
      doneAt: null,
    });
  }, [findChunk, sendToTab, updateChunk]);

  const sendFix = useCallback(async (repoRoot, planId, chunkId, notes, tabId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk || notes.length === 0) return;
    await sendToTab(tabId, buildFixPrompt(plan, chunk, notes));
    updateChunk(repoRoot, planId, chunkId, { awaitingFix: true, tabId });
  }, [findChunk, sendToTab, updateChunk]);

  // Fallback when the agent didn't commit: commit everything as this chunk.
  const commitChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk) return { found: false };
    await git(repoRoot, ['add', '-A']);
    await git(repoRoot, ['commit', '-m', chunkCommitMessage(plan, chunk), '-m', chunkTrailer(plan, chunk)]);
    return checkChunk(repoRoot, planId, chunkId);
  }, [findChunk, checkChunk]);

  const rollbackChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk?.commits?.length) throw new Error('This chunk has no commits to roll back');
    const before = (await git(repoRoot, ['rev-parse', 'HEAD'])).trim();
    try {
      await git(repoRoot, ['revert', '--no-edit', ...[...chunk.commits].reverse()]);
    } catch (e) {
      await git(repoRoot, ['revert', '--abort']).catch(() => {});
      throw new Error(String(e?.message || e).trim() || 'git revert failed');
    }
    const revertShas = (await git(repoRoot, ['rev-list', `${before}..HEAD`]))
      .split('\n').map((l) => l.trim()).filter(Boolean);
    if (revertShas.length === 0) throw new Error('git revert made no commit');
    updateChunk(repoRoot, planId, chunkId, {
      status: 'rolled-back',
      revertShas,
      commits: [],
      needsCommit: false,
      awaitingFix: false,
      doneAt: null,
    });
  }, [findChunk, updateChunk]);

  // When a tab's agent finishes a turn, check the chunks it was working on.
  useEffect(() => subscribeAgentHooks(({ sessionId, prev, next }) => {
    if (next?.state !== 'done' || prev?.state === 'done') return;
    for (const [repoRoot, plans] of Object.entries(stateRef.current)) {
      for (const plan of plans) {
        for (const chunk of plan.chunks) {
          if ((chunk.status === 'in-progress' || chunk.awaitingFix) && getTabSession(chunk.tabId) === sessionId) {
            checkChunk(repoRoot, plan.id, chunk.id);
          }
        }
      }
    }
  }), [checkChunk]);

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
    commitChunk,
    rollbackChunk,
    sendFix,
  }), [loadRepo, createPlan, replaceSource, runSplit, deletePlan, updatePlan, updateChunk, moveChunk, deleteChunk,
    implementChunk, checkChunk, commitChunk, rollbackChunk, sendFix]);

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
