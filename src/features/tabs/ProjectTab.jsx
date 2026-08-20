import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Terminal } from "../../components/Terminal";
import { Layout } from "../../components/Layout";
import { StatusBar } from "../../components/StatusBar";
import { TitleBar } from "../../components/TitleBar";
import { LeftSidebar } from "../../components/LeftSidebar";
import { usePromptTemplates } from "../templates";
import { useTheme } from "../../contexts/ThemeContext";
import { useWatcher } from "../watcher";
import { useBookmarks } from "../bookmarks";
import { useTabManager } from "../tabs";
import { invoke } from "@tauri-apps/api/core";
import { useCwdMonitor } from "../../hooks/useCwdMonitor";
import { useBranchName, useAutoChangelog, useAutoCommit, useBranchTasks, GitDiffDialog, BranchCompletedTasksDialog } from "../git";
import { MarkdownViewerDialog } from "../markdown";
import { useFlatViewNavigation } from "../../hooks/useFlatViewNavigation";
import { useViewModeShortcuts } from "../../hooks/useViewModeShortcuts";
import { useTextareaShortcuts } from "../../hooks/useTextareaShortcuts";
import { useHelpShortcut } from "../../hooks/useHelpShortcut";
import { useBookmarksShortcut } from "../bookmarks";
import { useClaudeLauncher } from "../cli-selection";
import { useFileSymbols } from "../file-analysis";
import { useTokenUsage } from "../token-budget";
import { useTypeChecker } from "../../hooks/useTypeChecker";
import { usePromptSender } from "../../hooks/usePromptSender";
import { escapeShellPath, getRelativePath } from "../../utils/pathUtils";
import { useOrchestrationCheck } from "../../hooks/useOrchestrationCheck";
import { TokenBudgetProvider } from "../token-budget";
import { SecondaryTerminal } from "../../components/SecondaryTerminal";
import { TextareaPanel } from "../../components/textarea-panel/textarea-panel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DialogHost } from "../../components/DialogHost";
import { FileSelectionProvider } from "../file-groups";

// Domain hooks
import { useSecondaryTerminal } from "../../hooks/useSecondaryTerminal";
import { useDialogs } from "../../hooks/useDialogs";
import { useTerminalSettings } from "../../hooks/useTerminalSettings";
import { useCompact } from "../compact";
import { useElementPicker } from "../file-analysis";
import { useAtMention } from "../at-mention";
import { useFileSelection } from "../file-groups";
import { useSidebarSearch } from "../../hooks/useSidebarSearch";
import { useTreeView } from "../../hooks/useTreeView";
import { useSidebar } from "../../hooks/useSidebar";
import { useInstanceSync } from "../instance-sync/useInstanceSync";
import { useInstanceSyncShortcut } from "../instance-sync/useInstanceSyncShortcut";
import { usePatterns } from "../patterns";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useUpdateChecker } from "../../hooks/useUpdateChecker";
import { useToast } from "../toast";
import { useAgentJobs } from "../agent-jobs/agent-jobs";

// currentPath doubles as sidebar status text ('Waiting for terminal...',
// 'Error loading directory') before the terminal session exists. Terminals
// spawned with that text as projectDir fall back to the home dir, and the
// cwd monitor then persists home over the tab's restored path — so anything
// that treats currentPath as a filesystem path must go through this guard.
function isRealPath(p) {
  return !!p && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p));
}

