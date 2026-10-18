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

/**
 * Normalize a `read_directory_recursive` result. Older backends return a bare
 * array; newer ones return `{ entries, truncated }` and may omit
 * `parent_path`, which the tree builder needs, so derive it from the path.
 */
function parseDirectoryResult(result) {
  const entries = Array.isArray(result) ? result : (result?.entries || []);
  const truncated = !Array.isArray(result) && !!result?.truncated;
  if (entries.length === 0 || entries[0].parent_path !== undefined) {
    return { entries, truncated };
  }
  return {
    entries: entries.map(e => ({ ...e, parent_path: e.path.substring(0, lastSepIndex(e.path)) })),
    truncated,
  };
}

/**
 * `fs-changes` entries are either bare paths or `{ path, is_dir }`.
 * @returns {{path: string, is_dir: boolean}}
 */
function parseChange(change) {
  return typeof change === 'string'
    ? { path: change, is_dir: false }
    : { path: change.path, is_dir: !!change.is_dir };
}

/** Flat file-list entry for a path created after the initial scan. */
function makeFileEntry({ path, is_dir }) {
  const lastSep = lastSepIndex(path);
  return {
    name: path.substring(lastSep + 1),
    path,
    is_dir: !!is_dir,
    parent_path: path.substring(0, lastSep),
  };
}

/** Paths of every folder in the tree. */
function collectFolderPaths(nodes, into = new Set()) {
  for (const node of nodes) {
    if (!node.is_dir) continue;
    into.add(node.path);
    if (node.children) collectFolderPaths(node.children, into);
  }
  return into;
}

/** Ancestor folders of each search result, plus matching folders themselves. */
function searchResultFolderPaths(results) {
  const paths = new Set();
  for (const result of results) {
    let current = result.path;
    while (current && current !== '/') {
      const lastSlash = lastSepIndex(current);
      if (lastSlash <= 0) break;
      current = current.substring(0, lastSlash);
      paths.add(current);
    }
    if (result.is_dir) paths.add(result.path);
  }
  return paths;
}

/** True when `path` or one of its ancestors is in `pathSet`. */
function isSelfOrDescendantOf(path, pathSet) {
  let current = path;
  while (current) {
    if (pathSet.has(current)) return true;
    const lastSep = lastSepIndex(current);
    if (lastSep <= 0) return false;
    current = current.substring(0, lastSep);
  }
  return false;
}

