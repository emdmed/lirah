import React from 'react';
import { useToast, useToasts } from './ToastContext';
import { FloatPane } from '../../components/ui/float-pane';

// Notifications stack as framed float panes centred below the top rail,
// newest on top, dropping in from above. The frame's lamp carries the
// type: fault for errors, warn for warnings, ok for success, a plain lit lamp
// for info.
const LAMPS = {
  error: 'fault',
  warning: 'warn',
  success: 'ok',
};

export function ToastContainer() {
  const { dismiss } = useToast();
  const toasts = useToasts();

  if (!toasts.length) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 top-10 z-[100] flex flex-col-reverse items-center gap-2 w-[min(420px,calc(100vw-24px))] pointer-events-none [--ins-shift:-6px]"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <FloatPane
          key={toast.id}
          title={toast.type}
          lamp={LAMPS[toast.type] ?? 'on'}
          role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
          className="ins-rise-enter relative w-full px-2.5 pointer-events-auto font-mono text-xs"
        >
          {toast.action && toast.duration > 0 && (
            <span
              className="ins-drain"
              style={{ animationDuration: `${toast.duration}ms` }}
              aria-hidden="true"
            />
          )}
          <div className="flex items-start gap-2 pt-1 pb-2">
            <span
              className={`min-w-0 flex-1 break-words leading-5 ${toast.type === 'error' ? 'text-[var(--ins-fault)]' : ''}`}
            >
              {toast.message}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action.onClick();
                    dismiss(toast.id);
                  }}
                  className="tui-btn"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="tui-btn"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </span>
          </div>
        </FloatPane>
      ))}
    </div>
  );
}
