import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { AddBookmarkDialog } from "./components/AddBookmarkDialog";
import { BookmarksPalette } from "./components/BookmarksPalette";
import { InitialProjectDialog } from "./components/InitialProjectDialog";
import { SplashScreen } from "./components/SplashScreen";
import { ManageTemplatesDialog } from "./components/ManageTemplatesDialog";
import { GitDiffDialog } from "./components/GitDiffDialog";
import { SaveFileGroupDialog } from "./components/SaveFileGroupDialog";
import { CliSelectionModal } from "./components/CliSelectionModal";
import { KeyboardShortcutsDialog } from "./components/KeyboardShortcutsDialog";
import { usePromptTemplates } from "./contexts/PromptTemplatesContext";
import { useTheme } from "./contexts/ThemeContext";
import { useWatcher } from "./contexts/WatcherContext";
import { useBookmarks } from "./contexts/BookmarksContext";
import { invoke } from "@tauri-apps/api/core";
import { useCwdMonitor } from "./hooks/useCwdMonitor";
import { useBranchName } from "./hooks/useBranchName";
import { useFlatViewNavigation } from "./hooks/useFlatViewNavigation";
import { useViewModeShortcuts } from "./hooks/useViewModeShortcuts";
import { useTextareaShortcuts } from "./hooks/useTextareaShortcuts";
import { useHelpShortcut } from "./hooks/useHelpShortcut";
import { useBookmarksShortcut } from "./hooks/useBookmarksShortcut";
import { useClaudeLauncher } from "./hooks/useClaudeLauncher";
import { useFileSymbols } from "./hooks/file-analysis/useFileSymbols";
import { useTokenUsage } from "./hooks/useTokenUsage";
import { useTypeChecker } from "./hooks/useTypeChecker";
import { usePromptSender } from "./hooks/usePromptSender";
import { escapeShellPath, getRelativePath } from "./utils/pathUtils";
import { ElementPickerDialog } from "./components/ElementPickerDialog";
import { TokenBudgetDialog } from "./components/TokenBudgetDialog";
import { TokenAlertBanner } from "./components/TokenAlertBanner";
import { TokenDashboard } from "./components/TokenDashboard";
import { TokenBudgetProvider } from "./contexts/TokenBudgetContext";
import { ToastContainer } from "./components/ToastContainer";
import { SecondaryTerminal } from "./components/SecondaryTerminal";
import { TextareaPanel } from "./components/textarea-panel/textarea-panel";
import { SidebarProvider } from "@/components/ui/sidebar";

// Domain hooks
import { useSecondaryTerminal } from "./hooks/useSecondaryTerminal";
import { useDialogs } from "./hooks/useDialogs";
import { useTerminalSettings } from "./hooks/useTerminalSettings";
import { useCompact } from "./hooks/useCompact";
import { useElementPicker } from "./hooks/useElementPicker";
import { useAtMention } from "./hooks/useAtMention";
import { useFileSelection } from "./contexts/FileSelectionContext";
import { useSidebarSearch } from "./hooks/useSidebarSearch";
import { useTreeView } from "./hooks/useTreeView";
import { useSidebar } from "./hooks/useSidebar";
import { useAutoChangelog } from "./hooks/useAutoChangelog";
import { AutoChangelogDialog } from "./components/AutoChangelogDialog";
import { useAutoCommit } from "./hooks/useAutoCommit";
import { AutoCommitDialog } from "./components/AutoCommitDialog";
import { AutoCommitConfigDialog } from "./components/AutoCommitConfigDialog";

