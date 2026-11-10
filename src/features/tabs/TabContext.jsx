import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useToast } from "../toast";
import { useConfirm } from "../dialogs/DialogProvider";
import { getAgentHookState, getLastTurn } from "./agentHookState";
import { getTabSession } from "./terminalActivity";
import { deleteWorkspaceFolder, getSavedWorkspaces, saveWorkspaces } from "../../lib/workspaceStore";
import { perfTabSwitchStart, perfTabSwitchStep } from "../../lib/perf";
import { invoke } from "@tauri-apps/api/core";
import { getEffectiveSettings, getSettings } from "../settings/settingsStore";
import { formatDuration } from "../../lib/formatDuration";
import { tildePath } from "../../components/ui/picker";
import { assertColumnRoom, placeColumn } from "../zen/zenColumns";
import { pathSegments, basename } from '../../utils/pathUtils';

// Actions are split from state so a tab can call updateTabPath without
// re-rendering whenever any tab's path or the active tab changes.
const TabContext = createContext(null);
const TabActionsContext = createContext(null);

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

// Zen columns follow focus: a tab focused outside them takes the slot of the
// tab focused before it (the last slot when that one is not a column).
export function followFocus(cols, prev, next) {
  if (!cols?.length || !next || cols.includes(next)) return cols;
  const out = [...cols];
  const i = out.indexOf(prev);
  out[i >= 0 ? i : out.length - 1] = next;
  return out;
}

// Saved columns lag focus by one effect, so follow it here too; closed tabs drop out.
function zenColumnsOf(workspaces, workspaceId, activeTabId, tabs) {
  const ws = workspaces.find((w) => w.id === workspaceId);
  const cols = followFocus(ws?.zenColumns, ws?.activeTabId, activeTabId) ?? [];
  return cols.filter((id) => tabs.some((t) => t.id === id && t.workspaceId === workspaceId));
}

// The workspace's master terminal: a tab of its own, kept out of the tab list,
// whose agent orchestrates the workspace's tabs. Null until first opened.
export function masterTabOf(tabs, workspaceId) {
  return tabs.find((t) => t.workspaceId === workspaceId && t.master) || null;
}

// The deepest folder holding all of these paths ("/" at worst).
function commonFolder(paths) {
  const parts = paths.map(pathSegments);
  const shared = [];
  for (let i = 0; parts.every((p) => i < p.length && p[i] === parts[0][i]); i++) shared.push(parts[0][i]);
  return /^[A-Za-z]:$/.test(shared[0] ?? '') ? shared.join('/') : `/${shared.join('/')}`;
}

// `launch` asks the tab to start its agent once its shell is up, even with
// auto-launch off; ProjectTab clears it as soon as it boots.
function createTab(projectPath, { launch = false, name, workspaceId, master = false } = {}) {
  return {
    id: crypto.randomUUID(),
    projectPath,
    workspaceId,
    label: basename(projectPath, projectPath),
    ...(name?.trim() && { customLabel: name.trim() }),
    ...(launch && { launch: true }),
    ...(master && { master: true }),
  };
}

// The startup projects to open instead of restoring the saved tabs, or null
// when the app should restore as usual. The active workspace may override startupMode.
function startupProjectList() {
  const { startupMode, startupProjects } = getEffectiveSettings(getSavedWorkspaces().activeWorkspaceId);
  return startupMode === 'projects' && startupProjects.length > 0 ? startupProjects : null;
}

