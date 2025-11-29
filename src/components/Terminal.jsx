import { useRef, useEffect, forwardRef } from 'react';
import { useTerminal } from '../hooks/useTerminal';

export const Terminal = forwardRef(({ theme, onResize, onSessionReady }, ref) => {
  const terminalRef = useRef(null);
  const { handleResize, sessionId } = useTerminal(terminalRef, theme, ref);

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
      ref={terminalRef}
      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
      }}
    />
  );
});

Terminal.displayName = 'Terminal';
