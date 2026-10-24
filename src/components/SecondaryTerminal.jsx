import { useRef, useEffect, useState, useCallback, forwardRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useTerminal } from '../hooks/useTerminal';
import { SecondaryTerminalPicker } from './SecondaryTerminalPicker';
import { TerminalSearchBar } from './TerminalSearchBar';
import { Maximize2, Minimize2 } from 'lucide-react';
import { PaneLegend } from './instrument/PaneLegend';

// Programs that take the whole window with every Lirah keybind off. They run
// via `exec`, so quitting them ends the shell and closes terminal 2.
const FOCUS_COMMANDS = new Set(['nvim', 'lazygit']);

const SecondaryTerminalInstance = memo(forwardRef(({ theme, onFocusChange, onSessionReady, initialCommand, projectDir, isActive = true, focus = false, onExit = null }, ref) => {
  const terminalRef = useRef(null);

  const { handleResize, sessionId, isFocused, searchAddon, searchOpen, searchDecorations, closeSearch } = useTerminal(
    terminalRef,
    theme,
    ref,
    null, // onSearchFocus
    null, // onToggleGitFilter
    onFocusChange,
    false, // sandboxEnabled
    false, // networkIsolation
    projectDir,
    initialCommand,
    true,  // secondaryMode
    isActive,
    null,  // reattachKey
    onExit,
  );

  useEffect(() => {
    if (sessionId && onSessionReady) onSessionReady(sessionId);
  }, [sessionId, onSessionReady]);

  // Focus terminal when session is ready and initialCommand is set
  useEffect(() => {
    if (sessionId && initialCommand && ref?.current?.focus) {
      // Small delay to ensure terminal is fully initialized
      const timer = setTimeout(() => {
        ref.current.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [sessionId, initialCommand, ref]);

  // One fit per frame; the SIGWINCH is debounced inside handleResize, so a
  // trailing second fit would only double the local work.
  const rafRef = useRef(null);
  const debouncedResize = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      handleResize();
    });
  }, [handleResize]);

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

  if (focus) {
    return (
      <div className="terminal-wrapper" style={{ width: '100%', flex: 1, minHeight: 0, minWidth: 0, position: 'relative', padding: '6px 8px' }}>
        <div ref={terminalRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
      </div>
    );
  }

  return (
    <div
      data-title="terminal 2"
      data-legend
      className={`ins-pane-enter tui-pane tui-pane-screen terminal-wrapper ${isFocused
        ? 'terminal-live'
        : ''
        }`}
      style={{ width: '100%', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}
    >
      <PaneLegend title="Terminal 2" lit={isFocused} />
      <div className="ins-glass relative" style={{ width: '100%', height: '100%', padding: '10px 14px', overflow: 'hidden' }}>
        <div
          ref={terminalRef}
          style={{ width: '100%', height: '100%', overflow: 'hidden' }}
        />
        {searchOpen && <TerminalSearchBar searchAddon={searchAddon} decorations={searchDecorations} onClose={closeSearch} />}
      </div>
    </div>
  );
}));

SecondaryTerminalInstance.displayName = 'SecondaryTerminalInstance';

export const SecondaryTerminal = memo(forwardRef(({ theme, visible, onClose, onFocusChange, onSessionReady, projectDir, fullscreen, onToggleFullscreen, onPickerVisibilityChange, onFocusModeChange, initialCommand: initialCommandProp, isActive = true }, ref) => {
  const [selectedCommand, setSelectedCommand] = useState(initialCommandProp || null);
  const focus = visible && FOCUS_COMMANDS.has(selectedCommand);

  useEffect(() => {
    onFocusModeChange?.(focus);
  }, [focus, onFocusModeChange]);
  // Separate so a tab closed mid-session never leaves the keybinds off.
  useEffect(() => () => onFocusModeChange?.(false), [onFocusModeChange]);

  // Notify parent when picker visibility changes
  useEffect(() => {
    if (visible) {
      onPickerVisibilityChange?.(selectedCommand === null);
    }
  }, [visible, selectedCommand, onPickerVisibilityChange]);

  if (!visible) return null;

  const containerStyle = fullscreen
    ? { position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--ins-gutter)' }
    : { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--ins-gutter)', marginLeft: '6px' };

  if (selectedCommand === null) {
    return (
      <div style={containerStyle}>
        <SecondaryTerminalPicker onSelect={setSelectedCommand} />
      </div>
    );
  }

  if (focus) {
    // Portaled: inactive tabs sit in a transformed wrapper, which would trap a
    // fixed child inside the tab instead of the window.
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--ins-gutter)', visibility: isActive ? 'visible' : 'hidden' }}>
        <SecondaryTerminalInstance
          ref={ref}
          theme={theme}
          onFocusChange={onFocusChange}
          onSessionReady={onSessionReady}
          initialCommand={`exec ${selectedCommand}`}
          projectDir={projectDir}
          isActive={isActive}
          focus
          onExit={onClose}
        />
      </div>,
      document.body,
    );
  }

  return (
    <div style={containerStyle}>
      <button
        onClick={onToggleFullscreen}
        className="ins-cap ins-round absolute top-[22px] right-5 z-50 text-muted-foreground hover:text-foreground"
        title={fullscreen ? 'Restore' : 'Maximize'}
        aria-label={fullscreen ? 'Restore' : 'Maximize'}
      >
        {fullscreen ? <Minimize2 className="size-2.5" /> : <Maximize2 className="size-2.5" />}
      </button>
      <SecondaryTerminalInstance
        ref={ref}
        theme={theme}
        onFocusChange={onFocusChange}
        onSessionReady={onSessionReady}
        initialCommand={selectedCommand}
        projectDir={projectDir}
        isActive={isActive}
      />
    </div>
  );
}));

SecondaryTerminal.displayName = 'SecondaryTerminal';
