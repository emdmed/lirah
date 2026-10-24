import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';

// Actions and state live in separate contexts: nearly every consumer only
// fires toasts, and shouldn't re-render each time one appears or expires.
const ToastContext = createContext(null);
const ToastStateContext = createContext(null);

const TOAST_DURATION = 5000; // 5 seconds default
const MAX_TOASTS = 5;

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// The live toast list — only the container needs it.
export const useToasts = () => useContext(ToastStateContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);
  const timers = useRef(new Map());

  // Live toasts by id, for dedupe and dismiss callbacks without reading state.
  const live = useRef(new Map());

  const removeToast = useCallback((id) => {
    live.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  // `dedupeKey`: skip while a toast with the same key is showing.
  // `onDismiss`: runs when it is dismissed by hand, not when it times out.
  const addToast = useCallback((toast) => {
    if (toast.dedupeKey != null) {
      for (const [liveId, t] of live.current) {
        if (t.dedupeKey === toast.dedupeKey) return liveId;
      }
    }
    const id = ++idCounter.current;
    const newToast = {
      id,
      type: 'info',
      duration: TOAST_DURATION,
      ...toast,
      createdAt: Date.now(),
    };
    live.current.set(id, newToast);

    setToasts((prev) => {
      // Remove oldest if at max capacity
      const updated = [...prev, newToast];
      if (updated.length > MAX_TOASTS) {
        const [oldest, ...rest] = updated;
        removeToast(oldest.id);
        return rest;
      }
      return updated;
    });

    // Auto-dismiss timer; a duration of 0 stays until dismissed.
    if (newToast.duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
      timers.current.set(id, timer);
    }

    return id;
  }, [removeToast]);

  const toast = useCallback(
    (message, options = {}) => {
      return addToast({ message, ...options });
    },
    [addToast]
  );

  const error = useCallback(
    (message, options = {}) => {
      return addToast({ message, type: 'error', ...options });
    },
    [addToast]
  );

  const success = useCallback(
    (message, options = {}) => {
      return addToast({ message, type: 'success', ...options });
    },
    [addToast]
  );

  const warning = useCallback(
    (message, options = {}) => {
      return addToast({ message, type: 'warning', ...options });
    },
    [addToast]
  );

  const info = useCallback(
    (message, options = {}) => {
      return addToast({ message, type: 'info', ...options });
    },
    [addToast]
  );

  const dismiss = useCallback(
    (id) => {
      const t = live.current.get(id);
      removeToast(id);
      t?.onDismiss?.();
    },
    [removeToast]
  );

  const dismissAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    live.current.clear();
    setToasts([]);
  }, []);

  const actions = useMemo(() => ({
    toast,
    error,
    success,
    warning,
    info,
    dismiss,
    dismissAll,
  }), [toast, error, success, warning, info, dismiss, dismissAll]);

  return (
    <ToastContext.Provider value={actions}>
      <ToastStateContext.Provider value={toasts}>
        {children}
      </ToastStateContext.Provider>
    </ToastContext.Provider>
  );
}
