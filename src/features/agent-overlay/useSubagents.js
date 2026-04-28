import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function useSubagents(projectPath) {
  const [subagents, setSubagents] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const unlistenRef = useRef(null);
  const pollIntervalRef = useRef(null);
  // Track mount time — only show completed agents that started after this
  const mountTimeRef = useRef(new Date().toISOString());

  const fetchSubagents = useCallback(async () => {
    if (!projectPath) return;

    try {
      const result = await invoke('get_project_subagents', { projectPath });
      // Show running agents always; completed agents only if they started during this session
      const mountTime = mountTimeRef.current;
      const relevant = result.filter(s => {
        if (s.status === 'running') return true;
        return s.started_at >= mountTime;
      });
      setSubagents(relevant);
      setActiveCount(relevant.filter(s => s.status === 'running').length);
    } catch {
      // Silently handle — project dir may not exist yet
    }
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath) return;

    let cancelled = false;

    const init = async () => {
      // Start fs watcher on the whole project dir
      try {
        await invoke('watch_project_subagents', { projectPath });
      } catch {
        // Watcher may fail if dir doesn't exist yet
      }

      // Initial fetch
      if (!cancelled) await fetchSubagents();

      // Listen for watcher events
      const unlisten = await listen('subagents-changed', () => {
        if (!cancelled) fetchSubagents();
      });
      unlistenRef.current = unlisten;

      // Fallback polling every 10s (needed for mtime-based status transitions)
      pollIntervalRef.current = setInterval(() => {
        if (!cancelled) fetchSubagents();
      }, 10000);
    };

    init();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      invoke('stop_session_subagents_watcher').catch(() => {});
    };
  }, [projectPath, fetchSubagents]);

  return { subagents, activeCount };
}
