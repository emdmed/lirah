import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { usePromptTemplates } from "./features/templates";
import { useTheme } from "./contexts/ThemeContext";
import { useWatcher } from "./features/watcher";
import { useBookmarks } from "./features/bookmarks";
import { invoke } from "@tauri-apps/api/core";
import { useCwdMonitor } from "./hooks/useCwdMonitor";
import { useBranchName, useAutoChangelog, useAutoCommit, useBranchTasks, GitDiffDialog, BranchCompletedTasksDialog } from "./features/git";
import { MarkdownViewerDialog } from "./features/markdown";
import { useFlatViewNavigation } from "./hooks/useFlatViewNavigation";
import { useViewModeShortcuts } from "./hooks/useViewModeShortcuts";
import { useTextareaShortcuts } from "./hooks/useTextareaShortcuts";
import { useHelpShortcut } from "./hooks/useHelpShortcut";
import { useBookmarksShortcut } from "./features/bookmarks";
import { useClaudeLauncher } from "./features/cli-selection";
import { useFileSymbols } from "./features/file-analysis";
import { useTokenUsage } from "./features/token-budget";
import { useTypeChecker } from "./hooks/useTypeChecker";
import { usePromptSender } from "./hooks/usePromptSender";
import { escapeShellPath, getRelativePath } from "./utils/pathUtils";
import { useOrchestrationCheck } from "./hooks/useOrchestrationCheck";
import { TokenBudgetProvider } from "./features/token-budget";
import { SecondaryTerminal } from "./components/SecondaryTerminal";
import { TextareaPanel } from "./components/textarea-panel/textarea-panel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DialogHost } from "./components/DialogHost";
import { SplashScreen } from "./features/splash";

// Domain hooks
import { useSecondaryTerminal } from "./hooks/useSecondaryTerminal";
import { useDialogs } from "./hooks/useDialogs";
import { useTerminalSettings } from "./hooks/useTerminalSettings";
import { useCompact } from "./features/compact";
import { useElementPicker } from "./features/file-analysis";
import { useAtMention } from "./features/at-mention";
import { useFileSelection } from "./features/file-groups";
import { useSidebarSearch } from "./hooks/useSidebarSearch";
import { useTreeView } from "./hooks/useTreeView";
import { useSidebar } from "./hooks/useSidebar";
import { useInstanceSync } from "./features/instance-sync/useInstanceSync";
import { useInstanceSyncShortcut } from "./features/instance-sync/useInstanceSyncShortcut";
import { usePatterns } from "./features/patterns";
import { useWorkspace } from "./hooks/useWorkspace";
import { useUpdateChecker } from "./hooks/useUpdateChecker";
import { useToast } from "./features/toast";