// Tabs for the startup projects whose folder still exists; the rest are named
// in `missing`.
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
  const workspaceTabs = useMemo(() => tabs.filter((t) => t.workspaceId === activeWorkspaceId && !t.master), [tabs, activeWorkspaceId]);

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
      ? prev.map((w) => (w.id === activeWorkspaceId
        ? { ...w, activeTabId, zenColumns: followFocus(w.zenColumns, w.activeTabId, activeTabId) }
        : w))
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

  const addTab = useCallback((projectPath, options = {}) => {
    const tab = createTab(projectPath, { ...options, workspaceId: activeWorkspaceIdRef.current });
    tabsRef.current = [...tabsRef.current, tab];
    setTabs(prev => [...prev, tab]);
    if (options.focus !== false) setActiveTabId(tab.id);
    return tab;
  }, []);

  const removeTab = useCallback((tabId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) return prev; // Don't remove last tab here; lifecycle handles it
      const ws = prev[idx].workspaceId;
      // A closed tab's Zen column closes with it (else focus-follow would refill it).
      const cols = workspacesRef.current.find((w) => w.id === ws)?.zenColumns ?? [];
      const col = cols.indexOf(tabId);
      const restCols = cols.filter((id) => id !== tabId && next.some((t) => t.id === id));
      if (col >= 0) setWorkspaces((p) => p.map((w) => (w.id === ws ? { ...w, zenColumns: restCols } : w)));
      // If removing the active tab, switch to the adjacent one in its
      // workspace (in Zen, the neighbouring column); the workspace may be left empty.
      if (tabId === activeTabIdRef.current) {
        const before = prev.slice(0, idx).filter((t) => t.workspaceId === ws && !t.master);
        const after = next.slice(idx).filter((t) => t.workspaceId === ws && !t.master);
        const neighbour = getSettings().zenMode && col >= 0 && restCols[Math.min(col, restCols.length - 1)];
        setActiveTabId(neighbour || (after[0] || before[before.length - 1])?.id || null);
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
    const tabId = (own.find((t) => t.id === ws.activeTabId) || own.find((t) => !t.master))?.id || null;
    if (tabId) perfTabSwitchStart();
    activeWorkspaceIdRef.current = workspaceId;
    setActiveWorkspaceId(workspaceId);
    setActiveTabId(tabId);
  }, []);

  // Zen's columns of the active workspace: up to three tab ids, left to right.
  const setZenColumns = useCallback((ids) => {
    const ws = activeWorkspaceIdRef.current;
    setWorkspaces((prev) => prev.map((w) => (w.id === ws ? { ...w, zenColumns: ids.slice(0, 3) } : w)));
  }, []);

  // The columns on screen now (the focused tab alone when none are saved).
  const currentZenColumns = () => {
    const focused = activeTabIdRef.current;
    const cols = zenColumnsOf(workspacesRef.current, activeWorkspaceIdRef.current, focused, tabsRef.current);
    return cols.length ? cols : [focused];
  };

  // Puts a tab into Zen column `slot` (0-based; null = the focused one's), adding
  // a column past the end. Throws the reason when it refuses (too narrow).
  const placeZenColumn = useCallback((tabId, slot) => {
    const cols = currentZenColumns();
    const focused = activeTabIdRef.current;
    const out = placeColumn(cols, focused, tabId, slot);
    if (out.length > cols.length) assertColumnRoom(out.length);
    setZenColumns(out);
    // The focused tab is always on screen; pushed off, focus goes to the new one.
    if (!out.includes(focused)) switchTab(tabId);
  }, [setZenColumns, switchTab]);

  // The active workspace's tabs at call time, for actions that must not re-render on every tab change.
  const getWorkspaceTabs = useCallback(() => tabsRef.current
    .filter((t) => t.workspaceId === activeWorkspaceIdRef.current && !t.master), []);

  // Takes a tab off screen; the last column stays.
  const dropZenColumn = useCallback((tabId) => {
    const cols = currentZenColumns();
    const i = cols.indexOf(tabId);
    if (i < 0) throw new Error('not on screen');
    if (cols.length === 1) throw new Error('the last column stays on screen');
    const out = cols.filter((id) => id !== tabId);
    setZenColumns(out);
    if (tabId === activeTabIdRef.current) switchTab(out[Math.min(i, out.length - 1)]);
  }, [setZenColumns, switchTab]);

  // A new, empty workspace, switched to.
  const addWorkspace = useCallback((name) => {
    const ws = createWorkspace(name?.trim() || `ws${workspacesRef.current.length + 1}`);
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

  // A null id renames the active workspace.
  const renameWorkspace = useCallback((workspaceId, name) => {
    if (!name?.trim()) return;
    workspaceId ??= activeWorkspaceIdRef.current;
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
        ? { ...t, projectPath: newPath, label: basename(newPath, newPath) }
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

  // A one-line purpose for the tab, read by the master agent (`lirah tabs note`).
  const setTabNote = useCallback((tabId, note) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, note: note?.trim() || undefined } : t)));
  }, []);

  // Boots a tab's terminal and agent without showing it (the master sends it
  // work). Not saved, so restored tabs still boot on first view.
  const wakeTab = useCallback((tabId) => {
    setTabs(prev => (prev.some(t => t.id === tabId && !t.background)
      ? prev.map(t => (t.id === tabId ? { ...t, background: true } : t))
      : prev));
  }, []);

  // Shows the active workspace's master terminal, opening it on first use in
  // the folder holding all its tabs' projects (home when it has none), so its
  // agent can read every repo.
  const openMaster = useCallback(async () => {
    const ws = activeWorkspaceIdRef.current;
    const existing = masterTabOf(tabsRef.current, ws);
    if (existing) {
      setActiveTabId(existing.id);
      return existing;
    }
    const paths = tabsRef.current.filter((t) => t.workspaceId === ws).map((t) => t.projectPath);
    const home = await invoke('get_home_dir').catch(() => '/');
    const path = paths.length ? commonFolder(paths) : home;
    const tab = createTab(path === '/' ? home : path, { launch: true, name: 'workspace', workspaceId: ws, master: true });
    tabsRef.current = [...tabsRef.current, tab];
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    return tab;
  }, []);

  const actions = useMemo(() => ({
    addTab,
    setTabNote,
    wakeTab,
    openMaster,
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
    setZenColumns,
    placeZenColumn,
    dropZenColumn,
    getWorkspaceTabs,
  }), [addTab, setTabNote, wakeTab, openMaster, removeTab, confirmCloseTab, requestCloseTab, clearTabLaunch, switchTab, reorderTab, updateTabPath, renameTab, setTabRole, setTabCompaction,
    switchWorkspace, addWorkspace, openWorkspace, renameWorkspace, removeWorkspace, setZenColumns, placeZenColumn, dropZenColumn, getWorkspaceTabs]);

  const zenColumns = useMemo(
    () => zenColumnsOf(workspaces, activeWorkspaceId, activeTabId, tabs),
    [workspaces, activeWorkspaceId, activeTabId, tabs],
  );

  // `tabs` is every tab, of all workspaces; `workspaceTabs` the active one's.
  const value = useMemo(
    () => ({ tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, zenColumns, startupPending, openedStartup: !!startupProjects, ...actions }),
    [tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, zenColumns, startupPending, startupProjects, actions],
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
