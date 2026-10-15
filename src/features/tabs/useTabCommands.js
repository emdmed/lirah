import { useMemo } from 'react';
import { requestJobsPane } from '../agent-jobs/jobsPane';

/**
 * The `:` command palette's commands. Each maps to an action that already
 * exists elsewhere (a shortcut, a status-bar control or a menu item), so the
 * palette adds reach, not behaviour.
 */
export function useTabCommands({
  dialogs,
  settings,
  themes,
  changeTheme,
  onCompactProject,
  onAutoCommit,
  toggleSandbox,
  toggleNetwork,
  onToggleGitFilter,
  onToggleMarkdownFilter,
  setSidebarOpen,
  setTextareaVisible,
}) {
  const { setCliSelectionModalOpen, setDashboardOpen, setBudgetDialogOpen, setAutoChangelogDialogOpen,
    setManageTemplatesDialogOpen, setBookmarksPaletteOpen, setWorkspaceDialogOpen, setShowHelp } = dialogs;
  const { sandboxEnabled, networkIsolation, setShowTitleBar } = settings;

  return useMemo(() => {
    const onOff = (arg, current) => (arg === 'on' ? true : arg === 'off' ? false : !current);
    return [
      { id: 'compact', hint: 'compact the project for the prompt', run: () => onCompactProject() },
      { id: 'commit', hint: 'auto commit (^⇧space)', run: () => onAutoCommit() },
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
      { id: 'git', hint: 'show only git changes (^G)', run: () => onToggleGitFilter() },
      { id: 'md', hint: 'show only markdown files (^M)', run: () => onToggleMarkdownFilter() },
      { id: 'files', hint: 'toggle the files pane', run: () => setSidebarOpen(prev => !prev) },
      { id: 'prompt', hint: 'toggle the prompt pane', run: () => setTextareaVisible(prev => !prev) },
      { id: 'jobs', hint: 'toggle the jobs pane', run: () => requestJobsPane('toggle') },
      { id: 'cli', hint: 'choose the CLI tool (^K)', run: () => setCliSelectionModalOpen(true) },
      { id: 'tokens', hint: 'token metrics (^⇧D)', run: () => setDashboardOpen(true) },
      { id: 'budget', hint: 'token budget', run: () => setBudgetDialogOpen(true) },
      { id: 'changelog', hint: 'auto changelog settings', run: () => setAutoChangelogDialogOpen(true) },
      { id: 'templates', hint: 'manage prompt templates', run: () => setManageTemplatesDialogOpen(true) },
      { id: 'marks', aliases: ['bookmarks'], hint: 'bookmarked directories', run: () => setBookmarksPaletteOpen(true) },
      { id: 'workspace', hint: 'workspaces', run: () => setWorkspaceDialogOpen(true) },
      { id: 'titlebar', hint: 'show or hide the title bar', run: () => setShowTitleBar(prev => !prev) },
      { id: 'help', aliases: ['keys'], hint: 'keyboard shortcuts (^H)', run: () => setShowHelp(true) },
    ];
  }, [onCompactProject, onAutoCommit, themes, changeTheme, sandboxEnabled, networkIsolation, setShowTitleBar,
    toggleSandbox, toggleNetwork, onToggleGitFilter, onToggleMarkdownFilter, setSidebarOpen, setTextareaVisible,
    setCliSelectionModalOpen, setDashboardOpen, setBudgetDialogOpen, setAutoChangelogDialogOpen,
    setManageTemplatesDialogOpen, setBookmarksPaletteOpen, setWorkspaceDialogOpen, setShowHelp]);
}
