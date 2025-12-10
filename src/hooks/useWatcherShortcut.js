import { useEffect } from 'react';

export function useWatcherShortcut({ onToggle }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onToggle]);
}
