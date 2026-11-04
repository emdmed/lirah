import { getRecordingMode } from './lib/recordingMode';
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { matches } from "./lib/shortcuts";
import { useTabManager } from "./features/tabs";
import { ProjectTab } from "./features/tabs/ProjectTab";
import { TabBar } from "./features/tabs/TabBar";
import { SubagentProvider } from "./contexts/SubagentContext";
import { RightSidebar } from "./features/agent-jobs/RightSidebar";
import { usePaneShortcuts } from "./hooks/usePaneShortcuts";
import { KeyHintBar } from "./components/KeyHintBar";
import { ToastContainer, useToast } from "./features/toast";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { DevProfiler } from "./components/DevProfiler";
import { reapOrphanedTerminals } from "./lib/terminalSessions";
import { startAgentHookListener } from "./features/tabs/agentHookState";
import { useAgentAttention } from "./features/tabs/useAgentAttention";
import { FirstTabChooser } from "./features/tabs/FirstTabChooser";
import { GlobalDialogOutlet } from "./features/dialogs/GlobalDialogOutlet";
import { useDialog } from "./features/dialogs/DialogProvider";
import { MAX_TABS } from "./features/tabs/TabContext";
import { useSetting } from "./features/settings/settingsStore";
import { useAgentControl } from "./features/agent-control/useAgentControl";