export function ProjectTab({ projectPath, isActive, tabId }) {
  // Inactive tabs stay mounted so terminals don't lose state, but we can't
  // use display:none — xterm's renderer pauses against a zero-size box and
  // pixels go stale, so when the tab returns the canvas blits the old frame
  // over Claude Code's new paint. We also can't use display:contents — the
  // wrapper has no box, ResizeObserver readings drift, and layout sizing
  // depends on the grandparent. Instead: keep the tab in the flow with full
  // dimensions, but hide it behind aria-hidden + visibility:hidden + pointer
  // events disabled. The terminal stays sized; ResizeObserver fires once on
  // first activation when the tab actually has the user's current viewport.
  // All tabs share the same absolute box inside a position:relative parent.
  // Inactive tabs keep their layout (so xterm sees real dimensions and the
  // ResizeObserver fires a single time on the actual viewport when the tab
  // becomes active) but are hidden via visibility + pointer-events.
  //
  // The translate is what stops background tabs burning CPU. xterm pauses its
  // renderer through an IntersectionObserver on the screen element, but
  // visibility:hidden leaves the geometry untouched, so a hidden terminal keeps
  // intersecting and keeps painting — three tabs with agents running means three
  // renderers going flat out for one visible terminal. Moving the box out of the
  // viewport makes it genuinely non-intersecting, so xterm's own pause path
  // engages and resumes with a full refresh on return. Unlike display:none the
  // element keeps its size, so ResizeObserver readings and fit() stay correct.
  const style = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    transform: isActive ? 'none' : 'translateX(-200vw)',
    visibility: isActive ? 'visible' : 'hidden',
    pointerEvents: isActive ? 'auto' : 'none',
    zIndex: isActive ? 1 : 0,
  };
  return (
    <div style={style} aria-hidden={!isActive}>
      <FileSelectionProvider>
        <ProjectTabInner projectPath={projectPath} isActive={isActive} tabId={tabId} />
      </FileSelectionProvider>
    </div>
  );
}

