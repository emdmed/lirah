import { useRef, useEffect, useCallback, forwardRef, memo } from 'react';
import { useTerminal } from '../hooks/useTerminal';

export const Terminal = memo(forwardRef(({ theme, onResize, onSessionReady, onReady, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir, onSandboxFailed }, ref) => {
  const terminalRef = useRef(null);
  const { handleResize, sessionId, isReady, isFocused, sandboxFailed } = useTerminal(terminalRef, theme, ref, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir);

  // Notify parent when session is ready
  useEffect(() => {
    if (sessionId && onSessionReady) {
      onSessionReady(sessionId);
    }
  }, [sessionId, onSessionReady]);

  // Notify parent when terminal is fully ready
  useEffect(() => {
    if (isReady && onReady) {
      onReady();
    }
  }, [isReady, onReady]);

  // Notify parent if sandbox failed
  useEffect(() => {
    if (sandboxFailed && onSandboxFailed) {
      onSandboxFailed();
    }
  }, [sandboxFailed, onSandboxFailed]);

  // Debounced resize — fit on next animation frame, coalescing rapid-fire
  // ResizeObserver events. A short follow-up pass catches late layout shifts
  // (e.g. CSS transitions finishing after the first fit).
  const rafRef = useRef(null);
  const trailingRef = useRef(null);
  const debouncedResize = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (trailingRef.current) cancelAnimationFrame(trailingRef.current);
    rafRef.current = requestAnimationFrame(() => {
      handleResize();
      // Trailing pass: catch layout shifts that settle one frame later
      trailingRef.current = requestAnimationFrame(() => {
        handleResize();
      });
    });
  }, [handleResize]);

  // Setup resize observer
  useEffect(() => {
    if (!terminalRef.current) return;

    const resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', debouncedResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', debouncedResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (trailingRef.current) cancelAnimationFrame(trailingRef.current);
    };
  }, [debouncedResize]);

  return (
    <div

      className={`px-2 mt-2 terminal-wrapper ${isFocused
        ? 'outline outline-1 outline-dashed outline-ring/70 outline-offset-2'
        : ''
        }`}

      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}));

Terminal.displayName = 'Terminal';
