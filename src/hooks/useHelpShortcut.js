import { useEffect } from 'react';

// Ctrl+H toggles the shortcuts dialog. Every booted tab mounts this, so only
// the active one listens, or each tab would open its own copy.
export function useHelpShortcut({ setShowHelp, secondaryTerminalFocused, isActive = true }) {
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (secondaryTerminalFocused) return;
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'h') {
        e.preventDefault();
        e.stopPropagation();
        setShowHelp(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, setShowHelp, secondaryTerminalFocused]);
}
