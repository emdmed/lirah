import { useEffect } from 'react';

// Each tab's auto-commit stage, for the tabs summary pane. Plain module state,
// like tabContextFill: the tab writes it and the pane reads it on its own tick.

const stages = new Map(); // tabId -> stage (never 'idle')

export function getTabAutoCommit(tabId) {
  return stages.get(tabId) ?? null;
}

/** Publishes `tabId`'s auto-commit stage while one is running. */
export function useTabAutoCommit(tabId, stage) {
  useEffect(() => {
    if (!tabId) return;
    if (stage === 'idle') stages.delete(tabId);
    else stages.set(tabId, stage);
  }, [tabId, stage]);
  useEffect(() => () => stages.delete(tabId), [tabId]);
}
