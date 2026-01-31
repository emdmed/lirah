import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { StatusBar } from "./components/StatusBar";
import { FileTree } from "./components/file-tree/file-tree";
import { SidebarHeader } from "./components/SidebarHeader";
import { FlatViewMenu } from "./components/FlatViewMenu";
import { AddBookmarkDialog } from "./components/AddBookmarkDialog";
import { BookmarksPalette } from "./components/BookmarksPalette";
import { InitialProjectDialog } from "./components/InitialProjectDialog";
import { ManageTemplatesDialog } from "./components/ManageTemplatesDialog";
import { GitDiffDialog } from "./components/GitDiffDialog";
import { CliSelectionModal } from "./components/CliSelectionModal";
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

  // Tree view state
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'tree'
  const [treeData, setTreeData] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [allFiles, setAllFiles] = useState([]); // Flat list for indexing

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

  // Type check state
  const [typeCheckResults, setTypeCheckResults] = useState(new Map());
  const [checkingFiles, setCheckingFiles] = useState(new Set());
  const [successfulChecks, setSuccessfulChecks] = useState(new Set()); // Files that passed (no errors)

  // Git diff dialog state
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffFilePath, setDiffFilePath] = useState(null);

  // CLI selection state (lazy init from localStorage to avoid race condition)
  const [selectedCli, setSelectedCli] = useState(() => {
    try {
      return localStorage.getItem('nevo-terminal:selected-cli') || 'claude-code';
    } catch {
      return 'claude-code';
    }
  });
  const [cliSelectionModalOpen, setCliSelectionModalOpen] = useState(false);

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

  // Search hook
  const { initializeSearch, search, clearSearch } = useFileSearch();

  // Claude launcher hook
  const { launchClaude, cliAvailability } = useClaudeLauncher(terminalSessionId, terminalRef, selectedCli);

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
        data: 'npx claude-orchestration\n'
      });

      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to launch orchestration:', error);
    }
  }, [terminalSessionId]);

  // Helper function to build tree from flat list
  const buildTreeFromFlatList = (flatList, rootPath) => {
    const nodeMap = new Map();

    // Initialize all nodes
    flatList.forEach(entry => {
      nodeMap.set(entry.path, {
        ...entry,
        children: entry.is_dir ? [] : undefined,
        depth: entry.depth
      });
    });

    const rootNodes = [];

    // Build parent-child relationships
    flatList.forEach(entry => {
      const node = nodeMap.get(entry.path);

      if (entry.parent_path === rootPath || !entry.parent_path) {
        rootNodes.push(node);
      } else {
        const parent = nodeMap.get(entry.parent_path);
        if (parent && parent.children) {
          parent.children.push(node);
        }
      }
    });

    // Sort recursively: folders first, alphabetically
    const sortChildren = (nodes) => {
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          sortChildren(node.children);
        }
      });
      nodes.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    };

    sortChildren(rootNodes);
    return rootNodes;
  };

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
  const toggleFileSelection = (filePath) => {
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
      } else {
        // Adding file
        next.add(filePath);
        // Set default state to 'modify'
        setFileStates(prevStates => {
          const nextStates = new Map(prevStates);
          nextStates.set(filePath, 'modify');
          return nextStates;
        });
      }
      return next;
    });
  };

  const removeFileFromSelection = (filePath) => {
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
  };

  const clearFileSelection = () => {
    setSelectedFiles(new Set());
    setFileStates(new Map());
  };

  // View git diff for a file
  const viewFileDiff = useCallback((filePath) => {
    setDiffFilePath(filePath);
    setDiffDialogOpen(true);
  }, []);

  const setFileState = (filePath, state) => {
    setFileStates(prev => {
      const next = new Map(prev);
      next.set(filePath, state);
      return next;
    });
  };

  // Incremental tree update to prevent flickering
  const incrementallyUpdateTree = useCallback((changes, rootPath) => {
    console.log('[incrementallyUpdateTree] Called with rootPath:', rootPath, 'changes:', changes);
    setTreeData(prevTreeData => {
      let newData = [...prevTreeData];
      console.log('[incrementallyUpdateTree] prevTreeData length:', prevTreeData.length);

      // Add new untracked files to the tree
      changes.newUntracked.forEach(({ path: filePath, stats }) => {
        const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
        const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
        console.log('[incrementallyUpdateTree] Processing:', filePath, 'parentPath:', parentPath);

        // Check if file already exists in tree
        const fileExistsInTree = (nodes) => {
          for (const node of nodes) {
            if (node.path === filePath) return true;
            if (node.children && fileExistsInTree(node.children)) return true;
          }
          return false;
        };

        if (fileExistsInTree(newData)) {
          console.log('[incrementallyUpdateTree] File already exists in tree, skipping:', filePath);
          return; // Already in tree
        }

        // Root-level file: parentPath equals the tree root
        if (parentPath === rootPath) {
          console.log('[incrementallyUpdateTree] Adding root-level file:', fileName);
          newData = [...newData, {
            name: fileName,
            path: filePath,
            is_dir: false,
            depth: 0,
            parent_path: parentPath
          }];
          // Sort: folders first, then files alphabetically
          newData.sort((a, b) => {
            if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          });
          return;
        }

        // Find and update the parent node for nested files
        console.log('[incrementallyUpdateTree] Looking for parent node:', parentPath);
        const updateNode = (nodes) => {
          return nodes.map(node => {
            if (node.path === parentPath) {
              console.log('[incrementallyUpdateTree] Found parent, adding file:', fileName);
              const newNode = { ...node };
              if (!newNode.children) {
                newNode.children = [];
              }
              // Add new file if not already present
              if (!newNode.children.some(child => child.path === filePath)) {
                newNode.children.push({
                  name: fileName,
                  path: filePath,
                  is_dir: false,
                  depth: node.depth + 1,
                  parent_path: parentPath
                });
                // Sort children: folders first, then files alphabetically
                newNode.children.sort((a, b) => {
                  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
                  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });
              }
              return newNode;
            } else if (node.children) {
              return { ...node, children: updateNode(node.children) };
            }
            return node;
          });
        };

        newData = updateNode(newData);
      });

      console.log('[incrementallyUpdateTree] Final newData length:', newData.length);
      return newData;
    });
  }, []);

  // Handle git changes with incremental updates to prevent flickering
  const handleGitChanges = useCallback((changes) => {
    console.log('[handleGitChanges] Called with:', changes);
    // For new untracked files only - use incremental update
    if (changes.newUntracked.length > 0 && !changes.newDeleted.length && !changes.noLongerUntracked.length) {
      console.log('[handleGitChanges] Adding new untracked files to tree:', changes.newUntracked, 'rootPath:', currentPath);
      incrementallyUpdateTree(changes, currentPath);
    } else if (changes.hasChanges) {
      console.log('[handleGitChanges] Complex git changes detected, refreshing tree:', changes);
      loadTreeData();
    }
  }, [incrementallyUpdateTree, loadTreeData, currentPath]);

  // Navigate to bookmark
  const navigateToBookmark = useCallback(async (bookmark) => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready');
      return;
    }

    try {
      // Shell escape the path
      const safePath = `'${bookmark.path.replace(/'/g, "'\\''")}'`;
      const command = `cd ${safePath}\n`;

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
  const sendTextareaToTerminal = useCallback(async () => {
    if (!terminalSessionId) {
      return;
    }

    const hasTextContent = textareaContent?.trim();
    const hasFiles = selectedFiles.size > 0;
    const hasTemplate = !!selectedTemplateId;

    if (!hasTextContent && !hasFiles && !hasTemplate) {
      return;
    }

    try {
      let fullCommand = '';

      if (hasTextContent) {
        fullCommand = textareaContent;
      }

      if (hasFiles) {
        const fileArray = Array.from(selectedFiles);

        // Group files by state
        const modifyFiles = [];
        const doNotModifyFiles = [];
        const exampleFiles = [];

        fileArray.forEach(absolutePath => {
          const relativePath = getRelativePath(absolutePath, currentPath);
          const escapedPath = escapeShellPath(relativePath);
          const state = fileStates.get(absolutePath) || 'modify';

          if (state === 'modify') {
            modifyFiles.push(escapedPath);
          } else if (state === 'do-not-modify') {
            doNotModifyFiles.push(escapedPath);
          } else if (state === 'use-as-example') {
            exampleFiles.push(escapedPath);
          }
        });

        // Build structured format
        const sections = [];

        if (modifyFiles.length > 0) {
          sections.push(`MODIFY: ${modifyFiles.join(' ')}`);
        }
        if (doNotModifyFiles.length > 0) {
          sections.push(`DO_NOT_MODIFY: ${doNotModifyFiles.join(' ')}`);
        }
        if (exampleFiles.length > 0) {
          sections.push(`USE_AS_EXAMPLE: ${exampleFiles.join(' ')}`);
        }

        const filesString = sections.join(' ');

        if (hasTextContent) {
          fullCommand = `${textareaContent} ${filesString}`;
        } else {
          fullCommand = filesString;
        }
      }

      // Append selected template content if any
      if (selectedTemplateId) {
        const template = getTemplateById(selectedTemplateId);
        if (template) {
          const separator = fullCommand.trim() ? '\n\n' : '';
          fullCommand = fullCommand + separator + template.content;
        }
      }

      // Append orchestration prompt if checkbox is checked
      if (appendOrchestration) {
        const separator = fullCommand.trim() ? '\n\n' : '';
        fullCommand = fullCommand + separator + 'Read and follow .claude/orchestration.md';
      }

      // Send text content first
      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: fullCommand
      });

      // Small delay then send Enter (carriage return) to submit
      setTimeout(async () => {
        try {
          await invoke('write_to_terminal', {
            sessionId: terminalSessionId,
            data: '\r'
          });
        } catch (error) {
          console.error('Failed to send Enter:', error);
        }
      }, 100);

      console.log('Sent to terminal:', fullCommand);

      // Focus terminal
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }

      // Clear textarea content (always)
      setTextareaContent('');

      // Clear file selection only if persistence is disabled
      if (!keepFilesAfterSend) {
        clearFileSelection();
      }
    } catch (error) {
      console.error('Failed to send to terminal:', error);
    }
  }, [terminalSessionId, textareaContent, selectedFiles, currentPath, fileStates, keepFilesAfterSend, selectedTemplateId, getTemplateById, appendOrchestration]);

  // Keyboard shortcuts hook
  useViewModeShortcuts({
    sidebarOpen,
    setSidebarOpen,
    viewMode,
    setViewMode,
    onLoadFlatView: loadFolders,
    onLoadTreeView: loadTreeData,
    onLaunchClaude: launchClaude,
    terminalSessionId
  });

  // Textarea keyboard shortcuts
  useTextareaShortcuts({
    textareaVisible,
    setTextareaVisible,
    textareaRef,
    onSendContent: sendTextareaToTerminal,
  });

  // Help keyboard shortcut
  useHelpShortcut({
    showHelp,
    setShowHelp,
  });

  // Bookmarks keyboard shortcut
  useBookmarksShortcut({
    bookmarksPaletteOpen,
    setBookmarksPaletteOpen,
  });

  // Clear folder expansion state when sidebar closes
  useEffect(() => {
    if (!sidebarOpen) {
      setExpandedFolders(new Set());
      setExpandedAnalysis(new Set());
      setTypeCheckResults(new Map());
      setCheckingFiles(new Set());
      setSuccessfulChecks(new Set());
    }
  }, [sidebarOpen]);

  // Monitor terminal CWD changes
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebarOpen && fileWatchingEnabled);

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

  // Search handler functions
  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

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

  // Keyboard shortcuts - for non-terminal focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+F or Cmd+F to focus search in tree mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && viewMode === 'tree' && sidebarOpen) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Note: Ctrl+G is handled in the terminal component's keyboard handler
      // to work both when terminal is focused and when sidebar is focused
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, sidebarOpen]);

  // Helper functions for multi-file copy
  const getRelativePath = (absolutePath, cwdPath) => {
    const normalizedCwd = cwdPath.endsWith('/') ? cwdPath.slice(0, -1) : cwdPath;
    const normalizedFile = absolutePath.endsWith('/') ? absolutePath.slice(0, -1) : absolutePath;

    if (normalizedFile.startsWith(normalizedCwd + '/')) {
      return normalizedFile.slice(normalizedCwd.length + 1);
    }

    if (normalizedFile === normalizedCwd) {
      return '.';
    }

    return absolutePath;
  };

  const escapeShellPath = (path) => {
    // Single quotes preserve all special characters except single quote itself
    // To include a single quote: 'path'\''s name'
    return `'${path.replace(/'/g, "'\\''")}'`;
  };

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
  const filterTreeBySearch = (nodes, matchingPaths) => {
    if (!matchingPaths || matchingPaths.length === 0) {
      return nodes;
    }

    const matchingSet = new Set(matchingPaths);
    const parentPathsSet = new Set();

    // Build set of all parent paths
    matchingPaths.forEach(path => {
      let currentPath = path;
      while (currentPath && currentPath !== '/') {
        const lastSlash = currentPath.lastIndexOf('/');
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
  };

  // Auto-expand function for search results
  const expandSearchResults = (results) => {
    const pathsToExpand = new Set();

    // Expand all parent folders of matches
    results.forEach(result => {
      let currentPath = result.path;
      while (currentPath && currentPath !== '/') {
        const lastSlash = currentPath.lastIndexOf('/');
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
  };

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


  // Type check functions
  const checkFileTypes = async (filePath) => {
    if (checkingFiles.has(filePath)) {
      return; // Prevent duplicate checks
    }

    console.log('🔍 Starting type check for:', filePath);
    setCheckingFiles(prev => new Set(prev).add(filePath));

    try {
      const result = await invoke('check_file_types', {
        filePath: filePath,
        projectRoot: currentPath
      });

      console.log('✅ Type check result:', result);
      setTypeCheckResults(prev => new Map(prev).set(filePath, result));

      // Open textarea and append errors if there are any
      if (result.error_count > 0 || result.warning_count > 0) {
        console.log(`⚠️ Found ${result.error_count} errors and ${result.warning_count} warnings`);
        setTextareaVisible(true);

        const errorText = formatTypeCheckErrors(result);
        setTextareaContent(prev => {
          const separator = prev.trim() ? '\n\n---\n\n' : '';
          return prev + separator + errorText;
        });
      } else {
        console.log('✨ No errors found! Showing green button for 3 seconds');
        // Success case - no errors! Only show visual feedback (green button)
        setSuccessfulChecks(prev => new Set(prev).add(filePath));

        // Clear success state after 3 seconds
        setTimeout(() => {
          setSuccessfulChecks(prev => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });
        }, 3000);
      }
    } catch (error) {
      console.error('❌ Type check failed:', filePath, error);

      setTextareaVisible(true);
      const errorMsg = `Type check failed for ${filePath}:\n${error}`;
      setTextareaContent(prev => {
        const separator = prev.trim() ? '\n\n---\n\n' : '';
        return prev + separator + errorMsg;
      });
    } finally {
      setCheckingFiles(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    }
  };

  const formatTypeCheckErrors = (result) => {
    const lines = [];

    lines.push(`Type Check Results: ${result.file_path}`);
    lines.push(`Errors: ${result.error_count}, Warnings: ${result.warning_count}`);
    lines.push(`Duration: ${result.execution_time_ms}ms`);
    lines.push('');

    const errors = result.errors.filter(e => e.severity === 'error');
    const warnings = result.errors.filter(e => e.severity === 'warning');

    if (errors.length > 0) {
      lines.push('ERRORS:');
      errors.forEach(err => {
        lines.push(`  Line ${err.line}, Col ${err.column}: ${err.code}`);
        lines.push(`    ${err.message}`);
      });
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push('WARNINGS:');
      warnings.forEach(warn => {
        lines.push(`  Line ${warn.line}, Col ${warn.column}: ${warn.code}`);
        lines.push(`    ${warn.message}`);
      });
    }

    return lines.join('\n');
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
                          />
                        )
                      )}
                    </SidebarGroupContent>
                  </SidebarGroup>
                  
                  {/* File Selection Panel */}
                  {selectedFiles.size > 0 && (
                    <SidebarFileSelection
                      filesWithRelativePaths={Array.from(selectedFiles || new Set()).map(absPath => ({
                        absolute: absPath,
                        relative: getRelativePath(absPath, currentPath),
                        name: absPath.split('/').pop()
                      }))}
                      fileStates={fileStates}
                      onSetFileState={setFileState}
                      onRemoveFile={removeFileFromSelection}
                      onClearAllFiles={clearFileSelection}
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
              onChange={setTextareaContent}
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
            />
          )
        }
        statusBar={
          <StatusBar
            viewMode={viewMode}
            currentPath={currentPath}
            sessionId={terminalSessionId}
            theme={theme.terminal}
            showHelp={showHelp}
            onToggleHelp={() => setShowHelp(prev => !prev)}
            onLaunchOrchestration={launchOrchestration}
            selectedCli={selectedCli}
            onOpenCliSettings={() => setCliSelectionModalOpen(true)}
          />
        }
      >
        <Terminal
          ref={terminalRef}
          theme={theme.terminal}
          onSessionReady={(id) => setTerminalSessionId(id)}
          onSearchFocus={handleSearchFocus}
          onToggleGitFilter={handleToggleGitFilter}
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
      <GitDiffDialog
        open={diffDialogOpen}
        onOpenChange={setDiffDialogOpen}
        filePath={diffFilePath}
        repoPath={currentPath}
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
    </SidebarProvider>
  );
}

export default App;
