import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const HOLD_MS = 900;
const FIRED_MS = 1400;

// Hold to confirm, for reversible one-row removals: something the toast can
// undo, like a context set. Never for worktrees, branches or commits; those
// go through useConfirm(). Shift+Enter or Shift+click calls `onFallback`
// (usually the shared confirm) for anyone who can't hold a key.
//
// Returns `state` ('idle' | 'holding' | 'fired') and `props` to spread on the
// element that carries `.ins-hold`. A click on its own does nothing.
export function useHoldToConfirm({ onConfirm, onFallback, duration = HOLD_MS, disabled = false }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = useCallback(() => {
    if (disabled || stateRef.current !== 'idle') return;
    setState('holding');
    timer.current = setTimeout(() => {
      setState('fired');
      onConfirm?.();
      timer.current = setTimeout(() => setState('idle'), FIRED_MS);
    }, duration);
  }, [disabled, duration, onConfirm]);

  const cancel = useCallback(() => {
    if (stateRef.current !== 'holding') return;
    clearTimeout(timer.current);
    setState('idle');
  }, []);

  const props = {
    'data-holding': state === 'holding' || undefined,
    'data-fired': state === 'fired' || undefined,
    style: { '--hold-ms': `${duration}ms` },
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      if (e.shiftKey && onFallback) { onFallback(); return; }
      start();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // Also keeps a host menu from selecting the item on keydown.
      e.preventDefault();
      if (e.repeat) return;
      if (e.key === 'Enter' && e.shiftKey && onFallback) { onFallback(); return; }
      start();
    },
    onKeyUp: (e) => {
      if (e.key === 'Enter' || e.key === ' ') cancel();
    },
  };

  return { state, props };
}

// A danger panel key that confirms by being held. `children` is the resting
// label; the label switches while holding and after it fires, and is
// announced politely.
export function HoldButton({
  onConfirm,
  onFallback,
  duration,
  holdingLabel = 'keep holding',
  firedLabel = 'done',
  disabled,
  className,
  children,
  ...rest
}) {
  const { state, props } = useHoldToConfirm({ onConfirm, onFallback, duration, disabled });
  return (
    <button
      type="button"
      disabled={disabled}
      title={onFallback ? 'Hold to confirm. Shift+Enter asks first.' : 'Hold to confirm'}
      className={cn('ins-key ins-key-panel ins-key-danger ins-round ins-hold', className)}
      {...rest}
      {...props}
    >
      <span aria-live="polite">
        {state === 'holding' ? holdingLabel : state === 'fired' ? firedLabel : children}
      </span>
    </button>
  );
}
