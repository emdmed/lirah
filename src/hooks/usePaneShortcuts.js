import { useEffect } from 'react';
import { matches } from '../lib/shortcuts';
import { requestJobsPane } from '../features/agent-jobs/jobsPane';

// Panes are numbered like lazygit's: [1] files, [2] terminal, [3] prompt, [4] jobs.
// Each pane root carries data-pane="N"; an element inside it marked
// data-pane-focus is where keyboard focus lands.
// In priority order: querySelector with a selector list returns the first match
// in document order, which let a header input beat the pane's real target.
const FOCUSABLE = ['[data-pane-focus]', '.xterm-helper-textarea', 'textarea', 'input', '[tabindex]:not([tabindex="-1"])'];

function findFocusTarget(pane) {
  for (const selector of FOCUSABLE) {
    const el = pane.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/** The pane N of the tab currently on screen. Inactive tabs stay laid out
 *  (visibility:hidden, moved off-screen), so offsetParent alone can't tell. */
export function findVisiblePane(n) {
  return [...document.querySelectorAll(`[data-pane="${n}"]`)].find(
    (el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden',
  ) || null;
}

export function focusPane(n) {
  const pane = findVisiblePane(n);
  if (n === 4 && (!pane || !findFocusTarget(pane))) {
    // Collapsed or not yet mounted: open it, then focus once it has rendered.
    requestJobsPane('open');
    requestAnimationFrame(() => requestAnimationFrame(() => focusPane4Content()));
    return;
  }
  if (!pane) return;
  const target = findFocusTarget(pane) || pane;
  target.focus({ preventScroll: true });
}

function focusPane4Content() {
  const pane = findVisiblePane(4);
  if (pane) (findFocusTarget(pane) || pane).focus({ preventScroll: true });
}

/** Alt+1…4 moves keyboard focus between panes. Capture phase, so xterm can't swallow it. */
export function usePaneShortcuts() {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!matches('pane-focus', e)) return;
      e.preventDefault();
      e.stopPropagation();
      focusPane(Number(e.code.slice(-1))); // Digit1…Digit4
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
