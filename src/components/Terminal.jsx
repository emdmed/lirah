import { useRef, useEffect, forwardRef } from 'react';
import { useTerminal } from '../hooks/useTerminal';

export const Terminal = forwardRef(({ theme, onResize, onSessionReady, onSearchFocus, onToggleGitFilter, onFocusChange }, ref) => {
  const terminalRef = useRef(null);
  const { handleResize, sessionId, isFocused } = useTerminal(terminalRef, theme, ref, onSearchFocus, onToggleGitFilter, onFocusChange);

  // Notify parent when session is ready
  useEffect(() => {
    if (sessionId && onSessionReady) {
      onSessionReady(sessionId);
    }
  }, [sessionId, onSessionReady]);

  // Setup resize observer
  useEffect(() => {
    if (!terminalRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(terminalRef.current);

    // Also handle window resize
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  return (
    <div
      className={`p-2 mt-2 terminal-wrapper${isFocused ? 'border-ring outline-none ring-2 ring-ring ring-offset-1 ring-offset-background rounded-md' : ''}`}
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
          overflow: 'auto',
        }}
      />
    </div>
  );
});

Terminal.displayName = 'Terminal';
