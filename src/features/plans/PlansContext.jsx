import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { notify } from '../../lib/notify';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { getAgentHookState, getAgentTranscript, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { getTabPrompt } from '../tabs/tabPrompts';
import {
  buildChunkPrompt,
  buildFixPrompt,
  buildNudgePrompt,
  buildSplitPrompt,
  chunkCommitMessage,
  chunkTrailer,
  markdownTitle,
  parseSplitResult,
  parseStatusMarker,
  slugify,
} from './planPrompts';

// Plans live in ~/.lirah/plans/<repo>-<hash>/plans.json, one file per repo,
// never inside the repo itself. Chunks are implemented by the tab's live agent,
// one commit each (found again by its Plan-Chunk trailer), so review is that
// commit's diff and rollback is `git revert`.
//
// Auto-pilot (plan.autopilot) chains the chunks in one tab: each Stop with the
// chunk's commit sends the next one. It stops to notify you when the plan is
// done (status 'done'), when it needs you (status 'paused': a question, a
// permission prompt, no commit after one nudge) and when something broke
// (status 'failed').

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

// The chunk to do next: the first one not yet implemented or skipped.
export function nextChunkId(plan) {
  return plan.chunks.find((c) => c.status === 'pending' || c.status === 'rolled-back')?.id ?? null;
}

// Paused for these, auto-pilot picks up again on its own once the agent works
// on: you answered its question or approved the prompt in the terminal.
const AUTO_RESUME = new Set(['needs-input', 'no-commit', 'permission']);

/** The last line or so of an agent's reply, for a notification. */
function excerpt(text, max = 160) {
  const line = String(text || '').trim().split('\n').filter((l) => l.trim()).pop() || '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
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
  const toast = useToast();
  const { tabs } = useTabManager();

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
      // A split can't survive a restart, and auto-pilot's tab is gone.
      plans = plans.map((p) => {
        let next = p.split === 'running' ? { ...p, split: 'failed', splitError: 'Interrupted — the app was closed.' } : p;
        if (p.autopilot?.status === 'running' || p.autopilot?.status === 'paused') {
          next = {
            ...next,
            autopilot: {
              ...p.autopilot,
              status: 'paused',
              reason: 'app-restarted',
              message: 'The app was closed during the run. Resume it from a tab with an agent.',
            },
          };
        }
        return next;
      });
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
    runSplit(repoRoot, plan.id);
    return plan.id;
  }, [loadRepo, mutate, runSplit]);

  // A plan file edited after import: take the new text and split it again.
  const replaceSource = useCallback((repoRoot, planId, { source, importedFrom }) => {
    updatePlan(repoRoot, planId, { source, importedFrom, chunks: [], autopilot: null });
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

  const implementChunk = useCallback(async (repoRoot, planId, chunkId, tabId, { autopilot = false } = {}) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk) throw new Error('Chunk not found');
    const baseSha = (await git(repoRoot, ['rev-parse', 'HEAD'])).trim();
    if (!baseSha) throw new Error('This repo has no commits yet');
    await sendToTab(tabId, buildChunkPrompt(plan, chunk, { autopilot }));
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

  // --- Auto-pilot ---

  const toastRef = useRef(toast);
  toastRef.current = toast;

  const findPlan = useCallback((repoRoot, planId) => stateRef.current[repoRoot]?.find((p) => p.id === planId), []);

  const setAutopilot = useCallback((repoRoot, planId, patch) => {
    updatePlan(repoRoot, planId, (p) => ({
      autopilot: patch === null ? null : { ...p.autopilot, ...patch, at: Date.now() },
    }));
  }, [updatePlan]);

  // Desktop notification plus a toast, for the three outcomes you asked to hear about.
  const announce = useCallback((plan, kind, body) => {
    const name = plan.title || 'Untitled plan';
    const title = {
      done: `✓ ${name} · plan complete`,
      paused: `${name} · needs you`,
      failed: `${name} · auto-pilot stopped`,
    }[kind];
    notify(title, body);
    const t = toastRef.current;
    const show = kind === 'done' ? t.success : kind === 'paused' ? t.warning : t.error;
    show(`${title}${body ? ` — ${body}` : ''}`);
  }, []);

  // Stop the run, notifying when it was running (not again for every later event).
  const halt = useCallback((repoRoot, planId, status, reason, message) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan?.autopilot) return;
    const wasRunning = plan.autopilot.status === 'running';
    setAutopilot(repoRoot, planId, { status, reason, message });
    // Permission prompts already get a desktop alert from useAgentAttention.
    if (wasRunning && reason !== 'permission') announce(plan, status, message);
  }, [findPlan, setAutopilot, announce]);

  // Send the next chunk, or finish.
  const advance = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (ap?.status !== 'running') return;
    const nextId = nextChunkId(plan);
    if (!nextId) {
      const { done } = planProgress(plan);
      const commits = plan.chunks.reduce((n, c) => n + (c.status === 'implemented' ? c.commits.length : 0), 0);
      setAutopilot(repoRoot, planId, { status: 'done', chunkId: null, reason: null, message: null });
      announce(plan, 'done', `${done} chunk${done === 1 ? '' : 's'}, ${commits} commit${commits === 1 ? '' : 's'}.`);
      return;
    }
    try {
      await implementChunk(repoRoot, planId, nextId, ap.tabId, { autopilot: true });
      setAutopilot(repoRoot, planId, { chunkId: nextId, nudged: false });
    } catch (e) {
      halt(repoRoot, planId, 'failed', 'send-failed', String(e?.message || e));
    }
  }, [findPlan, setAutopilot, announce, implementChunk, halt]);

  // Pick up where the run is: the current chunk if it is still in flight
  // (committed → move on; agent idle → nudge), else the next one.
  const kick = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (ap?.status !== 'running') return;
    const current = plan.chunks.find((c) => c.id === ap.chunkId && c.status === 'in-progress');
    if (!current) return advance(repoRoot, planId);
    const res = await checkChunk(repoRoot, planId, current.id);
    if (res.error) return halt(repoRoot, planId, 'failed', 'git-error', res.error);
    if (res.found) return advance(repoRoot, planId);
    if (getAgentHookState(getTabSession(ap.tabId))?.state === 'working') return; // Its Stop will come.
    try {
      await sendToTab(ap.tabId, buildNudgePrompt(plan, current));
      setAutopilot(repoRoot, planId, { nudged: true });
    } catch (e) {
      halt(repoRoot, planId, 'failed', 'send-failed', String(e?.message || e));
    }
  }, [findPlan, advance, checkChunk, halt, sendToTab, setAutopilot]);

  const startAutopilot = useCallback((repoRoot, planId, tabId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan) return;
    // A chunk already sent by hand is adopted rather than sent again.
    const inFlight = plan.chunks.find((c) => c.status === 'in-progress');
    setAutopilot(repoRoot, planId, {
      status: 'running', tabId, chunkId: inFlight?.id ?? null, nudged: false, reason: null, message: null,
      startedAt: Date.now(),
    });
    return kick(repoRoot, planId);
  }, [findPlan, setAutopilot, kick]);

  const resumeAutopilot = useCallback((repoRoot, planId, tabId) => {
    const ap = findPlan(repoRoot, planId)?.autopilot;
    setAutopilot(repoRoot, planId, {
      status: 'running', tabId: tabId || ap?.tabId, nudged: false, reason: null, message: null,
    });
    return kick(repoRoot, planId);
  }, [findPlan, setAutopilot, kick]);

  const stopAutopilot = useCallback((repoRoot, planId) => setAutopilot(repoRoot, planId, null), [setAutopilot]);

  // The agent's turn ended while auto-pilot was on its chunk.
  const onAutopilotStop = useCallback(async (repoRoot, planId, sessionId, error) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (!ap) return;
    if (error) return halt(repoRoot, planId, 'failed', 'agent-error', 'The agent stopped with an error.');
    const current = plan.chunks.find((c) => c.id === ap.chunkId);
    if (current?.status !== 'in-progress') return ap.status === 'running' ? advance(repoRoot, planId) : undefined;
    const res = await checkChunk(repoRoot, planId, current.id);
    if (res.error) return halt(repoRoot, planId, 'failed', 'git-error', res.error);
    if (res.found) {
      setAutopilot(repoRoot, planId, { status: 'running', nudged: false, reason: null, message: null });
      return advance(repoRoot, planId);
    }
    const transcriptPath = getAgentTranscript(sessionId);
    const text = transcriptPath
      ? await invoke('last_assistant_text', { transcriptPath }).catch(() => null)
      : null;
    const marker = parseStatusMarker(text);
    if (marker?.kind === 'blocked') {
      return halt(repoRoot, planId, 'failed', 'blocked', marker.message || `Chunk ${current.n}: the agent is blocked.`);
    }
    if (marker?.kind === 'needs-input') {
      return halt(repoRoot, planId, 'paused', 'needs-input', marker.message || `Chunk ${current.n}: the agent has a question.`);
    }
    if (ap.status === 'running' && !ap.nudged) {
      try {
        await sendToTab(ap.tabId, buildNudgePrompt(plan, current));
        setAutopilot(repoRoot, planId, { nudged: true });
      } catch (e) {
        halt(repoRoot, planId, 'failed', 'send-failed', String(e?.message || e));
      }
      return;
    }
    const said = excerpt(text);
    halt(repoRoot, planId, 'paused', 'no-commit',
      `Chunk ${current.n} stopped without committing.${said ? ` Last said: "${said}"` : ''}`);
  }, [findPlan, halt, advance, checkChunk, setAutopilot, sendToTab]);

  // Hook events: check chunks when a turn ends; drive auto-pilot runs.
  useEffect(() => subscribeAgentHooks(({ sessionId, prev, next }) => {
    const turnEnded = next?.state === 'done' && prev?.state !== 'done';
    for (const [repoRoot, plans] of Object.entries(stateRef.current)) {
      for (const plan of plans) {
        const ap = plan.autopilot;
        const piloted = (ap?.status === 'running' || ap?.status === 'paused') && getTabSession(ap.tabId) === sessionId;
        if (piloted) {
          if (next === null) {
            halt(repoRoot, plan.id, 'paused', 'session-ended', 'The agent exited. Relaunch it in the tab and resume.');
          } else if (next?.state === 'permission' && ap.status === 'running') {
            halt(repoRoot, plan.id, 'paused', 'permission', next.message || 'Waiting on a permission prompt.');
          } else if (next?.state === 'working' && ap.status === 'paused' && AUTO_RESUME.has(ap.reason)) {
            // You answered or approved in the terminal: the run carries on.
            setAutopilot(repoRoot, plan.id, {
              status: 'running', reason: null, message: null, nudged: ap.reason === 'permission' ? ap.nudged : false,
            });
          } else if (turnEnded && (ap.status === 'running' || AUTO_RESUME.has(ap.reason))) {
            onAutopilotStop(repoRoot, plan.id, sessionId, next.error);
          }
          // Auto-pilot checks its own chunk; checking it here too would race.
          if (turnEnded) {
            for (const chunk of plan.chunks) {
              if (chunk.awaitingFix && chunk.id !== ap.chunkId && getTabSession(chunk.tabId) === sessionId) {
                checkChunk(repoRoot, plan.id, chunk.id);
              }
            }
          }
          continue;
        }
        if (!turnEnded) continue;
        for (const chunk of plan.chunks) {
          if ((chunk.status === 'in-progress' || chunk.awaitingFix) && getTabSession(chunk.tabId) === sessionId) {
            checkChunk(repoRoot, plan.id, chunk.id);
          }
        }
      }
    }
  }), [checkChunk, halt, setAutopilot, onAutopilotStop]);

  // A run whose tab was closed would wait forever for a Stop.
  useEffect(() => {
    const open = new Set(tabs.map((t) => t.id));
    for (const [repoRoot, plans] of Object.entries(stateRef.current)) {
      for (const plan of plans) {
        const ap = plan.autopilot;
        if ((ap?.status === 'running' || ap?.status === 'paused') && ap.reason !== 'app-restarted' && !open.has(ap.tabId)) {
          halt(repoRoot, plan.id, 'failed', 'tab-closed', 'The tab running the plan was closed.');
        }
      }
    }
  }, [tabs, halt]);

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
    startAutopilot,
    resumeAutopilot,
    stopAutopilot,
  }), [loadRepo, createPlan, replaceSource, runSplit, deletePlan, updatePlan, updateChunk, moveChunk, deleteChunk,
    implementChunk, checkChunk, commitChunk, rollbackChunk, sendFix, startAutopilot, resumeAutopilot, stopAutopilot]);

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
