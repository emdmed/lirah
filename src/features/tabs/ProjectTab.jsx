import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { Terminal } from "../../components/Terminal";
import { LaunchAgentPrompt } from "../../components/LaunchAgentPrompt";
import { TAB_CLI_PROCESSES, tabCliProcess } from "../../lib/agentClis";
import { useToast } from "../toast/ToastContext";
import { consumeFirstRun } from "./firstRun";
import { Layout } from "../../components/Layout";
import { StatusBar } from "../../components/StatusBar";
import { TabBarStatusSlot } from "./TabBar";
import { TitleBar } from "../../components/TitleBar";
import { LeftSidebar } from "../../components/LeftSidebar";
import { usePromptTemplates } from "../templates";
import { useTheme } from "../../contexts/ThemeContext";
import { useWatcher } from "../watcher";
import { useBookmarks } from "../bookmarks";
import { useTabActions } from "./TabContext";
import { invoke } from "@tauri-apps/api/core";
import { useBranchName } from "../git/useBranchName";
import { registerTabSession, getTabSession } from "./terminalActivity";
import { useTabContextFill } from "./tabContextFill";
import { registerTabPrompt } from "./tabPrompts";
import { useLinkedRepos } from "./useLinkedRepos";
import { useAutoChangelog } from "../git/useAutoChangelog";
import { useAutoCommit } from "../git/useAutoCommit";
import { useAutoMerge } from "../git/useAutoMerge";
import { useFlatViewNavigation } from "../../hooks/useFlatViewNavigation";
import { useViewModeShortcuts } from "../../hooks/useViewModeShortcuts";
import { useTextareaShortcuts } from "../../hooks/useTextareaShortcuts";
import { useHelpShortcut } from "../../hooks/useHelpShortcut";
import { useBookmarksShortcut } from "../bookmarks";
import { useClaudeLauncher } from "../cli-selection";
import { useFileSymbols } from "../file-analysis/useFileSymbols";
import { useTokenUsage } from "../token-budget/useTokenUsage";
import { useTokenUsageValue } from "../token-budget/tokenUsageStore";
import { useTypeChecker } from "../../hooks/useTypeChecker";
import { usePromptSender } from "../../hooks/usePromptSender";
import { usePromptStore } from "../../hooks/usePromptStore";
import { buildPrompt } from "../../hooks/buildPrompt";
import { escapeShellPath, getRelativePath } from "../../utils/pathUtils";
import { useOrchestrationCheck } from "../../hooks/useOrchestrationCheck";
import { TokenBudgetProvider } from "../token-budget/TokenBudgetContext";
import { SecondaryTerminal } from "../../components/SecondaryTerminal";
import { TextareaPanel } from "../../components/textarea-panel/textarea-panel";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DialogHost } from "../../components/DialogHost";
import { FileSelectionProvider } from "../file-groups";

// Domain hooks
import { useSecondaryTerminal } from "../../hooks/useSecondaryTerminal";
import { setFocusMode } from "../../lib/focusMode";
import { useDialogs } from "../../hooks/useDialogs";
import { DialogScope } from "../dialogs/DialogProvider";
import { useTerminalSettings } from "../../hooks/useTerminalSettings";
import { useCompact } from "../compact/useCompact";
import { useElementPicker } from "../file-analysis/useElementPicker";
import { useAtMention } from "../at-mention";
import { useFileSelection } from "../file-groups";
import { useSidebarSearch } from "../../hooks/useSidebarSearch";
import { useTreeView } from "../../hooks/useTreeView";
import { useSidebar } from "../../hooks/useSidebar";
import { useSeededSetting } from "../settings/settingsStore";
import { usePatterns } from "../patterns";
import { useWorkspace } from "../../hooks/useWorkspace";
import { CommandPalette, useCommandPalette } from "../command-palette/command-palette";
import { useTabShortcuts } from "./useTabShortcuts";
import { useTabCommands } from "./useTabCommands";
import { useAgentJobsActions } from "../agent-jobs/AgentJobsContext";

// currentPath doubles as sidebar status text ('Waiting for terminal...',
// 'Error loading directory') before the terminal session exists. Terminals
// spawned with that text as projectDir fall back to the home dir, and the
// cwd monitor then persists home over the tab's restored path — so anything
// that treats currentPath as a filesystem path must go through this guard.
// Loaded on first open, mounted only while open.

function isRealPath(p) {
  return !!p && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p));
}

