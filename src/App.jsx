import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { StatusBar } from "./components/StatusBar";
import { FileTree } from "./components/file-tree/file-tree";
import { SidebarHeader } from "./components/SidebarHeader";
import { FlatViewMenu } from "./components/FlatViewMenu";
import { useTheme } from "./contexts/ThemeContext";
import { invoke } from "@tauri-apps/api/core";
import { useCwdMonitor } from "./hooks/useCwdMonitor";
import { useFlatViewNavigation } from "./hooks/useFlatViewNavigation";
import { useViewModeShortcuts } from "./hooks/useViewModeShortcuts";
import { useTextareaShortcuts } from "./hooks/useTextareaShortcuts";
import { useFileSearch } from "./hooks/useFileSearch";
import { useHelpShortcut } from "./hooks/useHelpShortcut";
import { TextareaPanel } from "./components/textarea-panel/textarea-panel";
import { analyzeJSFile } from "./utils/fileAnalyzer";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState(null);

  // Ref to access terminal's imperative methods
  const terminalRef = useRef(null);

  // Ref for search input
  const searchInputRef = useRef(null);

  // Flat view navigation hook
  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);

  // Tree view state
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'tree'
  const [treeData, setTreeData] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // File analysis state
  const [analyzedFiles, setAnalyzedFiles] = useState(new Map());
  const [expandedAnalysis, setExpandedAnalysis] = useState(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [allFiles, setAllFiles] = useState([]); // Flat list for indexing

  // Git filter state
  const [showGitChangesOnly, setShowGitChangesOnly] = useState(false);

  // Loading state
  const [treeLoading, setTreeLoading] = useState(false);

  // Textarea state
  const [textareaVisible, setTextareaVisible] = useState(false);
  const [textareaContent, setTextareaContent] = useState('');
  const textareaRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [fileStates, setFileStates] = useState(new Map()); // Map<filePath, 'modify'|'do-not-modify'|'use-as-example'>
  const [keepFilesAfterSend, setKeepFilesAfterSend] = useState(false);

  // Help state
  const [showHelp, setShowHelp] = useState(false);

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
  const loadTreeData = async () => {
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
  };

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

  const setFileState = (filePath, state) => {
    setFileStates(prev => {
      const next = new Map(prev);
      next.set(filePath, state);
      return next;
    });
  };

  // Send textarea content to terminal
  const sendTextareaToTerminal = useCallback(async () => {
    if (!terminalSessionId) {
      return;
    }

    const hasTextContent = textareaContent?.trim();
    const hasFiles = selectedFiles.size > 0;

    if (!hasTextContent && !hasFiles) {
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

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: fullCommand
      });

      console.log('Sent to terminal:', fullCommand);

      // Focus terminal first
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }

      // Small delay to ensure content is processed, then send Enter
      setTimeout(async () => {
        try {
          await invoke('write_to_terminal', {
            sessionId: terminalSessionId,
            data: '\n'
          });
        } catch (error) {
          console.error('Failed to send Enter key:', error);
        }
      }, 50);

      // Clear textarea content (always)
      setTextareaContent('');

      // Clear file selection only if persistence is disabled
      if (!keepFilesAfterSend) {
        clearFileSelection();
      }
    } catch (error) {
      console.error('Failed to send to terminal:', error);
    }
  }, [terminalSessionId, textareaContent, selectedFiles, currentPath, fileStates, keepFilesAfterSend]);

  // Keyboard shortcuts hook
  useViewModeShortcuts({
    sidebarOpen,
    setSidebarOpen,
    viewMode,
    setViewMode,
    onLoadFlatView: loadFolders,
    onLoadTreeView: loadTreeData
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

  // Clear folder expansion state when sidebar closes
  useEffect(() => {
    if (!sidebarOpen) {
      setExpandedFolders(new Set());
      setExpandedAnalysis(new Set());
    }
  }, [sidebarOpen]);

  // Monitor terminal CWD changes
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebarOpen);

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
    setShowGitChangesOnly(prev => !prev);
  }, []);

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


  // File analysis functions
  const analyzeFile = async (filePath) => {
    // Check cache - if already analyzed, just toggle expansion
    if (analyzedFiles.has(filePath)) {
      toggleAnalysisExpansion(filePath);
      return;
    }

    try {
      // Fetch file content from backend
      const content = await invoke('read_file_content', { path: filePath });

      // Parse and analyze
      const analysis = analyzeJSFile(content, filePath);

      // Cache results
      setAnalyzedFiles(new Map(analyzedFiles).set(filePath, analysis));

      // Expand panel
      setExpandedAnalysis(new Set(expandedAnalysis).add(filePath));
    } catch (error) {
      console.error('Failed to analyze file:', filePath, error);
      // Store error state
      setAnalyzedFiles(new Map(analyzedFiles).set(filePath, { error: error.message }));
    }
  };

  const toggleAnalysisExpansion = (filePath) => {
    setExpandedAnalysis(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const sendAnalysisItemToTerminal = async (itemName, category) => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready');
      return;
    }

    try {
      // Format with category context
      const textToSend = category
        ? `${itemName} ${category} `
        : `${itemName} `;

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: textToSend
      });

      // Focus terminal after sending
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to send to terminal:', itemName, error);
    }
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
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={{ height: '100%' }}>
      <Layout
        sidebar={
          sidebarOpen && (
            <Sidebar collapsible="none" className="border-e m-0 p-1 max-w-[300px]" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                />
                <SidebarGroup style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <SidebarGroupContent className="p-1" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {viewMode === 'flat' ? (
                      <FlatViewMenu
                        folders={folders}
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
                          analyzedFiles={analyzedFiles}
                          expandedAnalysis={expandedAnalysis}
                          onAnalyzeFile={analyzeFile}
                          onToggleAnalysis={toggleAnalysisExpansion}
                          onSendAnalysisItem={sendAnalysisItemToTerminal}
                          selectedFiles={selectedFiles}
                          onToggleFileSelection={toggleFileSelection}
                          isTextareaPanelOpen={textareaVisible}
                        />
                      )
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
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
              onRemoveFile={removeFileFromSelection}
              onClearAllFiles={clearFileSelection}
              getRelativePath={getRelativePath}
              fileStates={fileStates}
              onSetFileState={setFileState}
              keepFilesAfterSend={keepFilesAfterSend}
              onToggleKeepFiles={setKeepFilesAfterSend}
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
    </SidebarProvider>
  );
}

export default App;
