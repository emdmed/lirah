import { useSyncExternalStore } from 'react';

// On while terminal 2 runs a full-window program (nvim, lazygit). Every Lirah
// keybind backs off so the program gets all keys. Module-level because the
// key handlers live in App and in every tab, and only one tab can hold it.
let focusMode = false;
const listeners = new Set();

export function isFocusMode() {
  return focusMode;
}

export function setFocusMode(on) {
  if (focusMode === on) return;
  focusMode = on;
  listeners.forEach((fn) => fn());
}

export function subscribeFocusMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useFocusMode() {
  return useSyncExternalStore(subscribeFocusMode, isFocusMode);
}
