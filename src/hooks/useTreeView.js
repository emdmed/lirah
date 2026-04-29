import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buildTreeFromFlatList, incrementallyUpdateTree } from "../utils/treeOperations";
import { lastSepIndex } from "../utils/pathUtils";
import { useToast } from "../features/toast";
import { useWatcher } from "../features/watcher/WatcherContext";

/**
 * Custom hook to debounce a value
 * @template T
 * @param {T} value - The value to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {T} The debounced value
 */
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useTreeView({ terminalSessionId, setCurrentPath, initializeSearch, searchResults }) {
  const [treeData, setTreeData] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [showGitChangesOnly, setShowGitChangesOnly] = useState(false);
  const [showMarkdownOnly, setShowMarkdownOnly] = useState(false);
  const [allFiles, setAllFiles] = useState([]);
  const projectRootRef = useRef(null);
  const { error } = useToast();
  const { fileWatchingEnabled } = useWatcher();

  // Debounce search results to prevent expensive tree filtering on every keystroke
  const debouncedSearchResults = useDebounce(searchResults, 150);

  const loadTreeData = useCallback(async () => {
    try {
      if (!terminalSessionId) {
        setTreeData([]);
        setCurrentPath('Waiting for terminal...');
        return;
      }
      setTreeLoading(true);
      let cwd;
      if (projectRootRef.current) {
        cwd = projectRootRef.current;
      } else {
        cwd = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
        projectRootRef.current = cwd;
      }
      const allEntries = await invoke('read_directory_recursive', {
        path: cwd, maxDepth: 10, maxFiles: 10000
      });
      const treeNodes = buildTreeFromFlatList(allEntries, cwd);
      setTreeData(treeNodes);
      setCurrentPath(cwd);
      setAllFiles(allEntries);
      setTreeLoading(false);
      setWatchPath(cwd);
      initializeSearch(allEntries);
    } catch (err) {
      console.error('Failed to load tree data:', err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      setTreeData([]);
      setCurrentPath('Error loading directory');
      setTreeLoading(false);
      error(`Failed to load directory tree: ${errorMessage}`, {
        duration: 8000,
        action: {
          label: 'Retry',
          onClick: () => {
            loadTreeData();
          }
        }
      });
    }
  }, [terminalSessionId, setCurrentPath, initializeSearch]);

  // Track project root for fs watcher (set after first loadTreeData)
  const [watchPath, setWatchPath] = useState(null);

  // Remove a deleted file/directory from the tree
  const removeDeletedFromTree = useCallback((nodes, deletedPaths) => {
    const deletedSet = new Set(deletedPaths);
    const filterNodes = (nodeList) =>
      nodeList
        .filter(node => !deletedSet.has(node.path))
        .map(node => {
          if (node.children) {
            return { ...node, children: filterNodes(node.children) };
          }
          return node;
        });
    return filterNodes(nodes);
  }, []);

  // Start native FS watcher and listen for create/delete events
  useEffect(() => {
    if (!watchPath || !fileWatchingEnabled) return;

    let unlisten;
    let stopped = false;

    const setup = async () => {
      try {
        await invoke('start_fs_watcher', { path: watchPath });
        unlisten = await listen('fs-changes', (event) => {
          if (stopped) return;
          const { created, deleted, root_path } = event.payload || {};
          // Only process events for our watched path
          if (root_path && root_path !== watchPath) return;
          const hasCreated = created && created.length > 0;
          const hasDeleted = deleted && deleted.length > 0;

          // If the payload is empty or missing, fall back to full reload
          if (!hasCreated && !hasDeleted) {
            loadTreeData();
            return;
          }

          // Handle deletions — filter them out of the tree
          if (hasDeleted) {
            setTreeData(prev => removeDeletedFromTree(prev, deleted));
            // Also remove from allFiles and update search index
            setAllFiles(prev => {
              const deletedSet = new Set(deleted);
              const updated = prev.filter(f => !deletedSet.has(f.path));
              initializeSearch(updated);
              return updated;
            });
          }

          // Handle creations — add new nodes incrementally
          if (hasCreated) {
            const changes = {
              newUntracked: created.map(p => ({ path: p })),
            };
            setTreeData(prev => incrementallyUpdateTree(prev, changes, watchPath));
            // Also add to allFiles and update search index
            setAllFiles(prev => {
              const existingPaths = new Set(prev.map(f => f.path));
              const newEntries = created
                .filter(p => !existingPaths.has(p))
                .map(p => {
                  const lastSep = p.lastIndexOf('/');
                  return {
                    name: p.substring(lastSep + 1),
                    path: p,
                    is_dir: false,
                    parent_path: p.substring(0, lastSep),
                  };
                });
              if (newEntries.length > 0) {
                const updated = [...prev, ...newEntries];
                initializeSearch(updated);
                return updated;
              }
              return prev;
            });
          }
        });
      } catch (err) {
        console.warn('[useTreeView] Failed to start fs watcher:', err);
      }
    };

    setup();

    return () => {
      stopped = true;
      if (unlisten) unlisten();
      invoke('stop_fs_watcher', { path: watchPath }).catch(() => {});
    };
  }, [watchPath, fileWatchingEnabled, loadTreeData, removeDeletedFromTree, initializeSearch]);

  const handleIncrementalUpdate = useCallback((changes, rootPath) => {
    setTreeData(prev => incrementallyUpdateTree(prev, changes, rootPath));

    // Update allFiles and search index with new untracked files
    if (changes.newUntracked.length > 0) {
      setAllFiles(prev => {
        const existingPaths = new Set(prev.map(f => f.path));
        const newEntries = changes.newUntracked
          .filter(({ path }) => !existingPaths.has(path))
          .map(({ path }) => {
            const lastSep = path.lastIndexOf('/');
            return {
              name: path.substring(lastSep + 1),
              path,
              is_dir: false,
              parent_path: path.substring(0, lastSep),
            };
          });
        if (newEntries.length > 0) {
          const updated = [...prev, ...newEntries];
          initializeSearch(updated);
          return updated;
        }
        return prev;
      });
    }
  }, [initializeSearch]);

  const handleGitChanges = useCallback((changes) => {
    if (changes.newUntracked.length > 0 && !changes.newDeleted.length && !changes.noLongerUntracked.length) {
      // currentPath not available here, passed via caller
    } else if (changes.hasChanges) {
      loadTreeData();
    }
  }, [loadTreeData]);

  const toggleFolder = useCallback((folderPath) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, []);

  const filterTreeBySearch = useCallback((nodes, matchingPaths) => {
    if (!matchingPaths || matchingPaths.length === 0) return nodes;
    const matchingSet = new Set(matchingPaths);
    const parentPathsSet = new Set();
    matchingPaths.forEach(path => {
      let current = path;
      while (current && current !== '/') {
        const lastSlash = lastSepIndex(current);
        if (lastSlash <= 0) break;
        current = current.substring(0, lastSlash);
        parentPathsSet.add(current);
      }
    });
    const filterNodes = (nodes) => {
      return nodes
        .map(node => {
          const isMatch = matchingSet.has(node.path);
          const isParent = parentPathsSet.has(node.path);
          if (!isMatch && !isParent) return null;
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

  const expandSearchResults = useCallback((results) => {
    const pathsToExpand = new Set();
    results.forEach(result => {
      let current = result.path;
      while (current && current !== '/') {
        const lastSlash = lastSepIndex(current);
        if (lastSlash <= 0) break;
        current = current.substring(0, lastSlash);
        pathsToExpand.add(current);
      }
      if (result.is_dir) pathsToExpand.add(result.path);
    });
    setExpandedFolders(pathsToExpand);
  }, []);

  const expandAllFolders = useCallback(() => {
    if (treeData.length > 0) {
      const allFolderPaths = new Set();
      const collectFolders = (nodes) => {
        nodes.forEach(node => {
          if (node.is_dir) {
            allFolderPaths.add(node.path);
            if (node.children) collectFolders(node.children);
          }
        });
      };
      collectFolders(treeData);
      setExpandedFolders(allFolderPaths);
    }
  }, [treeData]);

  const handleToggleGitFilter = useCallback(() => {
    setShowGitChangesOnly(prev => {
      const newValue = !prev;
      if (newValue) {
        setShowMarkdownOnly(false);
        expandAllFolders();
      }
      return newValue;
    });
  }, [expandAllFolders]);

  const handleToggleMarkdownFilter = useCallback(() => {
    setShowMarkdownOnly(prev => {
      const newValue = !prev;
      if (newValue) {
        setShowGitChangesOnly(false);
        expandAllFolders();
      }
      return newValue;
    });
  }, [expandAllFolders]);

  const displayedTreeData = useMemo(() => {
    let filtered = treeData;
    // Use debounced search results to prevent excessive filtering during typing
    if (debouncedSearchResults) {
      const matchingPaths = debouncedSearchResults.map(r => r.path);
      filtered = filterTreeBySearch(filtered, matchingPaths);
    }
    return filtered;
  }, [treeData, debouncedSearchResults, filterTreeBySearch]);

  return useMemo(() => ({
    treeData, setTreeData,
    treeLoading,
    expandedFolders, setExpandedFolders,
    showGitChangesOnly,
    showMarkdownOnly,
    allFiles,
    loadTreeData,
    handleIncrementalUpdate,
    handleGitChanges,
    toggleFolder,
    filterTreeBySearch,
    expandSearchResults,
    handleToggleGitFilter,
    handleToggleMarkdownFilter,
    displayedTreeData,
  }), [
    treeData, treeLoading, expandedFolders, showGitChangesOnly, showMarkdownOnly, allFiles,
    loadTreeData, handleIncrementalUpdate, handleGitChanges, toggleFolder,
    filterTreeBySearch, expandSearchResults, handleToggleGitFilter, handleToggleMarkdownFilter, displayedTreeData,
  ]);
}
