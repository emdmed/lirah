import { useRef, useEffect, useCallback, forwardRef, memo } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { TerminalSearchBar } from './TerminalSearchBar';

export const Terminal = memo(forwardRef(({ theme, onResize, onSessionReady, onReady, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir, onSandboxFailed }, ref) => {
  const terminalRef = useRef(null);
  const { handleResize, sessionId, isReady, isFocused, sandboxFailed, searchAddon, searchOpen, searchDecorations, closeSearch } =
    useTerminal(terminalRef, theme, ref, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir);

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

  // Coalesce rapid-fire ResizeObserver events to one fit per frame. The
  // SIGWINCH itself is debounced inside handleResize, so we no longer need a
  // trailing rAF here — that just doubled the local fit work without helping.
  const rafRef = useRef(null);
  const debouncedResize = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      handleResize();
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
      {searchOpen && <TerminalSearchBar searchAddon={searchAddon} decorations={searchDecorations} onClose={closeSearch} />}
    </div>
  );
}));

Terminal.displayName = 'Terminal';