function App() {
  const { tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, startupPending, openedStartup, addTab, requestCloseTab, switchTab, switchWorkspace } = useTabManager();
  usePaneShortcuts();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const toast = useToast();

  // Terminals from before a reload that no tab will reattach.
  useEffect(() => { reapOrphanedTerminals(); }, []);

  // Requests from the `lirah` CLI in a tab: settings and theme changes.
  useAgentControl();

  // Agent state reported by Claude Code / opencode hooks, for the tab lamps.
  useEffect(() => { startAgentHookListener(); }, []);
  // opencode loads its plugins globally, so the "Agent state hook" setting
  // installs or removes Lirah's. Claude Code's is left out per launch instead.
  const [agentStateHook] = useSetting('agentStateHook');
  useEffect(() => {
    invoke('set_opencode_agent_plugin', { enabled: agentStateHook })
      .catch((error) => console.warn('Failed to update the opencode agent plugin:', error));
  }, [agentStateHook]);
  // Tabs whose agent is waiting on you: notifications and Alt+A to jump there.
  const { jumpToNext } = useAgentAttention({ tabs, activeTabId, switchTab });

  // One update check for the whole app (it hits GitHub's unauthenticated API).
  const availableUpdate = useUpdateChecker();

  // Show toast when a new release is available — but only once per version,
  // so restarts and the 4h re-check don't re-fire it.
  useEffect(() => {
    if (!availableUpdate) return;
    const NOTIFIED_KEY = 'nevo-terminal:update-notified-version';
    getRecordingMode().then(({ quiet }) => {
      if (quiet) return; // no toast over a promo recording
      try {
        if (localStorage.getItem(NOTIFIED_KEY) === availableUpdate.version) return;
        localStorage.setItem(NOTIFIED_KEY, availableUpdate.version);
      } catch { /* ignore */ }
      toast.info(`Update available: ${availableUpdate.version}`, {
        duration: 15000,
        action: {
          label: 'View Release',
          onClick: () => {
            import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
              openUrl(availableUpdate.url);
            });
          },
        },
      });
    });
  }, [availableUpdate, toast]);

  // Fetch CLI initial path on mount and create first tab. In 'projects'
  // startup mode this waits until TabProvider has opened the startup projects;
  // the CLI path then opens on top of them.
  // Once the first tabs are settled, a workspace with no tab (a new one, or
  // the first run) shows the chooser for where its first tab works.
  const initialTabsDone = useRef(false);
  const [showFirstTabChooser, setShowFirstTabChooser] = useState(false);
  useEffect(() => {
    if (startupPending || initialTabsDone.current) return;
    initialTabsDone.current = true;
    if (tabs.length > 0 && !openedStartup) {
      // Tabs restored from localStorage — nothing to open
      setShowFirstTabChooser(true);
      return;
    }
    invoke('get_initial_path').then(async (path) => {
      // A CLI path that is already a startup project focuses that tab.
      const open = path && openedStartup && tabs.find((t) => t.projectPath === path.replace(/\/+$/, ''));
      if (open) {
        switchTab(open.id);
      } else if (path) {
        addTab(path);
      }
    }).catch(() => {}).finally(() => setShowFirstTabChooser(true));
  }, [startupPending]);

  // New tab: pick the project first (current, starred, or any folder).
  // At the tab limit, addTab shows the limit toast instead of the picker.
  const activeProjectPath = activeTab?.projectPath;
  const dialog = useDialog();
  const tabCount = tabs.length;
  const handleNewTab = useCallback(() => {
    if (tabCount >= MAX_TABS) {
      addTab(activeProjectPath);
      return;
    }
    dialog.open('newTab', {}, null);
  }, [addTab, activeProjectPath, tabCount, dialog]);

  // Global keyboard shortcuts for tab management
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Tab: next tab; Ctrl+Shift+Tab: previous tab
      // Both count within the active workspace.
      if (matches('tab-next', e)) {
        if (workspaceTabs.length === 0) return;
        e.preventDefault();
        const idx = workspaceTabs.findIndex(t => t.id === activeTabId);
        const step = e.shiftKey ? workspaceTabs.length - 1 : 1;
        switchTab(workspaceTabs[(idx + step) % workspaceTabs.length].id);
        return;
      }
      // Ctrl+1-9: switch to tab N
      if (matches('tab-goto', e)) {
        const tabIdx = parseInt(e.key, 10) - 1;
        if (tabIdx < workspaceTabs.length) {
          e.preventDefault();
          switchTab(workspaceTabs[tabIdx].id);
        }
        return;
      }
      // Alt+W: next workspace; Alt+Shift+W: previous
      if (matches('workspace-next', e)) {
        if (workspaces.length < 2) return;
        e.preventDefault();
        e.stopPropagation();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
        const step = e.shiftKey ? workspaces.length - 1 : 1;
        switchWorkspace(workspaces[(idx + step) % workspaces.length].id);
        return;
      }
      // Alt+A: next tab whose agent is waiting on you
      if (matches('attention-jump', e)) {
        e.preventDefault();
        e.stopPropagation();
        jumpToNext();
        return;
      }
      // Ctrl+T: new tab. Stopped here so no tab-level listener (document
      // capture, which runs after this) also acts on it. The new tab's
      // terminal takes focus once it's ready (ProjectTab's activation effect).
      if (matches('tab-new', e)) {
        e.preventDefault();
        e.stopPropagation();
        handleNewTab();
        return;
      }
      // Ctrl+W: close active tab. With one tab it falls through to the
      // terminal (readline delete-word, nvim window commands).
      if (matches('tab-close', e) && tabs.length > 1) {
        e.preventDefault();
        e.stopPropagation();
        requestCloseTab(activeTabId);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [tabs, workspaceTabs, workspaces, activeWorkspaceId, activeTabId, switchTab, switchWorkspace, requestCloseTab, handleNewTab, jumpToNext]);

  return (
    <SubagentProvider tabs={tabs}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--ins-gutter)' }}>
        <TabBar />

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', background: 'var(--ins-gutter)' }}>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            {tabs.map(tab => (
              <DevProfiler key={tab.id} id={`ProjectTab:${tab.label}`}>
                <ProjectTab
                  tabId={tab.id}
                  projectPath={tab.projectPath}
                  isActive={tab.id === activeTabId}
                  compactionHook={!!tab.compactionHook}
                  launchOnStart={!!tab.launch}
                  availableUpdate={availableUpdate}
                />
              </DevProfiler>
            ))}
            {showFirstTabChooser && workspaceTabs.length === 0 && (
              <FirstTabChooser onOpenProject={(path) => addTab(path)} />
            )}
          </div>
          <RightSidebar projectPath={activeTab?.projectPath} onNewTab={handleNewTab} />
        </div>

        <KeyHintBar />
        <ToastContainer />

        <GlobalDialogOutlet currentPath={activeProjectPath} onOpenProject={addTab} />
      </div>
    </SubagentProvider>
  );
}

export default App;
