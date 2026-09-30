import React from 'react';
import { useToast } from './ToastContext';
import { Button } from '../../components/ui/button';

// Message line, as in vim: the newest notification occupies one line directly
// above the status bar, prefixed by a status mark. Older ones wait behind it.
const MARKS = {
  error: '✗',
  success: '✓',
  warning: '!',
  info: '·',
};

const COLORS = {
  error: 'var(--color-status-critical, #E82424)',
  success: 'var(--color-status-success, #76946A)',
  warning: 'var(--color-status-warning, #FF9E3B)',
  info: 'var(--color-status-info, #6B8CCE)',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  const toast = toasts[toasts.length - 1];
  const color = COLORS[toast.type] || COLORS.info;
  const queued = toasts.length - 1;

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-[100] flex items-center gap-2 h-8 px-2 text-xs font-mono bg-[var(--tui-bar)] shadow-[inset_0_1px_0_0_var(--tui-line)]"
      role="alert"
    >
      <span className="shrink-0" style={{ color }}>{MARKS[toast.type] || MARKS.info}</span>
      <span className="truncate min-w-0" style={toast.type === 'error' ? { color } : undefined}>
        {toast.message}
      </span>
      {queued > 0 && <span className="shrink-0 text-muted-foreground">+{queued}</span>}
      <span className="ml-auto flex items-center gap-1 shrink-0">
        {toast.action && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              toast.action.onClick();
              dismiss(toast.id);
            }}
            className="h-5 px-1"
          >
            {toast.action.label}
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => dismiss(toast.id)}
          className="h-5 px-1 text-muted-foreground"
          aria-label="Dismiss notification"
        >
          dismiss
        </Button>
      </span>
    </div>
  );
}
