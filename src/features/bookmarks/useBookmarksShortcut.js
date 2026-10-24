import { useEffect } from 'react';
import { isFocusMode } from '../../lib/focusMode';

// Ctrl+P toggles the bookmarks palette. Only the active tab listens, so a
// press doesn't open one palette per booted tab.
export function useBookmarksShortcut({ setBookmarksPaletteOpen, secondaryTerminalFocused, isActive = true }) {
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (secondaryTerminalFocused || isFocusMode()) return;
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        setBookmarksPaletteOpen(prev => !prev);
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, setBookmarksPaletteOpen, secondaryTerminalFocused]);
}
