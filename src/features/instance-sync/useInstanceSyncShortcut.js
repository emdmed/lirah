import { useEffect, useCallback } from 'react';

export function useInstanceSyncShortcut({
  onTogglePanel,
  secondaryTerminalFocused,
}) {
  const handleKeyDown = useCallback((e) => {
    if (secondaryTerminalFocused) return;
    
    // Ctrl/Cmd + Shift + I to toggle instance sync panel
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      e.stopPropagation();
      onTogglePanel();
    }
  }, [onTogglePanel, secondaryTerminalFocused]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
}
