import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createDialogStore, DialogScopeContext } from './dialogStore';

// One home for every dialog. The provider owns which dialogs are open (per
// tab, or app-wide) and the shared confirm. Dialogs are drawn by outlets:
// GlobalDialogOutlet for app-wide ones, DialogHost inside each tab.
//
//   const dialog = useDialog();
//   dialog.open('settings');                 // in the current tab
//   dialog.open('newTab', {}, null);         // app-wide
//   const ok = await dialog.confirm({ title: 'Discard job', confirmLabel: 'discard' });

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [store] = useState(createDialogStore);
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  // A second request while one is open cancels the first.
  const confirm = useCallback((options) => {
    resolveRef.current?.(false);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setRequest({ confirmLabel: 'Continue', destructive: true, ...options });
    });
  }, []);

  const value = useMemo(() => ({ store, confirm }), [store, confirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <ConfirmDialog request={request} settle={settle} />
    </DialogContext.Provider>
  );
}

function ConfirmDialog({ request, settle }) {
  const fault = !!request?.destructive;
  const label = request?.confirmLabel ?? 'Continue';
  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) settle(false); }}>
      {request && (
        <DialogContent
          role="alertdialog"
          size="sm"
          tone={fault ? 'fault' : undefined}
          escLabel="cancel"
          hints={[{ keys: ['↵'], label: typeof label === 'string' ? label.toLowerCase() : 'confirm' }]}
        >
          <DialogTitle>{request.title}</DialogTitle>
          {request.description ? (
            <DialogDescription className="leading-relaxed">{request.description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{request.title}</DialogDescription>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => settle(false)}>Cancel</Button>
            <Button
              variant={fault ? 'destructive' : 'default'}
              size="sm"
              autoFocus
              onClick={() => settle(true)}
            >
              {label}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function useDialogContext() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

// Open and close dialogs by registry id. Inside a tab, the tab is the default
// scope; pass `null` as the scope for an app-wide dialog.
export function useDialog() {
  const { store, confirm } = useDialogContext();
  const scopeCtx = useContext(DialogScopeContext);
  const here = scopeCtx ? scopeCtx.scope : null;
  return useMemo(() => ({
    open: (id, props, scope = here) => store.open(id, props, scope),
    close: (id, scope = here) => store.close(id, scope),
    isOpen: (id, scope = here) => store.isOpen(id, scope),
    confirm,
  }), [store, confirm, here]);
}

export function useConfirm() {
  return useDialogContext().confirm;
}

// The open dialogs in one scope: { [id]: props }. Re-renders only when that
// scope changes.
export function useOpenDialogs(scope) {
  const { store } = useDialogContext();
  return useSyncExternalStore(store.subscribe, () => store.read(scope));
}

export function useDialogStore() {
  return useDialogContext().store;
}

// Wraps a tab. Dialogs opened inside it belong to the tab, hide while another
// tab is showing, and close for good when the tab closes.
export function DialogScope({ scope, active, children }) {
  const { store } = useDialogContext();
  const value = useMemo(() => ({ scope, active }), [scope, active]);
  useEffect(() => () => store.closeScope(scope), [store, scope]);
  return <DialogScopeContext.Provider value={value}>{children}</DialogScopeContext.Provider>;
}
