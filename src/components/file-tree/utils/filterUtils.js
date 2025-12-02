/**
 * Recursively filters tree nodes to show only files with git changes
 * @param {Array} nodes - Array of tree nodes to filter
 * @param {Map} gitStatsMap - Map of file paths to git stats
 * @returns {Array} Filtered array of nodes
 */
export function filterTreeByGitChanges(nodes, gitStatsMap) {
  const filterNodes = (nodes) => {
    return nodes
      .map(node => {
        // Check if this file has git changes
        const hasChanges = gitStatsMap.has(node.path);

        // For directories, recursively filter children
        let filteredChildren = node.children;
        if (node.is_dir && node.children && Array.isArray(node.children)) {
          filteredChildren = filterNodes(node.children);
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
  };

  return filterNodes(nodes);
}
