// Lets the command palette open the plans pane without sharing RightSidebar's
// state. Reuses the jobs pane event: RightSidebar switches to `tab` when given.
import { JOBS_PANE_EVENT } from '../agent-jobs/jobsPane';

/** @param {'open' | 'toggle'} action */
export function requestPlansPane(action = 'open') {
  window.dispatchEvent(new CustomEvent(JOBS_PANE_EVENT, { detail: { action, tab: 'plans' } }));
}
