import { useState, useRef, useCallback, useMemo } from "react";

// initialCommand '' tells SecondaryTerminal to start a bare shell (no picker).
const SHELL = '';

export function useSecondaryTerminal(terminalRef) {
  const [secondaryVisible, setSecondaryVisible] = useState(false);
  const [secondaryFocused, setSecondaryFocused] = useState(false);
  const [secondaryFullscreen, setSecondaryFullscreen] = useState(false);
  const [secondarySessionId, setSecondarySessionId] = useState(null);
  const [secondaryKey, setSecondaryKey] = useState(0);
  const [pendingCommand, setPendingCommand] = useState(null);
  // How terminal 2 was opened: 'shell' (openShell), 'command' (openWithCommand) or null.
  const [secondaryMode, setSecondaryMode] = useState(null);
  const secondaryTerminalRef = useRef(null);

  const closeSecondaryTerminal = useCallback(() => {
    setSecondarySessionId(null);
    setSecondaryVisible(false);
    setSecondaryFocused(false);
    setSecondaryFullscreen(false);
    setPendingCommand(null);
    setProjectDirOverride(null);
    setSecondaryMode(null);
    setSecondaryKey(k => k + 1);
  }, []);

  const [projectDirOverride, setProjectDirOverride] = useState(null);

  const openWithCommand = useCallback((command, projectDir) => {
    if (secondaryVisible) closeSecondaryTerminal();
    setProjectDirOverride(projectDir || null);
    setPendingCommand(command);
    setSecondaryMode('command');
    setSecondaryVisible(true);
    setSecondaryFullscreen(true);
  }, [secondaryVisible, closeSecondaryTerminal]);

  const openShell = useCallback(() => {
    if (secondaryVisible) closeSecondaryTerminal();
    setPendingCommand(SHELL);
    setSecondaryMode('shell');
    setSecondaryVisible(true);
    setSecondaryFullscreen(true);
  }, [secondaryVisible, closeSecondaryTerminal]);

  const toggleShell = useCallback(() => {
    if (secondaryVisible && secondaryMode === 'shell') closeSecondaryTerminal();
    else openShell();
  }, [secondaryVisible, secondaryMode, closeSecondaryTerminal, openShell]);

  const handlePickerVisibilityChange = useCallback((isVisible) => {
    if (isVisible && terminalRef.current?.blur) {
      terminalRef.current.blur();
    }
  }, [terminalRef]);

  return useMemo(() => ({
    secondaryVisible,
    setSecondaryVisible,
    secondaryFocused,
    setSecondaryFocused,
    secondaryFullscreen,
    setSecondaryFullscreen,
    secondarySessionId,
    setSecondarySessionId,
    secondaryKey,
    secondaryTerminalRef,
    closeSecondaryTerminal,
    handlePickerVisibilityChange,
    projectDirOverride,
    pendingCommand,
    setPendingCommand,
    openWithCommand,
    openShell,
    toggleShell,
    secondaryMode,
  }), [
    secondaryVisible, setSecondaryVisible, secondaryFocused, setSecondaryFocused, secondaryFullscreen, setSecondaryFullscreen, secondarySessionId, setSecondarySessionId, secondaryKey, secondaryTerminalRef, closeSecondaryTerminal, handlePickerVisibilityChange, projectDirOverride, pendingCommand, setPendingCommand, openWithCommand, openShell, toggleShell, secondaryMode,
  ]);
}
