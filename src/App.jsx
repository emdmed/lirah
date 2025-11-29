import { useState, useEffect, useRef } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { StatusBar } from "./components/StatusBar";
import { FileTree } from "./components/FileTree";
import { SidebarHeader } from "./components/SidebarHeader";
import { FlatViewMenu } from "./components/FlatViewMenu";
import { themes, loadTheme } from "./themes/themes";
import { invoke } from "@tauri-apps/api/core";
import { useCwdMonitor } from "./hooks/useCwdMonitor";
import { useFlatViewNavigation } from "./hooks/useFlatViewNavigation";
import { useViewModeShortcuts } from "./hooks/useViewModeShortcuts";
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
  const currentTheme = loadTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState(null);

  // Ref to access terminal's imperative methods
  const terminalRef = useRef(null);

  // Flat view navigation hook
  const { folders, currentPath, setCurrentPath, loadFolders, navigateToParent } = useFlatViewNavigation(terminalSessionId);

  // Tree view state
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'tree'
  const [treeData, setTreeData] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  // File analysis state
  const [analyzedFiles, setAnalyzedFiles] = useState(new Map());
  const [expandedAnalysis, setExpandedAnalysis] = useState(new Set());

  // Tree view helper functions (defined early for use in hooks)
  const loadTreeData = async () => {
    try {
      if (!terminalSessionId) {
        console.log('Terminal session not ready');
        setTreeData([]);
        setCurrentPath('Waiting for terminal...');
        return;
      }

      // Get terminal's current CWD
      const cwd = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
      console.log('Loading tree from CWD:', cwd);

      // Load top-level items
      const entries = await invoke('read_directory', { path: cwd });
      console.log('Loaded', entries.length, 'items for tree');

      // Convert to tree nodes
      const treeNodes = entries.map(item => ({
        ...item,
        children: item.is_dir ? null : undefined, // null = not loaded, undefined = not a directory
        depth: 0
      }));

      setTreeData(treeNodes);
      setCurrentPath(cwd);
    } catch (error) {
      console.error('Failed to load tree data:', error);
      setTreeData([]);
      setCurrentPath('Error loading directory');
    }
  };

  // Keyboard shortcuts hook
  useViewModeShortcuts({
    sidebarOpen,
    setSidebarOpen,
    viewMode,
    setViewMode,
    onLoadFlatView: loadFolders,
    onLoadTreeView: loadTreeData
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
        // For tree view, expand to the new CWD path
        expandToPath(detectedCwd);
        // Also update currentPath
        setCurrentPath(detectedCwd);
      }
    }
  }, [detectedCwd, viewMode]);

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

  // Tree view helper functions
  const findNodeInTree = (tree, targetPath) => {
    for (const node of tree) {
      if (node.path === targetPath) {
        return node;
      }
      if (node.children && Array.isArray(node.children)) {
        const found = findNodeInTree(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const updateTreeNode = (tree, parentPath, newChildren) => {
    return tree.map(node => {
      if (node.path === parentPath) {
        // Found the parent node - update its children
        return {
          ...node,
          children: newChildren.map(child => ({
            ...child,
            children: child.is_dir ? null : undefined, // null = not loaded, undefined = not a directory
            depth: (node.depth || 0) + 1
          }))
        };
      }
      if (node.children && Array.isArray(node.children)) {
        // Recursively search in children
        return {
          ...node,
          children: updateTreeNode(node.children, parentPath, newChildren)
        };
      }
      return node;
    });
  };

  const loadTreeChildren = async (parentPath) => {
    try {
      const entries = await invoke('read_directory', { path: parentPath });
      console.log('Loaded', entries.length, 'children for:', parentPath);

      // Update tree data with new children
      setTreeData(prevTree => updateTreeNode(prevTree, parentPath, entries));
    } catch (error) {
      console.error('Failed to load tree children for', parentPath, error);
    }
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

        // Lazy load children if not already loaded
        const node = findNodeInTree(treeData, folderPath);
        if (node && node.children === null) {
          loadTreeChildren(folderPath);
        }
      }
      return next;
    });
  };

  const expandToPath = async (targetPath) => {
    if (!targetPath || targetPath === '/') return;

    try {
      // Split path into segments
      const segments = targetPath.split('/').filter(Boolean);

      // Build paths to expand: /home, /home/user, /home/user/project, etc.
      let currentSegmentPath = '';
      const pathsToExpand = [];

      for (const segment of segments) {
        currentSegmentPath += '/' + segment;
        pathsToExpand.push(currentSegmentPath);
      }

      // Expand each path in sequence
      for (const pathToExpand of pathsToExpand) {
        // Add to expanded set
        setExpandedFolders(prev => new Set(prev).add(pathToExpand));

        // Load children if not already loaded
        const node = findNodeInTree(treeData, pathToExpand);
        if (node && node.children === null) {
          await loadTreeChildren(pathToExpand);
          // Wait a bit for state to update before continuing
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      console.log('Expanded tree to:', targetPath);
    } catch (error) {
      console.error('Failed to expand to path:', targetPath, error);
    }
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
                />
                <SidebarGroup style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <SidebarGroupContent className="p-1" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {viewMode === 'flat' ? (
                      <FlatViewMenu
                        folders={folders}
                        onFolderClick={loadFolders}
                      />
                    ) : (
                      <FileTree
                        nodes={treeData}
                        expandedFolders={expandedFolders}
                        currentPath={currentPath}
                        onToggle={toggleFolder}
                        onSendToTerminal={sendFileToTerminal}
                        analyzedFiles={analyzedFiles}
                        expandedAnalysis={expandedAnalysis}
                        onAnalyzeFile={analyzeFile}
                        onToggleAnalysis={toggleAnalysisExpansion}
                        onSendAnalysisItem={sendAnalysisItemToTerminal}
                      />
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
          )
        }
        statusBar={
          <StatusBar
            viewMode={viewMode}
            currentPath={currentPath}
            sessionId={terminalSessionId}
            theme={themes[currentTheme]}
          />
        }
      >
        <Terminal
          ref={terminalRef}
          theme={themes[currentTheme]}
          onSessionReady={(id) => setTerminalSessionId(id)}
        />
      </Layout>
    </SidebarProvider>
  );
}

export default App;
