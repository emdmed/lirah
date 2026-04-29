import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const TabContext = createContext(null);

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

  // Persist tabs to localStorage (debounced)
  const persistTimer = useRef(null);
  useEffect(() => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
      localStorage.setItem(STORAGE_KEY + ':active', activeTabId || '');
    }, 500);
    return () => clearTimeout(persistTimer.current);
  }, [tabs, activeTabId]);

  const addTab = useCallback((projectPath) => {
    if (tabs.length >= MAX_TABS) {
      console.warn(`Maximum of ${MAX_TABS} tabs reached`);
      return null;
    }
    const tab = createTab(projectPath);
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    return tab;
  }, [tabs.length]);

  const removeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) return prev; // Don't remove last tab here; lifecycle handles it
      // If removing active tab, switch to adjacent
      if (tabId === activeTabId) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
      }
      return next;
    });
  }, [activeTabId]);

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

  const value = {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    switchTab,
    reorderTab,
    updateTabPath,
  };

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabManager() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error('useTabManager must be used within TabProvider');
  return ctx;
}
