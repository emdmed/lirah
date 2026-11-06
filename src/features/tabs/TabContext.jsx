import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useToast } from "../toast";
import { useConfirm } from "../dialogs/DialogProvider";
import { getAgentHookState, getLastTurn } from "./agentHookState";
import { getTabSession } from "./terminalActivity";
import { deleteWorkspaceFolder, getSavedWorkspaces, saveWorkspaces } from "../../lib/workspaceStore";
import { perfTabSwitchStart, perfTabSwitchStep } from "../../lib/perf";
import { invoke } from "@tauri-apps/api/core";
import { getEffectiveSettings } from "../settings/settingsStore";
import { formatDuration } from "../../lib/formatDuration";
import { tildePath } from "../../components/ui/picker";

// Actions are split from state so a tab can call updateTabPath without
// re-rendering whenever any tab's path or the active tab changes.
const TabContext = createContext(null);
const TabActionsContext = createContext(null);

export const MAX_TABS = 8;
const LIMIT_MESSAGE = `Tab limit reached (${MAX_TABS}) — close a tab first`;
// Agent states where closing the tab would kill work in flight.
const BUSY_STATES = new Set(['working', 'permission']);

// What a tab is called: the user's own name, else its bookmark's, else the
// folder it sits in.
export function tabDisplayName(tab, bookmarks = []) {
  return tab.customLabel || bookmarks.find((b) => b.path === tab.projectPath)?.name || tab.label;
}

// A workspace is a named group of tabs. Tabs of the other workspaces stay
// mounted and keep running; only the active workspace's tabs are listed.
function createWorkspace(name) {
  return { id: crypto.randomUUID(), name };
}

// Saved workspaces, with one to start from; saved tabs from before workspaces
// (or of a workspace that is gone) join the first one.
function loadWorkspaces(saved, tabs) {
  const workspaces = saved.length > 0 ? saved : [createWorkspace('main')];
  const ids = new Set(workspaces.map((w) => w.id));
  const placed = tabs.map((t) => (ids.has(t.workspaceId) ? t : { ...t, workspaceId: workspaces[0].id }));
  return { workspaces, tabs: placed };
}

// `launch` asks the tab to start its agent once its shell is up, even with
// auto-launch off; ProjectTab clears it as soon as it boots.
function createTab(projectPath, { launch = false, name, workspaceId } = {}) {
  return {
    id: crypto.randomUUID(),
    projectPath,
    workspaceId,
    label: projectPath.split('/').filter(Boolean).pop() || projectPath,
    ...(name?.trim() && { customLabel: name.trim() }),
    ...(launch && { launch: true }),
  };
}

// The startup projects to open instead of restoring the saved tabs, or null
// when the app should restore as usual. The active workspace may override startupMode.
function startupProjectList() {
  const { startupMode, startupProjects } = getEffectiveSettings(getSavedWorkspaces().activeWorkspaceId);
  return startupMode === 'projects' && startupProjects.length > 0 ? startupProjects : null;
}

// Tabs for the startup projects whose folder still exists; the rest are named
// in `missing`. Capped at MAX_TABS.
async function buildStartupTabs(projects, workspaceId) {
  let home = null;
  const checked = await Promise.all(projects.map(async (p) => {
    let path = p.path.trim();
    if (path === '~' || path.startsWith('~/')) {
      home ??= await invoke('get_home_dir').catch(() => null);
      if (home) path = home + path.slice(1);
    }
    if (path.length > 1) path = path.replace(/\/+$/, '');
    const exists = await invoke('path_exists', { path }).catch(() => false);
    return { ...p, path, exists };
  }));
  const tabs = checked
    .filter((p) => p.exists)
    .slice(0, MAX_TABS)
    .map((p) => createTab(p.path, { launch: !!p.launch, name: p.name, workspaceId }));
  return { tabs, missing: checked.filter((p) => !p.exists).map((p) => p.path) };
}

