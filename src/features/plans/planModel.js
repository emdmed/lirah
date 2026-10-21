// The plan's vocabulary: the status strings stored in plans.json and the
// predicates over them. Pure, no React. The values are persisted, so they never
// change; add new ones instead.

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
