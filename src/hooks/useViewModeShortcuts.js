import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useViewModeShortcuts({
  sidebarOpen,
  setSidebarOpen,
  viewMode,
  setViewMode,
  onLoadFlatView,
  onLoadTreeView,
  onLaunchClaude,
  terminalSessionId
}) {
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();

        // Send Ctrl+C twice to terminal to stop any running process
        if (terminalSessionId) {
          try {
            // Send Ctrl+C twice with small delay
            await invoke('write_to_terminal', {
              sessionId: terminalSessionId,
              data: '\x03' // Ctrl+C
            });
            
            setTimeout(async () => {
              try {
                await invoke('write_to_terminal', {
                  sessionId: terminalSessionId,
                  data: '\x03' // Ctrl+C again
                });
              } catch (error) {
                console.error('Failed to send second Ctrl+C:', error);
              }
            }, 100);
          } catch (error) {
            console.error('Failed to send Ctrl+C:', error);
          }
        }

        // Switch to nav mode (flat view)
        setViewMode('flat');
        setSidebarOpen(true);
        onLoadFlatView();
      }

      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();

        // Do nothing if already in tree mode
        if (sidebarOpen && viewMode === 'tree') {
          return;
        }

        // Always launch CLI for now - the process check isn't reliable since
        // the login shell is always running. We could implement a more sophisticated
        // check in the future using terminal output analysis or command prompt detection.
        const shouldLaunchCli = true;

        // Open tree view (closes flat if open)
        setViewMode('tree');
        setSidebarOpen(true);
        onLoadTreeView();

        // Launch Claude Code only if terminal is idle
        if (shouldLaunchCli && onLaunchClaude) {
          onLaunchClaude();
        }
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [sidebarOpen, viewMode, setSidebarOpen, setViewMode, onLoadFlatView, onLoadTreeView, onLaunchClaude, terminalSessionId]);
}
