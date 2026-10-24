import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// What fills the tab's current context, rebuilt from its Claude session file.
// Re-fetches when the context size changes (a new turn landed) while enabled.
export function useContextBreakdown(sessionFile, contextTokens, enabled = true) {
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!sessionFile) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await invoke('get_context_breakdown', { sessionFile });
      if (id !== requestId.current) return;
      setBreakdown(data);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(String(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [sessionFile]);

  useEffect(() => {
    if (!enabled || !sessionFile) return;
    load();
  }, [enabled, sessionFile, contextTokens, load]);

  // Drop a previous session's breakdown when the tab switches sessions.
  useEffect(() => {
    setBreakdown(null);
    setError(null);
  }, [sessionFile]);

  return { breakdown, loading, error, refresh: load };
}
