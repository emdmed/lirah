import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";

// Actions are split from state so a tab can call updateTabPath without
// re-rendering whenever any tab's path or the active tab changes.
const TabContext = createContext(null);
const TabActionsContext = createContext(null);

const STORAGE_KEY = 'nevo-terminal:tabs';
const MAX_TABS = 8;

function createTab(projectPath) {
  return {
    id: crypto.randomUUID(),
    projectPath,
    label: projectPath.split('/').filter(Boolean).pop() || projectPath,
  };
}

export function TabProvider({ children }) {
  const [tabs, setTabs] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return [];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY + ':active');
      if (stored && tabs.find(t => t.id === stored)) return stored;
    } catch { /* ignore */ }
    return tabs[0]?.id || null;
  });

  // Persist tabs to localStorage synchronously on every change.
  // A debounce here loses state: the custom TitleBar close button calls
  // appWindow.close() immediately, destroying the webview before a deferred
  // write can flush — so tab edits made right before quitting never persist.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
      localStorage.setItem(STORAGE_KEY + ':active', activeTabId || '');
    } catch { /* ignore */ }
  }, [tabs, activeTabId]);

  // Latest values for the actions below, so they can stay referentially stable.
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  const addTab = useCallback((projectPath) => {
    if (tabsRef.current.length >= MAX_TABS) {
      console.warn(`Maximum of ${MAX_TABS} tabs reached`);
      return null;
    }
    const tab = createTab(projectPath);
    tabsRef.current = [...tabsRef.current, tab];
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    return tab;
  }, []);

  const removeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) return prev; // Don't remove last tab here; lifecycle handles it
      // If removing active tab, switch to adjacent
      if (tabId === activeTabIdRef.current) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      }
      return next;
    });
  }, []);

  const switchTab = useCallback((tabId) => {
    setActiveTabId(tabId);
  }, []);

  const reorderTab = useCallback((fromIndex, toIndex) => {
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const updateTabPath = useCallback((tabId, newPath) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId
        ? { ...t, projectPath: newPath, label: newPath.split('/').filter(Boolean).pop() || newPath }
        : t
    ));
  }, []);

  // role tags a tab's repo (ui / api / db) for linking it into another prompt.
  const setTabRole = useCallback((tabId, role) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, role: role || undefined } : t)));
  }, []);

  const actions = useMemo(() => ({
    addTab,
    removeTab,
    switchTab,
    reorderTab,
    updateTabPath,
    setTabRole,
  }), [addTab, removeTab, switchTab, reorderTab, updateTabPath, setTabRole]);

  const value = useMemo(() => ({ tabs, activeTabId, ...actions }), [tabs, activeTabId, actions]);

  return (
    <TabActionsContext.Provider value={actions}>
      <TabContext.Provider value={value}>
        {children}
      </TabContext.Provider>
    </TabActionsContext.Provider>
  );
}

export function useTabManager() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error('useTabManager must be used within TabProvider');
  return ctx;
}

// Stable tab actions without subscribing to tab state.
export function useTabActions() {
  const ctx = useContext(TabActionsContext);
  if (!ctx) throw new Error('useTabActions must be used within TabProvider');
  return ctx;
}
