import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConfirm } from '../features/dialogs/DialogProvider';
import { matches } from '../lib/shortcuts';
import { getAgentHookState } from '../features/tabs/agentHookState';
import { getLastOutputAt } from '../features/tabs/terminalActivity';

// Output this recent from a terminal with no agent hooks counts as running.
const RECENT_OUTPUT_MS = 2000;

// Whether Ctrl+S's double ^C would interrupt something. Agent hooks say so
// directly; without them (hooks not installed, a plain shell job), fall back
// to the terminal having printed something just now.
function isTerminalBusy(sessionId) {
  const hook = getAgentHookState(sessionId);
  if (hook) return hook.state === 'working' || hook.state === 'permission';
  const lastOutput = getLastOutputAt(sessionId);
  return !!lastOutput && Date.now() - lastOutput < RECENT_OUTPUT_MS;
}

export function useViewModeShortcuts({
  sidebarOpen,
  setSidebarOpen,
  viewMode,
  setViewMode,
  onLoadFlatView,
  onLoadTreeView,
  onLaunchClaude,
  terminalSessionId,
  secondaryTerminalFocused,
  onToggleMarkdownFilter,
  isActive,
}) {
  const confirm = useConfirm();

  useEffect(() => {
    if (isActive === false) return;

    const handleKeyDown = async (e) => {
      if (secondaryTerminalFocused) return;
      if (matches('nav-mode', e)) {
        e.preventDefault();
        e.stopPropagation();

        // Send Ctrl+C twice to terminal to stop any running process — but
        // ask first when an agent is mid-turn, since that kills its work.
        if (terminalSessionId && isTerminalBusy(terminalSessionId)) {
          const ok = await confirm({
            title: 'Stop the agent and switch to navigation mode?',
            description: 'Ctrl+S sends Ctrl+C twice to the terminal, which interrupts the agent that is working in it.',
            confirmLabel: 'Stop and switch',
          });
          if (!ok) return;
        }
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

      if (matches('md-filter', e)) {
        e.preventDefault();
        e.stopPropagation();
        if (onToggleMarkdownFilter) onToggleMarkdownFilter();
        return;
      }

      if (matches('cli', e)) {
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
  }, [sidebarOpen, viewMode, setSidebarOpen, setViewMode, onLoadFlatView, onLoadTreeView, onLaunchClaude, terminalSessionId, secondaryTerminalFocused, onToggleMarkdownFilter, isActive, confirm]);
}