export function useTreeView({ terminalSessionId, setCurrentPath, initializeSearch, searchResults }) {
  const [treeData, setTreeData] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeTruncated, setTreeTruncated] = useState(false);
  // Folders the user opened. While search or a filter is active the tree shows
  // a separate, throwaway expansion instead, so the user's layout comes back
  // untouched when it is turned off.
  const [userExpandedFolders, setUserExpandedFolders] = useState(() => new Set());
  const [transientExpandedFolders, setTransientExpandedFolders] = useState(null);
  const expandedFolders = transientExpandedFolders ?? userExpandedFolders;
  const transientActive = transientExpandedFolders !== null;
  const [showGitChangesOnly, setShowGitChangesOnly] = useState(false);
  const [showMarkdownOnly, setShowMarkdownOnly] = useState(false);
  const [allFiles, setAllFiles] = useState([]);
  // Source of truth for the flat file list, so fs changes can update it (and
  // the search) outside state updaters, which must stay pure.
  const allFilesRef = useRef([]);
  const projectRootRef = useRef(null);
  const { error } = useToast();
  const { fileWatchingEnabled } = useWatcher();

  // Debounce search results to prevent expensive tree filtering on every keystroke
  const debouncedSearchResults = useDebounce(searchResults, 150);

  const commitAllFiles = useCallback((files) => {
    allFilesRef.current = files;
    setAllFiles(files);
    initializeSearch(files, projectRootRef.current);
  }, [initializeSearch]);

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
      const result = await invoke('read_directory_recursive', {
        path: cwd, maxDepth: 10, maxFiles: 10000
      });
      const { entries, truncated } = parseDirectoryResult(result);
      const treeNodes = buildTreeFromFlatList(entries, cwd);
      setTreeData(treeNodes);
      setTreeTruncated(truncated);
      setCurrentPath(cwd);
      commitAllFiles(entries);
      setTreeLoading(false);
      setWatchPath(cwd);
    } catch (err) {
      console.error('Failed to load tree data:', err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error';
      setTreeData([]);
      setTreeTruncated(false);
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
  }, [terminalSessionId, setCurrentPath, commitAllFiles]);

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

  // Drop deleted paths (and anything under a deleted directory) from the file list
  const removeFromAllFiles = useCallback((deletedPaths) => {
    const deletedSet = new Set(deletedPaths);
    const prev = allFilesRef.current;
    const updated = prev.filter(f => !isSelfOrDescendantOf(f.path, deletedSet));
    if (updated.length !== prev.length) commitAllFiles(updated);
  }, [commitAllFiles]);

  // Append newly created paths to the file list
  const addToAllFiles = useCallback((createdChanges) => {
    const prev = allFilesRef.current;
    const existingPaths = new Set(prev.map(f => f.path));
    const newEntries = createdChanges
      .filter(c => !existingPaths.has(c.path))
      .map(makeFileEntry);
    if (newEntries.length > 0) commitAllFiles([...prev, ...newEntries]);
  }, [commitAllFiles]);

  // Start native FS watcher and listen for create/delete events
  useEffect(() => {
    if (!watchPath || !fileWatchingEnabled) return;

    let unlisten;
    let stopped = false;

    // Watchers are ref-counted per path in the backend, and start/stop are
    // async commands that can overtake each other — so the stop is chained
    // onto this start and only sent if the start succeeded.
    const started = invoke('start_fs_watcher', { path: watchPath }).then(
      () => true,
      (err) => {
        console.warn('[useTreeView] Failed to start fs watcher:', err);
        return false;
      }
    );

    const setup = async () => {
      try {
        if (!(await started) || stopped) return;
        const fn = await listen('fs-changes', (event) => {
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

          // Handle deletions — filter them out of the tree and the file list
          if (hasDeleted) {
            const deletedPaths = deleted.map(d => parseChange(d).path);
            setTreeData(prev => removeDeletedFromTree(prev, deletedPaths));
            removeFromAllFiles(deletedPaths);
          }

          // Handle creations — add new nodes incrementally
          if (hasCreated) {
            const createdChanges = created.map(parseChange);
            setTreeData(prev => incrementallyUpdateTree(prev, { newUntracked: createdChanges }, watchPath));
            addToAllFiles(createdChanges);
          }
        });
        // Unmounted while listen() was resolving — tear down immediately
        if (stopped) fn();
        else unlisten = fn;
      } catch (err) {
        console.warn('[useTreeView] Failed to start fs watcher:', err);
      }
    };

    setup();

    return () => {
      stopped = true;
      if (unlisten) unlisten();
      started.then((ok) => {
        if (ok) invoke('stop_fs_watcher', { path: watchPath }).catch(() => {});
      });
    };
  }, [watchPath, fileWatchingEnabled, loadTreeData, removeDeletedFromTree, removeFromAllFiles, addToAllFiles]);

  const handleIncrementalUpdate = useCallback((changes, rootPath) => {
    setTreeData(prev => incrementallyUpdateTree(prev, changes, rootPath));

    // Update allFiles and search with new untracked files
    if (changes.newUntracked.length > 0) {
      addToAllFiles(changes.newUntracked.map(({ path }) => ({ path, is_dir: false })));
    }
  }, [addToAllFiles]);

  const handleGitChanges = useCallback((changes) => {
    if (changes.newUntracked.length > 0 && !changes.newDeleted.length && !changes.noLongerUntracked.length) {
      // currentPath not available here, passed via caller
    } else if (changes.hasChanges) {
      loadTreeData();
    }
  }, [loadTreeData]);

  const toggleFolder = useCallback((folderPath) => {
    const setActive = transientActive ? setTransientExpandedFolders : setUserExpandedFolders;
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, [transientActive]);

  const collapseAllFolders = useCallback(() => {
    setUserExpandedFolders(new Set());
    setTransientExpandedFolders(prev => (prev ? new Set() : prev));
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

  const handleToggleGitFilter = useCallback(() => {
    const next = !showGitChangesOnly;
    setShowGitChangesOnly(next);
    if (next) setShowMarkdownOnly(false);
  }, [showGitChangesOnly]);

  const handleToggleMarkdownFilter = useCallback(() => {
    const next = !showMarkdownOnly;
    setShowMarkdownOnly(next);
    if (next) setShowGitChangesOnly(false);
  }, [showMarkdownOnly]);

  // Search opens the folders holding its results; a filter opens everything
  // (the filtered tree only keeps folders with matches). Re-run only when the
  // mode changes, or the tree first arrives, so folding inside a filtered view
  // survives fs updates.
  const treeDataRef = useRef(treeData);
  treeDataRef.current = treeData;
  const treeLoaded = treeData.length > 0;
  const filterActive = showGitChangesOnly || showMarkdownOnly;
  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      setTransientExpandedFolders(searchResultFolderPaths(searchResults));
    } else if (filterActive) {
      setTransientExpandedFolders(collectFolderPaths(treeDataRef.current));
    } else {
      setTransientExpandedFolders(null);
    }
  }, [searchResults, filterActive, showGitChangesOnly, treeLoaded]);

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
    treeTruncated,
    expandedFolders,
    collapseAllFolders,
    showGitChangesOnly,
    showMarkdownOnly,
    allFiles,
    loadTreeData,
    handleIncrementalUpdate,
    handleGitChanges,
    toggleFolder,
    filterTreeBySearch,
    handleToggleGitFilter,
    handleToggleMarkdownFilter,
    displayedTreeData,
  }), [
    treeData, treeLoading, treeTruncated, expandedFolders, showGitChangesOnly, showMarkdownOnly, allFiles,
    loadTreeData, handleIncrementalUpdate, handleGitChanges, toggleFolder, collapseAllFolders,
    filterTreeBySearch, handleToggleGitFilter, handleToggleMarkdownFilter, displayedTreeData,
  ]);
}
