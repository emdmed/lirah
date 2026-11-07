// Lets other parts of the app (status line, pane shortcuts, command palette)
// open the jobs pane without sharing RightSidebar's state.
import { APP_EVENTS, createRequest } from '../../lib/appEvents';

export const jobsPaneRequest = createRequest(APP_EVENTS.jobsPane);

/**
 * @param {'open' | 'toggle'} action
 * @param {string} [tab] section to show; omitted keeps the current one
 */
export function requestJobsPane(action = 'open', tab) {
  jobsPaneRequest.request({ action, tab });
}

/** @param {'open' | 'toggle'} action */
export function requestTabsPane(action = 'open') {
  jobsPaneRequest.request({ action, tab: 'tabs' });
}
