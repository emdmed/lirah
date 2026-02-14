import { useState, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildTreeFromFlatList, incrementallyUpdateTree } from "../utils/treeOperations";
import { lastSepIndex } from "../utils/pathUtils";

export function useTreeView({ terminalSessionId, setCurrentPath, initializeSearch, searchResults }) {
  const [treeData, setTreeData] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [showGitChangesOnly, setShowGitChangesOnly] = useState(false);
  const [allFiles, setAllFiles] = useState([]);

  const loadTreeData = useCallback(async () => {
    try {
      if (!terminalSessionId) {
        setTreeData([]);
        setCurrentPath('Waiting for terminal...');
        return;
      }
      setTreeLoading(true);
      const cwd = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
      const allEntries = await invoke('read_directory_recursive', {
        path: cwd, maxDepth: 10, maxFiles: 10000
      });
      const treeNodes = buildTreeFromFlatList(allEntries, cwd);
      setTreeData(treeNodes);
      setCurrentPath(cwd);
      setAllFiles(allEntries);
      setTreeLoading(false);
      initializeSearch(allEntries);
    } catch (error) {
      console.error('Failed to load tree data:', error);
      setTreeData([]);
      setCurrentPath('Error loading directory');
      setTreeLoading(false);
    }
  }, [terminalSessionId, setCurrentPath, initializeSearch]);

  const handleIncrementalUpdate = useCallback((changes, rootPath) => {
    setTreeData(prev => incrementallyUpdateTree(prev, changes, rootPath));
  }, []);

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

  const handleToggleGitFilter = useCallback(() => {
    setShowGitChangesOnly(prev => {
      const newValue = !prev;
      if (newValue && treeData.length > 0) {
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
      return newValue;
    });
  }, [treeData]);

  const displayedTreeData = useMemo(() => {
    let filtered = treeData;
    if (searchResults) {
      const matchingPaths = searchResults.map(r => r.path);
      filtered = filterTreeBySearch(filtered, matchingPaths);
    }
    return filtered;
  }, [treeData, searchResults, filterTreeBySearch]);

  return {
    treeData, setTreeData,
    treeLoading,
    expandedFolders, setExpandedFolders,
    showGitChangesOnly,
    allFiles,
    loadTreeData,
    handleIncrementalUpdate,
    handleGitChanges,
    toggleFolder,
    filterTreeBySearch,
    expandSearchResults,
    handleToggleGitFilter,
    displayedTreeData,
  };
}
