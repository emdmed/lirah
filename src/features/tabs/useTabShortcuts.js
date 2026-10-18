import { useEffect, useRef } from 'react';

/**
 * The tab's global keyboard shortcuts. Registered only while the tab is
 * active, in the capture phase so they win over the terminal. Values the
 * handler reads but that shouldn't re-subscribe it are read through refs.
 */
export function useTabShortcuts({
  isActive,
  secondary,
  dialogs,
  viewMode,
  sidebarOpen,
  searchInputRef,
  onCompactProject,
  onOpenLazygit,
  onAutoCommit,
  onAutoMerge,
}) {
  const viewModeRef = useRef(viewMode);
  const sidebarOpenRef = useRef(sidebarOpen);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; }, [sidebarOpen]);

  const { secondaryVisible, secondaryFocused, closeSecondaryTerminal, setSecondaryVisible, openWithCommand } = secondary;
  const { setBudgetDialogOpen, setDashboardOpen } = dialogs;

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        e.stopPropagation();
        if (secondaryVisible) closeSecondaryTerminal();
        else setSecondaryVisible(true);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'l') {
        e.preventDefault();
        e.stopPropagation();
        onOpenLazygit();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'm') {
        e.preventDefault();
        e.stopPropagation();
        onAutoMerge();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        openWithCommand('nvim');
        return;
      }
      if (secondaryFocused) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && viewModeRef.current === 'tree' && sidebarOpenRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        onCompactProject();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        setBudgetDialogOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDashboardOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ' ') {
        e.preventDefault();
        onAutoCommit();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, secondaryVisible, secondaryFocused, closeSecondaryTerminal, setSecondaryVisible, openWithCommand,
    searchInputRef, onCompactProject, onOpenLazygit, onAutoCommit, onAutoMerge, setBudgetDialogOpen, setDashboardOpen]);
}
