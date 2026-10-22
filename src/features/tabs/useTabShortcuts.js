import { useEffect, useRef } from 'react';
import { matches } from '../../lib/shortcuts';

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
  onClearContext,
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
      if (matches('secondary', e)) {
        e.preventDefault();
        e.stopPropagation();
        if (secondaryVisible) closeSecondaryTerminal();
        else setSecondaryVisible(true);
        return;
      }
      if (matches('lazygit', e)) {
        e.preventDefault();
        e.stopPropagation();
        onOpenLazygit();
        return;
      }
      if (matches('merge', e)) {
        e.preventDefault();
        e.stopPropagation();
        onAutoMerge();
        return;
      }
      if (matches('nvim', e)) {
        e.preventDefault();
        e.stopPropagation();
        openWithCommand('nvim');
        return;
      }
      if (secondaryFocused) return;
      if (matches('file-search', e) && viewModeRef.current === 'tree' && sidebarOpenRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (matches('compact', e)) {
        e.preventDefault();
        onCompactProject();
      }
      if (matches('budget', e)) {
        e.preventDefault();
        setBudgetDialogOpen(true);
      }
      if (matches('tokens', e)) {
        e.preventDefault();
        setDashboardOpen(true);
      }
      if (matches('commit', e)) {
        e.preventDefault();
        onAutoCommit();
      }
      if (matches('clear-context', e)) {
        e.preventDefault();
        e.stopPropagation();
        onClearContext?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, secondaryVisible, secondaryFocused, closeSecondaryTerminal, setSecondaryVisible, openWithCommand,
    searchInputRef, onCompactProject, onOpenLazygit, onAutoCommit, onAutoMerge, onClearContext, setBudgetDialogOpen, setDashboardOpen]);
}
