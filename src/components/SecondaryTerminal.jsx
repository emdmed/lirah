import { useRef, useEffect, useState, forwardRef } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { SecondaryTerminalPicker } from './SecondaryTerminalPicker';

const SecondaryTerminalInstance = forwardRef(({ theme, onFocusChange, onSessionReady, initialCommand }, ref) => {
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
    null,  // projectDir
    initialCommand,
    true,  // secondaryMode
  );

  useEffect(() => {
    if (sessionId && onSessionReady) onSessionReady(sessionId);
  }, [sessionId, onSessionReady]);

  useEffect(() => {
    if (!terminalRef.current) return;
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(terminalRef.current);
    window.addEventListener('resize', handleResize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

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
});

SecondaryTerminalInstance.displayName = 'SecondaryTerminalInstance';

export const SecondaryTerminal = forwardRef(({ theme, visible, onClose, onFocusChange, onSessionReady }, ref) => {
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
      />
    </div>
  );
});

SecondaryTerminal.displayName = 'SecondaryTerminal';