export function TabProvider({ children }) {
  const toast = useToast();
  const confirm = useConfirm();
  // In 'projects' startup mode the saved tabs are not restored: the startup
  // projects open instead, once their folders are checked (startupPending).
  const [startupProjects] = useState(startupProjectList);
  const [startupPending, setStartupPending] = useState(!!startupProjects);
  const [initial] = useState(() => {
    const saved = getSavedWorkspaces();
    return { ...loadWorkspaces(saved.workspaces, startupProjects ? [] : saved.tabs), saved };
  });
  const [tabs, setTabs] = useState(initial.tabs);
  const [workspaces, setWorkspaces] = useState(initial.workspaces);

  const [activeTabId, setActiveTabId] = useState(() => {
    const stored = initial.saved.activeTabId;
    if (stored && tabs.find(t => t.id === stored)) return stored;
    return tabs[0]?.id || null;
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => {
    const stored = initial.saved.activeWorkspaceId;
    const fromTab = tabs.find((t) => t.id === activeTabId)?.workspaceId;
    return fromTab || (workspaces.some((w) => w.id === stored) ? stored : workspaces[0].id);
  });
  const workspaceTabs = useMemo(() => tabs.filter((t) => t.workspaceId === activeWorkspaceId), [tabs, activeWorkspaceId]);

  // Persist to workspaces/ (debounced; fileStore flushes on window close).
  // The active tab is saved as its workspace's activeTabId.
  useEffect(() => {
    // Parent effects run last, so this marks the end of the switch's effects.
    perfTabSwitchStep('effects-flushed');
    saveWorkspaces({ tabs, workspaces, activeWorkspaceId });
  }, [tabs, workspaces, activeWorkspaceId]);

  // Latest values for the actions below, so they can stay referentially stable.
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const workspacesRef = useRef(workspaces);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    workspacesRef.current = workspaces;
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [tabs, activeTabId, workspaces, activeWorkspaceId]);

  // Each workspace comes back to the tab it was on.
  useEffect(() => {
    if (!activeTabId) return;
    setWorkspaces((prev) => (prev.some((w) => w.id === activeWorkspaceId && w.activeTabId !== activeTabId)
      ? prev.map((w) => (w.id === activeWorkspaceId ? { ...w, activeTabId } : w))
      : prev));
  }, [activeTabId, activeWorkspaceId]);

  // Open the startup projects. App waits on startupPending before adding the
  // CLI path's tab (or the fallback tab when none opened).
  useEffect(() => {
    if (!startupProjects) return;
    let cancelled = false;
    buildStartupTabs(startupProjects, activeWorkspaceIdRef.current).then(({ tabs: opened, missing }) => {
      if (cancelled) return;
      if (missing.length > 0) {
        toast.warning(missing.length === 1
          ? `Startup project not found, skipped: ${missing[0]}`
          : `${missing.length} startup projects not found, skipped: ${missing.join(', ')}`);
      }
      // Set now: App's effect may addTab before this provider's ref effect runs.
      tabsRef.current = opened;
      setTabs(opened);
      setActiveTabId(opened[0]?.id || null);
      setStartupPending(false);
    });
    return () => { cancelled = true; };
  }, [startupProjects, toast]);

  const addTab = useCallback((projectPath, options) => {
    if (tabsRef.current.length >= MAX_TABS) {
      toast.warning(LIMIT_MESSAGE);
      return null;
    }
    const tab = createTab(projectPath, { ...options, workspaceId: activeWorkspaceIdRef.current });
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
      // If removing the active tab, switch to the adjacent one in its
      // workspace; the workspace may be left empty.
      if (tabId === activeTabIdRef.current) {
        const ws = prev[idx].workspaceId;
        const before = prev.slice(0, idx).filter((t) => t.workspaceId === ws);
        const after = next.slice(idx).filter((t) => t.workspaceId === ws);
        setActiveTabId((after[0] || before[before.length - 1])?.id || null);
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
    const sessionId = getTabSession(tabId);
    const hook = getAgentHookState(sessionId);
    if (!hook || !BUSY_STATES.has(hook.state)) return true;
    const branch = await invoke('get_current_branch', { repoPath: tab.projectPath }).catch(() => null);
    // Working counts from the turn's start (hook.at moves on every tool call);
    // a permission wait counts from when it began.
    const turn = getLastTurn(sessionId);
    const start = hook.state === 'working' && turn && !turn.endedAt ? turn.startedAt : hook.at;
    const since = formatDuration(Date.now() - start);
    return confirm({
      title: `Close ${tab.customLabel || tab.label}?`,
      description: 'The agent and its terminal end.',
      facts: [
        {
          label: 'Agent',
          value: hook.state === 'permission' ? `waiting on permission · ${since}` : `working · ${since}`,
          tone: 'lamp',
        },
        { label: 'Repo', value: tildePath(tab.projectPath) },
        ...(branch ? [{ label: 'Branch', value: branch }] : []),
      ],
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

  // A tab in another workspace (Alt+A, a plan's tab) brings its workspace along.
  const switchTab = useCallback((tabId) => {
    if (tabId !== activeTabIdRef.current) perfTabSwitchStart();
    const ws = tabsRef.current.find((t) => t.id === tabId)?.workspaceId;
    if (ws) setActiveWorkspaceId(ws);
    setActiveTabId(tabId);
  }, []);

  const switchWorkspace = useCallback((workspaceId) => {
    const ws = workspacesRef.current.find((w) => w.id === workspaceId);
    if (!ws || workspaceId === activeWorkspaceIdRef.current) return;
    const own = tabsRef.current.filter((t) => t.workspaceId === workspaceId);
    const tabId = (own.find((t) => t.id === ws.activeTabId) || own[0])?.id || null;
    if (tabId) perfTabSwitchStart();
    activeWorkspaceIdRef.current = workspaceId;
    setActiveWorkspaceId(workspaceId);
    setActiveTabId(tabId);
  }, []);

  // A new, empty workspace, switched to.
  const addWorkspace = useCallback((name) => {
    const ws = createWorkspace(name?.trim() || `ws ${workspacesRef.current.length + 1}`);
    workspacesRef.current = [...workspacesRef.current, ws];
    setWorkspaces((prev) => [...prev, ws]);
    activeWorkspaceIdRef.current = ws.id;
    setActiveWorkspaceId(ws.id);
    setActiveTabId(null);
    return ws;
  }, []);

  // Switch to the workspace with this name, adding it when there is none.
  const openWorkspace = useCallback((name) => {
    const want = name.trim().toLowerCase();
    const found = workspacesRef.current.find((w) => w.name.toLowerCase() === want);
    if (found) switchWorkspace(found.id);
    else addWorkspace(name);
  }, [switchWorkspace, addWorkspace]);

  const renameWorkspace = useCallback((workspaceId, name) => {
    if (!name?.trim()) return;
    setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? { ...w, name: name.trim() } : w)));
  }, []);

  // Removes a workspace, closes its tabs and deletes its folder, after asking.
  // The last workspace stays. Resolves true when it was removed.
  const removeWorkspace = useCallback(async (workspaceId) => {
    const list = workspacesRef.current;
    const ws = list.find((w) => w.id === workspaceId);
    if (!ws || list.length < 2) return false;
    const own = tabsRef.current.filter((t) => t.workspaceId === workspaceId);
    const closes = own.length === 0 ? '' : ` Its ${own.length === 1 ? 'tab closes' : `${own.length} tabs close`}, with their terminals and agents.`;
    if (!(await confirm({
      title: `Remove workspace ${ws.name}?`,
      description: `Its folder and everything in it are deleted.${closes}`,
      facts: [
        { label: 'Folder', value: `~/.lirah/workspaces/${workspaceId}/` },
        ...own.map((t) => ({ label: 'Tab', value: t.customLabel || t.label })),
      ],
      confirmLabel: 'Remove workspace',
      destructive: true,
    }))) return false;
    if (workspaceId === activeWorkspaceIdRef.current) {
      const i = list.indexOf(ws);
      switchWorkspace((list[i + 1] || list[i - 1]).id);
    }
    const gone = new Set(own.map((t) => t.id));
    tabsRef.current = tabsRef.current.filter((t) => !gone.has(t.id));
    setTabs((prev) => prev.filter((t) => !gone.has(t.id)));
    workspacesRef.current = list.filter((w) => w.id !== workspaceId);
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    deleteWorkspaceFolder(workspaceId).catch((error) => console.warn(`Failed to delete workspace ${workspaceId}:`, error));
    return true;
  }, [confirm, switchWorkspace]);

  // Indexes count within the active workspace, as the TABS pane lists them.
  const reorderTab = useCallback((fromIndex, toIndex) => {
    const ws = activeWorkspaceIdRef.current;
    setTabs(prev => {
      const shown = prev.filter((t) => t.workspaceId === ws);
      const moved = shown[fromIndex];
      const target = shown[toIndex];
      if (!moved || !target || moved === target) return prev;
      const next = prev.filter((t) => t !== moved);
      const at = next.indexOf(target);
      next.splice(fromIndex < toIndex ? at + 1 : at, 0, moved);
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
    switchWorkspace,
    addWorkspace,
    openWorkspace,
    renameWorkspace,
    removeWorkspace,
  }), [addTab, removeTab, confirmCloseTab, requestCloseTab, clearTabLaunch, switchTab, reorderTab, updateTabPath, renameTab, setTabRole, setTabCompaction,
    switchWorkspace, addWorkspace, openWorkspace, renameWorkspace, removeWorkspace]);

  // `tabs` is every tab, of all workspaces; `workspaceTabs` the active one's.
  const value = useMemo(
    () => ({ tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, startupPending, openedStartup: !!startupProjects, ...actions }),
    [tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, startupPending, startupProjects, actions],
  );

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
