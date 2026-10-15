import { useState, useSyncExternalStore } from 'react';

// The prompt text, held outside React state. Typing used to re-render the
// whole tab (sidebar, dialogs, tree); now only components that subscribe with
// usePromptText re-render, and everything else reads it on demand via get().
function createPromptStore() {
  let text = '';
  const listeners = new Set();
  return {
    get: () => text,
    // Accepts a value or an updater, like a state setter.
    set: (next) => {
      const value = typeof next === 'function' ? next(text) : next;
      if (value === text) return;
      text = value;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function usePromptStore() {
  const [store] = useState(createPromptStore);
  return store;
}

export function usePromptText(store) {
  return useSyncExternalStore(store.subscribe, store.get);
}