// A callback whose identity never changes but always runs the latest `fn`.
// For handlers built from sources that aren't memoized (useFlatViewNavigation,
// the bookmarks context), so the memoized sidebar can keep its props stable.
function useStableHandler(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

// Feeds the tabs pane's context-fill moon from the usage store. Its own
// component, so a usage poll re-renders this and not the tab.
function TabContextFillSync({ tabId, isActive, tokenUsageStore, terminalSessionId }) {
  const tokenUsage = useTokenUsageValue(tokenUsageStore);
  useTabContextFill(tabId, isActive, tokenUsage, terminalSessionId);
  return null;
}

// Memoized: App re-renders on every tab switch and tab-path update, which
// must not re-render the tabs whose props didn't change.
export const ProjectTab = memo(function ProjectTab({ projectPath, isActive, tabId, availableUpdate }) {
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

  // Restored tabs boot on first activation, not at startup: each one spawns a
  // PTY, a WebGL context and its pollers, so N persisted tabs used to cost N
  // of everything before the user looked at any but one. Once booted a tab
  // stays mounted, as before.
  const [booted, setBooted] = useState(isActive);
  if (isActive && !booted) setBooted(true);

  return (
    <div style={style} aria-hidden={!isActive} data-tab-pane data-tab-active={isActive || undefined}>
      {booted && (
        <DialogScope scope={tabId} active={isActive}>
          <FileSelectionProvider>
            <ProjectTabInner projectPath={projectPath} isActive={isActive} tabId={tabId} availableUpdate={availableUpdate} />
          </FileSelectionProvider>
        </DialogScope>
      )}
    </div>
  );
});

function ProjectTabInner({ projectPath, isActive, tabId, availableUpdate }) {
  const { theme, themes, changeTheme } = useTheme();
  const { fileWatchingEnabled } = useWatcher();
  const { getTemplateById } = usePromptTemplates();
  const { bookmarks, updateBookmark } = useBookmarks();
  const { updateTabPath } = useTabActions();

  // Core terminal state
  const [terminalSessionId, setTerminalSessionId] = useState(null);
  const [terminalKey, setTerminalKey] = useState(0);
  const terminalRef = useRef(null);
  const searchInputRef = useRef(null);

  // Textarea state
  const [textareaVisible, setTextareaVisible] = useState(true);
  // The prompt text lives in a store, not state: typing must re-render only
  // the textarea panel, not this whole tab.
  const promptStore = usePromptStore();
  const setTextareaContent = promptStore.set;
  const textareaRef = useRef(null);
  const { linkedRepos, clearLinkedRepos } = useLinkedRepos(tabId);
  // Last-used file view (flat/tree) is the default for new tabs.
  const [viewMode, setViewMode] = useSeededSetting('viewMode');

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Terminal ready state
  const [terminalReady, setTerminalReady] = useState(false);

  // A freshly spawned shell, until its agent auto-launches. A shell reclaimed
  // after a webview reload is left as it was.
  const freshShellRef = useRef(null);
  // Stable callback for terminal session ready (avoids inline arrow in JSX)
  const handleSessionReady = useCallback((id, { reattached = false } = {}) => {
    freshShellRef.current = reattached ? null : id;
    setTerminalSessionId(id);
  }, []);

  // Domain hooks
  const settings = useTerminalSettings();
  const toast = useToast();
  const dialogs = useDialogs(tabId);

  const flatView = useFlatViewNavigation(terminalSessionId);
  const { folders, currentPath, setCurrentPath } = flatView;
  // useFlatViewNavigation returns fresh functions each render.
  const loadFolders = useStableHandler(flatView.loadFolders);
  const navigateToParent = useStableHandler(flatView.navigateToParent);

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
  const { registerContextFiles } = useAgentJobsActions();
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
  const autoMerge = useAutoMerge();

  // Workspace state
  const workspaceHook = useWorkspace();

  const sidebarSearch = useSidebarSearch();

  const treeView = useTreeView({
    terminalSessionId,
    setCurrentPath,
    initializeSearch: sidebarSearch.initializeSearch,
    searchResults: sidebarSearch.searchResults,
    isActive,
  });

  // Terminate any running CLI process in the terminal before navigation
  const terminateCliProcess = useCallback(async () => {
    if (!terminalSessionId) return;
    for (const cliName of TAB_CLI_PROCESSES) {
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
      toast.error(`Couldn't open workspace: ${error?.message || error}`);
    }
  }, [terminalSessionId, viewMode, loadFolders, treeView?.loadTreeData, terminateCliProcess, toast.error]);

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

  const { tokenUsageStore, projectStats, refreshProjectStats } = useTokenUsage(currentPath, terminalSessionId, isActive && !!currentPath && !secondary.secondaryFullscreen);

  const compact = useCompact({
    currentPath,
    allFiles: treeView.allFiles,
    setTextareaVisible,
  });

  const elementPicker = useElementPicker();

  const atMention = useAtMention({
    search: sidebarSearch.search,
    toggleFileSelection: fileSelection.toggleFileSelection,
    setTextareaContent,
    textareaRef,
    rootPath: currentPath,
  });

  // Claude launcher
  const { launchClaude, cliAvailability } = useClaudeLauncher(terminalSessionId, terminalRef, settings.selectedCli);

  // Every fresh shell starts the tab's agent, so a tab opens straight into it.
  // Waits until the tab is first shown, so restoring many tabs at startup
  // doesn't start every agent at once. Typing into the shell first cancels it.
  const launchFresh = useStableHandler(launchClaude);
  useEffect(() => {
    const id = terminalSessionId;
    if (!settings.autoLaunchCli || !isActive || !terminalReady || !id || freshShellRef.current !== id) return;
    const cancel = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key.length !== 1 && e.key !== 'Enter' && e.key !== 'Backspace') return;
      if (e.target instanceof Element && e.target.closest('[data-pane="2"]')) freshShellRef.current = null;
    };
    window.addEventListener('keydown', cancel, true);
    // Give the shell a moment to print its prompt.
    const timer = setTimeout(() => {
      if (freshShellRef.current !== id) return;
      freshShellRef.current = null;
      launchFresh();
    }, 300);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', cancel, true);
    };
  }, [settings.autoLaunchCli, isActive, terminalReady, terminalSessionId, launchFresh]);

  const orchestrationCheck = useOrchestrationCheck();

  const switchToClaudeMode = useCallback(() => {
    setViewMode('tree');
    sidebar.setSidebarOpen(true);
  }, [sidebar.setSidebarOpen]);

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

  // Navigate to bookmark. Jumping to a saved repo kills the CLI that was running
  // in the old directory, so it's relaunched in the new one — otherwise opening a
  // starred repo drops you at a bare shell and you have to press Ctrl+K yourself.
  //
  // A fresh shell also launches the agent on its own (see the effect below).
  // `autoLaunch: false` is for callers that run their own launch sequence.
  // The bookmarks context hands out a new updateBookmark each render.
  const updateBookmarkStable = useStableHandler(updateBookmark);
  const navigateToBookmark = useCallback(async (bookmark, { autoLaunch = true } = {}) => {
    if (!terminalSessionId) return;
    try {
      await terminateCliProcess();
      const safePath = escapeShellPath(bookmark.path);
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: `cd ${safePath}\r` });
      await new Promise(resolve => setTimeout(resolve, 100));
      await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
      updateBookmarkStable(bookmark.id, { lastAccessedAt: Date.now() });
      if (viewMode === 'flat') await loadFolders();
      else if (viewMode === 'tree') await treeView.loadTreeData();
      terminalRef.current?.focus?.();
      if (autoLaunch && settings.autoLaunchCli) {
        // Let the cd settle so the CLI starts in the new directory.
        await new Promise(resolve => setTimeout(resolve, 200));
        await launchClaude();
      }
    } catch (error) {
      console.error('Failed to navigate to bookmark:', error);
      toast.error(`Couldn't open ${bookmark.name || bookmark.path}: ${error?.message || error}`);
    }
  }, [terminalSessionId, viewMode, loadFolders, treeView.loadTreeData, updateBookmarkStable, terminateCliProcess, settings.autoLaunchCli, launchClaude, toast.error]);

  // Handle project selection from initial dialog (with splash screen) — kept for bookmark navigation
  const handleSelectProject = useCallback(async (bookmark) => {
    // This path runs its own launch-and-wait sequence below.
    await navigateToBookmark(bookmark, { autoLaunch: false });
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
      const cliName = tabCliProcess(settings.selectedCli);
      // setTimeout chain, not setInterval: the next check is only scheduled
      // once the previous one has answered, so checks never pile up.
      const deadline = Date.now() + 15000;
      const checkCli = async () => {
        try {
          const running = await invoke('check_pty_child_process', {
            sessionId: terminalSessionId,
            processName: cliName,
          });
          if (running) { resolve(); return; }
        } catch { /* ignore */ }
        if (Date.now() >= deadline) resolve();
        else setTimeout(checkCli, 300);
      };
      setTimeout(checkCli, 300);
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }, [navigateToBookmark, switchToClaudeMode, launchClaude, terminalSessionId, settings.selectedCli]);

  // Git changes handler
  const handleGitChanges = useCallback((changes) => {
    // A file that stops being untracked (staged/committed) still exists, so
    // only additions, deletions and restored deletions change the tree.
    if (changes.newDeleted.length > 0 || changes.noLongerUntracked.some(c => c.status === 'deleted')) {
      treeView.loadTreeData();
    } else if (changes.newUntracked.length > 0) {
      treeView.handleIncrementalUpdate(changes, currentPath);
    }
  }, [treeView.handleIncrementalUpdate, treeView.loadTreeData, currentPath]);

  // View git diff
  const { setDiffFilePath, setDiffDialogOpen, setMarkdownFilePath, setMarkdownViewerOpen } = dialogs;
  const viewFileDiff = useCallback((filePath) => {
    setDiffFilePath(filePath);
    setDiffDialogOpen(true);
  }, [setDiffFilePath, setDiffDialogOpen]);

  // View markdown file
  const viewMarkdownFile = useCallback((filePath) => {
    setMarkdownFilePath(filePath);
    setMarkdownViewerOpen(true);
  }, [setMarkdownFilePath, setMarkdownViewerOpen]);

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

  const clearSelectedTemplate = useCallback(() => setSelectedTemplateId(null), []);

  // Prompt sender
  const sendTextareaToTerminal = usePromptSender({
    terminalSessionId, terminalRef, getTextareaContent: promptStore.get,
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
    clearSelectedTemplate,
    linkedRepos,
    clearLinkedRepos,
  });

  // The prompt as the sender builds it, minus the typed text: the cost
  // estimate prices it, so keystrokes don't redo file analysis.
  const promptBase = useMemo(() => buildPrompt({
    textareaContent: '',
    selectedFiles: fileSelection.selectedFiles,
    currentPath,
    fileStates: fileSelection.fileStates,
    selectedTemplateId,
    getTemplateById,
    formatFileAnalysis,
    getLineCount,
    getViewModeLabel,
    selectedElements: elementPicker.selectedElements,
    compactedProject: compact.compactedProject,
    selectedPatterns: patterns.selectedPatterns,
    getPatternInstructions: patterns.getPatternInstructions,
    linkedRepos,
  }), [
    fileSelection.selectedFiles, currentPath, fileSelection.fileStates,
    selectedTemplateId, getTemplateById, formatFileAnalysis, getLineCount, getViewModeLabel,
    elementPicker.selectedElements, compact.compactedProject,
    patterns.selectedPatterns, patterns.getPatternInstructions, linkedRepos,
  ]);

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

  // Clear folder expansion when sidebar closes
  useEffect(() => {
    if (!sidebar.sidebarOpen) {
      treeView.collapseAllFolders();
    }
  }, [sidebar.sidebarOpen]);

  // The tab follows the project the app navigated to (bookmarks, folder
  // navigation), not a `cd` typed in the shell, so tab, branch and tree agree.
  useEffect(() => {
    if (tabId && isRealPath(currentPath) && currentPath !== projectPath) {
      updateTabPath(tabId, currentPath);
    }
  }, [currentPath, projectPath, tabId, updateTabPath]);

  // Lets the tabs summary pane find this tab's terminal activity.
  useEffect(() => {
    if (!terminalSessionId || !tabId) return;
    return registerTabSession(tabId, terminalSessionId);
  }, [tabId, terminalSessionId]);


  // Lets the tabs summary pane link other repos and attach files to this
  // tab's prompt.
  const addFilesRef = useRef(fileSelection.addFiles);
  addFilesRef.current = fileSelection.addFiles;
  useEffect(() => {
    if (!tabId) return;
    return registerTabPrompt(tabId, {
      open: () => {
        setTextareaVisible(true);
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
      addFiles: (paths) => addFilesRef.current(paths),
      // Types `text` into the terminal and submits it, like the prompt's send.
      send: async (text) => {
        const sessionId = getTabSession(tabId);
        if (!sessionId) throw new Error('This tab has no terminal yet');
        await invoke('write_to_terminal', { sessionId, data: text });
        await new Promise((resolve) => setTimeout(resolve, 500));
        await invoke('write_to_terminal', { sessionId, data: '\r' });
      },
    });
  }, [tabId]);

  // A closed tab's links go with it.
  useEffect(() => () => clearLinkedRepos(), [clearLinkedRepos]);

  // Get current git branch
  const branchName = useBranchName(secondary.secondaryFullscreen ? null : resolvedProjectDir, isActive);

  // Keyboard shortcuts
  const { templateDropdownOpen, setTemplateDropdownOpen } = useTextareaShortcuts({
    textareaVisible, setTextareaVisible, textareaRef,
    onSendContent: sendTextareaToTerminal,
    selectedTemplateId, onSelectTemplate: setSelectedTemplateId,
    onRestoreLastPrompt: setTextareaContent,
    secondaryTerminalFocused: secondary.secondaryFocused,
    isActive,
  });

  useHelpShortcut({
    setShowHelp: dialogs.setShowHelp,
    secondaryTerminalFocused: secondary.secondaryFocused,
    isActive,
  });

  useBookmarksShortcut({
    setBookmarksPaletteOpen: dialogs.setBookmarksPaletteOpen,
    secondaryTerminalFocused: secondary.secondaryFocused,
    isActive,
  });

  // Fetch data when sidebar opens
  useEffect(() => {
    if (sidebar.sidebarOpen) {
      if (viewMode === 'flat') loadFolders();
      else if (viewMode === 'tree') treeView.loadTreeData();
    }
  }, [sidebar.sidebarOpen, viewMode]);

  // Auto-refresh sidebar when terminal session becomes available
  // The tree loader bails without a session, so a remembered tree view has to
  // load here too, not only the flat one.
  useEffect(() => {
    if (!terminalSessionId || !sidebar.sidebarOpen) return;
    if (viewMode === 'tree') treeView.loadTreeData();
    else if (folders.length === 0) loadFolders();
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

  // First run (no saved tabs): offer the starred projects and workspaces once
  // the shell is up. With none saved the picker has nothing to offer, so skip.
  useEffect(() => {
    if (!isActive || !terminalReady || !terminalSessionId || !workspaceHook.workspacesLoaded) return;
    if (!consumeFirstRun()) return;
    if (bookmarks.length > 0 || workspaceHook.workspaces.length > 0) {
      dialogs.setInitialProjectDialogOpen(true);
    }
  }, [isActive, terminalReady, terminalSessionId, workspaceHook.workspacesLoaded]);

  // Auto-commit and lazygit ask which project first when a workspace holds
  // several. Refs keep these callbacks stable across stage/workspace changes.
  const autoCommitStageRef = useRef(autoCommit.stage);
  const workspaceRef = useRef(workspaceHook.workspace);
  useEffect(() => { autoCommitStageRef.current = autoCommit.stage; }, [autoCommit.stage]);
  useEffect(() => { workspaceRef.current = workspaceHook.workspace; }, [workspaceHook.workspace]);

  const { setProjectPickerAction, setProjectPickerOpen } = dialogs;
  const handleAutoCommit = useCallback(() => {
    if (autoCommitStageRef.current !== 'idle') autoCommit.quickCommit();
    else if (workspaceRef.current?.projects?.length) {
      setProjectPickerAction('autocommit');
      setProjectPickerOpen(true);
    } else autoCommit.trigger(currentPathRef.current);
  }, [autoCommit.quickCommit, autoCommit.trigger, setProjectPickerAction, setProjectPickerOpen]);

  const autoMergeStageRef = useRef(autoMerge.stage);
  useEffect(() => { autoMergeStageRef.current = autoMerge.stage; }, [autoMerge.stage]);
  const handleAutoMerge = useCallback(() => {
    if (autoMergeStageRef.current !== 'idle') return;
    if (workspaceRef.current?.projects?.length) {
      setProjectPickerAction('automerge');
      setProjectPickerOpen(true);
    } else autoMerge.trigger(currentPathRef.current);
  }, [autoMerge.trigger, setProjectPickerAction, setProjectPickerOpen]);

  const handleOpenLazygit = useCallback(() => {
    if (workspaceRef.current?.projects?.length) {
      setProjectPickerAction('lazygit');
      setProjectPickerOpen(true);
    } else {
      secondary.openWithCommand('lazygit');
    }
  }, [secondary.openWithCommand, setProjectPickerAction, setProjectPickerOpen]);

  // Types a slash command into the tab's CLI and presses Enter.
  const sendCliCommand = useCallback(async (command) => {
    if (!terminalSessionId) return;
    try {
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: command });
      setTimeout(async () => {
        try {
          await invoke('write_to_terminal', { sessionId: terminalSessionId, data: '\r' });
        } catch (error) {
          console.error(`Failed to send Enter for ${command}:`, error);
        }
      }, 100);
      terminalRef.current?.focus?.();
    } catch (error) {
      console.error(`Failed to send ${command} to the CLI:`, error);
    }
  }, [terminalSessionId]);

  const handleClearContext = useCallback(
    () => sendCliCommand(settings.selectedCli === 'opencode' ? '/new' : '/clear'),
    [sendCliCommand, settings.selectedCli],
  );
  // Claude Code and opencode both summarise the session with /compact.
  const handleCompactContext = useCallback(() => sendCliCommand('/compact'), [sendCliCommand]);

  useTabShortcuts({
    isActive,
    secondary,
    dialogs,
    viewMode,
    sidebarOpen: sidebar.sidebarOpen,
    searchInputRef,
    onCompactProject: compact.handleCompactProject,
    onOpenLazygit: handleOpenLazygit,
    onAutoCommit: handleAutoCommit,
    onAutoMerge: handleAutoMerge,
    onClearContext: handleClearContext,
  });

  // Cleanup on unmount: close the terminal. The fs watcher is not stopped
  // here — useTreeView owns it, and watchers are ref-counted per path, so a
  // second stop would release another tab's watcher on the same project.
  // Use a ref so this effect only runs on unmount (empty deps), not when values change
  const terminalSessionIdCleanupRef = useRef(terminalSessionId);
  useEffect(() => { terminalSessionIdCleanupRef.current = terminalSessionId; }, [terminalSessionId]);

  useEffect(() => {
    return () => {
      if (terminalSessionIdCleanupRef.current) {
        invoke('close_terminal', { sessionId: terminalSessionIdCleanupRef.current }).catch(() => {});
      }
    };
  }, []);

  // Both restart the terminal session, since sandboxing is applied at spawn.
  const toggleNetwork = useCallback(() => {
    settings.setNetworkIsolation(prev => !prev);
    if (settings.sandboxEnabled && terminalSessionId) {
      invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
      setTerminalSessionId(null);
      settings.setSandboxFailed(false);
      setTerminalKey(k => k + 1);
    }
  }, [settings.setNetworkIsolation, settings.sandboxEnabled, terminalSessionId, settings.setSandboxFailed]);

  const toggleSandbox = useCallback(() => {
    settings.setSandboxEnabled(prev => !prev);
    settings.setSandboxFailed(false);
    if (terminalSessionId) {
      invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
    }
    setTerminalSessionId(null);
    setTerminalKey(k => k + 1);
  }, [settings.setSandboxEnabled, settings.setSandboxFailed, terminalSessionId]);

  const palette = useCommandPalette({ isActive });

  // Callbacks handed to children. Declared up here, never inline in JSX: the
  // sidebar is conditionally rendered, and a hook inside that branch changes
  // the hook count whenever it toggles.
  const handleSidebarSearchChange = useCallback((query) => {
    sidebarSearch.handleSearchChange(query);
    atMention.setAtMentionQuery(null);
  }, [sidebarSearch.handleSearchChange, atMention.setAtMentionQuery]);
  const { setShowHelp, setCliSelectionModalOpen, setDashboardOpen, setContextDetailsOpen, setSettingsOpen,
    setWorkspaceDialogOpen, setAddBookmarkDialogOpen, setManageTemplatesDialogOpen,
    setSaveFileGroupDialogOpen } = dialogs;
  const toggleHelp = useCallback(() => setShowHelp(prev => !prev), [setShowHelp]);
  const openCliSettings = useCallback(() => setCliSelectionModalOpen(true), [setCliSelectionModalOpen]);
  const openDashboard = useCallback(() => setDashboardOpen(true), [setDashboardOpen]);
  const openContextDetails = useCallback(() => setContextDetailsOpen(true), [setContextDetailsOpen]);
  const openSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen]);
  const openWorkspaceDialog = useCallback(() => setWorkspaceDialogOpen(true), [setWorkspaceDialogOpen]);
  const openAddBookmark = useCallback(() => setAddBookmarkDialogOpen(true), [setAddBookmarkDialogOpen]);
  const openManageTemplates = useCallback(() => setManageTemplatesDialogOpen(true), [setManageTemplatesDialogOpen]);
  const openSaveFileGroup = useCallback(() => setSaveFileGroupDialogOpen(true), [setSaveFileGroupDialogOpen]);
  const closeTextarea = useCallback(() => setTextareaVisible(false), []);
  const clearCompactedProject = useCallback(() => compact.setCompactedProject(null), [compact.setCompactedProject]);
  const toggleSecondaryFullscreen = useCallback(() => secondary.setSecondaryFullscreen(f => !f), [secondary.setSecondaryFullscreen]);

  // nvim/lazygit in terminal 2: whole window, Lirah keybinds off. Only the tab
  // that turned focus mode on turns it off, then hands focus back to its shell.
  const ownsFocusModeRef = useRef(false);
  const handleFocusModeChange = useCallback((on) => {
    if (on) {
      ownsFocusModeRef.current = true;
      setFocusMode(true);
      secondary.setSecondaryFullscreen(true);
    } else if (ownsFocusModeRef.current) {
      ownsFocusModeRef.current = false;
      setFocusMode(false);
      requestAnimationFrame(() => terminalRef.current?.focus?.());
    }
  }, [secondary.setSecondaryFullscreen]);
  const handleTerminalReady = useCallback(() => setTerminalReady(true), []);
  // Sandboxing is applied at spawn, so retrying without it turns the setting
  // off and restarts this tab's shell (same path as toggleSandbox).
  const retryWithoutSandbox = useCallback(() => {
    settings.setSandboxEnabled(false);
    settings.setSandboxFailed(false);
    // Read through the ref: this callback must stay stable, or Terminal's
    // onSandboxFailed effect re-fires and repeats the warning.
    const sessionId = terminalSessionIdCleanupRef.current;
    if (sessionId) {
      invoke('close_terminal', { sessionId }).catch(console.error);
    }
    setTerminalSessionId(null);
    setTerminalKey(k => k + 1);
  }, [settings.setSandboxEnabled, settings.setSandboxFailed]);
  const handleSandboxFailed = useCallback(() => {
    settings.setSandboxFailed(true);
    toast.warning('Sandbox failed to initialize. Terminal running without sandbox.', {
      duration: 10000,
      action: { label: 'Retry without sandbox', onClick: retryWithoutSandbox },
    });
  }, [settings.setSandboxFailed, toast.warning, retryWithoutSandbox]);

  const commands = useTabCommands({
    tabId,
    projectPath,
    dialogs,
    settings,
    themes,
    changeTheme,
    secondary,
    onCompactProject: compact.handleCompactProject,
    onAutoCommit: handleAutoCommit,
    onAutoMerge: handleAutoMerge,
    onLaunchCli: launchClaude,
    onOpenLazygit: handleOpenLazygit,
    onClearContext: handleClearContext,
    toggleSandbox,
    toggleNetwork,
    onToggleGitFilter: treeView.handleToggleGitFilter,
    onToggleMarkdownFilter: treeView.handleToggleMarkdownFilter,
    setSidebarOpen: sidebar.setSidebarOpen,
    setTextareaVisible,
  });

  return (
    <TokenBudgetProvider tokenUsageStore={tokenUsageStore} projectStats={projectStats} projectPath={currentPath}>
    <SidebarProvider open={sidebar.sidebarOpen} onOpenChange={sidebar.setSidebarOpen} className={`min-h-0 flex-1 ${sidebar.isResizing ? 'select-none' : ''}`} style={{ height: '100%' }}>
      <Layout
        sidebar={
          sidebar.sidebarOpen && (
            <LeftSidebar
              sidebar={sidebar}
              search={sidebarSearch}
              searchInputRef={searchInputRef}
              onSearchChange={handleSidebarSearchChange}
              treeView={treeView}
              typeChecker={typeChecker}
              fileSymbols={fileSymbolsHook}
              viewMode={viewMode}
              currentPath={currentPath}
              folders={folders}
              fileWatchingEnabled={fileWatchingEnabled && isActive && !secondary.secondaryFullscreen}
              isTextareaPanelOpen={textareaVisible}
              onNavigateParent={navigateToParent}
              onFolderClick={loadFolders}
              onAddBookmark={openAddBookmark}
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
              isActive={isActive}
            />
          )
        }
        textarea={
          textareaVisible && (
            <TextareaPanel
              promptStore={promptStore}
              onChange={handleTextareaChange}
              onSend={sendTextareaToTerminal}
              onClose={closeTextarea}
              textareaRef={textareaRef}
              disabled={!terminalSessionId}
              selectedFiles={fileSelection.selectedFiles}
              currentPath={currentPath}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              onManageTemplates={openManageTemplates}
              templateDropdownOpen={templateDropdownOpen}
              onTemplateDropdownOpenChange={setTemplateDropdownOpen}
              projectPath={currentPath}
              onLoadGroup={fileSelection.handleLoadFileGroup}
              onSaveGroup={openSaveFileGroup}
              onCompactProject={compact.handleCompactProject}
              isCompacting={compact.isCompacting}
              compactProgress={compact.compactProgress}
              compactedProject={compact.compactedProject}
              onClearCompactedProject={clearCompactedProject}
              onUpdateCompactedProject={compact.setCompactedProject}
              selectedElements={elementPicker.selectedElements}
              onClearElements={elementPicker.clearSelectedElements}
              linkedRepos={linkedRepos}
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
              onCreatePatterns={patterns.createPatterns}
              promptBase={promptBase}
              onClearRepos={clearLinkedRepos}
              onRemoveFile={fileSelection.removeFileFromSelection}
              onRemoveElement={elementPicker.removeElement}
              keepFilesAfterSend={settings.keepFilesAfterSend}
              onToggleKeepFiles={settings.setKeepFilesAfterSend}
            />
          )
        }
        titleBar={settings.showTitleBar && <TitleBar hasTerminalSession={!!terminalSessionId} currentPath={currentPath} />}
        statusBar={
          <TabBarStatusSlot active={isActive}>
          <StatusBar
            viewMode={viewMode}
            currentPath={currentPath}
            sessionId={terminalSessionId}
            onToggleHelp={toggleHelp}
            selectedCli={settings.selectedCli}
            onOpenCliSettings={openCliSettings}
            showTitleBar={settings.showTitleBar}
            sandboxEnabled={settings.sandboxEnabled}
            sandboxFailed={settings.sandboxFailed}
            networkIsolation={settings.networkIsolation}
            onToggleNetworkIsolation={toggleNetwork}
            secondaryTerminalFocused={secondary.secondaryFocused}
            onOpenDashboard={openDashboard}
            onOpenContextDetails={openContextDetails}
            changelogStatus={changelogStatus}
            onOpenSettings={openSettings}
            onAutoCommit={handleAutoCommit}
            onAutoMerge={handleAutoMerge}
            onToggleSandbox={toggleSandbox}
            workspace={workspaceHook.workspace}
            onOpenWorkspaceDialog={openWorkspaceDialog}
            onCloseWorkspace={workspaceHook.closeWorkspace}
            onClearContext={handleClearContext}
            onCompactContext={handleCompactContext}
            availableUpdate={availableUpdate}
          />
          </TabBarStatusSlot>
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
              onToggleFullscreen={toggleSecondaryFullscreen}
              onPickerVisibilityChange={secondary.handlePickerVisibilityChange}
              onFocusModeChange={handleFocusModeChange}
              initialCommand={secondary.pendingCommand}
              isActive={isActive}
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
          onReady={handleTerminalReady}
          onSearchFocus={handleSearchFocus}
          onToggleGitFilter={treeView.handleToggleGitFilter}
          sandboxEnabled={settings.sandboxEnabled}
          networkIsolation={settings.networkIsolation}
          projectDir={resolvedProjectDir}
          onSandboxFailed={handleSandboxFailed}
          reattachKey={tabId}
        />
        {!settings.autoLaunchCli && <LaunchAgentPrompt
          tabId={tabId}
          sessionId={terminalSessionId}
          isActive={isActive}
          selectedCli={settings.selectedCli}
          onLaunch={launchClaude}
          onChangeCli={openCliSettings}
        />}
      </Layout>

      {/* The tabs pane draws each tab's context fill as a moon. */}
      <TabContextFillSync tabId={tabId} isActive={isActive} tokenUsageStore={tokenUsageStore} terminalSessionId={terminalSessionId} />
      {isActive && (
        <CommandPalette open={palette.open} onClose={palette.close} commands={commands} />
      )}
      <DialogHost
        dialogs={dialogs}
        currentPath={currentPath}
        settings={settings}
        sessionId={terminalSessionId}
        toggleSandbox={toggleSandbox}
        toggleNetwork={toggleNetwork}
        cliAvailability={cliAvailability}
        elementPicker={elementPicker}
        fileSelection={fileSelection}
        branchName={branchName}
        autoCommit={autoCommit}
        autoMerge={autoMerge}
        changelogStatus={changelogStatus}
        tokenUsageStore={tokenUsageStore}
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
        markdownFiles={markdownFiles}
        viewMarkdownFile={viewMarkdownFile}
      />
    </SidebarProvider>
    </TokenBudgetProvider>
  );
}
