// Lets other parts of the app (status line, pane shortcuts, command palette)
// open the jobs pane without sharing RightSidebar's state.
import { APP_EVENTS, createRequest } from '../../lib/appEvents';

export const jobsPaneRequest = createRequest(APP_EVENTS.jobsPane);

/** @param {'open' | 'toggle'} action */
export function requestJobsPane(action = 'open') {
  jobsPaneRequest.request({ action });
}
