import { useState, useEffect } from "react";
import { Terminal } from "./components/Terminal";
import { Layout } from "./components/Layout";
import { FileTree } from "./components/FileTree";
import { themes, loadTheme } from "./themes/themes";
import { invoke } from "@tauri-apps/api/core";
import { useCwdMonitor } from "./hooks/useCwdMonitor";
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
import { Folder, File, ChevronUp, ChevronRight, ChevronDown, Copy, X } from "lucide-react";

function App() {
  const currentTheme = loadTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [terminalSessionId, setTerminalSessionId] = useState(null);

  // Tree view state
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'tree'
  const [treeData, setTreeData] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFilePaths, setSelectedFilePaths] = useState([]);

  // Monitor terminal CWD changes
  const detectedCwd = useCwdMonitor(terminalSessionId, sidebarOpen);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();

        if (sidebarOpen && viewMode === 'flat') {
          // Flat view is open, close it
          setSidebarOpen(false);
        } else {
          // Open flat view (closes tree if open)
          setViewMode('flat');
          setSidebarOpen(true);
          loadFolders();
        }
      }

      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();

        if (sidebarOpen && viewMode === 'tree') {
          // Tree view is open, close it
          setSidebarOpen(false);
        } else {
          // Open tree view (closes flat if open)
          setViewMode('tree');
          setSidebarOpen(true);
          loadTreeData();
        }
      }

      // Alt+Enter to copy all selected files and paste to terminal
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        if (viewMode === 'tree' && selectedFilePaths.length > 0) {
          copyAllSelected(true); // true = auto-paste to terminal
        }
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [sidebarOpen, viewMode, selectedFilePaths]);

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

  const loadFolders = async (path) => {
    try {
      let targetPath = path;

      // If explicit path provided, navigate terminal FIRST
      if (path) {
        if (!terminalSessionId) {
          console.log('Terminal session not ready');
          setFolders([]);
          setCurrentPath('Waiting for terminal...');
          return;
        }

        // Send cd command to terminal and wait for it
        await navigateTerminalToPath(path);

        // Wait briefly for shell to process the cd command
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the terminal's actual CWD after navigation
        targetPath = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
        console.log('Terminal navigated to:', targetPath);
      } else {
        // No explicit path - sync to terminal's current CWD
        if (!terminalSessionId) {
          console.log('No terminal session yet');
          setFolders([]);
          setCurrentPath('Waiting for terminal...');
          return;
        }

        // Get terminal's actual CWD
        targetPath = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
        console.log('Terminal CWD:', targetPath);
      }

      // Now load files from the confirmed directory
      const directories = await invoke('read_directory', { path: targetPath });
      console.log('Loaded', directories.length, 'items from:', targetPath);

      setFolders(directories);
      setCurrentPath(targetPath);
    } catch (error) {
      console.error('Failed to load folders:', error);
      setFolders([]);
      setCurrentPath('Error loading directory');
    }
  };

  const navigateToParent = async () => {
    if (!currentPath || currentPath === '/') {
      return; // Already at root
    }

    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    await loadFolders(parentPath);
  };

  const navigateTerminalToPath = async (path) => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready, skipping terminal navigation');
      return;
    }

    try {
      // Escape path for shell safety (handle spaces and special characters)
      const safePath = `'${path.replace(/'/g, "'\\''")}'`;
      const command = `cd ${safePath}\n`;

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: command
      });
    } catch (error) {
      console.error('Failed to navigate terminal to path:', path, error);
      // Don't throw - sidebar update should succeed even if terminal navigation fails
    }
  };

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

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: create temporary textarea
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  };

  const toggleFileSelection = (filePath) => {
    setSelectedFilePaths(prev => {
      if (prev.includes(filePath)) {
        return prev.filter(path => path !== filePath);
      } else {
        return [...prev, filePath];
      }
    });
  };

  const clearSelections = () => {
    setSelectedFilePaths([]);
  };

  const copyAllSelected = async (autoPaste = false) => {
    if (selectedFilePaths.length === 0) return;

    // Convert absolute paths to relative paths
    const relativePaths = selectedFilePaths.map(absPath =>
      getRelativePath(absPath, currentPath)
    );

    // Join with spaces
    const pathsString = relativePaths.join(' ');

    // Copy to clipboard
    const success = await copyToClipboard(pathsString);

    if (success) {
      console.log('Copied paths:', pathsString);

      // Auto-paste to terminal if requested
      if (autoPaste && terminalSessionId) {
        try {
          await invoke('write_to_terminal', {
            sessionId: terminalSessionId,
            data: pathsString
          });
          console.log('Auto-pasted to terminal');
        } catch (error) {
          console.error('Failed to paste to terminal:', error);
        }
      }
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

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Layout
        sidebar={
          sidebarOpen && (
            <Sidebar collapsible="none" className="border-e m-2 p-2">
              <SidebarContent>
                {/* Mode Badge and Action Buttons */}
                <div style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '6px'
                }}>
                  <Badge variant={viewMode === 'tree' ? 'info' : 'success'}>
                    {viewMode === 'tree' ? 'CLAUDE MODE' : 'NAVIGATION MODE'}
                  </Badge>

                  {/* Show action buttons only in tree mode when files are selected */}
                  {viewMode === 'tree' && selectedFilePaths.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.65rem',
                        opacity: 0.7,
                        fontWeight: '500'
                      }}>
                        {selectedFilePaths.length} selected
                      </span>
                      <button
                        onClick={copyAllSelected}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          opacity: 0.7,
                          transition: 'opacity 0.2s',
                          borderRadius: '3px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '0.7';
                          e.currentTarget.style.background = 'none';
                        }}
                        title="Copy all selected paths"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={clearSelections}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          opacity: 0.7,
                          transition: 'opacity 0.2s',
                          borderRadius: '3px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1';
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '0.7';
                          e.currentTarget.style.background = 'none';
                        }}
                        title="Clear selections"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <SidebarGroup>
                  <SidebarGroupLabel>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 'normal', opacity: 0.7, flex: 1 }}>
                        {currentPath || 'No path'}
                      </div>
                      {currentPath && currentPath !== '/' && (
                        <button
                          onClick={navigateToParent}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: 0.7,
                          }}
                          title="Go to parent directory"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </SidebarGroupLabel>
                  <SidebarGroupContent className="p-1">
                    {viewMode === 'flat' ? (
                      <SidebarMenu>
                        {folders.length === 0 ? (
                          <div style={{ padding: '0.25rem', opacity: 0.5, fontSize: '0.7rem' }}>
                            No files or folders found
                          </div>
                        ) : (
                          folders.map((item) => (
                            <SidebarMenuItem key={item.path}>
                              <SidebarMenuButton
                                onClick={item.is_dir ? () => loadFolders(item.path) : undefined}
                                style={{
                                  cursor: item.is_dir ? 'pointer' : 'default',
                                  paddingLeft: '4px',
                                  paddingRight: '4px',
                                  paddingTop: '1px',
                                  paddingBottom: '1px',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {item.is_dir ? (
                                  <Folder className="w-3 h-3 mr-1.5" />
                                ) : (
                                  <File className="w-3 h-3 mr-1.5" />
                                )}
                                {item.name}
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))
                        )}
                      </SidebarMenu>
                    ) : (
                      <FileTree
                        nodes={treeData}
                        expandedFolders={expandedFolders}
                        currentPath={currentPath}
                        onToggle={toggleFolder}
                        selectedFiles={selectedFilePaths}
                        onToggleSelection={toggleFileSelection}
                      />
                    )}
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
          )
        }
      >
        <Terminal
          theme={themes[currentTheme]}
          onSessionReady={(id) => setTerminalSessionId(id)}
        />
      </Layout>
    </SidebarProvider>
  );
}

export default App;
