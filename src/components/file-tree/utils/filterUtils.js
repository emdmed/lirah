import { normalizePath, parentDir, basename } from '../../../utils/pathUtils';

/**
import { normalizePath, parentDir, basename } from '../../../utils/pathUtils';
 * Recursively filters tree nodes to show only files with git changes
 * Also adds deleted files that aren't in the filesystem tree
 * @param {Array} nodes - Array of tree nodes to filter
 * @param {Map} gitStatsMap - Map of file paths to git stats
 * @returns {Array} Filtered array of nodes
 */
export function filterTreeByGitChanges(nodes, rawGitStatsMap) {
  // Compare in the canonical form: stats keys may come in the backend's style.
  const gitStatsMap = new Map([...rawGitStatsMap].map(([k, v]) => [normalizePath(k), v]));

  // Collect all existing paths in the tree
  const existingPaths = new Set();
  const collectPaths = (nodeList) => {
    for (const node of nodeList) {
      existingPaths.add(normalizePath(node.path));
      if (node.is_dir && node.children) {
        collectPaths(node.children);
      }
    }
  };
  collectPaths(nodes);

  // Find deleted files not in the tree
  const deletedFilesByDir = new Map();
  for (const [filePath, stats] of gitStatsMap.entries()) {
    if (stats.status === 'deleted' && !existingPaths.has(filePath)) {
      const dir = parentDir(filePath);
      if (!deletedFilesByDir.has(dir)) {
        deletedFilesByDir.set(dir, []);
      }
      deletedFilesByDir.get(dir).push({
        name: basename(filePath),
        path: filePath,
        is_dir: false,
        is_deleted: true,
        children: null
      });
    }
  }

  const filterNodes = (nodeList, parentPath = '') => {
    const result = nodeList
      .map(node => {
        // Check if this file has git changes
        const hasChanges = gitStatsMap.has(normalizePath(node.path));

        // For directories, recursively filter children
        let filteredChildren = node.children;
        if (node.is_dir && node.children && Array.isArray(node.children)) {
          filteredChildren = filterNodes(node.children, node.path);

          // Add any deleted files that belong in this directory
          const deletedInThisDir = deletedFilesByDir.get(normalizePath(node.path)) || [];
          if (deletedInThisDir.length > 0) {
            filteredChildren = [...filteredChildren, ...deletedInThisDir];
          }

          // Include directory if it has any children with changes
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
        }

        // Include file if it has changes
        if (!node.is_dir && hasChanges) {
          return node;
        }

        return null;
      })
      .filter(Boolean);

    return result;
  };

  // Get the root path from the first node's parent
  let rootPath = '';
  if (nodes.length > 0) {
    rootPath = parentDir(nodes[0].path);
  }

  // Start filtering and add deleted files at root level if any
  const filtered = filterNodes(nodes, rootPath);
  const deletedAtRoot = deletedFilesByDir.get(rootPath) || [];

  return [...filtered, ...deletedAtRoot];
}

/**
 * Recursively filters tree nodes to show only markdown (.md) files
 * @param {Array} nodes - Array of tree nodes to filter
 * @returns {Array} Filtered array of nodes containing only .md files and their parent dirs
 */
export function filterTreeByMarkdown(nodes) {
  const filterNodes = (nodeList) => {
    return nodeList
      .map(node => {
        if (node.is_dir && node.children && Array.isArray(node.children)) {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
          return null;
        }

        if (!node.is_dir && node.name.endsWith('.md')) {
          return node;
        }

        return null;
      })
      .filter(Boolean);
  };

  return filterNodes(nodes);
}

/**
 * Counts the files `filterTreeByMarkdown` would keep, without building the tree.
 * @param {Array} nodes - Array of tree nodes
 * @returns {number}
 */
export function countMarkdownFiles(nodes) {
  let count = 0;
  const walk = (nodeList) => {
    for (const node of nodeList) {
      if (node.is_dir) {
        if (Array.isArray(node.children)) walk(node.children);
      } else if (node.name.endsWith('.md')) {
        count++;
      }
    }
  };
  walk(nodes);
  return count;
}

/**
 * Counts changed files in the git stats that sit under `rootPath`. The stats
 * cover the whole repository, which can be wider than the open folder.
 * @param {Map} gitStatsMap - Map of absolute file paths to git stats
 * @param {string} rootPath - The open folder
 * @returns {number}
 */
export function countGitChanges(gitStatsMap, rootPath) {
  if (!gitStatsMap || gitStatsMap.size === 0) return 0;
  const root = rootPath ? rootPath.replace(/[\\/]+$/, '') : '';
  if (!root) return gitStatsMap.size;
  let count = 0;
  for (const path of gitStatsMap.keys()) {
    if (path.startsWith(root + '/') || path.startsWith(root + '\\')) count++;
  }
  return count;
}
