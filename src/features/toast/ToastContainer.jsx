import React from 'react';
import { useToast, useToasts } from './ToastContext';
import { Button } from '../../components/ui/button';
import { Lamp } from '../../components/instrument/Lamp';

// Message line, as in vim: the newest notification occupies one line directly
// above the status bar, prefixed by a status mark. Older ones wait behind it.
// Errors and warnings mark with a lit star in the theme's fault/warn colour;
// a success settles as an ok star; info is a faint dot.
const LAMPS = {
  error: 'fault',
  warning: 'warn',
  success: 'ok',
};

export function ToastContainer() {
  const { dismiss } = useToast();
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  const toast = toasts[toasts.length - 1];
  const lamp = LAMPS[toast.type];
  const queued = toasts.length - 1;

  return (
    <div
      className="ins-line-enter fixed left-0 right-0 bottom-0 z-[100] flex items-center gap-2.5 h-8 px-2.5 text-xs font-mono bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]"
      role="alert"
    >
      {lamp ? (
        <Lamp state={lamp} label={toast.type} />
      ) : (
        <span className="shrink-0 w-[7px] text-center text-[var(--ins-faint)]" aria-hidden="true">·</span>
      )}
      <span
        key={toast.id}
        className={`ins-text-swap truncate min-w-0 ${toast.type === 'error' ? 'text-[var(--ins-fault)]' : ''}`}
      >
        {toast.message}
      </span>
      {queued > 0 && <span className="shrink-0 text-muted-foreground tabular-nums">+{queued}</span>}
      <span className="ml-auto flex items-center gap-1 shrink-0">
        {toast.action && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              toast.action.onClick();
              dismiss(toast.id);
            }}
            className="tui-btn h-5 px-1 gap-0"
          >
            {toast.action.label}
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => dismiss(toast.id)}
          className="tui-btn h-5 px-1 gap-0 text-muted-foreground"
          aria-label="Dismiss notification"
        >
          dismiss
        </Button>
      </span>
    </div>
  );
}
