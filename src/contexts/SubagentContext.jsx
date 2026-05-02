import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const SubagentContext = createContext(null);

export function SubagentProvider({ tabs, children }) {
  // Map of projectPath -> SubagentInfo[]
  const [subagentsByPath, setSubagentsByPath] = useState({});
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const mountTimeRef = useRef(new Date().toISOString());

  // Track which paths have active watchers
  const activeWatchersRef = useRef(new Set());
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
      const result = await invoke('get_project_subagents', { projectPath });
      const mountTime = mountTimeRef.current;
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
        invoke('watch_project_subagents', { projectPath: path }).catch(() => {});
        currentWatchers.add(path);
        fetchForPath(path);
      }
    }

    // Stop watchers for removed paths
    for (const path of currentWatchers) {
      if (!desiredPaths.has(path)) {
        invoke('stop_project_subagents_watcher', { projectPath: path }).catch(() => {});
        currentWatchers.delete(path);
        setSubagentsByPath(prev => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }
    }
  }, [uniquePaths, fetchForPath]);

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
      unlistenRef.current = unlisten;
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

  // Fallback polling every 10s
  useEffect(() => {
    pollIntervalRef.current = setInterval(fetchAll, 10000);
    return () => clearInterval(pollIntervalRef.current);
  }, [fetchAll]);

  // Cleanup all watchers on unmount
  useEffect(() => {
    return () => {
      for (const path of activeWatchersRef.current) {
        invoke('stop_project_subagents_watcher', { projectPath: path }).catch(() => {});
      }
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
