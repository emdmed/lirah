import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useToast } from "../toast";
import { useConfirm } from "../dialogs/DialogProvider";
import { getAgentHookState } from "./agentHookState";
import { getTabSession } from "./terminalActivity";
import { loadJson, loadText, saveJson, saveText } from "../../lib/storage";
import { perfTabSwitchStart, perfTabSwitchStep } from "../../lib/perf";

// Actions are split from state so a tab can call updateTabPath without
// re-rendering whenever any tab's path or the active tab changes.
const TabContext = createContext(null);
const TabActionsContext = createContext(null);

const STORAGE_KEY = 'nevo-terminal:tabs';
export const MAX_TABS = 8;
const LIMIT_MESSAGE = `Tab limit reached (${MAX_TABS}) — close a tab first`;
// Agent states where closing the tab would kill work in flight.
const BUSY_STATES = new Set(['working', 'permission']);

// What a tab is called: the user's own name, else its bookmark's, else the
// folder it sits in.
export function tabDisplayName(tab, bookmarks = []) {
  return tab.customLabel || bookmarks.find((b) => b.path === tab.projectPath)?.name || tab.label;
}

// `launch` asks the tab to start its agent once its shell is up, even with
// auto-launch off; ProjectTab clears it as soon as it boots.
function createTab(projectPath, { launch = false } = {}) {
  return {
    id: crypto.randomUUID(),
    projectPath,
    label: projectPath.split('/').filter(Boolean).pop() || projectPath,
    ...(launch && { launch: true }),
  };
}

export function TabProvider({ children }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tabs, setTabs] = useState(() => {
    const parsed = loadJson(STORAGE_KEY, null);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    const stored = loadText(STORAGE_KEY + ':active');
    if (stored && tabs.find(t => t.id === stored)) return stored;
    return tabs[0]?.id || null;
  });

  // Persist tabs to localStorage synchronously on every change.
  // A debounce here loses state: the custom TitleBar close button calls
  // appWindow.close() immediately, destroying the webview before a deferred
  // write can flush — so tab edits made right before quitting never persist.
  useEffect(() => {
    // Parent effects run last, so this marks the end of the switch's effects.
    perfTabSwitchStep('effects-flushed');
    saveJson(STORAGE_KEY, tabs);
    saveText(STORAGE_KEY + ':active', activeTabId || '');
  }, [tabs, activeTabId]);

  // Latest values for the actions below, so they can stay referentially stable.
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  const addTab = useCallback((projectPath, options) => {
    if (tabsRef.current.length >= MAX_TABS) {
      toast.warning(LIMIT_MESSAGE);
      return null;
    }
    const tab = createTab(projectPath, options);
    tabsRef.current = [...tabsRef.current, tab];
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
    return tab;
  }, [toast]);

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

  // Asks before closing a tab whose agent is mid-turn or waiting on a
  // permission prompt. Resolves true when the tab may close.
  const confirmCloseTab = useCallback(async (tabId) => {
    const current = tabsRef.current;
    const tab = current.find((t) => t.id === tabId);
    if (!tab || current.length < 2) return false;
    const hook = getAgentHookState(getTabSession(tabId));
    if (!hook || !BUSY_STATES.has(hook.state)) return true;
    return confirm({
      title: `Close ${tab.customLabel || tab.label}?`,
      description: hook.state === 'permission'
        ? 'Its agent is waiting on a permission prompt. Closing the tab ends the agent and its terminal.'
        : 'Its agent is still working. Closing the tab ends the agent and its terminal.',
      confirmLabel: 'Close tab',
      destructive: true,
    });
  }, [confirm]);

  // Close with the confirmation above. Resolves true when the tab was closed.
  const requestCloseTab = useCallback(async (tabId) => {
    if (!(await confirmCloseTab(tabId))) return false;
    removeTab(tabId);
    return true;
  }, [confirmCloseTab, removeTab]);

  const switchTab = useCallback((tabId) => {
    if (tabId !== activeTabIdRef.current) perfTabSwitchStart();
    setActiveTabId(tabId);
  }, []);

  const reorderTab = useCallback((fromIndex, toIndex) => {
    setTabs(prev => {
      if (fromIndex === toIndex || !prev[fromIndex] || toIndex < 0 || toIndex >= prev.length) return prev;
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

  // A name the user gave the tab; it wins over the automatic label until it is
  // cleared (an empty name goes back to automatic).
  const renameTab = useCallback((tabId, name) => {
    const customLabel = name?.trim() || undefined;
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, customLabel } : t)));
  }, []);

  // role tags a tab's repo (ui / api / db) for linking it into another prompt.
  const setTabRole = useCallback((tabId, role) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, role: role || undefined } : t)));
  }, []);

  // Whether the tab's agent runs Lirah's compaction hook.
  const setTabCompaction = useCallback((tabId, enabled) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, compactionHook: enabled || undefined } : t)));
  }, []);

  // The tab has taken its one-shot launch request (see createTab).
  const clearTabLaunch = useCallback((tabId) => {
    setTabs(prev => (prev.some(t => t.id === tabId && t.launch)
      ? prev.map(t => (t.id === tabId ? { ...t, launch: undefined } : t))
      : prev));
  }, []);

  const actions = useMemo(() => ({
    addTab,
    removeTab,
    confirmCloseTab,
    requestCloseTab,
    clearTabLaunch,
    switchTab,
    reorderTab,
    updateTabPath,
    renameTab,
    setTabRole,
    setTabCompaction,
  }), [addTab, removeTab, confirmCloseTab, requestCloseTab, clearTabLaunch, switchTab, reorderTab, updateTabPath, renameTab, setTabRole, setTabCompaction]);

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