function ProjectTabInner({ projectPath, isActive, tabId }) {
  const { theme } = useTheme();
  const { fileWatchingEnabled } = useWatcher();
  const { getTemplateById } = usePromptTemplates();
  const { bookmarks, updateBookmark } = useBookmarks();
  const { updateTabPath } = useTabManager();

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

  // Terminal ready state
  const [terminalReady, setTerminalReady] = useState(false);

  // Stable callback for terminal session ready (avoids inline arrow in JSX)
  const handleSessionReady = useCallback((id) => setTerminalSessionId(id), []);

  // Domain hooks
  const settings = useTerminalSettings();
  const dialogs = useDialogs();

  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);

  // Set currentPath from projectPath prop on mount
  useEffect(() => {
    if (projectPath) {
      setCurrentPath(projectPath);
    }
  }, [projectPath]);

  // Directory terminals spawn in: currentPath once it holds a real path,
  // otherwise the tab's persisted project path.
  const resolvedProjectDir = isRealPath(currentPath) ? currentPath : projectPath;

  const patterns = usePatterns(currentPath);

  // Refs for current values in async callbacks
  const foldersRef = useRef(folders);
  const currentPathRef = useRef(currentPath);
  const terminalReadyRef = useRef(terminalReady);
  // Guards the one-shot CLI auto-launch (see the effect further down).
  const autoLaunchedRef = useRef(false);
  const autoLaunchTimerRef = useRef(null);

  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => { terminalReadyRef.current = terminalReady; }, [terminalReady]);

  const typeChecker = useTypeChecker(currentPath, { setTextareaVisible, setTextareaContent });
  const sidebar = useSidebar({ resetTypeChecker: typeChecker.resetTypeChecker });

  const fileSymbolsHook = useFileSymbols();
  const { extractFileSymbols, clearFileSymbols, clearAllSymbols, isBabelParseable, formatFileAnalysis, getLineCount, getViewModeLabel } = fileSymbolsHook;

  const fileSelection = useFileSelection();

  // Bridge this tab's file-tree selection up to the global agent-jobs context
  // (only while active) so the Run Job dialog can use it as context.
  const { registerContextFiles } = useAgentJobs();
  useEffect(() => {
    if (!isActive) return;
    registerContextFiles(fileSelection.filesForGroup);
  }, [isActive, fileSelection.filesForGroup, registerContextFiles]);

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
  const instanceSync = useInstanceSync(currentPath, selectedFilesArray, terminalSessionId, isActive);

  // Calculate deduplicated instance count
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
          await new Promise(resolve => setTimeout(resolve, 300));
          return;
        }
      } catch { /* ignore errors */ }
    }
  }, [terminalSessionId]);

  // Workspace navigation
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

  const { tokenUsage, projectStats, refreshProjectStats } = useTokenUsage(currentPath, isActive && !!currentPath && !secondary.secondaryFullscreen);

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
        if (prev.trim()) return prev + '\n\n' + contextText;
        return contextText;
      });
      setTextareaVisible(true);
      dialogs.setInstanceSyncPanelOpen(false);
      setTimeout(() => { textareaRef.current?.focus?.(); }, 100);
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
      setTimeout(() => { textareaRef.current?.focus?.(); }, 100);
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

  // Handle project selection from initial dialog (with splash screen) — kept for bookmark navigation
  const handleSelectProject = useCallback(async (bookmark) => {
    // This path launches the CLI itself; claim the auto-launch so it can't fire too.
    autoLaunchedRef.current = true;
    await navigateToBookmark(bookmark);
    await new Promise(resolve => {
      const checkNavigation = setInterval(() => {
        if (foldersRef.current.length > 0 && currentPathRef.current) {
          clearInterval(checkNavigation);
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(checkNavigation); resolve(); }, 5000);
    });
    switchToClaudeMode();
    await new Promise(resolve => {
      const checkReady = setInterval(() => {
        if (terminalReadyRef.current) {
          clearInterval(checkReady);
          resolve();
        }
      }, 50);
      setTimeout(() => { clearInterval(checkReady); resolve(); }, 3000);
    });
    await launchClaude();
    await new Promise(resolve => {
      const cliName = settings.selectedCli === 'opencode' ? 'opencode' : 'claude';
      const checkCli = setInterval(async () => {
        try {
          const running = await invoke('check_pty_child_process', {
            sessionId: terminalSessionId,
            processName: cliName,
          });
          if (running) { clearInterval(checkCli); resolve(); }
        } catch { /* ignore */ }
      }, 300);
      setTimeout(() => { clearInterval(checkCli); resolve(); }, 15000);
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }, [navigateToBookmark, switchToClaudeMode, launchClaude, currentPath, settings]);

  // Git changes handler
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

  // Collect markdown file paths
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
    isActive,
  });

  // Starting the app used to drop you at a bare shell in nav mode: every session
  // began with a manual Ctrl+K. Do that first Ctrl+K for you — switch to context
  // mode and launch the selected CLI — once per tab, the first time the tab is
  // active with a live terminal. Restored background tabs wait until you
  // actually switch to them, so reopening four tabs doesn't spawn four agents.
  useEffect(() => {
    if (!settings.autoLaunchCli || autoLaunchedRef.current) return;
    if (!isActive || !terminalReady || !terminalSessionId) return;
    autoLaunchedRef.current = true;
    setViewMode('tree');
    sidebar.setSidebarOpen(true);
    treeView.loadTreeData();
    // Give the shell a moment to finish sourcing its rc before typing at it.
    autoLaunchTimerRef.current = setTimeout(() => {
      autoLaunchTimerRef.current = null;
      launchClaude();
    }, 400);
  }, [settings.autoLaunchCli, isActive, terminalReady, terminalSessionId, launchClaude, sidebar, treeView]);

  useEffect(() => () => clearTimeout(autoLaunchTimerRef.current), []);

  // Clear folder expansion when sidebar closes
  useEffect(() => {
    if (!sidebar.sidebarOpen) {
      treeView.setExpandedFolders(new Set());
    }
  }, [sidebar.sidebarOpen]);

  // Monitor terminal CWD
  const detectedCwd = useCwdMonitor(terminalSessionId, isActive && sidebar.sidebarOpen && fileWatchingEnabled && !secondary.secondaryFullscreen);

  // Update tab label when terminal CWD changes
  useEffect(() => {
    if (detectedCwd && tabId) {
      updateTabPath(tabId, detectedCwd);
    }
  }, [detectedCwd, tabId, updateTabPath]);

  // Get current git branch
  const branchName = useBranchName(secondary.secondaryFullscreen ? null : detectedCwd, isActive);

  // Show toast when a new release is available — but only once per version.
  // useUpdateChecker runs in every ProjectTab and polls every 4h, so without
  // this guard the toast re-fires on each tab, remount, and interval forever.
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

  // Auto-focus and re-fit terminal when this tab becomes active.
  // Double rAF: first frame lets the browser apply the display change and
  // recompute layout; second frame guarantees the box has real dimensions
  // before xterm measures and we force-flush a SIGWINCH. Without this, an
  // Ink-style TUI (e.g. Claude Code) repaints against the pre-switch size
  // and the visible canvas keeps stale pixels until the next full redraw.
  useEffect(() => {
    if (!isActive || !terminalReady) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        terminalRef.current?.resize?.();
        terminalRef.current?.focus?.();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isActive, terminalReady]);

  // Global keyboard shortcuts - use refs to avoid unstable dependencies
  const viewModeRef = useRef(viewMode);
  const sidebarOpenRef = useRef(sidebar.sidebarOpen);
  const autoCommitStageRef = useRef(autoCommit.stage);
  const workspaceRef = useRef(workspaceHook.workspace);

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { sidebarOpenRef.current = sidebar.sidebarOpen; }, [sidebar.sidebarOpen]);
  useEffect(() => { autoCommitStageRef.current = autoCommit.stage; }, [autoCommit.stage]);
  useEffect(() => { workspaceRef.current = workspaceHook.workspace; }, [workspaceHook.workspace]);

  useEffect(() => {
    // Only register per-tab shortcuts when this tab is active
    if (!isActive) return;

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
  }, [isActive, compact.handleCompactProject, secondary.secondaryVisible, secondary.secondaryFocused, secondary.closeSecondaryTerminal, secondary.openWithCommand, autoCommit.trigger, autoCommit.quickCommit, dialogs]);

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

  // Cleanup on unmount: stop watcher and close terminal
  // Use refs so this effect only runs on unmount (empty deps), not when values change
  const terminalSessionIdCleanupRef = useRef(terminalSessionId);
  const currentPathCleanupRef = useRef(currentPath);
  useEffect(() => { terminalSessionIdCleanupRef.current = terminalSessionId; }, [terminalSessionId]);
  useEffect(() => { currentPathCleanupRef.current = currentPath; }, [currentPath]);

  useEffect(() => {
    return () => {
      if (terminalSessionIdCleanupRef.current) {
        invoke('close_terminal', { sessionId: terminalSessionIdCleanupRef.current }).catch(() => {});
      }
      if (currentPathCleanupRef.current) {
        invoke('stop_fs_watcher', { path: currentPathCleanupRef.current }).catch(() => {});
      }
    };
  }, []);

  return (
    <TokenBudgetProvider tokenUsage={tokenUsage} projectStats={projectStats} projectPath={currentPath}>
    <SidebarProvider open={sidebar.sidebarOpen} onOpenChange={sidebar.setSidebarOpen} className={`min-h-0 flex-1 ${sidebar.isResizing ? 'select-none' : ''}`} style={{ height: '100%' }}>
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
            onOpenCliSettings={useCallback(() => dialogs.setCliSelectionModalOpen(true), [dialogs.setCliSelectionModalOpen])}
            showTitleBar={settings.showTitleBar}
            onToggleTitleBar={useCallback(() => settings.setShowTitleBar(prev => !prev), [settings.setShowTitleBar])}
            autoLaunchCli={settings.autoLaunchCli}
            onToggleAutoLaunchCli={useCallback(() => settings.setAutoLaunchCli(prev => !prev), [settings.setAutoLaunchCli])}
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
            onOpenDashboard={useCallback(() => dialogs.setDashboardOpen(true), [dialogs.setDashboardOpen])}
            onOpenBudgetSettings={useCallback(() => dialogs.setBudgetDialogOpen(true), [dialogs.setBudgetDialogOpen])}
            autoChangelogEnabled={settings.autoChangelogEnabled}
            changelogStatus={changelogStatus}
            onOpenAutoChangelogDialog={useCallback(() => dialogs.setAutoChangelogDialogOpen(true), [dialogs.setAutoChangelogDialogOpen])}
            autoCommitCli={settings.autoCommitCli}
            onOpenAutoCommitConfig={useCallback(() => dialogs.setAutoCommitConfigOpen(true), [dialogs.setAutoCommitConfigOpen])}
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
            onToggleInstanceSyncPanel={useCallback(() => dialogs.setInstanceSyncPanelOpen(prev => !prev), [dialogs.setInstanceSyncPanelOpen])}
            workspace={workspaceHook.workspace}
            onOpenWorkspaceDialog={useCallback(() => dialogs.setWorkspaceDialogOpen(true), [dialogs.setWorkspaceDialogOpen])}
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
              projectDir={secondary.projectDirOverride || resolvedProjectDir}
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
          isActive={isActive}
          onSessionReady={handleSessionReady}
          onReady={() => setTerminalReady(true)}
          onSearchFocus={handleSearchFocus}
          onToggleGitFilter={treeView.handleToggleGitFilter}
          sandboxEnabled={settings.sandboxEnabled}
          networkIsolation={settings.networkIsolation}
          projectDir={resolvedProjectDir}
          onSandboxFailed={() => settings.setSandboxFailed(true)}
        />
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
    </SidebarProvider>
    </TokenBudgetProvider>
  );
}
