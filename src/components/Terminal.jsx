import { useRef, useEffect } from 'react';
import { useTerminal } from '../hooks/useTerminal';

export function Terminal({ theme, onResize, onSessionReady }) {
  const terminalRef = useRef(null);
  const { handleResize, sessionId } = useTerminal(terminalRef, theme);

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
        height: '100%',
      }}
    />
  );
}
