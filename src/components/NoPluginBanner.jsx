import { memo, useEffect, useRef, useState } from 'react';
import { usePageVisible } from '../hooks/usePageVisible';
import { useSetting } from '../features/settings/settingsStore';
import { subscribeAgentHooks, getAgentHookState } from '../features/tabs/agentHookState';
import { useCliRunning } from '../features/tabs/useTabsSummary';

// A launcher start reports SessionStart within a second or two of the process
// showing up; the CLI poll itself runs every 3 s.
const GRACE_MS = 5000;

/**
 * Bar over the terminal when the tab runs claude that never reported through
 * Lirah's agent-state hook: it was started by hand, without the plugin.
 * Relaunch restarts it through the launcher, which loads the plugin.
 */
export const NoPluginBanner = memo(function NoPluginBanner({ sessionId, isActive, selectedCli, onRelaunch }) {
  const pageVisible = usePageVisible();
  const [agentStateHook] = useSetting('agentStateHook');
  // With the hook switched off no claude reports, so there is nothing to tell apart.
  const live = !!sessionId && isActive && pageVisible && agentStateHook !== false && selectedCli === 'claude-code';
  const running = useCliRunning(sessionId, live); // undefined until the first poll
  const [show, setShow] = useState(false);
  // Last poll that saw no claude. Null while never seen idle (a reattached
  // shell may run a launcher claude that is just quiet), so no banner then.
  const idleAtRef = useRef(null);

  useEffect(() => { idleAtRef.current = null; setShow(false); }, [sessionId]);
  // Stamped only when the poll result changes: re-running on `live` (the tab or
  // window shown at boot) with an old "no claude" would date it after the
  // launcher claude's SessionStart and raise the banner wrongly.
  useEffect(() => {
    if (running !== undefined && running !== 'claude') idleAtRef.current = Date.now();
  }, [running, sessionId]);

  useEffect(() => {
    if (!live || running === undefined) return;
    if (running !== 'claude') {
      setShow(false);
      return;
    }
    const since = idleAtRef.current;
    if (since == null) return;
    // A SIGKILLed claude leaves its old state behind; only events since it started count.
    const heard = () => (getAgentHookState(sessionId)?.at ?? 0) >= since;
    if (heard()) return;
    const timer = setTimeout(() => setShow(!heard()), GRACE_MS);
    const unsubscribe = subscribeAgentHooks((change) => {
      if (change?.sessionId === sessionId && heard()) {
        clearTimeout(timer);
        setShow(false);
      }
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [live, running, sessionId]);

  if (!live || !show) return null;

  return (
    <div
      className="absolute top-3 right-5 z-10 flex items-center gap-2 h-7 pl-2 pr-1 text-xs ins-veil"
      role="status"
    >
      <span>Started without the Lirah plugin: status and autopilot won't work</span>
      <button
        type="button"
        onClick={() => { setShow(false); onRelaunch?.(); }}
        className="ins-key ins-round px-2 h-5"
      >
        Relaunch
      </button>
    </div>
  );
});
