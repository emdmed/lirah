// Lets other parts of the app (status line, pane shortcuts, command palette)
// open the jobs pane without sharing RightSidebar's state.
export const JOBS_PANE_EVENT = 'lirah:jobs-pane';

/** @param {'open' | 'toggle'} action */
export function requestJobsPane(action = 'open') {
  window.dispatchEvent(new CustomEvent(JOBS_PANE_EVENT, { detail: { action } }));
}
