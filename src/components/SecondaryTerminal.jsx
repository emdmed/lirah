import { useRef, useEffect, useState, useCallback, forwardRef, memo } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { SecondaryTerminalPicker } from './SecondaryTerminalPicker';

const SecondaryTerminalInstance = memo(forwardRef(({ theme, onFocusChange, onSessionReady, initialCommand, projectDir }, ref) => {
  const terminalRef = useRef(null);

  const { handleResize, sessionId, isFocused } = useTerminal(
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
  );

  useEffect(() => {
    if (sessionId && onSessionReady) onSessionReady(sessionId);
  }, [sessionId, onSessionReady]);

  const resizeTimerRef = useRef(null);
  const debouncedResize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      handleResize();
    }, 100);
  }, [handleResize]);

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
      style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative' }}
    >
      <div
        ref={terminalRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      />
    </div>
  );
}));

SecondaryTerminalInstance.displayName = 'SecondaryTerminalInstance';

export const SecondaryTerminal = memo(forwardRef(({ theme, visible, onClose, onFocusChange, onSessionReady, projectDir }, ref) => {
  const [selectedCommand, setSelectedCommand] = useState(null);

  if (!visible) return null;

  if (selectedCommand === null) {
    return (
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <SecondaryTerminalPicker onSelect={setSelectedCommand} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <SecondaryTerminalInstance
        ref={ref}
        theme={theme}
        onFocusChange={onFocusChange}
        onSessionReady={onSessionReady}
        initialCommand={selectedCommand}
        projectDir={projectDir}
      />
    </div>
  );
}));

SecondaryTerminal.displayName = 'SecondaryTerminal';
