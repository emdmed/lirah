import { useState } from 'react';
import { createStore, useStore } from '../lib/createStore';

// The prompt text, held outside React state. Typing used to re-render the
// whole tab (sidebar, dialogs, tree); now only components that subscribe with
// usePromptText re-render, and everything else reads it on demand via get().
// set() accepts a value or an updater, like a state setter.
export function usePromptStore(initial = '') {
  const [store] = useState(() => createStore(initial));
  return store;
}

export function usePromptText(store) {
  return useStore(store);
}
