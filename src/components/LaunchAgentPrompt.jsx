import { memo, useCallback, useEffect, useState } from 'react';
import { KeyChord } from './instrument/Keycap';
import { SplitKey } from './instrument/SplitKey';
import { usePageVisible } from '../hooks/usePageVisible';
import { tabCliLabel } from '../lib/agentClis';
import { subscribeAgentHooks, getAgentHookState } from '../features/tabs/agentHookState';
import { useCliRunning } from '../features/tabs/useTabsSummary';
import { Lamp } from './instrument/Lamp.jsx';
import { LirahMark } from './LirahMark';
import { SKY } from './Layout';
import { LAND_SVG } from '../features/tabs/FirstTabChooser';
import { basename } from '../utils/pathUtils';

// Tabs whose launch bar was dismissed. Module state so a terminal restart or a
// remount doesn't bring it back; it resets with the app.
const dismissedTabs = new Set();

// The startup orrery's orbits (FirstTabChooser), with no bodies on them.
const ORBITS = [110, 165, 220, 280];

/**
 * Plate over the terminal pane while the tab's shell has no agent: a split key
 * that launches the selected CLI (same as Ctrl+K), or opens the CLI picker
 * from its chevron.
 * Goes away once an agent runs, the user types into the shell, or it is
 * dismissed for the tab.
 */
export const LaunchAgentPrompt = memo(function LaunchAgentPrompt({
  tabId, sessionId, isActive, projectPath, selectedCli, onLaunch, onChangeCli,
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

  // Any CLI process under the shell (covers CLIs without hooks), from the
  // app's shared CLI poll.
  const running = useCliRunning(sessionId, live);
  useEffect(() => {
    if (live && running) setDoneFor(sessionId);
  }, [live, running, sessionId]);

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

  // Drawn before the shell is up too, so a tab with no agent coming opens straight onto it.
  if (dismissed || done) return null;

  const cliLabel = tabCliLabel(selectedCli);
  const name = basename(projectPath ?? '', 'project');

  // The startup orrery, settled: the unlit mark with the agent's seat on its
  // orbit empty. Hovering the launch key warms the empty seat.
  return (
    <div
      className="ins-agent-plate absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-hidden p-6"
      style={{ backgroundColor: 'var(--ins-gutter)' }}
      role="region"
      aria-label={`No agent running in ${name}`}
    >
      {SKY}
      {LAND_SVG}
      <div className="relative flex w-full flex-col items-center gap-3">
        <span className="relative w-full max-w-[760px]" style={{ aspectRatio: '760 / 290' }}>
          <svg viewBox="0 0 760 290" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
            <g fill="none" stroke="var(--color-foreground)" strokeWidth="1" vectorEffect="non-scaling-stroke" transform="rotate(-11 380 145)">
              {ORBITS.map((rx, i) => (
                <ellipse
                  key={rx}
                  cx="380"
                  cy="145"
                  rx={rx}
                  ry={rx * 0.47}
                  opacity={i === ORBITS.length - 1 ? 0.4 : 0.3}
                  strokeDasharray={i === ORBITS.length - 1 ? '5 4' : undefined}
                />
              ))}
              <circle cx="380" cy="145" r="44" strokeWidth="0.6" strokeDasharray="1 3" opacity="0.4" />
              {/* The agent's seat on the first orbit (60deg along it), empty. */}
              <g className="ins-agent-seat" transform="translate(435 189.8)">
                <circle className="ins-agent-seat-halo" r="10" strokeDasharray="1 2.5" />
                <circle r="4.5" fill="var(--ins-gutter)" />
              </g>
            </g>
          </svg>
          <LirahMark size={40} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
        </span>
        <span className="ins-name text-[16px] text-foreground">{name}</span>
        <span className="h-px w-56 bg-[var(--ins-edge)]" aria-hidden="true" />
        <span className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <Lamp state="off" />
          no agent running
        </span>
        <span className="ins-agent-launch mt-2 flex items-center gap-2 text-xs">
          <SplitKey onClick={handleLaunch} onChoose={onChangeCli} chooseLabel="Choose agent" disabled={!sessionId}>
            ▶ Launch {cliLabel}
          </SplitKey>
          <KeyChord keys={['^', 'K']} size="sm" />
        </span>
        <span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          or type to use the shell ·
          <button
            type="button"
            onClick={handleDismiss}
            className="underline-offset-2 hover:text-foreground hover:underline"
            title="Hide for this tab"
          >
            hide
          </button>
        </span>
      </div>
    </div>
  );
});
