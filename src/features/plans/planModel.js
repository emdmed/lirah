// The plan's vocabulary: the status strings stored in plans.json, the
// selectors and predicates over a plan, and the patches that move a chunk from
// one status to the next. Pure, no React. The values are persisted, so they
// never change; add new ones instead.
import { shortId } from '../../lib/ids';
import { defaultBranch } from './planGit';

/** chunk.status */
export const CHUNK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  IMPLEMENTED: 'implemented',
  ROLLED_BACK: 'rolled-back',
  SKIPPED: 'skipped',
});

/** plan.autopilot.status */
export const AUTOPILOT_STATUS = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  FAILED: 'failed',
  DONE: 'done',
  OFF: 'off',
});

/** plan.autopilot.reason: why a run paused, failed or stopped. */
export const HALT_REASON = Object.freeze({
  APP_RESTARTED: 'app-restarted',
  STOPPED: 'stopped',
  SEND_FAILED: 'send-failed',
  GIT_ERROR: 'git-error',
  AGENT_ERROR: 'agent-error',
  BLOCKED: 'blocked',
  NEEDS_INPUT: 'needs-input',
  NO_COMMIT: 'no-commit',
  SESSION_ENDED: 'session-ended',
  PERMISSION: 'permission',
  TAB_CLOSED: 'tab-closed',
  NO_HOOKS: 'no-hooks',
});

/** plan.split */
export const SPLIT_STATUS = Object.freeze({
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});

/** A chunk's status with its flags folded in. Derived for display, never stored. */
export const CHUNK_STATE = Object.freeze({
  ...CHUNK_STATUS,
  NO_COMMIT: 'no-commit',
  FIXING: 'fixing',
});

export const UNTITLED_PLAN = 'Untitled plan';

/** Longest excerpt of an agent's reply quoted in a notification. */
export const EXCERPT_MAX = 160;

// Paused for these, auto-pilot picks up again on its own once the agent works
// on: you answered its question or approved the prompt in the terminal.
export const AUTO_RESUME_REASONS = new Set([
  HALT_REASON.NEEDS_INPUT, HALT_REASON.NO_COMMIT, HALT_REASON.PERMISSION,
]);

/** A run that is going or waiting on you, as opposed to finished, failed or off. */
export function isAutopilotLive(ap) {
  return ap?.status === AUTOPILOT_STATUS.RUNNING || ap?.status === AUTOPILOT_STATUS.PAUSED;
}

/**
 * The chunk's status, or what its flags say on top of it: NO_COMMIT when the
 * agent finished an in-progress chunk without committing, FIXING while review
 * notes on an implemented chunk wait for their fix commit.
 */
export function effectiveChunkState(chunk) {
  if (chunk.needsCommit) return CHUNK_STATE.NO_COMMIT;
  if (chunk.awaitingFix) return CHUNK_STATE.FIXING;
  return chunk.status;
}

// --- Selectors ---

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

/** The auto-pilot chunk's place among the chunks that count (skipped ones don't). */
export function pilotPosition(plan) {
  const active = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED);
  const chunk = active.find((c) => c.id === plan.autopilot?.chunkId);
  return chunk ? { chunk, index: active.indexOf(chunk) + 1, total: active.length } : null;
}

// Runs that need watching, most urgent first.
const RUN_URGENCY = { [AUTOPILOT_STATUS.FAILED]: 0, [AUTOPILOT_STATUS.PAUSED]: 1, [AUTOPILOT_STATUS.RUNNING]: 2 };

/** Sort key: plans with a failed, then paused, then running run first; the rest after. */
export const runRank = (plan) => RUN_URGENCY[plan.autopilot?.status] ?? 3;

/**
 * The tab the plan is working in: its auto-pilot run's (finished runs count
 * until dismissed), else the tab of a chunk in flight or awaiting its fix.
 */
export function planTabId(plan) {
  const ap = plan.autopilot;
  if (ap?.tabId && ap.status !== AUTOPILOT_STATUS.OFF) return ap.tabId;
  return plan.chunks.find((c) => c.tabId && (c.status === CHUNK_STATUS.IN_PROGRESS || c.awaitingFix))?.tabId ?? null;
}

// --- New and loaded plans ---

/** Chunks from a split, numbered from 1, with nothing done yet. */
export function newChunks(chunks) {
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
    result: null, // what the agent said when a chunk was done with nothing to commit
    decisions: [], // its Decision: lines, passed on to later chunks' prompts
    startedAt: null,
    doneAt: null,
  }));
}

export const renumber = (chunks) => chunks.map((c, i) => (c.n === i + 1 ? c : { ...c, n: i + 1 }));

/** A plan as read from disk: a split can't survive a restart, and auto-pilot's tab is gone. */
export function normalizeLoadedPlan(p) {
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
}

/** A new plan's git settings: in place, on its own branch, from `base` in the one repo. */
export function defaultGitConfig(repoRoot, slug, base) {
  return {
    worktrees: false,
    branch: defaultBranch(slug),
    repos: [{ root: repoRoot, base, workPath: null, prepared: false }],
    workDir: null,
    preparedAt: null,
  };
}

// --- Chunk patches ---

/** Sent to the agent in `tabId`, from `baseShas` (each repo's HEAD; `primaryRoot`'s is baseSha). */
export function toInProgress({ tabId, baseShas, primaryRoot, now = Date.now() }) {
  return {
    status: CHUNK_STATUS.IN_PROGRESS,
    tabId,
    baseSha: baseShas[primaryRoot] ?? null,
    baseShas,
    commits: [],
    commitsByRepo: {},
    needsCommit: false,
    awaitingFix: false,
    result: null,
    decisions: [],
    startedAt: now,
    doneAt: null,
  };
}

/**
 * Its commits landed, or it was done with nothing to commit (no commits, and
 * `result` says what the agent did). A fix commit on an implemented chunk
 * keeps the first doneAt. `decisions` replaces the chunk's; left out, they stay.
 */
export function toImplemented(chunk, { commits, commitsByRepo, result = null, decisions, now = Date.now() }) {
  return {
    status: CHUNK_STATUS.IMPLEMENTED,
    commits,
    commitsByRepo,
    needsCommit: false,
    awaitingFix: false,
    result,
    decisions: decisions ?? chunk.decisions ?? [],
    doneAt: chunk.status === CHUNK_STATUS.IMPLEMENTED ? chunk.doneAt : now,
  };
}

/** Its commits were reverted by `revertShas`. */
export function toRolledBack(revertShas) {
  return {
    status: CHUNK_STATUS.ROLLED_BACK,
    revertShas,
    commits: [],
    commitsByRepo: {},
    needsCommit: false,
    awaitingFix: false,
    result: null,
    decisions: [],
    doneAt: null,
  };
}
