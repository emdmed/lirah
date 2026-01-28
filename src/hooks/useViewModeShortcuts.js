import { useEffect } from 'react';

export function useViewModeShortcuts({
  sidebarOpen,
  setSidebarOpen,
  viewMode,
  setViewMode,
  onLoadFlatView,
  onLoadTreeView,
  onLaunchClaude
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();

        if (sidebarOpen && viewMode === 'flat') {
          // Flat view is open, close it
          setSidebarOpen(false);
        } else {
          // Open flat view (closes tree if open)
          setViewMode('flat');
          setSidebarOpen(true);
          onLoadFlatView();
        }
      }

      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();

        // Do nothing if already in tree mode
        if (sidebarOpen && viewMode === 'tree') {
          return;
        }

        // Open tree view (closes flat if open)
        setViewMode('tree');
        setSidebarOpen(true);
        onLoadTreeView();

        // Launch Claude Code
        if (onLaunchClaude) {
          onLaunchClaude();
        }
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [sidebarOpen, viewMode, setSidebarOpen, setViewMode, onLoadFlatView, onLoadTreeView, onLaunchClaude]);
}
