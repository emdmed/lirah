// Lets the command palette open the plans pane without sharing RightSidebar's
// state. Reuses the jobs pane event: RightSidebar switches to `tab` when given.
import { APP_EVENTS, createRequest } from '../../lib/appEvents';
import { jobsPaneRequest } from '../agent-jobs/jobsPane';

/** @param {'open' | 'toggle'} action */
export function requestPlansPane(action = 'open') {
  jobsPaneRequest.request({ action, tab: 'plans' });
}

// A plan to open in the pane, e.g. from a notification or the status bar. Kept
// until the pane has that plan's repo loaded: the pane may not be mounted yet,
// or still showing another tab's repo.
const planFocus = createRequest(APP_EVENTS.plansFocus, { pending: true, before: () => requestPlansPane('open') });

export const requestPlanFocus = (planId) => planFocus.request(planId);
export const subscribePlanFocus = planFocus.subscribe;

/** The pending plan id if it is one of `plans` (and clears it), else null. */
export const takePlanFocus = (plans) => planFocus.take((id) => !!plans?.some((p) => p.id === id));

// The command palette's `autopilot`: start or stop auto-pilot on the plan the
// pane shows. Pending like a focus request, but only briefly, so a request the
// pane can't serve (not a git repo) doesn't fire much later by surprise.
const autopilotToggle = createRequest(APP_EVENTS.plansAutopilotToggle, {
  pending: true,
  ttl: 5000,
  before: () => requestPlansPane('open'),
});

export const requestAutopilotToggle = () => autopilotToggle.request();
export const subscribeAutopilotToggle = autopilotToggle.subscribe;

/** Whether a toggle is pending (and clears it). */
export const takeAutopilotToggle = () => autopilotToggle.take() !== null;

// The command palette's `plan next` / `plan implement`, for the open plan's
// next chunk. Pending briefly, like the auto-pilot toggle.
const chunkCommand = createRequest(APP_EVENTS.plansChunkCommand, {
  pending: true,
  ttl: 5000,
  before: () => requestPlansPane('open'),
});

/** @param {'next' | 'implement'} action */
export const requestPlanChunkCommand = (action) => chunkCommand.request(action);
export const subscribePlanChunkCommand = chunkCommand.subscribe;
/** The pending action (and clears it), or null. */
export const takePlanChunkCommand = () => chunkCommand.take();
