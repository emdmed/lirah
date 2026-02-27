import { useEffect } from 'react';

export function useBookmarksShortcut({ bookmarksPaletteOpen, setBookmarksPaletteOpen, secondaryTerminalFocused }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (secondaryTerminalFocused) return;
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        setBookmarksPaletteOpen(prev => !prev);
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [bookmarksPaletteOpen, setBookmarksPaletteOpen, secondaryTerminalFocused]);
}
