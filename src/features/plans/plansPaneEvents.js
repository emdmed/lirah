// Lets the command palette open the plans pane without sharing RightSidebar's
// state. Reuses the jobs pane event: RightSidebar switches to `tab` when given.
import { JOBS_PANE_EVENT } from '../agent-jobs/jobsPane';

/** @param {'open' | 'toggle'} action */
export function requestPlansPane(action = 'open') {
  window.dispatchEvent(new CustomEvent(JOBS_PANE_EVENT, { detail: { action, tab: 'plans' } }));
}

// A plan to open in the pane, e.g. from a notification or the status bar. Kept
// until the pane has that plan's repo loaded: the pane may not be mounted yet,
// or still showing another tab's repo.
const PLAN_FOCUS_EVENT = 'lirah:plans-focus';
let pendingPlanId = null;

export function requestPlanFocus(planId) {
  pendingPlanId = planId;
  requestPlansPane('open');
  window.dispatchEvent(new CustomEvent(PLAN_FOCUS_EVENT));
}

export function subscribePlanFocus(fn) {
  window.addEventListener(PLAN_FOCUS_EVENT, fn);
  return () => window.removeEventListener(PLAN_FOCUS_EVENT, fn);
}

/** The pending plan id if it is one of `plans` (and clears it), else null. */
export function takePlanFocus(plans) {
  if (!pendingPlanId || !plans?.some((p) => p.id === pendingPlanId)) return null;
  const id = pendingPlanId;
  pendingPlanId = null;
  return id;
}

// The command palette's `autopilot`: start or stop auto-pilot on the plan the
// pane shows. Pending like a focus request, but only briefly, so a request the
// pane can't serve (not a git repo) doesn't fire much later by surprise.
const AUTOPILOT_TOGGLE_EVENT = 'lirah:plans-autopilot-toggle';
const TOGGLE_TTL = 5000;
let toggleRequestedAt = 0;

export function requestAutopilotToggle() {
  toggleRequestedAt = Date.now();
  requestPlansPane('open');
  window.dispatchEvent(new CustomEvent(AUTOPILOT_TOGGLE_EVENT));
}

export function subscribeAutopilotToggle(fn) {
  window.addEventListener(AUTOPILOT_TOGGLE_EVENT, fn);
  return () => window.removeEventListener(AUTOPILOT_TOGGLE_EVENT, fn);
}

/** Whether a toggle is pending (and clears it). */
export function takeAutopilotToggle() {
  const pending = Date.now() - toggleRequestedAt < TOGGLE_TTL;
  toggleRequestedAt = 0;
  return pending;
}
