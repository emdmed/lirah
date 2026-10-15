import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePageVisible } from './usePageVisible';

const POLL_MS = 500;

export function useCwdMonitor(sessionId, enabled) {
  const [currentCwd, setCurrentCwd] = useState(null);
  const lastCwdRef = useRef(null);
  const pageVisible = usePageVisible();

  useEffect(() => {
    if (!enabled || !sessionId || !pageVisible) return;

    // A timeout chain rather than setInterval, so a slow lookup can never
    // stack up overlapping calls.
    let cancelled = false;
    let timer = null;
    const checkCwd = async () => {
      try {
        const cwd = await invoke('get_terminal_cwd', { sessionId });
        if (!cancelled && cwd !== lastCwdRef.current) {
          lastCwdRef.current = cwd;
          setCurrentCwd(cwd);
        }
      } catch {
        // Terminal might not be ready yet, ignore
      }
      if (!cancelled) timer = setTimeout(checkCwd, POLL_MS);
    };
    checkCwd();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, enabled, pageVisible]);

  return currentCwd;
}
