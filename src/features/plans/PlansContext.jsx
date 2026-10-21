import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../../lib/errorMessage';
import { basename } from '../../utils/pathUtils';
import { invoke } from '@tauri-apps/api/core';
import { notify } from '../../lib/notify';
import { formatDuration } from '../../lib/formatDuration';
import { currentBranch, git, repoTop } from '../../lib/git';
import { hash8, shortId } from '../../lib/ids';
import { lirahDir } from '../../lib/lirahPaths';
import {
  AUTO_RESUME_REASONS, AUTOPILOT_STATUS, CHUNK_STATUS, EXCERPT_MAX, HALT_REASON, isAutopilotLive, SPLIT_STATUS, UNTITLED_PLAN,
} from './planModel';
import { useToast } from '../toast';
import { useTabManager } from '../tabs/TabContext';
import { getAgentHookState, getAgentTranscript, subscribeAgentHooks } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { getTabPrompt } from '../tabs/tabPrompts';
import { requestPlanFocus } from './plansPaneEvents';
import {
  chunkBases, chunkCommitsByRepo, cleanupGit, defaultBranch, planGit, prepareGit, workPath,
} from './planGit';
import {
  buildChunkPrompt,
  buildFixPrompt,
  buildNudgePrompt,
  buildPlanFixPrompt,
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
// A plan's git settings (plan.git, see planGit.js) can add more repos, a
// branch for the plan and worktrees; chunks are then checked, committed and
// rolled back in every repo, each keyed by its root.
//
// Auto-pilot (plan.autopilot) chains the chunks in one tab: each Stop with the
// chunk's commit sends the next one. It stops to notify you when the plan is
// done (status 'done'), when it needs you (status 'paused': a question, a
// permission prompt, no commit after one nudge) and when something broke
// (status 'failed').

const PlansActionsContext = createContext(null);
const PlansStateContext = createContext(null);

const PERSIST_DEBOUNCE = 400;

function storePath(home, repoRoot) {
  const name = basename(repoRoot, 'repo');
  return `${lirahDir(home)}/plans/${name}-${hash8(repoRoot)}/plans.json`;
}

/** Chunks that count toward progress (skipped ones don't), and how many are in. */
export function planProgress(plan) {
  const active = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED);
  return { done: active.filter((c) => c.status === CHUNK_STATUS.IMPLEMENTED).length, total: active.length };
}

export function planStarted(plan) {
  return plan.chunks.some((c) => c.status !== CHUNK_STATUS.PENDING && c.status !== CHUNK_STATUS.SKIPPED);
}

// The chunk to do next: the first one not yet implemented or skipped.
export function nextChunkId(plan) {
  return plan.chunks.find((c) => c.status === CHUNK_STATUS.PENDING || c.status === CHUNK_STATUS.ROLLED_BACK)?.id ?? null;
}

// A PermissionRequest carries the tool name; a Notification, a sentence.
function permissionMessage(message) {
  if (!message) return 'Waiting on a permission prompt in the terminal.';
  return /\s/.test(message.trim()) ? message : `Waiting on permission to use ${message}.`;
}

