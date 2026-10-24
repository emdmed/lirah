import { useState } from 'react';
import { createStore, useStore } from '../../lib/createStore';

// A tab's live session token usage, held outside React state. The usage poll
// lands every few seconds while an agent works; keeping it in the tab's state
// re-rendered the whole tab (sidebar, file tree, prompt) each time. Now only
// the readers that subscribe with useTokenUsageValue re-render.
export function useTokenUsageStore() {
  const [store] = useState(() => createStore(null));
  return store;
}

export function useTokenUsageValue(store) {
  return useStore(store);
}
