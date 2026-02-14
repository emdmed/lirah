import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { FileTree } from "./components/file-tree/file-tree";
import { SidebarHeader } from "./components/SidebarHeader";
import { FlatViewMenu } from "./components/FlatViewMenu";
import { AddBookmarkDialog } from "./components/AddBookmarkDialog";
import { BookmarksPalette } from "./components/BookmarksPalette";
import { InitialProjectDialog } from "./components/InitialProjectDialog";
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
import { CompactConfirmDialog } from "./components/CompactConfirmDialog";
import { ElementPickerDialog } from "./components/ElementPickerDialog";
import { SecondaryTerminal } from "./components/SecondaryTerminal";
import { TextareaPanel } from "./components/textarea-panel/textarea-panel";
import { SidebarFileSelection } from "./components/sidebar/SidebarFileSelection";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarProvider,
} from "@/components/ui/sidebar";

// Domain hooks
import { useSecondaryTerminal } from "./hooks/useSecondaryTerminal";
import { useDialogs } from "./hooks/useDialogs";
import { useTerminalSettings } from "./hooks/useTerminalSettings";
import { useCompact } from "./hooks/useCompact";
import { useElementPicker } from "./hooks/useElementPicker";
import { useAtMention } from "./hooks/useAtMention";
import { useFileSelection } from "./hooks/useFileSelection";
import { useSidebarSearch } from "./hooks/useSidebarSearch";
import { useTreeView } from "./hooks/useTreeView";
import { useSidebar } from "./hooks/useSidebar";

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
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [appendOrchestration, setAppendOrchestration] = useState(true);
  const [orchestrationTokenEstimate, setOrchestrationTokenEstimate] = useState(null);

  // Domain hooks
  const settings = useTerminalSettings();
  const dialogs = useDialogs();

  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);

  const {
    checkFileTypes, typeCheckResults, checkingFiles, successfulChecks, resetTypeChecker,
  } = useTypeChecker(currentPath, { setTextareaVisible, setTextareaContent });

  const sidebar = useSidebar({ resetTypeChecker });

  const {
    fileSymbols, extractFileSymbols, clearFileSymbols, clearAllSymbols,
    getSymbolCount, getLineCount, formatFileAnalysis, getViewModeLabel,
    setFileViewMode, isBabelParseable, VIEW_MODES,
  } = useFileSymbols();

  const fileSelection = useFileSelection({
    currentPath, clearFileSymbols, isBabelParseable, extractFileSymbols, clearAllSymbols,
  });

  const secondary = useSecondaryTerminal(terminalRef);

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

  const tokenUsage = useTokenUsage(currentPath, !!currentPath);

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
      if (viewMode === 'flat') loadFolders();
      else if (viewMode === 'tree') treeView.loadTreeData();
      terminalRef.current?.focus?.();
    } catch (error) {
      console.error('Failed to navigate to bookmark:', error);
    }
  }, [terminalSessionId, viewMode, loadFolders, treeView.loadTreeData, updateBookmark]);

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

  const { templateDropdownOpen, setTemplateDropdownOpen } = useTextareaShortcuts({
    textareaVisible, setTextareaVisible, textareaRef,
    onSendContent: sendTextareaToTerminal,
    onToggleOrchestration: setAppendOrchestration,
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

  // Clear folder expansion when sidebar closes
  useEffect(() => {
    if (!sidebar.sidebarOpen) {
      treeView.setExpandedFolders(new Set());
    }
  }, [sidebar.sidebarOpen]);

  // Monitor terminal CWD
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebar.sidebarOpen && fileWatchingEnabled);

  // Auto-check orchestration
  useEffect(() => {
    if (!detectedCwd) return;
    invoke('read_file_content', { path: `${detectedCwd}/.orchestration/orchestration.md` })
      .then(async (orchestrationContent) => {
        setAppendOrchestration(true);
        try {
          const entries = await invoke('read_directory_recursive', {
            path: `${detectedCwd}/.orchestration`, maxDepth: 5, maxFiles: 100
          });
          const mdFiles = entries.filter(e => e.name.endsWith('.md'));
          let totalChars = orchestrationContent.length;
          const contents = await Promise.all(
            mdFiles.filter(e => e.path !== `${detectedCwd}/.orchestration/orchestration.md`)
              .map(e => invoke('read_file_content', { path: e.path }).catch(() => ''))
          );
          totalChars += contents.reduce((sum, c) => sum + c.length, 0);
          const avgWorkflowChars = contents.length > 0
            ? contents.reduce((sum, c) => sum + c.length, 0) / contents.length : 0;
          setOrchestrationTokenEstimate(Math.round((orchestrationContent.length + avgWorkflowChars) / 4));
        } catch { setOrchestrationTokenEstimate(null); }
      })
      .catch(() => { setAppendOrchestration(false); setOrchestrationTokenEstimate(null); });
  }, [detectedCwd]);

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

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        e.stopPropagation();
        if (secondary.secondaryVisible) secondary.closeSecondaryTerminal();
        else secondary.setSecondaryVisible(true);
        return;
      }
      if (secondary.secondaryFocused) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && viewMode === 'tree' && sidebar.sidebarOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        compact.handleCompactProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [viewMode, sidebar.sidebarOpen, compact.handleCompactProject, secondary.secondaryVisible, secondary.secondaryFocused, secondary.closeSecondaryTerminal]);

  return (
    <SidebarProvider open={sidebar.sidebarOpen} onOpenChange={sidebar.setSidebarOpen} className={sidebar.isResizing ? 'select-none' : ''} style={{ height: '100%' }}>
      <Layout
        sidebar={
          sidebar.sidebarOpen && (
            <>
              <Sidebar collapsible="none" className="border-e border-e-sketch m-0 p-1 shrink-0 overflow-hidden" style={{ height: '100%', display: 'flex', flexDirection: 'column', width: sidebar.sidebarWidth }}>
                <SidebarContent style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <SidebarHeader
                    viewMode={viewMode}
                    currentPath={currentPath}
                    onNavigateParent={navigateToParent}
                    searchQuery={sidebarSearch.searchQuery}
                    onSearchChange={(query) => { sidebarSearch.handleSearchChange(query); atMention.setAtMentionQuery(null); }}
                    onSearchClear={sidebarSearch.handleSearchClear}
                    showSearch={viewMode === 'tree'}
                    searchInputRef={searchInputRef}
                    showGitChangesOnly={treeView.showGitChangesOnly}
                    onToggleGitFilter={treeView.handleToggleGitFilter}
                    fileWatchingEnabled={fileWatchingEnabled}
                    onAddBookmark={() => dialogs.setAddBookmarkDialogOpen(true)}
                    onNavigateBookmark={navigateToBookmark}
                    hasTerminalSession={!!terminalSessionId}
                    sandboxEnabled={settings.sandboxEnabled}
                  />
                  <SidebarGroup style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <SidebarGroupContent className="p-1" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                      {viewMode === 'flat' ? (
                        <FlatViewMenu folders={folders} currentPath={currentPath} onFolderClick={loadFolders} />
                      ) : (
                        treeView.treeLoading ? (
                          <div className="p-4 text-center">
                            <div className="text-sm opacity-60">Loading directory tree...</div>
                          </div>
                        ) : (
                          <FileTree
                            nodes={treeView.displayedTreeData}
                            searchQuery={sidebarSearch.searchQuery}
                            expandedFolders={treeView.expandedFolders}
                            currentPath={currentPath}
                            showGitChangesOnly={treeView.showGitChangesOnly}
                            onToggle={treeView.toggleFolder}
                            onSendToTerminal={sendFileToTerminal}
                            onViewDiff={viewFileDiff}
                            selectedFiles={fileSelection.selectedFiles}
                            onToggleFileSelection={fileSelection.toggleFileSelection}
                            isTextareaPanelOpen={textareaVisible}
                            typeCheckResults={typeCheckResults}
                            checkingFiles={checkingFiles}
                            successfulChecks={successfulChecks}
                            onCheckFileTypes={checkFileTypes}
                            fileWatchingEnabled={fileWatchingEnabled}
                            onGitChanges={handleGitChanges}
                            onOpenElementPicker={elementPicker.handleOpenElementPicker}
                          />
                        )
                      )}
                    </SidebarGroupContent>
                  </SidebarGroup>

                  {fileSelection.selectedFiles.size > 0 && (
                    <SidebarFileSelection
                      filesWithRelativePaths={fileSelection.filesWithRelativePaths}
                      fileStates={fileSelection.fileStates}
                      onSetFileState={fileSelection.setFileState}
                      onRemoveFile={fileSelection.removeFileFromSelection}
                      onClearAllFiles={fileSelection.clearFileSelection}
                      getSymbolCount={getSymbolCount}
                      getLineCount={getLineCount}
                      getViewModeLabel={getViewModeLabel}
                      setFileViewMode={setFileViewMode}
                      fileSymbols={fileSymbols}
                      VIEW_MODES={VIEW_MODES}
                    />
                  )}
                </SidebarContent>
              </Sidebar>
              <div
                className={`w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-50 shrink-0 ${sidebar.isResizing ? 'bg-primary/50' : ''}`}
                onMouseDown={sidebar.handleResizeStart}
              />
            </>
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
              onToggleOrchestration={setAppendOrchestration}
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
            onToggleHelp={() => dialogs.setShowHelp(prev => !prev)}
            onLaunchOrchestration={launchOrchestration}
            selectedCli={settings.selectedCli}
            onOpenCliSettings={() => dialogs.setCliSelectionModalOpen(true)}
            showTitleBar={settings.showTitleBar}
            onToggleTitleBar={() => settings.setShowTitleBar(prev => !prev)}
            sandboxEnabled={settings.sandboxEnabled}
            sandboxFailed={settings.sandboxFailed}
            networkIsolation={settings.networkIsolation}
            onToggleNetworkIsolation={() => {
              settings.setNetworkIsolation(prev => !prev);
              if (settings.sandboxEnabled && terminalSessionId) {
                invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
                setTerminalSessionId(null);
                settings.setSandboxFailed(false);
                setTerminalKey(k => k + 1);
              }
            }}
            secondaryTerminalFocused={secondary.secondaryFocused}
            onToggleSandbox={() => {
              settings.setSandboxEnabled(prev => !prev);
              settings.setSandboxFailed(false);
              if (terminalSessionId) {
                invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
              }
              setTerminalSessionId(null);
              setTerminalKey(k => k + 1);
            }}
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
            />
          )
        }
      >
        <Terminal
          key={terminalKey}
          ref={terminalRef}
          theme={theme.terminal}
          onSessionReady={(id) => setTerminalSessionId(id)}
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
      <InitialProjectDialog
        open={dialogs.initialProjectDialogOpen}
        onOpenChange={dialogs.setInitialProjectDialogOpen}
        onNavigate={navigateToBookmark}
        onLaunchClaude={launchClaude}
        onSwitchToClaudeMode={switchToClaudeMode}
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
      <CompactConfirmDialog
        open={compact.compactConfirmOpen}
        onOpenChange={compact.setCompactConfirmOpen}
        fileCount={compact.pendingCompactResult?.fileCount || 0}
        tokenEstimate={compact.pendingCompactResult?.tokenEstimate || 0}
        formattedTokens={compact.pendingCompactResult?.formattedTokens || '0'}
        originalTokens={compact.pendingCompactResult?.originalTokens || 0}
        formattedOriginalTokens={compact.pendingCompactResult?.formattedOriginalTokens || '0'}
        compressionPercent={compact.pendingCompactResult?.compressionPercent || 0}
        onConfirm={compact.handleConfirmCompact}
        onCancel={compact.handleCancelCompact}
      />
      <ElementPickerDialog
        open={elementPicker.elementPickerOpen}
        onOpenChange={elementPicker.setElementPickerOpen}
        filePath={elementPicker.elementPickerFilePath}
        currentPath={currentPath}
        onAddElements={elementPicker.handleAddElements}
      />
    </SidebarProvider>
  );
}

export default App;
