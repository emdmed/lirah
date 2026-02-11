import { useEffect } from 'react';

export function useHelpShortcut({ showHelp, setShowHelp, secondaryTerminalFocused }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (secondaryTerminalFocused) return;
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        e.stopPropagation();
        setShowHelp(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showHelp, setShowHelp, secondaryTerminalFocused]);
}
