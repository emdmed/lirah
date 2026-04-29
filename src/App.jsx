import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabManager } from "./features/tabs";
import { ProjectTab } from "./features/tabs/ProjectTab";
import { TabBar } from "./features/tabs/TabBar";
import { SplashScreen } from "./features/splash";

function App() {
  const { tabs, activeTabId, addTab, removeTab, switchTab, reorderTab } = useTabManager();

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
        // No CLI path — use home dir as fallback
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

  // Global keyboard shortcuts for tab management
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Tab: next tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const nextIdx = (idx + 1) % tabs.length;
        switchTab(tabs[nextIdx].id);
        return;
      }
      // Ctrl+Shift+Tab: previous tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const prevIdx = (idx - 1 + tabs.length) % tabs.length;
        switchTab(tabs[prevIdx].id);
        return;
      }
      // Ctrl+1-9: switch to tab N
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const tabIdx = parseInt(e.key, 10) - 1;
        if (tabIdx < tabs.length) {
          e.preventDefault();
          switchTab(tabs[tabIdx].id);
        }
        return;
      }
      // Ctrl+T: new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        handleNewTab();
        return;
      }
      // Ctrl+W: close active tab (if >1 tab)
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && !e.shiftKey && !e.altKey) {
        if (tabs.length > 1) {
          e.preventDefault();
          removeTab(activeTabId);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [tabs, activeTabId, switchTab, removeTab]);

  // New tab handler — opens at home dir
  const handleNewTab = useCallback(async () => {
    try {
      const home = await invoke('get_home_dir');
      if (home) addTab(home);
    } catch { /* ignore */ }
  }, [addTab]);

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {tabs.length > 1 && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitch={switchTab}
          onClose={removeTab}
          onAdd={handleNewTab}
          onReorder={reorderTab}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tabs.map(tab => (
          <ProjectTab
            key={tab.id}
            tabId={tab.id}
            projectPath={tab.projectPath}
            isActive={tab.id === activeTabId}
          />
        ))}
      </div>

      <SplashScreen
        visible={splashVisible}
        projectName={splashProjectName}
        currentStep={splashStep}
        onComplete={() => setSplashVisible(false)}
      />
    </div>
  );
}

export default App;
