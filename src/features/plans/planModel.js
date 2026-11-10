// The plan's vocabulary: the status strings stored in plan.json, the
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
  QUEUED: 'queued', // written by the `lirah` CLI while the app was closed; split when the plans load
});

/** Where a plan is in its life, furthest first reached last. Derived, never stored. */
export const PLAN_STAGE = Object.freeze({
  PLANNED: 'planned',
  BUILDING: 'building',
  IMPLEMENTED: 'implemented',
  PR_OPEN: 'pr-open',
  MERGED: 'merged',
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
/** A stopped run in a word or two: what broke, or that it needs you. */
const HALT_WORD = {
  [HALT_REASON.SEND_FAILED]: 'send failed',
  [HALT_REASON.GIT_ERROR]: 'git error',
  [HALT_REASON.AGENT_ERROR]: 'agent error',
  [HALT_REASON.TAB_CLOSED]: 'tab closed',
  [HALT_REASON.BLOCKED]: 'blocked',
};
export function haltWord(ap) {
  if (ap?.status === AUTOPILOT_STATUS.PAUSED) return ap.reason === HALT_REASON.BLOCKED ? 'waiting' : 'needs you';
  return HALT_WORD[ap?.reason] ?? 'error';
}

export const AUTO_RESUME_REASONS = new Set([
  HALT_REASON.NEEDS_INPUT, HALT_REASON.NO_COMMIT, HALT_REASON.PERMISSION,
]);

/** Does the run handle its agent's Stop itself? Otherwise (paused after a restart, no hooks) the chunk is checked like one sent by hand. */
export function stopDrivesRun(ap) {
  return ap?.status === AUTOPILOT_STATUS.RUNNING || AUTO_RESUME_REASONS.has(ap?.reason);
}

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

/** The furthest stage the plan has reached (plan.merged and plan.pr are saved by planLifecycle.js). */
export function planStage(plan) {
  if (plan.merged) return PLAN_STAGE.MERGED;
  if (plan.pr?.state === 'OPEN') return PLAN_STAGE.PR_OPEN;
  const { done, total } = planProgress(plan);
  if (total > 0 && done === total) return PLAN_STAGE.IMPLEMENTED;
  return planStarted(plan) ? PLAN_STAGE.BUILDING : PLAN_STAGE.PLANNED;
}

/**
 * The dated stages the plan went through, oldest first: `idea` when its task
 * (if any) was created, then each PLAN_STAGE it reached.
 */
export function planLifecycle(plan, task = null) {
  const active = plan.chunks.filter((c) => c.status !== CHUNK_STATUS.SKIPPED);
  const starts = active.map((c) => c.startedAt).filter(Boolean);
  const { done, total } = planProgress(plan);
  const dones = active.map((c) => c.doneAt).filter(Boolean);
  return [
    task?.createdAt && { stage: 'idea', at: task.createdAt },
    { stage: PLAN_STAGE.PLANNED, at: plan.createdAt },
    starts.length > 0 && { stage: PLAN_STAGE.BUILDING, at: Math.min(...starts) },
    total > 0 && done === total && dones.length > 0 && { stage: PLAN_STAGE.IMPLEMENTED, at: Math.max(...dones) },
    plan.pr?.createdAt && { stage: PLAN_STAGE.PR_OPEN, at: Date.parse(plan.pr.createdAt) },
    plan.merged?.at && { stage: PLAN_STAGE.MERGED, at: plan.merged.at },
  ].filter(Boolean);
}

/** A stage's date as the plan views show it: 5 Nov. */
export const shortDate = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

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
 * The tab the plan is working in: its own dedicated tab, else its auto-pilot
 * run's (finished runs count until dismissed), else the tab of a chunk in
 * flight or awaiting its fix.
 */
export function planTabId(plan) {
  if (plan.tabId) return plan.tabId;
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
    prompts: [], // { kind, at, file } per prompt sent for it (chunk, fix, nudge)
    startedAt: null,
    doneAt: null,
  }));
}

export const renumber = (chunks) => chunks.map((c, i) => (c.n === i + 1 ? c : { ...c, n: i + 1 }));

/** A plan as read from disk: a split can't survive a restart, and auto-pilot's tab is gone. */
export function normalizeLoadedPlan(p) {
  let next = p.split === SPLIT_STATUS.RUNNING ? { ...p, split: SPLIT_STATUS.FAILED, splitError: 'Interrupted — the app was closed.' } : p;
  const { done, total } = planProgress(p);
  if (isAutopilotLive(p.autopilot) && total > 0 && done === total) {
    // Closed after the last chunk landed: resuming would only mark it done.
    next = { ...next, autopilot: { ...p.autopilot, status: AUTOPILOT_STATUS.DONE, chunkId: null, reason: null, message: null, endedAt: p.autopilot.endedAt ?? Date.now() } };
  } else if (isAutopilotLive(p.autopilot)) {
    next = {
      ...next,
      autopilot: {
        ...p.autopilot,
        status: AUTOPILOT_STATUS.PAUSED,
        reason: HALT_REASON.APP_RESTARTED,
        message: 'The app closed during the run. Resume to pick up where it stopped.',
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

/** A plan in a folder with no git repo: no repos, worked in place, nothing to prepare. */
export function noGitConfig(root) {
  return { noGit: true, worktrees: false, branch: '', repos: [], workDir: root, preparedAt: 1 };
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
    doneRequested: null,
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
    doneRequested: null, // { result } from `lirah plans done` while the app was closed
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

/** The month folder a plan lives in, `YYYY-MM` in local time, from its createdAt. */
export function planMonth(ts = Date.now()) {
  const d = new Date(ts ?? Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** A plan's folder under ~/.lirah: `plans/<YYYY-MM>/<id>`. */
export const planDir = (plan) => `plans/${planMonth(plan.createdAt)}/${plan.id}`;

/** Where plan .md files go: `<home>/.lirah/plans/<YYYY-MM>` (the month of `ts`). */
export const planFilesDir = (home, ts) => `${home}/.lirah/plans/${planMonth(ts)}`;
