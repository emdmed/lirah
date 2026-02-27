import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const TOAST_DURATION = 5000; // 5 seconds default
const MAX_TOASTS = 5;

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);
  const timers = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback((toast) => {
    const id = ++idCounter.current;
    const newToast = {
      id,
      type: 'info',
      duration: TOAST_DURATION,
      ...toast,
      createdAt: Date.now(),
    };

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

    // Auto-dismiss timer
    const timer = setTimeout(() => {
      removeToast(id);
    }, newToast.duration);
    timers.current.set(id, timer);

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
      removeToast(id);
    },
    [removeToast]
  );

  const dismissAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  const value = {
    toasts,
    toast,
    error,
    success,
    warning,
    info,
    dismiss,
    dismissAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}
