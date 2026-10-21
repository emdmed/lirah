import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

const ConfirmContext = createContext(null);

// `const ok = await confirm({ title, description, confirmLabel, destructive })`
// One dialog for every "are you sure?" in the app, so destructive actions all
// ask the same way. Resolves false on Cancel, Escape or clicking outside.
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
  return context;
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const settle = useCallback((result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback((options) => {
    // A second request while one is open cancels the first.
    resolveRef.current?.(false);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setRequest({ confirmLabel: 'Continue', destructive: true, ...options });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog open={!!request} onOpenChange={(open) => { if (!open) settle(false); }}>
        {request && (
          <DialogContent
            className={request.destructive
              ? 'sm:max-w-[440px] border-destructive/30 edge-engraved bg-destructive/5'
              : 'sm:max-w-[440px] edge-engraved'}
          >
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                {request.destructive && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/20">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                )}
                <DialogTitle className="text-base font-semibold">{request.title}</DialogTitle>
              </div>
              {request.description && (
                <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                  {request.description}
                </DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter className="flex justify-end gap-2 sm:justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => settle(false)} className="edge-engraved">
                Cancel
              </Button>
              <Button
                variant={request.destructive ? 'destructive' : 'default'}
                size="sm"
                autoFocus
                onClick={() => settle(true)}
              >
                {request.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
