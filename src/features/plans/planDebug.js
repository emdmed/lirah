// What's stuck or broken in a plan, and the repair for each, for `lirah plans
// debug`. Pure: the caller gathers what it needs from the app (open tabs, each
// tab's agent state, files on disk) and applies the fixes.
import { AUTOPILOT_STATUS, CHUNK_STATUS, isAutopilotLive, planStarted, SPLIT_STATUS } from './planModel';
import { planGit } from './planGit';

/** Repairs `lirah plans debug --fix` can apply. */
export const DEBUG_FIX = Object.freeze({
  RESPLIT: 'resplit', // split the plan's source into chunks again
  RECHECK: 'recheck', // look for the chunk's commits again
  RESET: 'reset', // nothing came of the chunk: back to pending, to send again
  REIMPORT: 'reimport', // take the edited plan file's text and split it again
});

/** A chunk nothing came of, back to pending so it can be sent again. */
export const PENDING_PATCH = Object.freeze({
  status: CHUNK_STATUS.PENDING, tabId: null, baseSha: null, baseShas: {}, needsCommit: false, awaitingFix: false,
});

const BUSY = new Set(['working', 'permission']);

/**
 * Findings for `plan`, each `{ code, chunk?, problem, fix, hint? }`; `fix` is a
 * DEBUG_FIX or null when it needs a person. `env`:
 * - tabIds: Set of open tab ids
 * - agentState(tabId): the tab's agent state ('working', 'done', ...) or null
 * - missingPaths: Set of worktree paths that are gone
 * - fileHash: hash of the plan file now, null if it's gone, undefined if not read
 */
export function diagnosePlan(plan, { tabIds = new Set(), agentState = () => null, missingPaths = new Set(), fileHash } = {}) {
  const found = [];
  const add = (f) => found.push({ fix: null, ...f });
  const live = isAutopilotLive(plan.autopilot);

  if (plan.split === SPLIT_STATUS.FAILED) {
    add({ code: 'split-failed', problem: `splitting into chunks failed: ${plan.splitError || 'no reason given'}`, fix: DEBUG_FIX.RESPLIT });
  } else if (plan.split === SPLIT_STATUS.DONE && plan.chunks.length === 0) {
    add({ code: 'no-chunks', problem: 'the split finished with no chunks', fix: DEBUG_FIX.RESPLIT });
  } else if (plan.split === SPLIT_STATUS.RUNNING) {
    add({ code: 'splitting', problem: 'still splitting into chunks', hint: 'wait a moment and debug again' });
  }

  const inProgress = plan.chunks.filter((c) => c.status === CHUNK_STATUS.IN_PROGRESS);
  if (inProgress.length > 1) {
    add({ code: 'many-in-progress', problem: `${inProgress.length} chunks are in progress at once (${inProgress.map((c) => c.n).join(', ')})`, hint: 'finish or roll back all but one from the plans pane' });
  }

  for (const c of plan.chunks) {
    const tabGone = !!c.tabId && !tabIds.has(c.tabId);
    const busy = !tabGone && BUSY.has(agentState(c.tabId));
    if (c.status === CHUNK_STATUS.IN_PROGRESS && !c.needsCommit) {
      if (!c.tabId || tabGone) {
        add({ code: 'orphaned', chunk: c.n, problem: `chunk ${c.n} is in progress but the tab it was sent to is closed`, fix: DEBUG_FIX.RESET });
      } else if (!busy) {
        add({ code: 'idle', chunk: c.n, problem: `chunk ${c.n} is in progress but its tab's agent isn't working`, fix: DEBUG_FIX.RECHECK });
      }
    }
    if (c.needsCommit) {
      add({
        code: 'no-commit', chunk: c.n, problem: `chunk ${c.n}: the agent stopped without committing`, fix: DEBUG_FIX.RECHECK,
        hint: 'commit the chunk\'s work, or `lirah plans done <plan> <chunk> --result "..."` if there is nothing to commit',
      });
    }
    if (c.awaitingFix && !busy) {
      add({ code: 'fix-stalled', chunk: c.n, problem: `chunk ${c.n} waits for a fix commit and no agent is working on it`, fix: DEBUG_FIX.RECHECK });
    }
  }

  const ap = plan.autopilot;
  if (ap && (ap.status === AUTOPILOT_STATUS.PAUSED || ap.status === AUTOPILOT_STATUS.FAILED)) {
    add({
      code: `autopilot-${ap.status}`, problem: `autopilot ${ap.status}${ap.reason ? ` (${ap.reason})` : ''}: ${ap.message || 'no message'}`,
      hint: 'resume or dismiss it from the plans pane',
    });
  }

  const cfg = planGit(plan);
  for (const r of cfg.repos || []) {
    if (cfg.worktrees && cfg.preparedAt && !cfg.removedAt && r.workPath && missingPaths.has(r.workPath)) {
      add({ code: 'worktree-missing', problem: `the worktree ${r.workPath} for ${r.root} is gone`, hint: 'recreate it with `git worktree add` on the plan branch, or delete the plan and import it again' });
    }
  }

  if (plan.importedFrom && fileHash !== undefined) {
    if (fileHash === null) {
      add({ code: 'file-gone', problem: `the plan file ${plan.importedFrom.path} is gone`, hint: 'nothing breaks; the plan keeps its own copy' });
    } else if (fileHash !== plan.importedFrom.hash) {
      const ok = !planStarted(plan) && !live;
      add({
        code: 'file-changed', problem: `${plan.importedFrom.path} was edited after it was imported`,
        fix: ok ? DEBUG_FIX.REIMPORT : null, hint: ok ? undefined : 'the plan has started; import the file as a new plan if the edits matter',
      });
    }
  }
  return found;
}
