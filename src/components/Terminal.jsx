import { useRef, useEffect, useCallback, forwardRef, memo } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { TerminalSearchBar } from './TerminalSearchBar';
import { PaneLegend } from './instrument/PaneLegend';

export const Terminal = memo(forwardRef(({ theme, onResize, onSessionReady, onReady, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir, onSandboxFailed, isActive = true, reattachKey = null }, ref) => {
  const terminalRef = useRef(null);
  const { handleResize, sessionId, reattached, isReady, isFocused, sandboxFailed, searchAddon, searchOpen, searchDecorations, closeSearch } =
    useTerminal(terminalRef, theme, ref, onSearchFocus, onToggleGitFilter, onFocusChange, sandboxEnabled, networkIsolation, projectDir, null, false, isActive, reattachKey);

  // Notify parent when session is ready
  useEffect(() => {
    if (sessionId && onSessionReady) {
      onSessionReady(sessionId, { reattached });
    }
  }, [sessionId, reattached, onSessionReady]);

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
      data-pane="2"
      data-title="[2] terminal"
      data-legend
      className={`tui-pane tui-pane-screen terminal-wrapper ${isFocused
        ? 'terminal-live'
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
      <PaneLegend index={2} title="Terminal" lit={isFocused} />
      {/* The screen carries the inset; the ref div stays unpadded so FitAddon
          measures exactly the cell area. */}
      <div className="ins-glass relative" style={{ width: '100%', height: '100%', padding: '10px 14px', overflow: 'hidden' }}>
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
    </div>
  );
}));

Terminal.displayName = 'Terminal';