/** The last line or so of an agent's reply, for a notification. */
function excerpt(text, max = EXCERPT_MAX) {
  const line = String(text || '').trim().split('\n').filter((l) => l.trim()).pop() || '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function newChunks(chunks) {
  return chunks.map((c, i) => ({
    id: shortId('c'),
    n: i + 1,
    ...c,
    status: CHUNK_STATUS.PENDING,
    tabId: null,
    baseSha: null, // the primary repo's; baseShas has every repo's
    baseShas: {},
    commits: [], // every repo's, in order; commitsByRepo splits them by repo root
    commitsByRepo: {},
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
  const { tabs, switchTab } = useTabManager();

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
    const bases = plan && chunk ? chunkBases(plan, chunk) : {};
    if (!plan || Object.keys(bases).length === 0 || checkingRef.current.has(chunkId)) return { found: false };
    checkingRef.current.add(chunkId);
    try {
      const commitsByRepo = {};
      for (const repo of planGit(plan).repos) {
        const base = bases[repo.root];
        if (!base) continue;
        const out = await git(workPath(repo), [
          'log', `${base}..HEAD`, '--format=%H', '--fixed-strings', `--grep=${chunkTrailer(plan, chunk)}`,
        ]);
        const shas = out.split('\n').map((l) => l.trim()).filter(Boolean).reverse();
        if (shas.length > 0) commitsByRepo[repo.root] = shas;
      }
      const commits = Object.values(commitsByRepo).flat();
      if (commits.length > 0) {
        updateChunk(repoRoot, planId, chunkId, {
          status: CHUNK_STATUS.IMPLEMENTED,
          commits,
          commitsByRepo,
          needsCommit: false,
          awaitingFix: false,
          doneAt: chunk.status === CHUNK_STATUS.IMPLEMENTED ? chunk.doneAt : Date.now(),
        });
        return { found: true, commits };
      }
      updateChunk(repoRoot, planId, chunkId, {
        needsCommit: chunk.status === CHUNK_STATUS.IN_PROGRESS,
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
        let next = p.split === SPLIT_STATUS.RUNNING ? { ...p, split: SPLIT_STATUS.FAILED, splitError: 'Interrupted — the app was closed.' } : p;
        if (isAutopilotLive(p.autopilot)) {
          next = {
            ...next,
            autopilot: {
              ...p.autopilot,
              status: AUTOPILOT_STATUS.PAUSED,
              reason: HALT_REASON.APP_RESTARTED,
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
          if (chunk.status === CHUNK_STATUS.IN_PROGRESS || chunk.awaitingFix) checkChunk(repoRoot, plan.id, chunk.id);
        }
      }
    })().finally(() => loadingRef.current.delete(repoRoot));
    loadingRef.current.set(repoRoot, promise);
    return promise;
  }, [getHome, checkChunk]);

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
      git: {
        worktrees: false,
        branch: defaultBranch(slug),
        repos: [{ root: repoRoot, base: await currentBranch(repoRoot).catch(() => ''), workPath: null, prepared: false }],
        workDir: null,
        preparedAt: null,
      },
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
    const plan = stateRef.current[repoRoot]?.find((p) => p.id === planId);
    if (plan) await cleanupGit(plan).catch((e) => toast.error(`Worktrees not removed: ${e?.message || e}`));
    mutate(repoRoot, (plans) => plans.filter((p) => p.id !== planId));
  }, [mutate, toast]);

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
    const plan = stateRef.current[repoRoot]?.find((p) => p.id === planId);
    if (!plan) throw new Error('Plan not found');
    const cfg = planGit(plan);
    if (cfg.preparedAt) return cfg;
    const save = (git) => updatePlan(repoRoot, planId, { git });
    return prepareGit(await getHome(), plan, save);
  }, [updatePlan, getHome]);

  const removeWorktrees = useCallback(async (repoRoot, planId) => {
    const plan = stateRef.current[repoRoot]?.find((p) => p.id === planId);
    if (!plan) return;
    await cleanupGit(plan);
    updatePlan(repoRoot, planId, (p) => ({ git: { ...planGit(p), removedAt: Date.now() } }));
  }, [updatePlan]);

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
    if (!findChunk(repoRoot, planId, chunkId).chunk) throw new Error('Chunk not found');
    const cfg = await ensureGit(repoRoot, planId);
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (cfg.removedAt) throw new Error('The plan\'s worktrees were removed');
    const baseShas = {};
    for (const repo of cfg.repos) {
      const sha = (await git(workPath(repo), ['rev-parse', 'HEAD']).catch(() => '')).trim();
      if (!sha) throw new Error(`${basename(repo.root)} has no commits yet`);
      baseShas[repo.root] = sha;
    }
    await sendToTab(tabId, buildChunkPrompt(plan, chunk, { autopilot }));
    updateChunk(repoRoot, planId, chunkId, {
      status: CHUNK_STATUS.IN_PROGRESS,
      tabId,
      baseSha: baseShas[repoRoot] ?? null,
      baseShas,
      commits: [],
      commitsByRepo: {},
      needsCommit: false,
      awaitingFix: false,
      startedAt: Date.now(),
      doneAt: null,
    });
  }, [findChunk, ensureGit, sendToTab, updateChunk]);

  const sendFix = useCallback(async (repoRoot, planId, chunkId, notes, tabId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk || notes.length === 0) return;
    await sendToTab(tabId, buildFixPrompt(plan, chunk, notes));
    updateChunk(repoRoot, planId, chunkId, { awaitingFix: true, tabId });
  }, [findChunk, sendToTab, updateChunk]);

  // Review notes on the whole plan's diff: one fix commit, not tied to a chunk.
  const sendPlanFix = useCallback(async (repoRoot, planId, notes, tabId) => {
    const plan = stateRef.current[repoRoot]?.find((p) => p.id === planId);
    if (!plan || notes.length === 0) return;
    await sendToTab(tabId, buildPlanFixPrompt(plan, notes));
  }, [sendToTab]);

  // Fallback when the agent didn't commit: commit everything as this chunk.
  const commitChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk) return { found: false };
    for (const repo of planGit(plan).repos) {
      const path = workPath(repo);
      if (!(await git(path, ['status', '--porcelain'])).trim()) continue;
      await git(path, ['add', '-A']);
      await git(path, ['commit', '-m', chunkCommitMessage(plan, chunk), '-m', chunkTrailer(plan, chunk)]);
    }
    return checkChunk(repoRoot, planId, chunkId);
  }, [findChunk, checkChunk]);

  const rollbackChunk = useCallback(async (repoRoot, planId, chunkId) => {
    const { plan, chunk } = findChunk(repoRoot, planId, chunkId);
    if (!chunk?.commits?.length) throw new Error('This chunk has no commits to roll back');
    const byRepo = chunkCommitsByRepo(plan, chunk);
    const revertShas = [];
    const reverted = [];
    for (const repo of planGit(plan).repos) {
      const commits = byRepo[repo.root];
      if (!commits?.length) continue;
      const path = workPath(repo);
      const before = (await git(path, ['rev-parse', 'HEAD'])).trim();
      try {
        await git(path, ['revert', '--no-edit', ...[...commits].reverse()]);
      } catch (e) {
        await git(path, ['revert', '--abort']).catch(() => {});
        const msg = errorMessage(e).trim() || 'git revert failed';
        throw new Error(reverted.length
          ? `${basename(repo.root)}: ${msg} (already reverted in ${reverted.join(', ')})`
          : `${basename(repo.root)}: ${msg}`);
      }
      revertShas.push(...(await git(path, ['rev-list', `${before}..HEAD`]))
        .split('\n').map((l) => l.trim()).filter(Boolean));
      reverted.push(basename(repo.root));
    }
    if (revertShas.length === 0) throw new Error('git revert made no commit');
    updateChunk(repoRoot, planId, chunkId, {
      status: CHUNK_STATUS.ROLLED_BACK,
      revertShas,
      commits: [],
      commitsByRepo: {},
      needsCommit: false,
      awaitingFix: false,
      doneAt: null,
    });
  }, [findChunk, updateChunk]);

  // --- Auto-pilot ---

  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const findPlan = useCallback((repoRoot, planId) => stateRef.current[repoRoot]?.find((p) => p.id === planId), []);

  const setAutopilot = useCallback((repoRoot, planId, patch) => {
    updatePlan(repoRoot, planId, (p) => ({
      autopilot: patch === null ? null : { ...p.autopilot, ...patch, at: Date.now() },
    }));
  }, [updatePlan]);

  // Bring the run into view: its tab, and the plan open in the plans pane.
  const revealRun = useCallback((repoRoot, planId) => {
    const tabId = findPlan(repoRoot, planId)?.autopilot?.tabId;
    if (tabId && tabsRef.current.some((t) => t.id === tabId)) switchTab(tabId);
    requestPlanFocus(planId);
  }, [findPlan, switchTab]);

  // Desktop notification plus a toast, for the three outcomes you asked to
  // hear about. Both lead back to the run; the ones that need you stay up.
  const announce = useCallback((repoRoot, plan, kind, body) => {
    const name = plan.title || UNTITLED_PLAN;
    const title = {
      [AUTOPILOT_STATUS.DONE]: `✓ ${name} · plan complete`,
      [AUTOPILOT_STATUS.PAUSED]: `${name} · needs you`,
      [AUTOPILOT_STATUS.FAILED]: `${name} · auto-pilot error`,
    }[kind];
    const reveal = () => revealRun(repoRoot, plan.id);
    notify(title, body, { onClick: reveal });
    const t = toastRef.current;
    const show = kind === AUTOPILOT_STATUS.DONE ? t.success : kind === AUTOPILOT_STATUS.PAUSED ? t.warning : t.error;
    show(`${title}${body ? ` — ${body}` : ''}`, {
      action: { label: 'show', onClick: reveal },
      ...(kind === AUTOPILOT_STATUS.DONE ? {} : { duration: 0 }),
    });
  }, [revealRun]);

  // Stop the run, notifying when it was running (not again for every later event).
  const halt = useCallback((repoRoot, planId, status, reason, message) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan?.autopilot) return;
    const wasRunning = plan.autopilot.status === AUTOPILOT_STATUS.RUNNING;
    setAutopilot(repoRoot, planId, { status, reason, message });
    // Permission prompts already get a desktop alert from useAgentAttention.
    if (wasRunning && reason !== HALT_REASON.PERMISSION) announce(repoRoot, plan, status, message);
  }, [findPlan, setAutopilot, announce]);

  // Send the next chunk, or finish.
  const advance = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (ap?.status !== AUTOPILOT_STATUS.RUNNING) return;
    const nextId = nextChunkId(plan);
    if (!nextId) {
      const { done } = planProgress(plan);
      const commits = plan.chunks.reduce((n, c) => n + (c.status === CHUNK_STATUS.IMPLEMENTED ? c.commits.length : 0), 0);
      setAutopilot(repoRoot, planId, { status: AUTOPILOT_STATUS.DONE, chunkId: null, reason: null, message: null, endedAt: Date.now() });
      const took = ap.startedAt ? ` in ${formatDuration(Date.now() - ap.startedAt)}` : '';
      announce(repoRoot, plan, AUTOPILOT_STATUS.DONE,
        `${done} chunk${done === 1 ? '' : 's'}, ${commits} commit${commits === 1 ? '' : 's'}${took}.`);
      return;
    }
    // Recorded first, so a failed send points at the chunk it was for.
    setAutopilot(repoRoot, planId, { chunkId: nextId, nudged: false });
    try {
      await implementChunk(repoRoot, planId, nextId, ap.tabId, { autopilot: true });
    } catch (e) {
      halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.SEND_FAILED, errorMessage(e));
    }
  }, [findPlan, setAutopilot, announce, implementChunk, halt]);

  // Pick up where the run is: the current chunk if it is still in flight
  // (committed → move on; agent idle → nudge), else the next one.
  const kick = useCallback(async (repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (ap?.status !== AUTOPILOT_STATUS.RUNNING) return;
    const current = plan.chunks.find((c) => c.id === ap.chunkId && c.status === CHUNK_STATUS.IN_PROGRESS);
    if (!current) return advance(repoRoot, planId);
    const res = await checkChunk(repoRoot, planId, current.id);
    if (res.error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.GIT_ERROR, res.error);
    if (res.found) return advance(repoRoot, planId);
    if (getAgentHookState(getTabSession(ap.tabId))?.state === 'working') return; // Its Stop will come.
    try {
      await sendToTab(ap.tabId, buildNudgePrompt(plan, current));
      setAutopilot(repoRoot, planId, { nudged: true });
    } catch (e) {
      halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.SEND_FAILED, errorMessage(e));
    }
  }, [findPlan, advance, checkChunk, halt, sendToTab, setAutopilot]);

  const startAutopilot = useCallback((repoRoot, planId, tabId) => {
    const plan = findPlan(repoRoot, planId);
    if (!plan) return;
    // A chunk already sent by hand is adopted rather than sent again.
    const inFlight = plan.chunks.find((c) => c.status === CHUNK_STATUS.IN_PROGRESS);
    setAutopilot(repoRoot, planId, {
      status: AUTOPILOT_STATUS.RUNNING, tabId, chunkId: inFlight?.id ?? null, nudged: false, reason: null, message: null,
      startedAt: Date.now(), endedAt: null,
    });
    return kick(repoRoot, planId);
  }, [findPlan, setAutopilot, kick]);

  const resumeAutopilot = useCallback((repoRoot, planId, tabId) => {
    const ap = findPlan(repoRoot, planId)?.autopilot;
    setAutopilot(repoRoot, planId, {
      status: AUTOPILOT_STATUS.RUNNING, tabId: tabId || ap?.tabId, nudged: false, reason: null, message: null,
    });
    return kick(repoRoot, planId);
  }, [findPlan, setAutopilot, kick]);

  // Turned off by hand: keeps a note of where it stopped until dismissed.
  const stopAutopilot = useCallback((repoRoot, planId) => {
    const plan = findPlan(repoRoot, planId);
    const chunk = plan?.chunks.find((c) => c.id === plan.autopilot?.chunkId);
    setAutopilot(repoRoot, planId, {
      status: AUTOPILOT_STATUS.OFF,
      reason: HALT_REASON.STOPPED,
      message: chunk ? `Turned off during chunk ${chunk.n}. The agent wasn't interrupted.` : 'Turned off.',
    });
  }, [findPlan, setAutopilot]);

  const dismissAutopilot = useCallback((repoRoot, planId) => setAutopilot(repoRoot, planId, null), [setAutopilot]);

  // The agent's turn ended while auto-pilot was on its chunk.
  const onAutopilotStop = useCallback(async (repoRoot, planId, sessionId, error) => {
    const plan = findPlan(repoRoot, planId);
    const ap = plan?.autopilot;
    if (!ap) return;
    if (error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.AGENT_ERROR, 'The agent stopped with an error.');
    const current = plan.chunks.find((c) => c.id === ap.chunkId);
    if (current?.status !== CHUNK_STATUS.IN_PROGRESS) return ap.status === AUTOPILOT_STATUS.RUNNING ? advance(repoRoot, planId) : undefined;
    const res = await checkChunk(repoRoot, planId, current.id);
    if (res.error) return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.GIT_ERROR, res.error);
    if (res.found) {
      setAutopilot(repoRoot, planId, { status: AUTOPILOT_STATUS.RUNNING, nudged: false, reason: null, message: null });
      return advance(repoRoot, planId);
    }
    const transcriptPath = getAgentTranscript(sessionId);
    const text = transcriptPath
      ? await invoke('last_assistant_text', { transcriptPath }).catch(() => null)
      : null;
    const marker = parseStatusMarker(text);
    if (marker?.kind === HALT_REASON.BLOCKED) {
      return halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.BLOCKED, marker.message || `Chunk ${current.n}: the agent is blocked.`);
    }
    if (marker?.kind === HALT_REASON.NEEDS_INPUT) {
      return halt(repoRoot, planId, AUTOPILOT_STATUS.PAUSED, HALT_REASON.NEEDS_INPUT, marker.message || `Chunk ${current.n}: the agent has a question.`);
    }
    if (ap.status === AUTOPILOT_STATUS.RUNNING && !ap.nudged) {
      try {
        await sendToTab(ap.tabId, buildNudgePrompt(plan, current));
        setAutopilot(repoRoot, planId, { nudged: true });
      } catch (e) {
        halt(repoRoot, planId, AUTOPILOT_STATUS.FAILED, HALT_REASON.SEND_FAILED, errorMessage(e));
      }
      return;
    }
    const said = excerpt(text);
    halt(repoRoot, planId, AUTOPILOT_STATUS.PAUSED, HALT_REASON.NO_COMMIT,
      `Chunk ${current.n} stopped without committing.${said ? ` Last said: "${said}"` : ''}`);
  }, [findPlan, halt, advance, checkChunk, setAutopilot, sendToTab]);

  // Hook events: check chunks when a turn ends; drive auto-pilot runs.
  useEffect(() => subscribeAgentHooks(({ sessionId, prev, next }) => {
    const turnEnded = next?.state === 'done' && prev?.state !== 'done';
    for (const [repoRoot, plans] of Object.entries(stateRef.current)) {
      for (const plan of plans) {
        const ap = plan.autopilot;
        const piloted = isAutopilotLive(ap) && getTabSession(ap.tabId) === sessionId;
        if (piloted) {
          if (next === null) {
            halt(repoRoot, plan.id, AUTOPILOT_STATUS.PAUSED, HALT_REASON.SESSION_ENDED, 'The agent exited. Relaunch it in the tab and resume.');
          } else if (next?.state === 'permission' && ap.status === AUTOPILOT_STATUS.RUNNING) {
            halt(repoRoot, plan.id, AUTOPILOT_STATUS.PAUSED, HALT_REASON.PERMISSION, permissionMessage(next.message));
          } else if (next?.state === 'working' && ap.status === AUTOPILOT_STATUS.PAUSED && AUTO_RESUME_REASONS.has(ap.reason)) {
            // You answered or approved in the terminal: the run carries on.
            setAutopilot(repoRoot, plan.id, {
              status: AUTOPILOT_STATUS.RUNNING, reason: null, message: null, nudged: ap.reason === HALT_REASON.PERMISSION ? ap.nudged : false,
            });
          } else if (turnEnded && (ap.status === AUTOPILOT_STATUS.RUNNING || AUTO_RESUME_REASONS.has(ap.reason))) {
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
          if ((chunk.status === CHUNK_STATUS.IN_PROGRESS || chunk.awaitingFix) && getTabSession(chunk.tabId) === sessionId) {
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
        if (isAutopilotLive(ap) && ap.reason !== HALT_REASON.APP_RESTARTED && !open.has(ap.tabId)) {
          halt(repoRoot, plan.id, AUTOPILOT_STATUS.FAILED, HALT_REASON.TAB_CLOSED, 'The tab running the plan was closed.');
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
    implementChunk, checkChunk, commitChunk, rollbackChunk, sendFix, startAutopilot, resumeAutopilot, stopAutopilot,
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

const LIVE = new Set([AUTOPILOT_STATUS.RUNNING, AUTOPILOT_STATUS.PAUSED, AUTOPILOT_STATUS.FAILED]);
const URGENCY = { [AUTOPILOT_STATUS.FAILED]: 0, [AUTOPILOT_STATUS.PAUSED]: 1, [AUTOPILOT_STATUS.RUNNING]: 2 };

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
    return runs.sort((a, b) => URGENCY[a.plan.autopilot.status] - URGENCY[b.plan.autopilot.status]);
  }, [plansByRepo]);
}
