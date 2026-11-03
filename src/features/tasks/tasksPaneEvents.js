// Lets the command palette and the Alt+Q shortcut open the tasks pane without
// sharing RightSidebar's state. Reuses the jobs pane event, like plans.
import { APP_EVENTS, createRequest } from '../../lib/appEvents';
import { jobsPaneRequest } from '../agent-jobs/jobsPane';

/** @param {'open' | 'toggle'} action */
export function requestTasksPane(action = 'open') {
  jobsPaneRequest.request({ action, tab: 'tasks' });
}

// Focus the quick-add field. Pending, since the pane may mount only after the
// switch to its tab.
const quickAdd = createRequest(APP_EVENTS.tasksQuickAdd, {
  pending: true,
  ttl: 5000,
  before: () => requestTasksPane('open'),
});

/** `text` prefills the field, e.g. from the palette's `:task fix the login`. */
export const requestQuickTask = (text) => quickAdd.request(text?.trim() || true);
export const subscribeQuickTask = quickAdd.subscribe;
/** The pending request (true, or text to prefill) and clears it; null when none. */
export const takeQuickTask = () => quickAdd.take();
