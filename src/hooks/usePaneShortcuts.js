import { useEffect } from 'react';
import { requestJobsPane } from '../features/agent-jobs/jobsPane';

// Panes are numbered like lazygit's: [1] files, [2] terminal, [3] prompt, [4] jobs.
// Each pane root carries data-pane="N"; an element inside it marked
// data-pane-focus is where keyboard focus lands.
const FOCUSABLE = '[data-pane-focus], .xterm-helper-textarea, textarea, input, [tabindex]:not([tabindex="-1"])';

/** The pane N of the tab currently on screen (inactive tabs are display:none). */
export function findVisiblePane(n) {
  return [...document.querySelectorAll(`[data-pane="${n}"]`)].find((el) => el.offsetParent !== null) || null;
}

export function focusPane(n) {
  const pane = findVisiblePane(n);
  if (n === 4 && (!pane || !pane.querySelector(FOCUSABLE))) {
    // Collapsed or not yet mounted: open it, then focus once it has rendered.
    requestJobsPane('open');
    requestAnimationFrame(() => requestAnimationFrame(() => focusPane4Content()));
    return;
  }
  if (!pane) return;
  const target = pane.querySelector(FOCUSABLE) || pane;
  target.focus({ preventScroll: true });
}

function focusPane4Content() {
  const pane = findVisiblePane(4);
  (pane?.querySelector(FOCUSABLE) || pane)?.focus({ preventScroll: true });
}

/** Alt+1…4 moves keyboard focus between panes. Capture phase, so xterm can't swallow it. */
export function usePaneShortcuts() {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const match = /^Digit([1-4])$/.exec(e.code);
      if (!match) return;
      e.preventDefault();
      e.stopPropagation();
      focusPane(Number(match[1]));
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
