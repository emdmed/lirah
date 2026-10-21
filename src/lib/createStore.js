import { useSyncExternalStore } from 'react';

/**
 * A set of listeners: subscribe(fn) returns the unsubscribe function, emit(...)
 * calls each one. `onStart` runs before the first listener is added and
 * `onStop` after the last one is removed, e.g. to attach a window listener only
 * while someone is listening.
 */
export function createEmitter({ onStart, onStop } = {}) {
  const listeners = new Set();
  return {
    subscribe(fn) {
      if (listeners.size === 0) onStart?.();
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) onStop?.();
      };
    },
    emit(...args) {
      for (const fn of listeners) fn(...args);
    },
  };
}

/** One value with get/set/subscribe. set takes a value or an updater, like a state setter, and skips unchanged values. */
export function createStore(initial) {
  let value = initial;
  const { subscribe, emit } = createEmitter();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? next(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      emit();
    },
    subscribe,
  };
}

/** The store's current value; re-renders when it changes. */
export function useStore(store) {
  return useSyncExternalStore(store.subscribe, store.get);
}
