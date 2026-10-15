import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePageVisible } from '../hooks/usePageVisible';

const SubagentContext = createContext(null);

function stopWatcher(projectPath, started) {
  started.then((ok) => {
    if (ok) invoke('stop_project_subagents_watcher', { projectPath }).catch(() => {});
  });
}

export function SubagentProvider({ tabs, children }) {
  // Map of projectPath -> SubagentInfo[]
  const [subagentsByPath, setSubagentsByPath] = useState({});
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const mountTimeRef = useRef(new Date().toISOString());
  const pageVisible = usePageVisible();
  // Bumped by the poll so the watcher effect retries failed starts.
  const [watcherRetry, setWatcherRetry] = useState(0);

  // Track which paths have active watchers
  // path -> promise of its start command. Watchers are ref-counted in the
  // backend and start/stop are async, so each stop is chained onto its start
  // (and skipped if the start failed) to keep the count balanced.
  const activeWatchersRef = useRef(new Map());
  const pollIntervalRef = useRef(null);
  const unlistenRef = useRef(null);

  // Deduplicate project paths across all tabs
  const uniquePaths = useMemo(() => {
    const paths = new Set();
    for (const tab of tabs) {
      if (tab.projectPath) paths.add(tab.projectPath);
    }
    return [...paths];
  }, [tabs]);

  // Fetch subagents for a specific path
  const fetchForPath = useCallback(async (projectPath) => {
    try {
      const mountTime = mountTimeRef.current;
      // sinceMs lets the backend skip (unread) transcripts this filter drops.
      const result = await invoke('get_project_subagents', {
        projectPath,
        sinceMs: Date.parse(mountTime),
      });
      const relevant = result.filter(s => {
        if (s.status === 'running') return true;
        return s.started_at >= mountTime;
      });
      setSubagentsByPath(prev => {
        const prevList = prev[projectPath];
        if (prevList && JSON.stringify(prevList) === JSON.stringify(relevant)) return prev;
        return { ...prev, [projectPath]: relevant };
      });
    } catch {
      // Project dir may not exist yet
    }
  }, []);

  // Fetch all paths
  const fetchAll = useCallback(() => {
    for (const p of uniquePaths) {
      fetchForPath(p);
    }
  }, [uniquePaths, fetchForPath]);

  // Start/stop watchers as unique paths change
  useEffect(() => {
    const currentWatchers = activeWatchersRef.current;
    const desiredPaths = new Set(uniquePaths);

    // Start watchers for new paths
    for (const path of desiredPaths) {
      if (!currentWatchers.has(path)) {
        const started = invoke('watch_project_subagents', { projectPath: path }).then(() => true, () => {
          // Usually the project's transcript dir doesn't exist yet (Claude
          // never ran there). Forget it so the next poll retries the start.
          if (activeWatchersRef.current.get(path) === started) activeWatchersRef.current.delete(path);
          return false;
        });
        currentWatchers.set(path, started);
        fetchForPath(path);
      }
    }

    // Stop watchers for removed paths
    for (const [path, started] of currentWatchers) {
      if (!desiredPaths.has(path)) {
        stopWatcher(path, started);
        currentWatchers.delete(path);
        setSubagentsByPath(prev => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
    }
  }, [uniquePaths, fetchForPath, watcherRetry]);

  // Listen for watcher events (payload is the project path string)
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      const unlisten = await listen('subagents-changed', (event) => {
        if (cancelled) return;
        const changedPath = event.payload;
        if (changedPath && activeWatchersRef.current.has(changedPath)) {
          fetchForPath(changedPath);
        }
      });
      // Unmounted while listen() was resolving — tear down immediately
      if (cancelled) unlisten();
      else unlistenRef.current = unlisten;
    };
    setup();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [fetchForPath]);

  // Fallback poll — the watcher's subagents-changed event is the primary
  // signal, so this only catches what it misses. "Running" is derived from
  // recent writes, and a subagent going quiet emits no event, so poll faster
  // while any is running. Each poll also retries watchers that failed to
  // start. Paused while hidden.
  const anyRunning = useMemo(
    () => Object.values(subagentsByPath).some(list => list.some(s => s.status === 'running')),
    [subagentsByPath]
  );
  useEffect(() => {
    if (!pageVisible) return;
    fetchAll();
    pollIntervalRef.current = setInterval(() => {
      fetchAll();
      setWatcherRetry(n => n + 1);
    }, anyRunning ? 10000 : 60000);
    return () => clearInterval(pollIntervalRef.current);
  }, [fetchAll, pageVisible, anyRunning]);

  // Cleanup all watchers on unmount
  useEffect(() => {
    return () => {
      for (const [path, started] of activeWatchersRef.current) stopWatcher(path, started);
      activeWatchersRef.current.clear();
    };
  }, []);

  // Build aggregated list with tab info attached
  const allSubagents = useMemo(() => {
    const result = [];
    for (const tab of tabs) {
      const agents = subagentsByPath[tab.projectPath] || [];
      for (const agent of agents) {
        result.push({
          ...agent,
          tabId: tab.id,
          tabLabel: tab.label,
          projectPath: tab.projectPath,
        });
      }
    }
    return result;
  }, [tabs, subagentsByPath]);

  const totalActiveCount = useMemo(
    () => allSubagents.filter(s => s.status === 'running').length,
    [allSubagents]
  );

  const dismiss = useCallback((agentId) => {
    setDismissedIds(prev => new Set([...prev, agentId]));
  }, []);

  const toggleSidebar = useCallback(() => setSidebarVisible(v => !v), []);

  const value = useMemo(() => ({
    allSubagents,
    subagentsByPath,
    totalActiveCount,
    sidebarVisible,
    toggleSidebar,
    dismissedIds,
    dismiss,
  }), [allSubagents, subagentsByPath, totalActiveCount, sidebarVisible, toggleSidebar, dismissedIds, dismiss]);

  return (
    <SubagentContext.Provider value={value}>
      {children}
    </SubagentContext.Provider>
  );
}

export function useSubagentContext() {
  const ctx = useContext(SubagentContext);
  if (!ctx) throw new Error('useSubagentContext must be used within SubagentProvider');
  return ctx;
}
