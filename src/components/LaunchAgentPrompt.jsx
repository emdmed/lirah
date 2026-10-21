import { memo, useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyChord } from './instrument/Keycap';
import { PanelButton } from './instrument/PanelButton';
import { usePageVisible } from '../hooks/usePageVisible';
import { TAB_CLI_PROCESSES, tabCliLabel } from '../lib/agentClis';
import { subscribeAgentHooks, getAgentHookState } from '../features/tabs/agentHookState';

const POLL_MS = 2000;

// Tabs whose launch bar was dismissed. Module state so a terminal restart or a
// remount doesn't bring it back; it resets with the app.
const dismissedTabs = new Set();

/**
 * Slim bar at the top-right of the terminal pane while the tab's shell has no
 * agent: launches the selected CLI (same as Ctrl+K), or opens the CLI picker.
 * Goes away once an agent runs, the user types into the shell, or it is
 * dismissed for the tab.
 */
export const LaunchAgentPrompt = memo(function LaunchAgentPrompt({
  tabId, sessionId, isActive, selectedCli, onLaunch, onChangeCli,
}) {
  const pageVisible = usePageVisible();
  const [dismissed, setDismissed] = useState(() => dismissedTabs.has(tabId));
  // Per shell session: a restarted terminal is a fresh shell again.
  const [doneFor, setDoneFor] = useState(null);
  const done = doneFor !== null && doneFor === sessionId;
  const live = !!sessionId && isActive && pageVisible && !dismissed && !done;

  // An agent reporting through its hooks has started.
  useEffect(() => {
    if (!live) return;
    if (getAgentHookState(sessionId)) { setDoneFor(sessionId); return; }
    return subscribeAgentHooks((change) => {
      if (change?.sessionId === sessionId && change.next) setDoneFor(sessionId);
    });
  }, [live, sessionId]);

  // Any CLI process under the shell (covers CLIs without hooks).
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      for (const processName of TAB_CLI_PROCESSES) {
        try {
          if (await invoke('check_pty_child_process', { sessionId, processName })) {
            if (!cancelled) setDoneFor(sessionId);
            return;
          }
        } catch { /* session gone */ }
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [live, sessionId]);

  // Typing into this tab's shell means the user wants the shell, not the bar.
  // Capture phase: xterm handles the key before it would bubble here.
  useEffect(() => {
    if (!live) return;
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length !== 1 && e.key !== 'Enter' && e.key !== 'Backspace') return;
      if (!(e.target instanceof Element) || !e.target.closest('[data-pane="2"]')) return;
      setDoneFor(sessionId);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [live, sessionId]);

  const handleDismiss = useCallback(() => {
    dismissedTabs.add(tabId);
    setDismissed(true);
  }, [tabId]);

  const handleLaunch = useCallback(() => {
    setDoneFor(sessionId);
    onLaunch?.();
  }, [sessionId, onLaunch]);

  if (!sessionId || dismissed || done) return null;

  const cliLabel = tabCliLabel(selectedCli);

  return (
    <div
      className="absolute top-3 right-5 z-10 flex items-center gap-2 h-7 pl-1 pr-1.5 text-xs bg-[var(--ins-raised)] edge-engraved"
      role="region"
      aria-label="Launch agent"
    >
      <PanelButton onClick={handleLaunch} className="h-5 px-2 text-xs">
        ▶ Launch {cliLabel}
      </PanelButton>
      <button
        type="button"
        onClick={onChangeCli}
        className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        change
      </button>
      <KeyChord keys={['^', 'K']} size="sm" />
      <button
        type="button"
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground px-0.5"
        aria-label="Dismiss launch bar for this tab"
        title="Hide for this tab"
      >
        ×
      </button>
    </div>
  );
});
