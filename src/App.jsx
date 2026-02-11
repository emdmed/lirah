import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { useFileSearch } from "./hooks/useFileSearch";
import { useHelpShortcut } from "./hooks/useHelpShortcut";
import { useBookmarksShortcut } from "./hooks/useBookmarksShortcut";
import { useClaudeLauncher } from "./hooks/useClaudeLauncher";
import { useFileSymbols } from "./hooks/file-analysis/useFileSymbols";
import { useTokenUsage } from "./hooks/useTokenUsage";
import { useProjectCompact, estimateTokens, formatTokenCount } from "./hooks/useProjectCompact";
import { useTypeChecker } from "./hooks/useTypeChecker";
import { usePromptSender } from "./hooks/usePromptSender";
import { buildTreeFromFlatList, incrementallyUpdateTree } from "./utils/treeOperations";
import { IS_WINDOWS, escapeShellPath, getRelativePath, basename, lastSepIndex } from "./utils/pathUtils";
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
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "./components/ui/button";
import { Folder, File, ChevronUp, ChevronRight, ChevronDown } from "lucide-react";

function App() {
  const { theme } = useTheme();
  const { fileWatchingEnabled } = useWatcher();
  const { getTemplateById } = usePromptTemplates();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showTitleBar, setShowTitleBar] = useState(() => {
    try {
      const saved = localStorage.getItem('nevo-terminal:show-title-bar');
      return saved !== null ? JSON.parse(saved) : true;
    } catch { return true; }
  });
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState(null);

  // Ref to access terminal's imperative methods
  const terminalRef = useRef(null);

  // Ref for search input
  const searchInputRef = useRef(null);

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(200, e.clientX), 600);
      setSidebarWidth(newWidth);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);

  // Flat view navigation hook
  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);

  // Token usage tracking
  const tokenUsage = useTokenUsage(currentPath, !!currentPath);

  // Project compacting hook
  const { isCompacting, progress: compactProgress, compactProject } = useProjectCompact();

  // Tree view state
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'tree'
  const [treeData, setTreeData] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [allFiles, setAllFiles] = useState([]); // Flat list for indexing

  // @ mention search state (separate from sidebar search)
  const [atMentionResults, setAtMentionResults] = useState(null);

  // Git filter state
  const [showGitChangesOnly, setShowGitChangesOnly] = useState(false);

  // Loading state
  const [treeLoading, setTreeLoading] = useState(false);

  // Textarea state
  const [textareaVisible, setTextareaVisible] = useState(true);
  const [textareaContent, setTextareaContent] = useState('');
  const textareaRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [fileStates, setFileStates] = useState(new Map()); // Map<filePath, 'modify'|'do-not-modify'|'use-as-example'>
  const [keepFilesAfterSend, setKeepFilesAfterSend] = useState(false);
  const [atMentionQuery, setAtMentionQuery] = useState(null);
  const [atMentionSelectedIndex, setAtMentionSelectedIndex] = useState(0);

  // Help state
  const [showHelp, setShowHelp] = useState(false);

  // Bookmarks state
  const [addBookmarkDialogOpen, setAddBookmarkDialogOpen] = useState(false);
  const [bookmarksPaletteOpen, setBookmarksPaletteOpen] = useState(false);
  const [initialProjectDialogOpen, setInitialProjectDialogOpen] = useState(false);
  const { bookmarks, updateBookmark } = useBookmarks();

  // Prompt templates state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [manageTemplatesDialogOpen, setManageTemplatesDialogOpen] = useState(false);
  const [appendOrchestration, setAppendOrchestration] = useState(true);
  const [orchestrationTokenEstimate, setOrchestrationTokenEstimate] = useState(null);

  // Type checker hook
  const {
    checkFileTypes,
    typeCheckResults,
    checkingFiles,
    successfulChecks,
    resetTypeChecker,
  } = useTypeChecker(currentPath, { setTextareaVisible, setTextareaContent });

  // Git diff dialog state
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffFilePath, setDiffFilePath] = useState(null);

  // File groups dialog state
  const [saveFileGroupDialogOpen, setSaveFileGroupDialogOpen] = useState(false);

  // CLI selection state (lazy init from localStorage to avoid race condition)
  const [selectedCli, setSelectedCli] = useState(() => {
    try {
      return localStorage.getItem('nevo-terminal:selected-cli') || 'claude-code';
    } catch {
      return 'claude-code';
    }
  });
  const [cliSelectionModalOpen, setCliSelectionModalOpen] = useState(false);

  // Sandbox state
  const [sandboxEnabled, setSandboxEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('nevo-terminal:sandbox-enabled');
      return saved !== null ? JSON.parse(saved) : false;
    } catch { return false; }
  });
  const [networkIsolation, setNetworkIsolation] = useState(() => {
    try {
      const saved = localStorage.getItem('nevo-terminal:network-isolation');
      return saved !== null ? JSON.parse(saved) : false;
    } catch { return false; }
  });

  // Terminal restart key — incrementing forces Terminal remount
  const [terminalKey, setTerminalKey] = useState(0);
  const [sandboxFailed, setSandboxFailed] = useState(false);

  // Compact project confirmation state
  const [compactConfirmOpen, setCompactConfirmOpen] = useState(false);
  const [pendingCompactResult, setPendingCompactResult] = useState(null);
  const [compactedProject, setCompactedProject] = useState(null);

  // Element picker state
  const [elementPickerOpen, setElementPickerOpen] = useState(false);
  const [elementPickerFilePath, setElementPickerFilePath] = useState(null);
  const [selectedElements, setSelectedElements] = useState(new Map()); // Map<filePath, element[]>

  // Secondary terminal state
  const [secondaryVisible, setSecondaryVisible] = useState(false);
  const [secondaryFocused, setSecondaryFocused] = useState(false);
  const [secondarySessionId, setSecondarySessionId] = useState(null);
  const [secondaryKey, setSecondaryKey] = useState(0);
  const secondaryTerminalRef = useRef(null);

  // Load keepFilesAfterSend from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nevo-terminal:keep-files-after-send');
      if (saved !== null) {
        setKeepFilesAfterSend(JSON.parse(saved));
      }
    } catch (error) {
      console.warn('Failed to load keep-files preference from localStorage:', error);
    }
  }, []);

  // Save selectedCli to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('nevo-terminal:selected-cli', selectedCli);
    } catch (error) {
      console.warn('Failed to save CLI preference to localStorage:', error);
    }
  }, [selectedCli]);

  // Save keepFilesAfterSend to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('nevo-terminal:keep-files-after-send', JSON.stringify(keepFilesAfterSend));
    } catch (error) {
      console.warn('Failed to save keep-files preference to localStorage:', error);
    }
  }, [keepFilesAfterSend]);

  // Save showTitleBar to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('nevo-terminal:show-title-bar', JSON.stringify(showTitleBar));
    } catch (error) {
      console.warn('Failed to save title bar preference to localStorage:', error);
    }
  }, [showTitleBar]);

  // Save sandboxEnabled to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('nevo-terminal:sandbox-enabled', JSON.stringify(sandboxEnabled));
    } catch (error) {
      console.warn('Failed to save sandbox preference to localStorage:', error);
    }
  }, [sandboxEnabled]);

  // Save networkIsolation to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('nevo-terminal:network-isolation', JSON.stringify(networkIsolation));
    } catch (error) {
      console.warn('Failed to save network isolation preference to localStorage:', error);
    }
  }, [networkIsolation]);

  // Search hook
  const { initializeSearch, search, clearSearch } = useFileSearch();

  // Claude launcher hook
  const { launchClaude, cliAvailability } = useClaudeLauncher(terminalSessionId, terminalRef, selectedCli);

  // File symbols hook for code symbol extraction
  const {
    fileSymbols,
    extractFileSymbols,
    clearFileSymbols,
    clearAllSymbols,
    getSymbolCount,
    getLineCount,
    formatFileAnalysis,
    getViewModeLabel,
    setFileViewMode,
    isBabelParseable,
    VIEW_MODES,
  } = useFileSymbols();

  // Switch to Claude mode (tree view)
  const switchToClaudeMode = useCallback(() => {
    setViewMode('tree');
    setSidebarOpen(true);
  }, []);

  // Launch orchestration handler
  const launchOrchestration = useCallback(async () => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready');
      return;
    }

    try {
      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: 'npx agentic-orchestration\r'
      });

      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to launch orchestration:', error);
    }
  }, [terminalSessionId]);

  // Tree view helper functions (defined early for use in hooks)
  const loadTreeData = useCallback(async () => {
    try {
      if (!terminalSessionId) {
        console.log('Terminal session not ready');
        setTreeData([]);
        setCurrentPath('Waiting for terminal...');
        return;
      }

      setTreeLoading(true);

      // Get terminal's current CWD
      const cwd = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
      console.log('Loading tree from CWD:', cwd);

      // Load ALL items recursively
      const allEntries = await invoke('read_directory_recursive', {
        path: cwd,
        maxDepth: 10,
        maxFiles: 10000
      });

      console.log('Loaded', allEntries.length, 'items total');

      // Build hierarchical tree from flat list
      const treeNodes = buildTreeFromFlatList(allEntries, cwd);

      setTreeData(treeNodes);
      setCurrentPath(cwd);
      setAllFiles(allEntries);
      setTreeLoading(false);

      // Initialize search index
      initializeSearch(allEntries);
    } catch (error) {
      console.error('Failed to load tree data:', error);
      setTreeData([]);
      setCurrentPath('Error loading directory');
      setTreeLoading(false);
    }
  }, [terminalSessionId, initializeSearch]);

  // File selection handlers
  const toggleFileSelection = useCallback((filePath) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        // Removing file
        next.delete(filePath);
        // Also remove from fileStates
        setFileStates(prevStates => {
          const nextStates = new Map(prevStates);
          nextStates.delete(filePath);
          return nextStates;
        });
        // Clear symbols for this file
        clearFileSymbols(filePath);
      } else {
        // Adding file
        next.add(filePath);
        // Set default state to 'modify'
        setFileStates(prevStates => {
          const nextStates = new Map(prevStates);
          nextStates.set(filePath, 'modify');
          return nextStates;
        });
        // Extract symbols for parseable files
        if (isBabelParseable(filePath)) {
          extractFileSymbols(filePath);
        }
      }
      return next;
    });
  }, [clearFileSymbols, isBabelParseable, extractFileSymbols]);

  const removeFileFromSelection = useCallback((filePath) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
    setFileStates(prev => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  const clearFileSelection = () => {
    setSelectedFiles(new Set());
    setFileStates(new Map());
    clearAllSymbols();
  };

  // View git diff for a file
  const viewFileDiff = useCallback((filePath) => {
    setDiffFilePath(filePath);
    setDiffDialogOpen(true);
  }, []);

  const setFileState = useCallback((filePath, state) => {
    setFileStates(prev => {
      const next = new Map(prev);
      next.set(filePath, state);
      return next;
    });
  }, []);

  // File groups handlers
  const handleLoadFileGroup = useCallback((group) => {
    // Replace current selection with group files
    const newSelectedFiles = new Set();
    const newFileStates = new Map();

    group.files.forEach(file => {
      // Convert relative path to absolute
      const absolutePath = `${currentPath}/${file.relativePath}`;
      newSelectedFiles.add(absolutePath);
      newFileStates.set(absolutePath, file.state);

      // Extract symbols for parseable files
      if (isBabelParseable(absolutePath)) {
        extractFileSymbols(absolutePath);
      }
    });

    setSelectedFiles(newSelectedFiles);
    setFileStates(newFileStates);
  }, [currentPath, isBabelParseable, extractFileSymbols]);

  const handleSaveFileGroup = useCallback(() => {
    setSaveFileGroupDialogOpen(true);
  }, []);

  // Compact project handler
  const handleCompactProject = useCallback(async () => {
    if (isCompacting || !currentPath) return;

    try {
      // Use existing allFiles state if available, otherwise fetch
      let files = allFiles;
      if (!files || files.length === 0) {
        files = await invoke('read_directory_recursive', {
          path: currentPath,
          maxDepth: 10,
          maxFiles: 10000
        });
      }

      const result = await compactProject(currentPath, files);

      // null means no parseable files found (handled by button UI)
      if (!result) {
        return;
      }

      const { output, originalSize } = result;

      // Calculate token estimates (~4 chars per token)
      const compactedTokens = estimateTokens(output);
      const originalTokens = Math.ceil(originalSize / 4);
      const fileCount = (output.match(/^## /gm) || []).length;

      // Calculate compression percentage
      const compressionPercent = originalSize > 0
        ? Math.round((1 - output.length / originalSize) * 100)
        : 0;

      // Store result and show confirmation dialog
      setPendingCompactResult({
        output,
        tokenEstimate: compactedTokens,
        formattedTokens: formatTokenCount(compactedTokens),
        originalTokens,
        formattedOriginalTokens: formatTokenCount(originalTokens),
        fileCount,
        compressionPercent,
      });
      setCompactConfirmOpen(true);
    } catch (error) {
      console.error('Failed to compact project:', error);
    }
  }, [isCompacting, currentPath, allFiles, compactProject]);

  // Confirm compact insertion
  const handleConfirmCompact = useCallback(() => {
    if (pendingCompactResult?.output) {
      setCompactedProject({
        output: pendingCompactResult.output,
        fullOutput: pendingCompactResult.output,
        fileCount: pendingCompactResult.fileCount,
        tokenEstimate: pendingCompactResult.tokenEstimate,
        formattedTokens: pendingCompactResult.formattedTokens,
        originalTokens: pendingCompactResult.originalTokens,
        formattedOriginalTokens: pendingCompactResult.formattedOriginalTokens,
        compressionPercent: pendingCompactResult.compressionPercent,
        disabledPaths: [],
      });
      setTextareaVisible(true);
    }
    setPendingCompactResult(null);
  }, [pendingCompactResult]);

  // Cancel compact insertion
  const handleCancelCompact = useCallback(() => {
    setPendingCompactResult(null);
    setCompactedProject(null);
  }, []);

  // Element picker handlers
  const handleOpenElementPicker = useCallback((filePath) => {
    setElementPickerFilePath(filePath);
    setElementPickerOpen(true);
  }, []);

  const handleAddElements = useCallback((filePath, elements) => {
    setSelectedElements(prev => {
      const next = new Map(prev);
      const existing = next.get(filePath) || [];
      // Merge with existing, avoiding duplicates by key
      const existingKeys = new Set(existing.map(e => e.key));
      const newElements = elements.filter(e => !existingKeys.has(e.key));
      next.set(filePath, [...existing, ...newElements]);
      return next;
    });
  }, []);

  const clearSelectedElements = useCallback(() => {
    setSelectedElements(new Map());
  }, []);

  // Incremental tree update to prevent flickering
  const handleIncrementalUpdate = useCallback((changes, rootPath) => {
    setTreeData(prevTreeData => incrementallyUpdateTree(prevTreeData, changes, rootPath));
  }, []);

  // Handle git changes with incremental updates to prevent flickering
  const handleGitChanges = useCallback((changes) => {
    console.log('[handleGitChanges] Called with:', changes);
    // For new untracked files only - use incremental update
    if (changes.newUntracked.length > 0 && !changes.newDeleted.length && !changes.noLongerUntracked.length) {
      console.log('[handleGitChanges] Adding new untracked files to tree:', changes.newUntracked, 'rootPath:', currentPath);
      handleIncrementalUpdate(changes, currentPath);
    } else if (changes.hasChanges) {
      console.log('[handleGitChanges] Complex git changes detected, refreshing tree:', changes);
      loadTreeData();
    }
  }, [handleIncrementalUpdate, loadTreeData, currentPath]);

  // Navigate to bookmark
  const navigateToBookmark = useCallback(async (bookmark) => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready');
      return;
    }

    try {
      // Shell escape the path
      const safePath = escapeShellPath(bookmark.path);
      const command = `cd ${safePath}\r`;

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: command
      });

      // Wait for shell to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify navigation succeeded
      const actualCwd = await invoke('get_terminal_cwd', {
        sessionId: terminalSessionId
      });

      // Update lastAccessedAt
      updateBookmark(bookmark.id, { lastAccessedAt: Date.now() });

      // Reload sidebar view
      if (viewMode === 'flat') {
        loadFolders();
      } else if (viewMode === 'tree') {
        loadTreeData();
      }

      // Focus terminal
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }

      // Check if navigation failed
      if (actualCwd !== bookmark.path) {
        console.error(`Failed to navigate to bookmark path: ${bookmark.path}`);
        console.error(`Current directory: ${actualCwd}`);
      }
    } catch (error) {
      console.error('Failed to navigate to bookmark:', error);
    }
  }, [terminalSessionId, viewMode, loadFolders, loadTreeData, updateBookmark, terminalRef]);

  // Send textarea content to terminal
  const sendTextareaToTerminal = usePromptSender({
    terminalSessionId,
    terminalRef,
    textareaContent,
    selectedFiles,
    currentPath,
    fileStates,
    keepFilesAfterSend,
    selectedTemplateId,
    getTemplateById,
    appendOrchestration,
    formatFileAnalysis,
    getLineCount,
    getViewModeLabel,
    selectedElements,
    compactedProject,
    setTextareaContent,
    setCompactedProject,
    clearFileSelection,
    clearSelectedElements,
  });

  // Keyboard shortcuts hook
  useViewModeShortcuts({
    sidebarOpen,
    setSidebarOpen,
    viewMode,
    setViewMode,
    onLoadFlatView: loadFolders,
    onLoadTreeView: loadTreeData,
    onLaunchClaude: launchClaude,
    terminalSessionId,
    secondaryTerminalFocused: secondaryFocused,
  });

  // Textarea keyboard shortcuts
  const { templateDropdownOpen, setTemplateDropdownOpen } = useTextareaShortcuts({
    textareaVisible,
    setTextareaVisible,
    textareaRef,
    onSendContent: sendTextareaToTerminal,
    onToggleOrchestration: setAppendOrchestration,
    selectedTemplateId,
    onSelectTemplate: setSelectedTemplateId,
    onRestoreLastPrompt: setTextareaContent,
    secondaryTerminalFocused: secondaryFocused,
  });

  // Help keyboard shortcut
  useHelpShortcut({
    showHelp,
    setShowHelp,
    secondaryTerminalFocused: secondaryFocused,
  });

  // Bookmarks keyboard shortcut
  useBookmarksShortcut({
    bookmarksPaletteOpen,
    setBookmarksPaletteOpen,
    secondaryTerminalFocused: secondaryFocused,
  });

  // Clear folder expansion state when sidebar closes
  useEffect(() => {
    if (!sidebarOpen) {
      setExpandedFolders(new Set());
      setExpandedAnalysis(new Set());
      resetTypeChecker();
    }
  }, [sidebarOpen]);

  // Monitor terminal CWD changes
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebarOpen && fileWatchingEnabled);

  // Auto-uncheck orchestration if .orchestration/orchestration.md doesn't exist in project root
  // Also estimate token usage from all orchestration workflow files
  useEffect(() => {
    if (!detectedCwd) return;
    invoke('read_file_content', { path: `${detectedCwd}/.orchestration/orchestration.md` })
      .then(async (orchestrationContent) => {
        setAppendOrchestration(true);
        // Read all workflow files to estimate total token cost
        try {
          const entries = await invoke('read_directory_recursive', {
            path: `${detectedCwd}/.orchestration`,
            maxDepth: 5,
            maxFiles: 100
          });
          const mdFiles = entries.filter(e => e.name.endsWith('.md'));
          let totalChars = orchestrationContent.length;
          const contents = await Promise.all(
            mdFiles
              .filter(e => e.path !== `${detectedCwd}/.orchestration/orchestration.md`)
              .map(e => invoke('read_file_content', { path: e.path }).catch(() => ''))
          );
          totalChars += contents.reduce((sum, c) => sum + c.length, 0);
          // ~4 chars per token on average, orchestration.md is always sent + avg 1 workflow
          const avgWorkflowChars = contents.length > 0
            ? contents.reduce((sum, c) => sum + c.length, 0) / contents.length
            : 0;
          const estimatedTokens = Math.round((orchestrationContent.length + avgWorkflowChars) / 4);
          setOrchestrationTokenEstimate(estimatedTokens);
        } catch {
          setOrchestrationTokenEstimate(null);
        }
      })
      .catch(() => {
        setAppendOrchestration(false);
        setOrchestrationTokenEstimate(null);
      });
  }, [detectedCwd]);

  // Fetch data when sidebar opens (mode-specific)
  useEffect(() => {
    if (sidebarOpen) {
      if (viewMode === 'flat') {
        loadFolders();
      } else if (viewMode === 'tree') {
        loadTreeData();
      }
    }
  }, [sidebarOpen, viewMode]);

  // Auto-refresh sidebar when terminal session becomes available
  useEffect(() => {
    if (terminalSessionId && sidebarOpen && folders.length === 0) {
      loadFolders();
    }
  }, [terminalSessionId]);

  // Show initial project dialog when terminal is ready and bookmarks exist
  useEffect(() => {
    if (terminalSessionId && bookmarks.length > 0) {
      setInitialProjectDialogOpen(true);
    }
  }, [terminalSessionId]); // Only run once when session becomes available

  // Reload sidebar when terminal CWD changes (mode-specific)
  useEffect(() => {
    if (detectedCwd && sidebarOpen) {
      console.log('CWD changed, updating view');
      if (viewMode === 'flat') {
        loadFolders();
      } else if (viewMode === 'tree') {
        // For tree view, reload tree and clear search
        loadTreeData();
        setSearchQuery('');
        setSearchResults(null);
      }
    }
  }, [detectedCwd, viewMode]);

  // Extract @ mention from textarea content
  const extractAtMention = useCallback((text) => {
    if (viewMode !== 'tree') return null;
    const match = text.match(/@([^\s@]*)$/);
    return match ? match[1] : null;
  }, [viewMode]);

  // Handle textarea changes to detect @ mentions
  const handleTextareaChange = useCallback((newValue) => {
    setTextareaContent(newValue);
    const mention = extractAtMention(newValue);
    setAtMentionQuery(mention);
    // Reset selected index when query changes
    setAtMentionSelectedIndex(0);
  }, [extractAtMention]);

  // Sort results same as AtMentionModal: files first, dirs last
  const atMentionDisplayedResults = useMemo(() => {
    if (!atMentionResults) return [];
    const files = atMentionResults.filter(r => !r.is_dir);
    const dirs = atMentionResults.filter(r => r.is_dir);
    return [...files, ...dirs].slice(0, 12);
  }, [atMentionResults]);

  // Navigate @ mention modal (skip directories, only select files)
  const handleAtMentionNavigate = useCallback((direction) => {
    if (atMentionDisplayedResults.length === 0) return;

    setAtMentionSelectedIndex(prev => {
      let newIndex = prev;
      const maxIndex = atMentionDisplayedResults.length - 1;

      if (direction === 'up') {
        newIndex = prev > 0 ? prev - 1 : maxIndex;
      } else {
        newIndex = prev < maxIndex ? prev + 1 : 0;
      }

      // Skip directories
      let attempts = 0;
      while (atMentionDisplayedResults[newIndex]?.is_dir && attempts < atMentionDisplayedResults.length) {
        if (direction === 'up') {
          newIndex = newIndex > 0 ? newIndex - 1 : maxIndex;
        } else {
          newIndex = newIndex < maxIndex ? newIndex + 1 : 0;
        }
        attempts++;
      }

      if (attempts >= atMentionDisplayedResults.length) return prev;
      return newIndex;
    });
  }, [atMentionDisplayedResults]);

  // Select file from @ mention modal
  const handleAtMentionSelect = useCallback((filePath, isDirectory) => {
    if (!filePath) return;

    // Only allow selecting files, not directories
    if (isDirectory) {
      return;
    }

    // Add file to selection
    toggleFileSelection(filePath);

    // Remove @ mention from textarea
    const newContent = textareaContent.replace(/@[^\s@]*$/, '');
    setTextareaContent(newContent);
    setAtMentionQuery(null);
    setAtMentionSelectedIndex(0);

    // Focus back on textarea
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [toggleFileSelection, textareaContent]);

  // Close @ mention modal
  const handleAtMentionClose = useCallback(() => {
    setTextareaContent(prev => prev.replace(/@[^\s@]*$/, ''));
    setAtMentionQuery(null);
    setAtMentionSelectedIndex(0);
  }, []);

  // Search handler functions
  const handleSearchChange = useCallback((query) => {
    setSearchQuery(query);
    setAtMentionQuery(null); // Clear @ mention when manual search is used
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  const handleToggleGitFilter = useCallback(() => {
    setShowGitChangesOnly(prev => {
      const newValue = !prev;
      // When enabling git filter, expand all folders to show all changed files
      if (newValue && treeData.length > 0) {
        const allFolderPaths = new Set();
        const collectFolders = (nodes) => {
          nodes.forEach(node => {
            if (node.is_dir) {
              allFolderPaths.add(node.path);
              if (node.children) {
                collectFolders(node.children);
              }
            }
          });
        };
        collectFolders(treeData);
        setExpandedFolders(allFolderPaths);
      }
      return newValue;
    });
  }, [treeData]);

  

  // Memoized @ mention search function
  const performAtMentionSearch = useCallback((query) => {
    if (!query || query.trim() === '') {
      return null;
    }
    return search(query);
  }, [search]);

  // @ mention search effect (separate from sidebar search)
  useEffect(() => {
    if (atMentionQuery === null) {
      setAtMentionResults(null);
      return;
    }

    const timer = setTimeout(() => {
      const results = performAtMentionSearch(atMentionQuery);
      setAtMentionResults(results);
    }, 200); // 200ms debounce

    return () => clearTimeout(timer);
  }, [atMentionQuery, performAtMentionSearch]);

  // Reset selected index to first file when @ mention results change
  useEffect(() => {
    if (atMentionQuery !== null) {
      setAtMentionSelectedIndex(0);
    }
  }, [atMentionResults, atMentionQuery]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery || searchQuery.trim() === '') {
        setSearchResults(null);
        return;
      }

      const results = search(searchQuery);
      setSearchResults(results);

      // Auto-expand matching paths
      if (results && results.length > 0) {
        expandSearchResults(results);
      }
    }, 200); // 200ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  // Handle search focus from keyboard shortcut
  const handleSearchFocus = useCallback(() => {
    if (viewMode === 'tree' && sidebarOpen) {
      searchInputRef.current?.focus();
    }
  }, [viewMode, sidebarOpen]);

  // Close secondary terminal handler
  const closeSecondaryTerminal = useCallback(() => {
    if (secondarySessionId) {
      invoke('close_terminal', { sessionId: secondarySessionId }).catch(console.error);
      setSecondarySessionId(null);
    }
    setSecondaryVisible(false);
    setSecondaryFocused(false);
    setSecondaryKey(k => k + 1);
  }, [secondarySessionId]);

  // Keyboard shortcuts - for non-terminal focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+` to toggle secondary terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        e.stopPropagation();
        if (secondaryVisible) {
          closeSecondaryTerminal();
        } else {
          setSecondaryVisible(true);
        }
        return;
      }

      if (secondaryFocused) return;

      // Ctrl+F or Cmd+F to focus search in tree mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && viewMode === 'tree' && sidebarOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Ctrl+Shift+P to compact whole project
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        handleCompactProject();
      }

      // Note: Ctrl+G is handled in the terminal component's keyboard handler
      // to work both when terminal is focused and when sidebar is focused
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [viewMode, sidebarOpen, handleCompactProject, secondaryVisible, secondaryFocused, closeSecondaryTerminal]);

  const sendFileToTerminal = async (absolutePath) => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready');
      return;
    }

    try {
      const relativePath = getRelativePath(absolutePath, currentPath);
      const escapedPath = escapeShellPath(relativePath);
      const textToSend = `${escapedPath} `;

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: textToSend
      });

      console.log('Sent to terminal:', textToSend);

      // Focus terminal after sending path
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to send file to terminal:', absolutePath, error);
    }
  };


  // Tree filtering function for search
  const filterTreeBySearch = useCallback((nodes, matchingPaths) => {
    if (!matchingPaths || matchingPaths.length === 0) {
      return nodes;
    }

    const matchingSet = new Set(matchingPaths);
    const parentPathsSet = new Set();

    // Build set of all parent paths
    matchingPaths.forEach(path => {
      let currentPath = path;
      while (currentPath && currentPath !== '/') {
        const lastSlash = lastSepIndex(currentPath);
        if (lastSlash <= 0) break;
        currentPath = currentPath.substring(0, lastSlash);
        parentPathsSet.add(currentPath);
      }
    });

    const filterNodes = (nodes) => {
      return nodes
        .map(node => {
          const isMatch = matchingSet.has(node.path);
          const isParentOfMatch = parentPathsSet.has(node.path);

          if (!isMatch && !isParentOfMatch) {
            return null; // Filter out
          }

          let filteredChildren = node.children;
          if (node.children && Array.isArray(node.children)) {
            filteredChildren = filterNodes(node.children);
          }

          return { ...node, children: filteredChildren };
        })
        .filter(Boolean);
    };

    return filterNodes(nodes);
  }, []);

  // Auto-expand function for search results
  const expandSearchResults = useCallback((results) => {
    const pathsToExpand = new Set();

    // Expand all parent folders of matches
    results.forEach(result => {
      let currentPath = result.path;
      while (currentPath && currentPath !== '/') {
        const lastSlash = lastSepIndex(currentPath);
        if (lastSlash <= 0) break;
        currentPath = currentPath.substring(0, lastSlash);
        pathsToExpand.add(currentPath);
      }

      // Also expand matching folders themselves
      if (result.is_dir) {
        pathsToExpand.add(result.path);
      }
    });

    setExpandedFolders(pathsToExpand);
  }, []);

  const toggleFolder = (folderPath) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        // Collapse
        next.delete(folderPath);
      } else {
        // Expand
        next.add(folderPath);
      }
      return next;
    });
  };


  // Create filtered tree data for display (search filter only)
  const displayedTreeData = useMemo(() => {
    let filtered = treeData;

    // Apply search filter
    if (searchResults) {
      const matchingPaths = searchResults.map(r => r.path);
      filtered = filterTreeBySearch(filtered, matchingPaths);
    }

    return filtered;
  }, [treeData, searchResults]);

  // Memoize computed props to avoid new references every render
  const filesWithRelativePaths = useMemo(() => {
    return Array.from(selectedFiles).map(absPath => ({
      absolute: absPath,
      relative: getRelativePath(absPath, currentPath),
      name: basename(absPath)
    }));
  }, [selectedFiles, currentPath]);

  const filesForGroup = useMemo(() => {
    return Array.from(selectedFiles).map(absolutePath => ({
      relativePath: getRelativePath(absolutePath, currentPath),
      state: fileStates.get(absolutePath) || 'modify'
    }));
  }, [selectedFiles, fileStates, currentPath]);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className={isResizing ? 'select-none' : ''} style={{ height: '100%' }}>
      <Layout
        sidebar={
          sidebarOpen && (
            <>
              <Sidebar collapsible="none" className="border-e border-e-sketch m-0 p-1 shrink-0 overflow-hidden" style={{ height: '100%', display: 'flex', flexDirection: 'column', width: sidebarWidth }}>
                <SidebarContent style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <SidebarHeader
                    viewMode={viewMode}
                    currentPath={currentPath}
                    onNavigateParent={navigateToParent}
                    searchQuery={searchQuery}
                    onSearchChange={handleSearchChange}
                    onSearchClear={handleSearchClear}
                    showSearch={viewMode === 'tree'}
                    searchInputRef={searchInputRef}
                    showGitChangesOnly={showGitChangesOnly}
                    onToggleGitFilter={handleToggleGitFilter}
                    fileWatchingEnabled={fileWatchingEnabled}
                    onAddBookmark={() => setAddBookmarkDialogOpen(true)}
                    onNavigateBookmark={navigateToBookmark}
                    hasTerminalSession={!!terminalSessionId}
                    sandboxEnabled={sandboxEnabled}
                  />
                  <SidebarGroup style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <SidebarGroupContent className="p-1" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                      {viewMode === 'flat' ? (
                        <FlatViewMenu
                          folders={folders}
                          currentPath={currentPath}
                          onFolderClick={loadFolders}
                        />
                      ) : (
                        treeLoading ? (
                          <div className="p-4 text-center">
                            <div className="text-sm opacity-60">Loading directory tree...</div>
                          </div>
                        ) : (
                          <FileTree
                            nodes={displayedTreeData}
                            searchQuery={searchQuery}
                            expandedFolders={expandedFolders}
                            currentPath={currentPath}
                            showGitChangesOnly={showGitChangesOnly}
                            onToggle={toggleFolder}
                            onSendToTerminal={sendFileToTerminal}
                            onViewDiff={viewFileDiff}
                            selectedFiles={selectedFiles}
                            onToggleFileSelection={toggleFileSelection}
                            isTextareaPanelOpen={textareaVisible}
                            typeCheckResults={typeCheckResults}
                            checkingFiles={checkingFiles}
                            successfulChecks={successfulChecks}
                            onCheckFileTypes={checkFileTypes}
                            fileWatchingEnabled={fileWatchingEnabled}
                            onGitChanges={handleGitChanges}
                            onOpenElementPicker={handleOpenElementPicker}
                          />
                        )
                      )}
                    </SidebarGroupContent>
                  </SidebarGroup>
                  
                  {/* File Selection Panel */}
                  {selectedFiles.size > 0 && (
                    <SidebarFileSelection
                      filesWithRelativePaths={filesWithRelativePaths}
                      fileStates={fileStates}
                      onSetFileState={setFileState}
                      onRemoveFile={removeFileFromSelection}
                      onClearAllFiles={clearFileSelection}
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
              {/* Resize handle */}
              <div
                className={`w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-50 shrink-0 ${isResizing ? 'bg-primary/50' : ''}`}
                onMouseDown={handleResizeStart}
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
              selectedFiles={selectedFiles}
              currentPath={currentPath}
              keepFilesAfterSend={keepFilesAfterSend}
              onToggleKeepFiles={setKeepFilesAfterSend}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              onManageTemplates={() => setManageTemplatesDialogOpen(true)}
              appendOrchestration={appendOrchestration}
              onToggleOrchestration={setAppendOrchestration}
              orchestrationTokenEstimate={orchestrationTokenEstimate}
              templateDropdownOpen={templateDropdownOpen}
              onTemplateDropdownOpenChange={setTemplateDropdownOpen}
              tokenUsage={tokenUsage}
              projectPath={currentPath}
              onLoadGroup={handleLoadFileGroup}
              onSaveGroup={handleSaveFileGroup}
              onCompactProject={handleCompactProject}
              isCompacting={isCompacting}
              compactProgress={compactProgress}
              compactedProject={compactedProject}
              onClearCompactedProject={() => setCompactedProject(null)}
              onUpdateCompactedProject={setCompactedProject}
              selectedElements={selectedElements}
              onClearElements={clearSelectedElements}
              atMentionActive={atMentionQuery !== null}
              atMentionQuery={atMentionQuery || ''}
              atMentionResults={atMentionDisplayedResults}
              atMentionSelectedIndex={atMentionSelectedIndex}
              onAtMentionNavigate={handleAtMentionNavigate}
              onAtMentionSelect={handleAtMentionSelect}
              onAtMentionClose={handleAtMentionClose}
              fileStates={fileStates}
              onSetFileState={setFileState}
              onToggleFile={toggleFileSelection}
            />
          )
        }
        titleBar={showTitleBar && <TitleBar theme={theme.terminal} />}
        statusBar={
          <StatusBar
            viewMode={viewMode}
            currentPath={currentPath}
            sessionId={terminalSessionId}
            theme={theme.terminal}
            onToggleHelp={() => setShowHelp(prev => !prev)}
            onLaunchOrchestration={launchOrchestration}
            selectedCli={selectedCli}
            onOpenCliSettings={() => setCliSelectionModalOpen(true)}
            showTitleBar={showTitleBar}
            onToggleTitleBar={() => setShowTitleBar(prev => !prev)}
            sandboxEnabled={sandboxEnabled}
            sandboxFailed={sandboxFailed}
            networkIsolation={networkIsolation}
            onToggleNetworkIsolation={() => {
              setNetworkIsolation(prev => !prev);
              if (sandboxEnabled && terminalSessionId) {
                invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
                setTerminalSessionId(null);
                setSandboxFailed(false);
                setTerminalKey(k => k + 1);
              }
            }}
            secondaryTerminalFocused={secondaryFocused}
            onToggleSandbox={() => {
              setSandboxEnabled(prev => !prev);
              setSandboxFailed(false);
              if (terminalSessionId) {
                invoke('close_terminal', { sessionId: terminalSessionId }).catch(console.error);
              }
              setTerminalSessionId(null);
              setTerminalKey(k => k + 1);
            }}
          />
        }
        secondaryTerminal={
          secondaryVisible && (
            <>
              {/* Resize handle between primary and secondary */}
              <div
                className="w-1 cursor-col-resize hover:bg-primary/50 transition-colors z-50 shrink-0"
              />
              <SecondaryTerminal
                key={secondaryKey}
                ref={secondaryTerminalRef}
                theme={theme.terminal}
                visible={secondaryVisible}
                onClose={closeSecondaryTerminal}
                onFocusChange={setSecondaryFocused}
                onSessionReady={setSecondarySessionId}
              />
            </>
          )
        }
      >
        <Terminal
          key={terminalKey}
          ref={terminalRef}
          theme={theme.terminal}
          onSessionReady={(id) => setTerminalSessionId(id)}
          onSearchFocus={handleSearchFocus}
          onToggleGitFilter={handleToggleGitFilter}
          sandboxEnabled={sandboxEnabled}
          networkIsolation={networkIsolation}
          projectDir={currentPath}
          onSandboxFailed={() => setSandboxFailed(true)}
        />
        <GitDiffDialog
          open={diffDialogOpen}
          onOpenChange={setDiffDialogOpen}
          filePath={diffFilePath}
          repoPath={currentPath}
        />
      </Layout>
      <AddBookmarkDialog
        open={addBookmarkDialogOpen}
        onOpenChange={setAddBookmarkDialogOpen}
        currentPath={currentPath}
      />
      <BookmarksPalette
        open={bookmarksPaletteOpen}
        onOpenChange={setBookmarksPaletteOpen}
        onNavigate={navigateToBookmark}
      />
      <ManageTemplatesDialog
        open={manageTemplatesDialogOpen}
        onOpenChange={setManageTemplatesDialogOpen}
      />
      <SaveFileGroupDialog
        open={saveFileGroupDialogOpen}
        onOpenChange={setSaveFileGroupDialogOpen}
        projectPath={currentPath}
        files={filesForGroup}
      />
      <InitialProjectDialog
        open={initialProjectDialogOpen}
        onOpenChange={setInitialProjectDialogOpen}
        onNavigate={navigateToBookmark}
        onLaunchClaude={launchClaude}
        onSwitchToClaudeMode={switchToClaudeMode}
      />
      <CliSelectionModal
        open={cliSelectionModalOpen}
        onOpenChange={setCliSelectionModalOpen}
        selectedCli={selectedCli}
        onCliChange={setSelectedCli}
        cliAvailability={cliAvailability}
      />
      <KeyboardShortcutsDialog
        open={showHelp}
        onOpenChange={setShowHelp}
      />
      <CompactConfirmDialog
        open={compactConfirmOpen}
        onOpenChange={setCompactConfirmOpen}
        fileCount={pendingCompactResult?.fileCount || 0}
        tokenEstimate={pendingCompactResult?.tokenEstimate || 0}
        formattedTokens={pendingCompactResult?.formattedTokens || '0'}
        originalTokens={pendingCompactResult?.originalTokens || 0}
        formattedOriginalTokens={pendingCompactResult?.formattedOriginalTokens || '0'}
        compressionPercent={pendingCompactResult?.compressionPercent || 0}
        onConfirm={handleConfirmCompact}
        onCancel={handleCancelCompact}
      />
      <ElementPickerDialog
        open={elementPickerOpen}
        onOpenChange={setElementPickerOpen}
        filePath={elementPickerFilePath}
        currentPath={currentPath}
        onAddElements={handleAddElements}
      />
    </SidebarProvider>
  );
}

export default App;