function App() {
  const { theme } = useTheme();
  const { fileWatchingEnabled } = useWatcher();
  const { getTemplateById } = usePromptTemplates();
  const { bookmarks, updateBookmark } = useBookmarks();

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

  // Template/orchestration state
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [autoChangelogDialogOpen, setAutoChangelogDialogOpen] = useState(false);
  const [autoCommitConfigOpen, setAutoCommitConfigOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [appendOrchestration, setAppendOrchestration] = useState(true);
  const [orchestrationTokenEstimate, setOrchestrationTokenEstimate] = useState(null);

  // Splash screen state
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashStep, setSplashStep] = useState('navigate');
  const [splashProjectName, setSplashProjectName] = useState('');
  const [terminalReady, setTerminalReady] = useState(false);

  // Domain hooks
  const settings = useTerminalSettings();
  const dialogs = useDialogs();

  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);
  
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

  const sidebarSearch = useSidebarSearch();

  const treeView = useTreeView({
    terminalSessionId,
    setCurrentPath,
    initializeSearch: sidebarSearch.initializeSearch,
    searchResults: sidebarSearch.searchResults,
  });

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

  const switchToClaudeMode = useCallback(() => {
    setViewMode('tree');
    sidebar.setSidebarOpen(true);
  }, [sidebar]);

  // Launch orchestration
  const launchOrchestration = useCallback(async () => {
    if (!terminalSessionId) return;
    try {
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: 'npx agentic-orchestration\r' });
      terminalRef.current?.focus?.();
    } catch (error) {
      console.error('Failed to launch orchestration:', error);
    }
  }, [terminalSessionId]);

  // Navigate to bookmark
  const navigateToBookmark = useCallback(async (bookmark) => {
    if (!terminalSessionId) return;
    try {
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
  }, [terminalSessionId, viewMode, loadFolders, treeView.loadTreeData, updateBookmark]);

  // Handle project selection from initial dialog (with splash screen)
  const handleSelectProject = useCallback(async (bookmark) => {
    setSplashProjectName(bookmark.name);
    setSplashStep('navigate');
    setSplashVisible(true);
    setTerminalReady(false);

    // Step 1: Navigate and wait for filetree to fully load
    await navigateToBookmark(bookmark);
    
    // Wait for navigation to actually complete (folders loaded)
    // Use a polling approach with refs to access current values
    await new Promise(resolve => {
      const checkNavigation = setInterval(() => {
        if (foldersRef.current.length > 0 && currentPathRef.current) {
          clearInterval(checkNavigation);
          resolve();
        }
      }, 50);
      // Timeout after 5 seconds to prevent infinite wait
      setTimeout(() => {
        clearInterval(checkNavigation);
        resolve();
      }, 5000);
    });

    // Step 2: Start Claude (wait for terminal to be ready first)
    setSplashStep('claude');
    switchToClaudeMode();
    
    // Wait for terminal to be ready before launching Claude
    await new Promise(resolve => {
      const checkReady = setInterval(() => {
        if (terminalReadyRef.current) {
          clearInterval(checkReady);
          resolve();
        }
      }, 50);
      // Timeout after 3 seconds
      setTimeout(() => {
        clearInterval(checkReady);
        resolve();
      }, 3000);
    });
    
    launchClaude();

    setSplashStep('done');
  }, [navigateToBookmark, switchToClaudeMode, launchClaude]);

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
    selectedTemplateId, getTemplateById, appendOrchestration,
    formatFileAnalysis, getLineCount, getViewModeLabel,
    selectedElements: elementPicker.selectedElements,
    compactedProject: compact.compactedProject,
    setTextareaContent,
    setCompactedProject: compact.setCompactedProject,
    clearFileSelection: fileSelection.clearFileSelection,
    clearSelectedElements: elementPicker.clearSelectedElements,
  });

  // Keyboard shortcut hooks
  useViewModeShortcuts({
    sidebarOpen: sidebar.sidebarOpen, setSidebarOpen: sidebar.setSidebarOpen,
    viewMode, setViewMode,
    onLoadFlatView: loadFolders, onLoadTreeView: treeView.loadTreeData,
    onLaunchClaude: launchClaude, terminalSessionId,
    secondaryTerminalFocused: secondary.secondaryFocused,
  });

  // Clear folder expansion when sidebar closes
  useEffect(() => {
    if (!sidebar.sidebarOpen) {
      treeView.setExpandedFolders(new Set());
    }
  }, [sidebar.sidebarOpen]);

  // Monitor terminal CWD
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebar.sidebarOpen && fileWatchingEnabled && !secondary.secondaryFullscreen);

  // Calculate orchestration token estimate when enabled
  const calculateOrchestrationEstimate = useCallback(async (cwd) => {
    if (!cwd) return;
    try {
      // Read the orchestration.md file and estimate tokens from its content
      // When orchestration is enabled, Claude will read this file, consuming those tokens
      const orchestrationContent = await invoke('read_file_content', { path: `${cwd}/.orchestration/orchestration.md` });
      const commandText = 'Follow .orchestration/orchestration.md (read it only if not already read in this conversation)';
      // Total tokens = command text (~20) + file content that will be read
      const commandTokens = Math.round(commandText.length / 4);
      const contentTokens = Math.round(orchestrationContent.length / 4);
      setOrchestrationTokenEstimate(commandTokens + contentTokens);
    } catch {
      setOrchestrationTokenEstimate(null);
    }
  }, []);

  // Handle orchestration toggle
  const handleToggleOrchestration = useCallback((value) => {
    const nextValue = typeof value === 'function' ? value(appendOrchestration) : value;
    setAppendOrchestration(nextValue);
    if (nextValue && detectedCwd) {
      calculateOrchestrationEstimate(detectedCwd);
    } else if (!nextValue) {
      setOrchestrationTokenEstimate(null);
    }
  }, [detectedCwd, calculateOrchestrationEstimate, appendOrchestration]);

  // Get current git branch
  const branchName = useBranchName(secondary.secondaryFullscreen ? null : detectedCwd);

  // Auto-check orchestration
  useEffect(() => {
    if (!detectedCwd) return;
    invoke('read_file_content', { path: `${detectedCwd}/.orchestration/orchestration.md` })
      .then(() => {
        setAppendOrchestration(true);
        calculateOrchestrationEstimate(detectedCwd);
      })
      .catch(() => { setAppendOrchestration(false); setOrchestrationTokenEstimate(null); });
  }, [detectedCwd, calculateOrchestrationEstimate]);

  // Keyboard shortcuts (must come after orchestration functions)
  const { templateDropdownOpen, setTemplateDropdownOpen } = useTextareaShortcuts({
    textareaVisible, setTextareaVisible, textareaRef,
    onSendContent: sendTextareaToTerminal,
    onToggleOrchestration: handleToggleOrchestration,
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

  // Show initial project dialog
  useEffect(() => {
    if (terminalSessionId && bookmarks.length > 0) dialogs.setInitialProjectDialogOpen(true);
  }, [terminalSessionId]);

  // Reload sidebar when CWD changes
  useEffect(() => {
    if (detectedCwd && sidebar.sidebarOpen) {
      if (viewMode === 'flat') loadFolders();
      else if (viewMode === 'tree') {
        treeView.loadTreeData();
        sidebarSearch.setSearchQuery('');
        sidebarSearch.setSearchResults(null);
      }
    }
  }, [detectedCwd, viewMode]);

  // Global keyboard shortcuts - use refs to avoid unstable dependencies
  const viewModeRef = useRef(viewMode);
  const sidebarOpenRef = useRef(sidebar.sidebarOpen);
  const autoCommitStageRef = useRef(autoCommit.stage);
  
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
        secondary.openWithCommand('lazygit');
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
        setBudgetDialogOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDashboardOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ' ') {
        e.preventDefault();
        if (autoCommitStageRef.current === 'idle') {
          autoCommit.trigger(currentPathRef.current);
        } else {
          autoCommit.quickCommit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [compact.handleCompactProject, secondary.secondaryVisible, secondary.secondaryFocused, secondary.closeSecondaryTerminal, secondary.openWithCommand, autoCommit.trigger, autoCommit.quickCommit]);

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
              onGitChanges={handleGitChanges}
              onOpenElementPicker={elementPicker.handleOpenElementPicker}
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
              keepFilesAfterSend={settings.keepFilesAfterSend}
              onToggleKeepFiles={settings.setKeepFilesAfterSend}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              onManageTemplates={() => dialogs.setManageTemplatesDialogOpen(true)}
              appendOrchestration={appendOrchestration}
              onToggleOrchestration={handleToggleOrchestration}
              orchestrationTokenEstimate={orchestrationTokenEstimate}
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
            onLaunchOrchestration={launchOrchestration}
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
            onOpenDashboard={() => setDashboardOpen(true)}
            onOpenBudgetSettings={() => setBudgetDialogOpen(true)}
            autoChangelogEnabled={settings.autoChangelogEnabled}
            changelogStatus={changelogStatus}
            onOpenAutoChangelogDialog={() => setAutoChangelogDialogOpen(true)}
            autoCommitCli={settings.autoCommitCli}
            onOpenAutoCommitConfig={() => setAutoCommitConfigOpen(true)}
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
              projectDir={currentPath}
              fullscreen={secondary.secondaryFullscreen}
              onToggleFullscreen={() => secondary.setSecondaryFullscreen(f => !f)}
              onPickerVisibilityChange={secondary.handlePickerVisibilityChange}
              initialCommand={secondary.pendingCommand}
            />
          )
        }
      >
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
        <GitDiffDialog
          open={dialogs.diffDialogOpen}
          onOpenChange={dialogs.setDiffDialogOpen}
          filePath={dialogs.diffFilePath}
          repoPath={currentPath}
        />
      </Layout>
      <AddBookmarkDialog
        open={dialogs.addBookmarkDialogOpen}
        onOpenChange={dialogs.setAddBookmarkDialogOpen}
        currentPath={currentPath}
      />
      <BookmarksPalette
        open={dialogs.bookmarksPaletteOpen}
        onOpenChange={dialogs.setBookmarksPaletteOpen}
        onNavigate={navigateToBookmark}
      />
      <ManageTemplatesDialog
        open={dialogs.manageTemplatesDialogOpen}
        onOpenChange={dialogs.setManageTemplatesDialogOpen}
      />
      <SaveFileGroupDialog
        open={dialogs.saveFileGroupDialogOpen}
        onOpenChange={dialogs.setSaveFileGroupDialogOpen}
        projectPath={currentPath}
        files={fileSelection.filesForGroup}
      />
      {dialogs.initialProjectDialogOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-background, #0a0a0a)' }}
        >
          <div style={{ fontFamily: "'Grenze Gotisch', serif", fontSize: '42px', lineHeight: 1 }}>
            Lirah
          </div>
        </div>
      )}
      <InitialProjectDialog
        open={dialogs.initialProjectDialogOpen}
        onOpenChange={dialogs.setInitialProjectDialogOpen}
        onSelectProject={handleSelectProject}
      />
      <CliSelectionModal
        open={dialogs.cliSelectionModalOpen}
        onOpenChange={dialogs.setCliSelectionModalOpen}
        selectedCli={settings.selectedCli}
        onCliChange={settings.setSelectedCli}
        cliAvailability={cliAvailability}
      />
      <KeyboardShortcutsDialog
        open={dialogs.showHelp}
        onOpenChange={dialogs.setShowHelp}
      />
      <ElementPickerDialog
        open={elementPicker.elementPickerOpen}
        onOpenChange={elementPicker.setElementPickerOpen}
        filePath={elementPicker.elementPickerFilePath}
        currentPath={currentPath}
        onAddElements={elementPicker.handleAddElements}
      />
      <TokenAlertBanner
        projectPath={currentPath}
        onOpenBudgetSettings={() => setBudgetDialogOpen(true)}
      />
      <TokenBudgetDialog
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
        projectPath={currentPath}
      />
      <AutoChangelogDialog
        open={autoChangelogDialogOpen}
        onOpenChange={setAutoChangelogDialogOpen}
        enabled={settings.autoChangelogEnabled}
        trigger={settings.autoChangelogTrigger}
        targetFile={settings.autoChangelogTarget}
        cli={settings.autoChangelogCli}
        onSave={({ enabled, trigger, targetFile, cli }) => {
          settings.setAutoChangelogEnabled(enabled);
          settings.setAutoChangelogTrigger(trigger);
          settings.setAutoChangelogTarget(targetFile);
          settings.setAutoChangelogCli(cli);
        }}
      />
      <TokenDashboard
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
        tokenUsage={tokenUsage}
        projectStats={projectStats}
        refreshStats={refreshProjectStats}
        projectPath={currentPath}
        theme={theme}
      />
      <AutoCommitDialog autoCommit={autoCommit} />
      <AutoCommitConfigDialog
        open={autoCommitConfigOpen}
        onOpenChange={setAutoCommitConfigOpen}
        cli={settings.autoCommitCli}
        customPrompt={settings.autoCommitCustomPrompt}
        onSave={({ cli, customPrompt }) => {
          settings.setAutoCommitCli(cli);
          settings.setAutoCommitCustomPrompt(customPrompt);
        }}
      />
      <SplashScreen
        visible={splashVisible}
        projectName={splashProjectName}
        currentStep={splashStep}
        onComplete={() => setSplashVisible(false)}
      />
      <ToastContainer />
    </SidebarProvider>
    </TokenBudgetProvider>
  );
}

export default App;
