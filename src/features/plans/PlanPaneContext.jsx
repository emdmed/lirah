import { createContext, useContext } from 'react';

// What the plans pane hands down to the open plan and its chunks: which action
// is in flight (state, changes often) and the pane's own handlers (actions).
// Plan data and store actions come from usePlansActions directly.

/** The action in flight, one at a time. */
export const BUSY = Object.freeze({
  REVIEW_ALL: 'review-all', // gathering the whole plan's diff
  GIT_SETUP: 'git-setup', // changing the git settings
  chunk: (chunkId) => `chunk:${chunkId}`, // an action on one chunk
});

const PlanPaneStateContext = createContext(null);
const PlanPaneActionsContext = createContext(null);

export function PlanPaneProvider({ busy, actions, children }) {
  return (
    <PlanPaneActionsContext.Provider value={actions}>
      <PlanPaneStateContext.Provider value={busy}>{children}</PlanPaneStateContext.Provider>
    </PlanPaneActionsContext.Provider>
  );
}

/** Whether `key` (a BUSY key) is the action in flight. */
export function useBusy(key) {
  return useContext(PlanPaneStateContext) === key;
}

/**
 * The pane's handlers: repoRoot, closePlan, and the actions that confirm, set
 * up git or toast before calling the store (implement, check, commit, review,
 * rollback, autopilot, resume, reviewAll, deletePlan, addRepo, removeWorktrees).
 */
export function usePlanPane() {
  const ctx = useContext(PlanPaneActionsContext);
  if (!ctx) throw new Error('usePlanPane must be used within a PlanPaneProvider');
  return ctx;
}
