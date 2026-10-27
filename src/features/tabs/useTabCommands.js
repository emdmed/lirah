import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { requestJobsPane } from '../agent-jobs/jobsPane';
import { requestAutopilotToggle, requestPlansPane } from '../plans/plansPaneEvents';
import { useWatcher } from '../watcher';
import { useTabActions } from './TabContext';
import { requestAttentionJump } from './useAgentAttention';
import { SCROLLBACK_OPTIONS, setScrollback } from '../../lib/terminalPrefs';

/**
 * The `:` command palette's commands. Each maps to an action that already
 * exists elsewhere (a shortcut, a status-bar control or a menu item), so the
 * palette adds reach, not behaviour. A command's shortcut, if it has one, comes
 * from src/lib/shortcuts.js and is shown by the palette, not written in `hint`.
 */
export function useTabCommands({
  tabId,
  projectPath,
  dialogs,
  settings,
  themes,
  changeTheme,
  secondary,
  onToggleCompaction,
  compactionEnabled,
  compactionAvailable,
  onAutoCommit,
  onAutoMerge,
  onLaunchCli,
  onOpenLazygit,
  onClearContext,
  onInsertContext,
  toggleSandbox,
  toggleNetwork,
  onToggleGitFilter,
  onToggleMarkdownFilter,
  setSidebarOpen,
  setTextareaVisible,
}) {
  const { setCliSelectionModalOpen, setDashboardOpen, setBudgetDialogOpen, setAutoChangelogDialogOpen,
    setManageTemplatesDialogOpen, setBookmarksPaletteOpen, setWorkspaceDialogOpen, setShowHelp,
    setSettingsOpen } = dialogs;
  const { sandboxEnabled, networkIsolation, setShowTitleBar, keepFilesAfterSend, setKeepFilesAfterSend } = settings;
  const { secondaryVisible, closeSecondaryTerminal, setSecondaryVisible, openWithCommand } = secondary;
  const { addTab, requestCloseTab } = useTabActions();
  const { fileWatchingEnabled, toggleWatchers } = useWatcher();

  return useMemo(() => {
    const onOff = (arg, current) => (arg === 'on' ? true : arg === 'off' ? false : !current);
    const commands = [
      // Tabs
      // Same as Ctrl+T: open in this tab's project, else home.
      { id: 'tab', aliases: ['new'], hint: 'new tab in this project', run: async () => {
        if (projectPath) { addTab(projectPath); return; }
        const home = await invoke('get_home_dir');
        if (home) addTab(home);
      } },
      { id: 'close', hint: 'close this tab', run: () => requestCloseTab(tabId) },
      { id: 'waiting', aliases: ['next'], hint: 'jump to the next agent waiting on you', run: () => requestAttentionJump() },

      // Agent & terminals
      { id: 'launch', aliases: ['claude'], hint: 'launch the CLI in the terminal', run: () => onLaunchCli() },
      { id: 'cli', hint: 'choose the CLI tool', run: () => setCliSelectionModalOpen(true) },
      { id: 'clear', hint: 'clear the CLI context (/clear)', run: () => onClearContext() },
      { id: 'term', hint: 'toggle the secondary terminal', run: () => {
        if (secondaryVisible) closeSecondaryTerminal();
        else setSecondaryVisible(true);
      } },
      { id: 'nvim', hint: 'nvim in the secondary terminal', run: () => openWithCommand('nvim') },
      { id: 'lazygit', aliases: ['lg'], hint: 'lazygit in the secondary terminal', run: () => onOpenLazygit() },
      { id: 'scrollback', hint: 'terminal scrollback lines', options: SCROLLBACK_OPTIONS.map((o) => String(o.value)), run: (arg) => {
        const lines = Number(arg);
        if (!SCROLLBACK_OPTIONS.some((o) => o.value === lines)) throw new Error('pick one of the listed sizes');
        setScrollback(lines);
      } },

      // Prompt
      { id: 'compact', hint: 'compaction hook for this tab\'s agent', options: ['on', 'off'], run: (arg) => {
        if (!compactionAvailable) throw new Error('the compaction hook is off in settings');
        if (onOff(arg, compactionEnabled) !== compactionEnabled) onToggleCompaction();
      } },
      { id: 'keep', hint: 'keep attached files after sending', options: ['on', 'off'], run: (arg) => {
        setKeepFilesAfterSend(onOff(arg, keepFilesAfterSend));
      } },
      { id: 'insert', hint: 'type the context into the terminal (CLIs without the hook)', run: () => {
        if (!onInsertContext) throw new Error('no context to insert');
        return onInsertContext();
      } },
      { id: 'templates', hint: 'manage prompt templates', run: () => setManageTemplatesDialogOpen(true) },

      // Git
      { id: 'commit', hint: 'auto commit', run: () => onAutoCommit() },
      { id: 'merge', hint: 'merge this branch into a base branch', run: () => onAutoMerge() },

      // Files & panes
      { id: 'git', hint: 'show only git changes', run: () => onToggleGitFilter() },
      { id: 'md', hint: 'show only markdown files', run: () => onToggleMarkdownFilter() },
      { id: 'watch', hint: `file watching (${fileWatchingEnabled ? 'on' : 'off'})`, options: ['on', 'off'], run: (arg) => {
        if (onOff(arg, fileWatchingEnabled) !== fileWatchingEnabled) toggleWatchers();
      } },
      { id: 'files', hint: 'toggle the files pane', run: () => setSidebarOpen(prev => !prev) },
      { id: 'prompt', hint: 'toggle the prompt pane', run: () => setTextareaVisible(prev => !prev) },
      { id: 'jobs', hint: 'toggle the jobs pane', run: () => requestJobsPane('toggle') },
      { id: 'plans', hint: 'plans: split, implement, review, roll back', run: () => requestPlansPane('toggle') },
      { id: 'autopilot', aliases: ['ap'], hint: 'plans: run or stop auto-pilot on the open plan', run: () => requestAutopilotToggle() },
      { id: 'marks', aliases: ['bookmarks'], hint: 'bookmarked directories', run: () => setBookmarksPaletteOpen(true) },
      { id: 'workspace', hint: 'workspaces', run: () => setWorkspaceDialogOpen(true) },

      // Settings
      { id: 'theme', hint: 'switch theme', options: () => Object.keys(themes), run: (name) => {
        if (!name) return;
        if (!themes[name]) throw new Error(`no theme "${name}"`);
        changeTheme(name);
      } },
      { id: 'sandbox', hint: 'sandbox the terminal (restarts it)', options: ['on', 'off'], run: (arg) => {
        if (onOff(arg, sandboxEnabled) !== sandboxEnabled) toggleSandbox();
      } },
      { id: 'net', hint: 'isolate network in the sandbox', options: ['on', 'off'], run: (arg) => {
        if (!sandboxEnabled) throw new Error('sandbox is off');
        // "net on" means network allowed, i.e. isolation off.
        const wantIsolated = arg === 'off' ? true : arg === 'on' ? false : !networkIsolation;
        if (wantIsolated !== networkIsolation) toggleNetwork();
      } },
      { id: 'tokens', hint: 'token metrics', run: () => setDashboardOpen(true) },
      { id: 'budget', hint: 'token budget', run: () => setBudgetDialogOpen(true) },
      { id: 'changelog', hint: 'auto changelog settings', run: () => setAutoChangelogDialogOpen(true) },
      { id: 'titlebar', hint: 'show or hide the title bar', run: () => setShowTitleBar(prev => !prev) },
      { id: 'help', aliases: ['keys'], hint: 'keyboard shortcuts', run: () => setShowHelp(true) },
    ];
    if (setSettingsOpen) {
      commands.push({ id: 'settings', aliases: ['prefs'], hint: 'all settings', run: () => setSettingsOpen(true) });
    }
    return commands;
  }, [tabId, projectPath, addTab, requestCloseTab, onLaunchCli, onClearContext, onInsertContext, onOpenLazygit,
    secondaryVisible, closeSecondaryTerminal, setSecondaryVisible, openWithCommand,
    keepFilesAfterSend, setKeepFilesAfterSend, fileWatchingEnabled, toggleWatchers,
    onToggleCompaction, compactionEnabled, compactionAvailable, onAutoCommit, onAutoMerge, themes, changeTheme, sandboxEnabled, networkIsolation, setShowTitleBar,
    toggleSandbox, toggleNetwork, onToggleGitFilter, onToggleMarkdownFilter, setSidebarOpen, setTextareaVisible,
    setCliSelectionModalOpen, setDashboardOpen, setBudgetDialogOpen, setAutoChangelogDialogOpen,
    setManageTemplatesDialogOpen, setBookmarksPaletteOpen, setWorkspaceDialogOpen, setShowHelp, setSettingsOpen]);
}