function App() {
  const { theme } = useTheme();
  const { fileWatchingEnabled } = useWatcher();
  const { getTemplateById } = usePromptTemplates();
  const { bookmarks, updateBookmark } = useBookmarks();

  // CLI initial path (e.g. `lirah /path/to/project`)
  const [initialProjectDir, setInitialProjectDir] = useState(undefined); // undefined = not yet checked

  // Core terminal state
  const [terminalSessionId, setTerminalSessionId] = useState(null);
  const [terminalKey, setTerminalKey] = useState(0);
  const terminalRef = useRef(null);
  const searchInputRef = useRef(null);

  // Textarea state
  const [textareaVisible, setTextareaVisible] = useState(true);
  const [textareaContent, setTextareaContent] = useState('');
  const textareaRef = useRef(null);
  const [viewMode, setViewMode] = useState('flat');

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Splash screen state
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashStep, setSplashStep] = useState('navigate');
  const [splashProjectName, setSplashProjectName] = useState('');
  const [terminalReady, setTerminalReady] = useState(false);

  // Domain hooks
  const settings = useTerminalSettings();
  const dialogs = useDialogs();

  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);

  // Fetch CLI initial path on mount
  useEffect(() => {
    invoke('get_initial_path').then((path) => {
      if (path) {
        setCurrentPath(path);
      }
      setInitialProjectDir(path || null);
    }).catch(() => {
      setInitialProjectDir(null);
    });
  }, []);

  const patterns = usePatterns(currentPath);

  // Refs for splash screen to access current values in async callbacks
  const foldersRef = useRef(folders);
  const currentPathRef = useRef(currentPath);
  const terminalReadyRef = useRef(terminalReady);

  // Keep refs in sync with state
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    terminalReadyRef.current = terminalReady;
  }, [terminalReady]);

  const typeChecker = useTypeChecker(currentPath, { setTextareaVisible, setTextareaContent });

  const sidebar = useSidebar({ resetTypeChecker: typeChecker.resetTypeChecker });

  const fileSymbolsHook = useFileSymbols();
  const { extractFileSymbols, clearFileSymbols, clearAllSymbols, isBabelParseable, formatFileAnalysis, getLineCount, getViewModeLabel } = fileSymbolsHook;

  const fileSelection = useFileSelection();

  // Register symbol callbacks and currentPath with file selection context
  useEffect(() => {
    fileSelection.registerSymbolCallbacks({ clearFileSymbols, isBabelParseable, extractFileSymbols, clearAllSymbols });
  }, [clearFileSymbols, isBabelParseable, extractFileSymbols, clearAllSymbols]);

  useEffect(() => {
    fileSelection.registerCurrentPath(currentPath);
  }, [currentPath]);

  const secondary = useSecondaryTerminal(terminalRef);

  const { changelogStatus, dismissChangelogStatus } = useAutoChangelog(
    currentPath,
    settings.autoChangelogEnabled,
    settings.autoChangelogTarget,
    settings.autoChangelogTrigger,
    settings.autoChangelogCli,
  );

  const autoCommit = useAutoCommit(settings.autoCommitCli, settings.autoCommitCustomPrompt);

  const branchTasks = useBranchTasks(settings.selectedCli);

  // Workspace state
  const workspaceHook = useWorkspace();

  // Instance sync
  const selectedFilesArray = useMemo(() => Array.from(fileSelection.selectedFiles), [fileSelection.selectedFiles]);
  const instanceSync = useInstanceSync(
    currentPath,
    selectedFilesArray,
    terminalSessionId
  );

  // Calculate deduplicated instance count (by project_path, keeping most recent)
  const deduplicatedOtherInstancesCount = useMemo(() => {
    const uniquePaths = new Set();
    let count = 0;
    for (const instance of instanceSync.otherInstances) {
      if (!uniquePaths.has(instance.project_path)) {
        uniquePaths.add(instance.project_path);
        count++;
      }
    }
    return count;
  }, [instanceSync.otherInstances]);

  const sidebarSearch = useSidebarSearch();

  const treeView = useTreeView({
    terminalSessionId,
    setCurrentPath,
    initializeSearch: sidebarSearch.initializeSearch,
    searchResults: sidebarSearch.searchResults,
  });

  // Terminate any running CLI process in the terminal before navigation
  const terminateCliProcess = useCallback(async () => {
    if (!terminalSessionId) return;
    const cliNames = ['claude', 'opencode'];
    for (const cliName of cliNames) {
      try {
        const killed = await invoke('kill_pty_child_process', {
          sessionId: terminalSessionId,
          processName: cliName,
        });
        if (killed) {
          // Wait for shell to reclaim the prompt after child is killed
          await new Promise(resolve => setTimeout(resolve, 300));
          return;
        }
      } catch { /* ignore errors */ }
    }
  }, [terminalSessionId]);

  // Workspace navigation (after treeView is declared)
  const navigateToWorkspace = useCallback(async (workspacePath) => {
    if (!terminalSessionId) return;
    try {
      await terminateCliProcess();
      const safePath = escapeShellPath(workspacePath);
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: `cd ${safePath}\r` });
      await new Promise(resolve => setTimeout(resolve, 100));
      await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
      if (viewMode === 'flat') await loadFolders();
      else if (viewMode === 'tree') await treeView.loadTreeData();
    } catch (error) {
      console.error('Failed to navigate to workspace:', error);
    }
  }, [terminalSessionId, viewMode, loadFolders, treeView?.loadTreeData, terminateCliProcess]);

  const handleCreateWorkspace = useCallback(async (name, projects) => {
    const info = await workspaceHook.createWorkspace(name, projects);
    if (info?.path) await navigateToWorkspace(info.path);
    return info;
  }, [workspaceHook.createWorkspace, navigateToWorkspace]);

  const handleOpenWorkspace = useCallback(async (workspacePath) => {
    const info = await workspaceHook.openWorkspace(workspacePath);
    if (info?.path) await navigateToWorkspace(info.path);
    return info;
  }, [workspaceHook.openWorkspace, navigateToWorkspace]);

  // Auto-expand search results when they change
  useEffect(() => {
    if (sidebarSearch.searchResults && sidebarSearch.searchResults.length > 0) {
      treeView.expandSearchResults(sidebarSearch.searchResults);
    }
  }, [sidebarSearch.searchResults]);

  const { tokenUsage, projectStats, refreshProjectStats } = useTokenUsage(currentPath, !!currentPath && !secondary.secondaryFullscreen);

  const compact = useCompact({
    currentPath,
    allFiles: treeView.allFiles,
    setTextareaVisible,
  });

  const elementPicker = useElementPicker();

  const atMention = useAtMention({
    viewMode,
    search: sidebarSearch.search,
    toggleFileSelection: fileSelection.toggleFileSelection,
    textareaContent,
    setTextareaContent,
    textareaRef,
  });

  // Claude launcher
  const { launchClaude, cliAvailability } = useClaudeLauncher(terminalSessionId, terminalRef, settings.selectedCli);

  const toast = useToast();
  const availableUpdate = useUpdateChecker();
  const orchestrationCheck = useOrchestrationCheck();

  const switchToClaudeMode = useCallback(() => {
    setViewMode('tree');
    sidebar.setSidebarOpen(true);
  }, [sidebar]);

  // Delete orchestration folder
  const handleDeleteOrchestration = useCallback(async () => {
    if (!currentPath) return;
    try {
      const orchDir = `${currentPath}/.orchestration`;
      const exists = await invoke('path_exists', { path: orchDir });
      if (!exists) return;

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: `rm -rf "${orchDir}"\r`
      });

      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error('Failed to delete orchestration:', error);
    }
  }, [currentPath, terminalSessionId]);

  // Navigate to bookmark
  const navigateToBookmark = useCallback(async (bookmark) => {
    if (!terminalSessionId) return;
    try {
      await terminateCliProcess();
      const safePath = escapeShellPath(bookmark.path);
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: `cd ${safePath}\r` });
      await new Promise(resolve => setTimeout(resolve, 100));
      await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
      updateBookmark(bookmark.id, { lastAccessedAt: Date.now() });
      if (viewMode === 'flat') await loadFolders();
      else if (viewMode === 'tree') await treeView.loadTreeData();
      terminalRef.current?.focus?.();
    } catch (error) {
      console.error('Failed to navigate to bookmark:', error);
    }
  }, [terminalSessionId, viewMode, loadFolders, treeView.loadTreeData, updateBookmark, terminateCliProcess]);

  // Handle loading context from another instance's session
  const handleLoadInstanceContext = useCallback(async (session) => {
    if (!session?.messages?.length) return;

    try {
      const contextLines = [];
      contextLines.push(`# Context from ${session.project_path}`);
      contextLines.push(`## Session: ${session.summary || 'Previous Work'}`);
      contextLines.push('');
      contextLines.push('### Recent conversation:');
      contextLines.push('');

      const recentMessages = session.messages.slice(-10);
      recentMessages.forEach((msg) => {
        const role = msg.role === 'user' ? '**User**' : '**Claude**';
        contextLines.push(`${role}: ${msg.content.substring(0, 300)}${msg.content.length > 300 ? '...' : ''}`);
        contextLines.push('');
      });

      contextLines.push('---');
      contextLines.push('Please continue based on the above context.');

      const contextText = contextLines.join('\n');

      setTextareaContent(prev => {
        if (prev.trim()) {
          return prev + '\n\n' + contextText;
        }
        return contextText;
      });

      setTextareaVisible(true);
      dialogs.setInstanceSyncPanelOpen(false);

      setTimeout(() => {
        textareaRef.current?.focus?.();
      }, 100);

    } catch (error) {
      console.error('Failed to load instance context:', error);
    }
  }, [setTextareaContent, setTextareaVisible, dialogs]);

  // Handle sending implementation prompt generation via hidden CLI
  const handleSendImplementationPrompt = useCallback(async ({ selectedMessages, promptType, action, prompt }) => {
    if (action === 'send-to-textarea' && prompt) {
      setTextareaContent(prev => {
        const separator = prev.trim() ? '\n\n' : '';
        return prev + separator + prompt;
      });
      setTextareaVisible(true);
      dialogs.setInstanceSyncPanelOpen(false);
      setTimeout(() => {
        textareaRef.current?.focus?.();
      }, 100);
      return;
    }

    if (!currentPath || !instanceSync.selectedSession) return;

    const allVisibleMessages = instanceSync.selectedSession.messages.filter(
      msg => !msg.content.startsWith('[Thinking]:')
    );

    const selectedMessageObjects = Array.from(selectedMessages)
      .sort((a, b) => a - b)
      .map(idx => allVisibleMessages[idx])
      .filter(Boolean)
      .map(msg => ({ role: msg.role, content: msg.content }));

    if (selectedMessageObjects.length === 0) return;

    try {
      const generatedPrompt = await invoke('generate_instance_sync_prompt', {
        projectDir: currentPath,
        cli: settings.selectedCli,
        promptType,
        messages: selectedMessageObjects,
      });

      return generatedPrompt;
    } catch (error) {
      console.error('Failed to generate implementation prompt:', error);
      throw error;
    }
  }, [currentPath, instanceSync.selectedSession, settings.selectedCli, setTextareaContent, setTextareaVisible, dialogs, textareaRef, instanceSync]);

  // Handle project selection from initial dialog (with splash screen)
  const handleSelectProject = useCallback(async (bookmark) => {
    setSplashProjectName(bookmark.name);
    setSplashStep('navigate');
    setSplashVisible(true);
    setTerminalReady(false);

    await navigateToBookmark(bookmark);

    await new Promise(resolve => {
      const checkNavigation = setInterval(() => {
        if (foldersRef.current.length > 0 && currentPathRef.current) {
          clearInterval(checkNavigation);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(checkNavigation);
        resolve();
      }, 5000);
    });

    setSplashStep('claude');
    switchToClaudeMode();

    await new Promise(resolve => {
      const checkReady = setInterval(() => {
        if (terminalReadyRef.current) {
          clearInterval(checkReady);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(checkReady);
        resolve();
      }, 3000);
    });

    await launchClaude();

    // Poll until the CLI process is detected (or timeout after 15s)
    await new Promise(resolve => {
      const cliName = settings.selectedCli === 'opencode' ? 'opencode' : 'claude';
      const checkCli = setInterval(async () => {
        try {
          const running = await invoke('check_pty_child_process', {
            sessionId: terminalSessionId,
            processName: cliName,
          });
          if (running) {
            clearInterval(checkCli);
            resolve();
          }
        } catch { /* ignore polling errors */ }
      }, 300);
      setTimeout(() => { clearInterval(checkCli); resolve(); }, 15000);
    });

    // Allow the CLI TUI to render after process detection
    await new Promise(resolve => setTimeout(resolve, 1500));

    setSplashStep('done');
  }, [navigateToBookmark, switchToClaudeMode, launchClaude, currentPath, settings]);

  // Git changes handler (needs currentPath for incremental updates)
  const handleGitChanges = useCallback((changes) => {
    if (changes.newUntracked.length > 0 && !changes.newDeleted.length && !changes.noLongerUntracked.length) {
      treeView.handleIncrementalUpdate(changes, currentPath);
    } else if (changes.hasChanges) {
      treeView.loadTreeData();
    }
  }, [treeView.handleIncrementalUpdate, treeView.loadTreeData, currentPath]);

  // View git diff
  const viewFileDiff = useCallback((filePath) => {
    dialogs.setDiffFilePath(filePath);
    dialogs.setDiffDialogOpen(true);
  }, [dialogs]);

  // View markdown file
  const viewMarkdownFile = useCallback((filePath) => {
    dialogs.setMarkdownFilePath(filePath);
    dialogs.setMarkdownViewerOpen(true);
  }, [dialogs]);

  // Collect markdown file paths from tree for navigation (only when viewer is open)
  const markdownFiles = useMemo(() => {
    if (!dialogs.markdownViewerOpen) return [];
    const paths = [];
    const collect = (nodes) => {
      for (const node of nodes) {
        if (node.is_dir && node.children) collect(node.children);
        else if (!node.is_dir && node.name.endsWith('.md')) paths.push(node.path);
      }
    };
    collect(treeView.treeData);
    return paths;
  }, [treeView.treeData, dialogs.markdownViewerOpen]);

  // Send file path to terminal
  const sendFileToTerminal = useCallback(async (absolutePath) => {
    if (!terminalSessionId) return;
    try {
      const relativePath = getRelativePath(absolutePath, currentPath);
      const escapedPath = escapeShellPath(relativePath);
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: `${escapedPath} ` });
      terminalRef.current?.focus?.();
    } catch (error) {
      console.error('Failed to send file to terminal:', absolutePath, error);
    }
  }, [terminalSessionId, currentPath]);

  // Handle textarea changes (detect @ mentions)
  const handleTextareaChange = useCallback((newValue) => {
    setTextareaContent(newValue);
    const mention = atMention.extractAtMention(newValue);
    atMention.setAtMentionQuery(mention);
  }, [atMention.extractAtMention, atMention.setAtMentionQuery]);

  // Search focus handler
  const handleSearchFocus = useCallback(() => {
    if (viewMode === 'tree' && sidebar.sidebarOpen) {
      searchInputRef.current?.focus();
    }
  }, [viewMode, sidebar.sidebarOpen]);

  // Prompt sender
  const sendTextareaToTerminal = usePromptSender({
    terminalSessionId, terminalRef, textareaContent,
    selectedFiles: fileSelection.selectedFiles,
    currentPath, fileStates: fileSelection.fileStates,
    keepFilesAfterSend: settings.keepFilesAfterSend,
    selectedTemplateId, getTemplateById,
    formatFileAnalysis, getLineCount, getViewModeLabel,
    selectedElements: elementPicker.selectedElements,
    compactedProject: compact.compactedProject,
    setTextareaContent,
    setCompactedProject: compact.setCompactedProject,
    clearFileSelection: fileSelection.clearFileSelection,
    clearSelectedElements: elementPicker.clearSelectedElements,
    selectedPatterns: patterns.selectedPatterns,
    getPatternInstructions: patterns.getPatternInstructions,
    clearPatterns: patterns.clearPatterns,
    clearSelectedTemplate: () => setSelectedTemplateId(null),
  });

  // Keyboard shortcut hooks
  useViewModeShortcuts({
    sidebarOpen: sidebar.sidebarOpen, setSidebarOpen: sidebar.setSidebarOpen,
    viewMode, setViewMode,
    onLoadFlatView: loadFolders, onLoadTreeView: treeView.loadTreeData,
    onLaunchClaude: launchClaude, terminalSessionId,
    secondaryTerminalFocused: secondary.secondaryFocused,
    onToggleMarkdownFilter: treeView.handleToggleMarkdownFilter,
  });

  // Clear folder expansion when sidebar closes
  useEffect(() => {
    if (!sidebar.sidebarOpen) {
      treeView.setExpandedFolders(new Set());
    }
  }, [sidebar.sidebarOpen]);

  // Monitor terminal CWD
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebar.sidebarOpen && fileWatchingEnabled && !secondary.secondaryFullscreen);

  // Get current git branch
  const branchName = useBranchName(secondary.secondaryFullscreen ? null : detectedCwd);

  // Show toast when a new release is available
  useEffect(() => {
    if (!availableUpdate) return;
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
  }, [availableUpdate]);

  // Keyboard shortcuts
  const { templateDropdownOpen, setTemplateDropdownOpen } = useTextareaShortcuts({
    textareaVisible, setTextareaVisible, textareaRef,
    onSendContent: sendTextareaToTerminal,

    selectedTemplateId, onSelectTemplate: setSelectedTemplateId,
    onRestoreLastPrompt: setTextareaContent,
    secondaryTerminalFocused: secondary.secondaryFocused,
  });

  useHelpShortcut({
    showHelp: dialogs.showHelp, setShowHelp: dialogs.setShowHelp,
    secondaryTerminalFocused: secondary.secondaryFocused,
  });

  useBookmarksShortcut({
    bookmarksPaletteOpen: dialogs.bookmarksPaletteOpen,
    setBookmarksPaletteOpen: dialogs.setBookmarksPaletteOpen,
    secondaryTerminalFocused: secondary.secondaryFocused,
  });

  useInstanceSyncShortcut({
    onTogglePanel: () => dialogs.setInstanceSyncPanelOpen(prev => !prev),
    secondaryTerminalFocused: secondary.secondaryFocused,
  });

  // Fetch data when sidebar opens
  useEffect(() => {
    if (sidebar.sidebarOpen) {
      if (viewMode === 'flat') loadFolders();
      else if (viewMode === 'tree') treeView.loadTreeData();
    }
  }, [sidebar.sidebarOpen, viewMode]);

  // Auto-refresh sidebar when terminal session becomes available
  useEffect(() => {
    if (terminalSessionId && sidebar.sidebarOpen && folders.length === 0) loadFolders();
  }, [terminalSessionId]);

  // Show initial project dialog (skip when opened via CLI with a path)
  useEffect(() => {
    if (initialProjectDir) return;
    if (terminalSessionId && (bookmarks.length > 0 || workspaceHook.workspaces.length > 0)) dialogs.setInitialProjectDialogOpen(true);
  }, [terminalSessionId]);

  // Global keyboard shortcuts - use refs to avoid unstable dependencies
  const viewModeRef = useRef(viewMode);
  const sidebarOpenRef = useRef(sidebar.sidebarOpen);
  const autoCommitStageRef = useRef(autoCommit.stage);
  const workspaceRef = useRef(workspaceHook.workspace);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    sidebarOpenRef.current = sidebar.sidebarOpen;
  }, [sidebar.sidebarOpen]);

  useEffect(() => {
    autoCommitStageRef.current = autoCommit.stage;
  }, [autoCommit.stage]);

  useEffect(() => {
    workspaceRef.current = workspaceHook.workspace;
  }, [workspaceHook.workspace]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        e.stopPropagation();
        if (secondary.secondaryVisible) secondary.closeSecondaryTerminal();
        else secondary.setSecondaryVisible(true);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'l') {
        e.preventDefault();
        e.stopPropagation();
        if (workspaceRef.current?.projects?.length) {
          dialogs.setProjectPickerAction('lazygit');
          dialogs.setProjectPickerOpen(true);
        } else {
          secondary.openWithCommand('lazygit');
        }
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'n') {
        e.preventDefault();
        e.stopPropagation();
        secondary.openWithCommand('nvim');
        return;
      }
      if (secondary.secondaryFocused) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && viewModeRef.current === 'tree' && sidebarOpenRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        compact.handleCompactProject();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        dialogs.setBudgetDialogOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        dialogs.setDashboardOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ' ') {
        e.preventDefault();
        if (autoCommitStageRef.current === 'idle') {
          if (workspaceRef.current?.projects?.length) {
            dialogs.setProjectPickerAction('autocommit');
            dialogs.setProjectPickerOpen(true);
          } else {
            autoCommit.trigger(currentPathRef.current);
          }
        } else {
          autoCommit.quickCommit();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        dialogs.setBranchTasksOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [compact.handleCompactProject, secondary.secondaryVisible, secondary.secondaryFocused, secondary.closeSecondaryTerminal, secondary.openWithCommand, autoCommit.trigger, autoCommit.quickCommit, dialogs]);

  const handleClearContext = useCallback(async () => {
    if (!terminalSessionId) return;
    const command = settings.selectedCli === 'opencode' ? '/new' : '/clear';
    try {
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: command });
      setTimeout(async () => {
        try {
          await invoke('write_to_terminal', { sessionId: terminalSessionId, data: '\r' });
        } catch (error) {
          console.error('Failed to send Enter for clear context:', error);
        }
      }, 100);
      terminalRef.current?.focus?.();
    } catch (error) {
      console.error('Failed to clear CLI context:', error);
    }
  }, [terminalSessionId, settings.selectedCli]);

  return (
    <TokenBudgetProvider tokenUsage={tokenUsage} projectStats={projectStats} projectPath={currentPath}>
    <SidebarProvider open={sidebar.sidebarOpen} onOpenChange={sidebar.setSidebarOpen} className={sidebar.isResizing ? 'select-none' : ''} style={{ height: '100%' }}>
      <Layout
        sidebar={
          sidebar.sidebarOpen && (
            <LeftSidebar
              sidebar={sidebar}
              search={sidebarSearch}
              searchInputRef={searchInputRef}
              onSearchChange={useCallback((query) => { sidebarSearch.handleSearchChange(query); atMention.setAtMentionQuery(null); }, [sidebarSearch.handleSearchChange, atMention.setAtMentionQuery])}
              treeView={treeView}
              typeChecker={typeChecker}
              fileSymbols={fileSymbolsHook}
              viewMode={viewMode}
              currentPath={currentPath}
              folders={folders}
              fileWatchingEnabled={fileWatchingEnabled && !secondary.secondaryFullscreen}
              isTextareaPanelOpen={textareaVisible}
              onNavigateParent={navigateToParent}
              onFolderClick={loadFolders}
              onAddBookmark={() => dialogs.setAddBookmarkDialogOpen(true)}
              onNavigateBookmark={navigateToBookmark}
              hasTerminalSession={!!terminalSessionId}
              sandboxEnabled={settings.sandboxEnabled}
              onSendToTerminal={sendFileToTerminal}
              onViewDiff={viewFileDiff}
              onViewMarkdown={viewMarkdownFile}
              onGitChanges={handleGitChanges}
              onOpenElementPicker={elementPicker.handleOpenElementPicker}
              keepFilesAfterSend={settings.keepFilesAfterSend}
              onToggleKeepFiles={settings.setKeepFilesAfterSend}
            />
          )
        }
        textarea={
          textareaVisible && (
            <TextareaPanel
              value={textareaContent}
              onChange={handleTextareaChange}
              onSend={sendTextareaToTerminal}
              onClose={() => setTextareaVisible(false)}
              textareaRef={textareaRef}
              disabled={!terminalSessionId}
              selectedFiles={fileSelection.selectedFiles}
              currentPath={currentPath}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              onManageTemplates={() => dialogs.setManageTemplatesDialogOpen(true)}

              templateDropdownOpen={templateDropdownOpen}
              onTemplateDropdownOpenChange={setTemplateDropdownOpen}
              tokenUsage={tokenUsage}
              projectPath={currentPath}
              onLoadGroup={fileSelection.handleLoadFileGroup}
              onSaveGroup={() => dialogs.setSaveFileGroupDialogOpen(true)}
              onCompactProject={compact.handleCompactProject}
              isCompacting={compact.isCompacting}
              compactProgress={compact.compactProgress}
              compactedProject={compact.compactedProject}
              onClearCompactedProject={() => compact.setCompactedProject(null)}
              onUpdateCompactedProject={compact.setCompactedProject}
              selectedElements={elementPicker.selectedElements}
              onClearElements={elementPicker.clearSelectedElements}
              atMentionActive={atMention.atMentionQuery !== null}
              atMentionQuery={atMention.atMentionQuery || ''}
              atMentionResults={atMention.atMentionDisplayedResults}
              atMentionSelectedIndex={atMention.atMentionSelectedIndex}
              onAtMentionNavigate={atMention.handleAtMentionNavigate}
              onAtMentionSelect={atMention.handleAtMentionSelect}
              onAtMentionClose={atMention.handleAtMentionClose}
              fileStates={fileSelection.fileStates}
              onSetFileState={fileSelection.setFileState}
              onToggleFile={fileSelection.toggleFileSelection}
              sessionId={terminalSessionId}
              onClearContext={handleClearContext}
              patternFiles={patterns.patternFiles}
              selectedPatterns={patterns.selectedPatterns}
              onTogglePattern={patterns.togglePattern}


            />
          )
        }
        titleBar={settings.showTitleBar && <TitleBar theme={theme.terminal} />}
        statusBar={
          <StatusBar
            viewMode={viewMode}
            currentPath={currentPath}
            sessionId={terminalSessionId}
            theme={theme.terminal}
            onToggleHelp={useCallback(() => dialogs.setShowHelp(prev => !prev), [dialogs.setShowHelp])}
            selectedCli={settings.selectedCli}
            onOpenCliSettings={() => dialogs.setCliSelectionModalOpen(true)}
            showTitleBar={settings.showTitleBar}
            onToggleTitleBar={() => settings.setShowTitleBar(prev => !prev)}
            sandboxEnabled={settings.sandboxEnabled}
            sandboxFailed={settings.sandboxFailed}
            networkIsolation={settings.networkIsolation}
            onToggleNetworkIsolation={useCallback(() => {
              settings.setNetworkIsolation(prev => !prev);
              if (settings.sandboxEnabled && terminalSessionId) {
                invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
                setTerminalSessionId(null);
                settings.setSandboxFailed(false);
                setTerminalKey(k => k + 1);
              }
            }, [settings.setNetworkIsolation, settings.sandboxEnabled, terminalSessionId, settings.setSandboxFailed])}
            secondaryTerminalFocused={secondary.secondaryFocused}
            onOpenDashboard={() => dialogs.setDashboardOpen(true)}
            onOpenBudgetSettings={() => dialogs.setBudgetDialogOpen(true)}
            autoChangelogEnabled={settings.autoChangelogEnabled}
            changelogStatus={changelogStatus}
            onOpenAutoChangelogDialog={() => dialogs.setAutoChangelogDialogOpen(true)}
            autoCommitCli={settings.autoCommitCli}
            onOpenAutoCommitConfig={() => dialogs.setAutoCommitConfigOpen(true)}
            onToggleSandbox={useCallback(() => {
              settings.setSandboxEnabled(prev => !prev);
              settings.setSandboxFailed(false);
              if (terminalSessionId) {
                invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
              }
              setTerminalSessionId(null);
              setTerminalKey(k => k + 1);
            }, [settings.setSandboxEnabled, settings.setSandboxFailed, terminalSessionId])}
            branchName={branchName}
            onToggleBranchTasks={useCallback(() => dialogs.setBranchTasksOpen(prev => !prev), [dialogs.setBranchTasksOpen])}
            branchTasksOpen={dialogs.branchTasksOpen}
            otherInstancesCount={deduplicatedOtherInstancesCount}
            onToggleInstanceSyncPanel={() => dialogs.setInstanceSyncPanelOpen(prev => !prev)}
            workspace={workspaceHook.workspace}
            onOpenWorkspaceDialog={() => dialogs.setWorkspaceDialogOpen(true)}
            onCloseWorkspace={workspaceHook.closeWorkspace}
            onClearContext={handleClearContext}
            availableUpdate={availableUpdate}
          />
        }
        secondaryTerminal={
          secondary.secondaryVisible && (
            <SecondaryTerminal
              key={secondary.secondaryKey}
              ref={secondary.secondaryTerminalRef}
              theme={theme.terminal}
              visible={secondary.secondaryVisible}
              onClose={secondary.closeSecondaryTerminal}
              onFocusChange={secondary.setSecondaryFocused}
              onSessionReady={secondary.setSecondarySessionId}
              projectDir={secondary.projectDirOverride || currentPath}
              fullscreen={secondary.secondaryFullscreen}
              onToggleFullscreen={() => secondary.setSecondaryFullscreen(f => !f)}
              onPickerVisibilityChange={secondary.handlePickerVisibilityChange}
              initialCommand={secondary.pendingCommand}
            />
          )
        }
      >
        {initialProjectDir !== undefined && (
          <Terminal
            key={terminalKey}
            ref={terminalRef}
            theme={theme.terminal}
            onSessionReady={(id) => setTerminalSessionId(id)}
            onReady={() => setTerminalReady(true)}
            onSearchFocus={handleSearchFocus}
            onToggleGitFilter={treeView.handleToggleGitFilter}
            sandboxEnabled={settings.sandboxEnabled}
            networkIsolation={settings.networkIsolation}
            projectDir={currentPath}
            onSandboxFailed={() => settings.setSandboxFailed(true)}
          />
        )}
        <GitDiffDialog
          open={dialogs.diffDialogOpen}
          onOpenChange={dialogs.setDiffDialogOpen}
          filePath={dialogs.diffFilePath}
          repoPath={currentPath}
        />
        <MarkdownViewerDialog
          open={dialogs.markdownViewerOpen}
          onOpenChange={dialogs.setMarkdownViewerOpen}
          filePath={dialogs.markdownFilePath}
          repoPath={currentPath}
          markdownFiles={markdownFiles}
          onFileChange={viewMarkdownFile}
        />
        <BranchCompletedTasksDialog
          open={dialogs.branchTasksOpen}
          onOpenChange={dialogs.setBranchTasksOpen}
          repoPath={currentPath}
          branchTasks={branchTasks}
          currentBranch={branchName}
        />
      </Layout>

      <DialogHost
        dialogs={dialogs}
        currentPath={currentPath}
        settings={settings}
        cliAvailability={cliAvailability}
        elementPicker={elementPicker}
        fileSelection={fileSelection}
        instanceSync={instanceSync}
        branchName={branchName}
        branchTasks={branchTasks}
        autoCommit={autoCommit}
        changelogStatus={changelogStatus}
        tokenUsage={tokenUsage}
        projectStats={projectStats}
        refreshProjectStats={refreshProjectStats}
        theme={theme}
        workspaceHook={workspaceHook}
        secondary={secondary}
        orchestrationCheck={orchestrationCheck}
        navigateToBookmark={navigateToBookmark}
        handleSelectProject={handleSelectProject}
        handleCreateWorkspace={handleCreateWorkspace}
        handleOpenWorkspace={handleOpenWorkspace}
        handleLoadInstanceContext={handleLoadInstanceContext}
        handleSendImplementationPrompt={handleSendImplementationPrompt}

      />

      <SplashScreen
        visible={splashVisible}
        projectName={splashProjectName}
        currentStep={splashStep}
        onComplete={() => setSplashVisible(false)}
      />
    </SidebarProvider>
    </TokenBudgetProvider>
  );
}

export default App;
