import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { matches } from "./lib/shortcuts";
import { useTabManager } from "./features/tabs";
import { ProjectTab } from "./features/tabs/ProjectTab";
import { TabBar } from "./features/tabs/TabBar";
import { SplashScreen } from "./features/splash";
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
import { markFirstRun } from "./features/tabs/firstRun";

function App() {
  const { tabs, activeTabId, addTab, requestCloseTab, switchTab } = useTabManager();
  usePaneShortcuts();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const toast = useToast();

  // Terminals from before a reload that no tab will reattach.
  useEffect(() => { reapOrphanedTerminals(); }, []);

  // Agent state reported by Claude Code / opencode hooks, for the tab lamps.
  useEffect(() => { startAgentHookListener(); }, []);
  // Tabs whose agent is waiting on you: notifications and Alt+A to jump there.
  const { jumpToNext } = useAgentAttention({ tabs, activeTabId, switchTab });

  // One update check for the whole app (it hits GitHub's unauthenticated API).
  const availableUpdate = useUpdateChecker();

  // Show toast when a new release is available — but only once per version,
  // so restarts and the 4h re-check don't re-fire it.
  useEffect(() => {
    if (!availableUpdate) return;
    const NOTIFIED_KEY = 'nevo-terminal:update-notified-version';
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
  }, [availableUpdate, toast]);

  // CLI initial path (e.g. `nevo /path/to/project`)
  const [initialProjectDir, setInitialProjectDir] = useState(undefined); // undefined = not yet checked

  // Splash screen state
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashStep, setSplashStep] = useState('navigate');
  const [splashProjectName, setSplashProjectName] = useState('');

  // Fetch CLI initial path on mount and create first tab
  useEffect(() => {
    if (tabs.length > 0) {
      // Tabs restored from localStorage — nothing to do
      setInitialProjectDir(tabs[0].projectPath);
      return;
    }
    invoke('get_initial_path').then(async (path) => {
      if (path) {
        setInitialProjectDir(path);
        addTab(path);
      } else {
        // No CLI path — use home dir as fallback, and let the tab offer the
        // project picker once its terminal is up.
        markFirstRun();
        try {
          const home = await invoke('get_home_dir');
          const fallback = home || '/';
          setInitialProjectDir(fallback);
          addTab(fallback);
        } catch {
          setInitialProjectDir('/');
          addTab('/');
        }
      }
    }).catch(() => {
      setInitialProjectDir('/');
      addTab('/');
    });
  }, []);

  // New tab handler — opens where the active tab is now, else at home dir
  const activeProjectPath = activeTab?.projectPath;
  const handleNewTab = useCallback(async () => {
    if (activeProjectPath) {
      addTab(activeProjectPath);
      return;
    }
    try {
      const home = await invoke('get_home_dir');
      if (home) addTab(home);
    } catch { /* ignore */ }
  }, [addTab, activeProjectPath]);

  // Global keyboard shortcuts for tab management
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Tab: next tab; Ctrl+Shift+Tab: previous tab
      if (matches('tab-next', e)) {
        if (tabs.length === 0) return;
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const step = e.shiftKey ? tabs.length - 1 : 1;
        switchTab(tabs[(idx + step) % tabs.length].id);
        return;
      }
      // Ctrl+1-9: switch to tab N
      if (matches('tab-goto', e)) {
        const tabIdx = parseInt(e.key, 10) - 1;
        if (tabIdx < tabs.length) {
          e.preventDefault();
          switchTab(tabs[tabIdx].id);
        }
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
  }, [tabs, activeTabId, switchTab, requestCloseTab, handleNewTab, jumpToNext]);

  // Handle project selection from initial dialog (with splash screen)
  const handleSelectProjectForNewTab = useCallback((bookmark) => {
    setSplashProjectName(bookmark.name);
    setSplashStep('navigate');
    setSplashVisible(true);
    addTab(bookmark.path);
    // Splash auto-closes after delay
    setTimeout(() => {
      setSplashStep('done');
    }, 2000);
  }, [addTab]);

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
                  availableUpdate={availableUpdate}
                />
              </DevProfiler>
            ))}
          </div>
          <RightSidebar projectPath={activeTab?.projectPath} onNewTab={handleNewTab} />
        </div>

        <KeyHintBar />
        <ToastContainer />

        <SplashScreen
          visible={splashVisible}
          projectName={splashProjectName}
          currentStep={splashStep}
          onComplete={() => setSplashVisible(false)}
        />
      </div>
    </SubagentProvider>
  );
}

export default App;
