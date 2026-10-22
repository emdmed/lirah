import { useEffect } from 'react';
import { getContextFill } from '../../config/models';

// Each tab's last known context-window fill (0..1), for the tabs summary pane's
// moons. Token usage is only polled for the active tab, so a background tab
// keeps the fill it had when it was last active. Plain module state, like
// terminalActivity: the tab writes it and the pane reads it on its own tick.

const fills = new Map(); // tabId -> ratio

export function setTabContextFill(tabId, ratio) {
  if (ratio == null) fills.delete(tabId);
  else fills.set(tabId, ratio);
}

export function getTabContextFill(tabId) {
  return fills.get(tabId) ?? null;
}

/**
 * Publishes `tabId`'s fill from its token usage. Usage is only polled while
 * the tab is active, so publish then and keep the last value. A live session
 * with no usage yet is a new moon (0), not no moon.
 */
export function useTabContextFill(tabId, isActive, tokenUsage, terminalSessionId) {
  useEffect(() => {
    if (!tabId || !isActive) return;
    setTabContextFill(tabId, getContextFill(tokenUsage)?.ratio ?? (terminalSessionId ? 0 : null));
  }, [tabId, isActive, tokenUsage, terminalSessionId]);
  useEffect(() => () => setTabContextFill(tabId, null), [tabId]);
}
