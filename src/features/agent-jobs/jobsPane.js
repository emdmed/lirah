// Lets other parts of the app (status line, pane shortcuts, command palette)
// open the jobs pane without sharing RightSidebar's state.
import { APP_EVENTS, createRequest } from '../../lib/appEvents';
import { getSettings, setSetting } from '../settings/settingsStore';

export const jobsPaneRequest = createRequest(APP_EVENTS.jobsPane);

/**
 * @param {'open' | 'toggle'} action
 * @param {string} [tab] section to show; omitted keeps the current one
 */
export function requestJobsPane(action = 'open', tab) {
  jobsPaneRequest.request({ action, tab });
}

/** The tabs list lives in the files pane: show it there (toggle goes back to files). */
export function requestTabsPane(action = 'open') {
  const toFiles = action === 'toggle' && getSettings().sidebarSection === 'tabs';
  setSetting('sidebarSection', toFiles ? 'files' : 'tabs');
}
