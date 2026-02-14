import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useSecondaryTerminal(terminalRef) {
  const [secondaryVisible, setSecondaryVisible] = useState(false);
  const [secondaryFocused, setSecondaryFocused] = useState(false);
  const [secondaryFullscreen, setSecondaryFullscreen] = useState(false);
  const [secondarySessionId, setSecondarySessionId] = useState(null);
  const [secondaryKey, setSecondaryKey] = useState(0);
  const secondaryTerminalRef = useRef(null);

  const closeSecondaryTerminal = useCallback(() => {
    if (secondarySessionId) {
      invoke('close_terminal', { sessionId: secondarySessionId }).catch(console.error);
      setSecondarySessionId(null);
    }
    setSecondaryVisible(false);
    setSecondaryFocused(false);
    setSecondaryFullscreen(false);
    setSecondaryKey(k => k + 1);
  }, [secondarySessionId]);

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
  };
}
