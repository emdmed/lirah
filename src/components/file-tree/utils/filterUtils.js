/**
 * Recursively filters tree nodes to show only files with git changes
 * Also adds deleted files that aren't in the filesystem tree
 * @param {Array} nodes - Array of tree nodes to filter
 * @param {Map} gitStatsMap - Map of file paths to git stats
 * @returns {Array} Filtered array of nodes
 */
export function filterTreeByGitChanges(nodes, gitStatsMap) {
  // Collect all existing paths in the tree
  const existingPaths = new Set();
  const collectPaths = (nodeList) => {
    for (const node of nodeList) {
      existingPaths.add(node.path);
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
      const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (!deletedFilesByDir.has(parentDir)) {
        deletedFilesByDir.set(parentDir, []);
      }
      const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
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
        // Check if this file has git changes
        const hasChanges = gitStatsMap.has(node.path);

        // For directories, recursively filter children
        let filteredChildren = node.children;
        if (node.is_dir && node.children && Array.isArray(node.children)) {
          filteredChildren = filterNodes(node.children, node.path);

          // Add any deleted files that belong in this directory
          const deletedInThisDir = deletedFilesByDir.get(node.path) || [];
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
    const firstPath = nodes[0].path;
    rootPath = firstPath.substring(0, firstPath.lastIndexOf('/'));
  }

  // Start filtering and add deleted files at root level if any
  const filtered = filterNodes(nodes, rootPath);
  const deletedAtRoot = deletedFilesByDir.get(rootPath) || [];

  return [...filtered, ...deletedAtRoot];
}
