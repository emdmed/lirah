import { useCallback, useEffect, useRef } from 'react';
import { getAgentHookState } from '../tabs/agentHookState';
import { getTabSession } from '../tabs/terminalActivity';
import { AUTOPILOT_STATUS, HALT_REASON } from './planModel';

// A prompt typed into the tab shows up as a hook event within a second or two.
// None by then means the hooks aren't reaching Lirah, and the run would wait
// forever for a Stop that never comes.
const HOOK_TIMEOUT_MS = 30_000;
const NO_HOOKS_MESSAGE = 'Sent the chunk, but the agent\'s hooks never reported back, so auto-pilot can\'t tell when it finishes. '
  + 'Launch the agent with Lirah\'s launcher (Ctrl+K) so it loads the hook plugin, then resume.';

/** Has the agent in `tabId` reported through its hooks since `sentAt`? */
function hooksHeardSince(tabId, sentAt) {
  const s = getAgentHookState(getTabSession(tabId));
  // Mid-turn (a long tool call, a prompt) it can be quiet a while: it got the prompt queued.
  return !!s && (s.at >= sentAt || s.state === 'working' || s.state === 'permission');
}

/**
 * Auto-pilot's check that the agent's hooks are reaching Lirah. Returns
 * `expectHooks(repoRoot, planId)`, called after each send: if the run is still
 * on the same chunk and the agent stays silent, it pauses with no-hooks.
 */
export function useHookWatchdog({ findPlan, halt }) {
  // One pending hook check per plan, replaced by each send.
  const hookChecksRef = useRef(new Map()); // planId -> timeout id
  useEffect(() => () => {
    for (const id of hookChecksRef.current.values()) clearTimeout(id);
  }, []);

  return useCallback((repoRoot, planId) => {
    const checks = hookChecksRef.current;
    clearTimeout(checks.get(planId));
    const sentAt = Date.now();
    const chunkId = findPlan(repoRoot, planId)?.autopilot?.chunkId;
    checks.set(planId, setTimeout(() => {
      checks.delete(planId);
      const ap = findPlan(repoRoot, planId)?.autopilot;
      if (ap?.status !== AUTOPILOT_STATUS.RUNNING || ap.chunkId !== chunkId) return;
      if (hooksHeardSince(ap.tabId, sentAt)) return;
      halt(repoRoot, planId, AUTOPILOT_STATUS.PAUSED, HALT_REASON.NO_HOOKS, NO_HOOKS_MESSAGE);
    }, HOOK_TIMEOUT_MS));
  }, [findPlan, halt]);
}
