import { normalizePath } from "@/utils/pathUtils";

/**
 * Recursively filters tree nodes to show only files with git changes
 * Also adds deleted files that aren't in the filesystem tree
 * @param {Array} nodes - Array of tree nodes to filter
 * @param {Map} gitStatsMap - Map of file paths to git stats
 * @returns {Array} Filtered array of nodes
 */
export function filterTreeByGitChanges(nodes, gitStatsMap) {
  // Build a normalized lookup for gitStats
  const normalizedGitStats = new Map();
  for (const [filePath, stats] of gitStatsMap.entries()) {
    normalizedGitStats.set(normalizePath(filePath), stats);
  }

  // Collect all existing paths in the tree (normalized)
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
    const normalizedFilePath = normalizePath(filePath);
    if (stats.status === 'deleted' && !existingPaths.has(normalizedFilePath)) {
      const lastSlash = normalizedFilePath.lastIndexOf('/');
      const parentDir = normalizedFilePath.substring(0, lastSlash);
      if (!deletedFilesByDir.has(parentDir)) {
        deletedFilesByDir.set(parentDir, []);
      }
      const fileName = normalizedFilePath.substring(lastSlash + 1);
      deletedFilesByDir.get(parentDir).push({
        name: fileName,
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
        const normalizedNodePath = normalizePath(node.path);
        // Check if this file has git changes
        const hasChanges = normalizedGitStats.has(normalizedNodePath);

        // For directories, recursively filter children
        let filteredChildren = node.children;
        if (node.is_dir && node.children && Array.isArray(node.children)) {
          filteredChildren = filterNodes(node.children, normalizedNodePath);

          // Add any deleted files that belong in this directory
          const deletedInThisDir = deletedFilesByDir.get(normalizedNodePath) || [];
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
    const normalizedFirstPath = normalizePath(nodes[0].path);
    const lastSlash = normalizedFirstPath.lastIndexOf('/');
    rootPath = normalizedFirstPath.substring(0, lastSlash);
  }

  // Start filtering and add deleted files at root level if any
  const filtered = filterNodes(nodes, rootPath);
  const deletedAtRoot = deletedFilesByDir.get(rootPath) || [];

  return [...filtered, ...deletedAtRoot];
}
