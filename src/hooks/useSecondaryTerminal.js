import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useSecondaryTerminal(terminalRef) {
  const [secondaryVisible, setSecondaryVisible] = useState(false);
  const [secondaryFocused, setSecondaryFocused] = useState(false);
  const [secondaryFullscreen, setSecondaryFullscreen] = useState(false);
  const [secondarySessionId, setSecondarySessionId] = useState(null);
  const [secondaryKey, setSecondaryKey] = useState(0);
  const [pendingCommand, setPendingCommand] = useState(null);
  const secondaryTerminalRef = useRef(null);

  const closeSecondaryTerminal = useCallback(() => {
    if (secondarySessionId) {
      invoke('close_terminal', { sessionId: secondarySessionId }).catch(console.error);
      setSecondarySessionId(null);
    }
    setSecondaryVisible(false);
    setSecondaryFocused(false);
    setSecondaryFullscreen(false);
    setPendingCommand(null);
    setSecondaryKey(k => k + 1);
  }, [secondarySessionId]);

  const openWithCommand = useCallback((command) => {
    if (secondaryVisible) closeSecondaryTerminal();
    setPendingCommand(command);
    setSecondaryVisible(true);
    setSecondaryFullscreen(true);
  }, [secondaryVisible, closeSecondaryTerminal]);

  const handlePickerVisibilityChange = useCallback((isVisible) => {
    if (isVisible && terminalRef.current?.blur) {
      terminalRef.current.blur();
    }
  }, [terminalRef]);

  return {
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
    pendingCommand,
    setPendingCommand,
    openWithCommand,
  };
}
