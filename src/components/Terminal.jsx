import { useRef, useEffect, useCallback, forwardRef, memo } from 'react';
import { useTerminal } from '../hooks/useTerminal';

export const Terminal = memo(forwardRef(({ theme, onResize, onSessionReady, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir, onSandboxFailed }, ref) => {
  const terminalRef = useRef(null);
  const { handleResize, sessionId, isFocused, sandboxFailed } = useTerminal(terminalRef, theme, ref, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir);

  // Notify parent when session is ready
  useEffect(() => {
    if (sessionId && onSessionReady) {
      onSessionReady(sessionId);
    }
  }, [sessionId, onSessionReady]);

  // Notify parent if sandbox failed
  useEffect(() => {
    if (sandboxFailed && onSandboxFailed) {
      onSandboxFailed();
    }
  }, [sandboxFailed, onSandboxFailed]);

  // Debounced resize — wait for layout to settle before fitting terminal
  const resizeTimerRef = useRef(null);
  const debouncedResize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      handleResize();
    }, 100);
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
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [debouncedResize]);

  return (
    <div

      className={`p-2 mt-2 terminal-wrapper ${isFocused
        ? 'outline outline-1 outline-dashed outline-ring/70 outline-offset-2'
        : ''
        }`}

      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
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
