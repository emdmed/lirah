import { useCallback, useRef, useSyncExternalStore } from 'react';
import { getFileActivity, subscribeFileActivity } from '../../features/tabs/agentHookState';

const noSubscribe = () => () => {};

// What agents read or edited this turn, from any terminal: `files` by path, and
// `folders` holding the strongest mark of anything inside them, open or closed.
// Marks only; the tree's open state is untouched. The maps are built once per
// change in agentHookState and shared by every tree; rows look up their own
// path, so nothing outside the tree's root is ever read.
//
// While `enabled` is false (a tab in the background) it stops listening and
// keeps the last marks it saw; re-enabling picks up the current ones.
export function useAgentFileActivity(enabled = true) {
  const on = enabled !== false;
  const lastRef = useRef(null);
  const getSnapshot = useCallback(() => {
    if (on || !lastRef.current) lastRef.current = getFileActivity();
    return lastRef.current;
  }, [on]);
  return useSyncExternalStore(on ? subscribeFileActivity : noSubscribe, getSnapshot);
}

// One primitive per row, so TreeNode's shallow memo holds.
export function markKey(mark) {
  return mark ? `${mark.kind}${mark.live ? '-live' : ''}` : undefined;
}
