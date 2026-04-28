import React, { useEffect, useState } from 'react';
import { useToast } from './ToastContext';
import { X, AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '../../components/ui/button';

const ICONS = {
  error: AlertCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
};

const STYLES = {
  error: { color: 'var(--color-status-critical, #E82424)' },
  success: { color: 'var(--color-status-success, #76946A)' },
  warning: { color: 'var(--color-status-warning, #FF9E3B)' },
  info: { color: 'var(--color-status-info, #6B8CCE)' },
};

function Toast({ toast, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const Icon = ICONS[toast.type] || Info;
  const { color } = STYLES[toast.type] || STYLES.info;

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;

    const startTime = Date.now();
    const duration = toast.duration;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      const percentage = (remaining / duration) * 100;
      setProgress(percentage);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.duration]);

  return (
    <div
      className="relative flex items-start gap-3 p-3 rounded-none border shadow-lg min-w-[320px] max-w-[480px] animate-in slide-in-from-right-4 fade-in duration-300"
      style={{ borderColor: `color-mix(in srgb, ${color} 50%, transparent)`, backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
      role="alert"
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-relaxed">{toast.message}</p>
        {toast.action && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              toast.action.onClick();
              onDismiss();
            }}
            className="mt-2 h-7 text-xs px-2 py-1"
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="xs"
        onClick={onDismiss}
        className="p-1 h-auto flex-shrink-0 opacity-60 hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
      {toast.duration > 0 && (
        <div
          className="absolute bottom-0 left-0 h-[2px] transition-all duration-100"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      )}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={() => dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
