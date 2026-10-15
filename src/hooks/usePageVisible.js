import { useSyncExternalStore } from 'react';

function subscribe(onChange) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function getSnapshot() {
  return document.visibilityState === 'visible';
}

// True while the window is visible. Polls gate on this so a minimised or
// hidden window does no background work.
export function usePageVisible() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
