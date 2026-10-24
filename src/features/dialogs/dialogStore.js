import { createContext } from 'react';

// Which dialogs are open, keyed by scope: a tab id, or null for app-wide
// dialogs. Kept outside React state so opening a dialog in one tab only
// re-renders the hooks reading that tab's scope.
export function createDialogStore() {
  const scopes = new Map(); // scope -> { [id]: props }
  const listeners = new Set();

  const read = (scope) => scopes.get(scope) ?? EMPTY;

  const write = (scope, next) => {
    if (next === read(scope)) return;
    if (Object.keys(next).length === 0) scopes.delete(scope);
    else scopes.set(scope, next);
    listeners.forEach((l) => l());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    isOpen: (id, scope = null) => id in read(scope),
    open(id, props = {}, scope = null) {
      write(scope, { ...read(scope), [id]: props });
    },
    close(id, scope = null) {
      const cur = read(scope);
      if (!(id in cur)) return;
      const { [id]: _closed, ...rest } = cur;
      write(scope, rest);
    },
    closeScope(scope) {
      if (scopes.has(scope)) write(scope, EMPTY);
    },
  };
}

const EMPTY = Object.freeze({});

// Set by each tab (DialogScope): which scope `useDialog()` opens into, and
// whether that tab is on screen. ui/dialog.jsx reads `active` to hide a
// tab's dialogs while another tab is showing.
export const DialogScopeContext = createContext(null);
