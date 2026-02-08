/**
 * Pure tree utility functions for building and updating file tree structures.
 */

/**
 * Build a hierarchical tree from a flat list of file entries.
 */
// Normalize path separators for consistent comparison
function normalizePath(p) {
  return p ? p.replace(/\\/g, '/') : p;
}

export function buildTreeFromFlatList(flatList, rootPath) {
  const normalizedRoot = normalizePath(rootPath);
  const nodeMap = new Map();

  // Initialize all nodes
  flatList.forEach(entry => {
    const normalizedPath = normalizePath(entry.path);
    nodeMap.set(normalizedPath, {
      ...entry,
      path: normalizedPath,
      parent_path: normalizePath(entry.parent_path),
      children: entry.is_dir ? [] : undefined,
      depth: entry.depth
    });
  });

  const rootNodes = [];

  // Build parent-child relationships
  flatList.forEach(entry => {
    const normalizedPath = normalizePath(entry.path);
    const normalizedParent = normalizePath(entry.parent_path);
    const node = nodeMap.get(normalizedPath);

    if (normalizedParent === normalizedRoot || !normalizedParent) {
      rootNodes.push(node);
    } else {
      const parent = nodeMap.get(normalizedParent);
      if (parent && parent.children) {
        parent.children.push(node);
      }
    }
  });

  sortChildren(rootNodes);
  return rootNodes;
}

/**
 * Sort tree nodes recursively: folders first, then alphabetically.
 */
export function sortChildren(nodes) {
  nodes.forEach(node => {
    if (node.children && node.children.length > 0) {
      sortChildren(node.children);
    }
  });
  nodes.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/**
 * Check if a file path exists anywhere in the tree.
 */
function fileExistsInTree(nodes, filePath) {
  for (const node of nodes) {
    if (node.path === filePath) return true;
    if (node.children && fileExistsInTree(node.children, filePath)) return true;
  }
  return false;
}

/**
 * Recursively find a parent node and add a child to it.
 */
function addChildToParent(nodes, parentPath, childNode) {
  return nodes.map(node => {
    if (node.path === parentPath) {
      const newNode = { ...node };
      if (!newNode.children) {
        newNode.children = [];
      }
      if (!newNode.children.some(child => child.path === childNode.path)) {
        newNode.children.push(childNode);
        newNode.children.sort((a, b) => {
          if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
      }
      return newNode;
    } else if (node.children) {
      return { ...node, children: addChildToParent(node.children, parentPath, childNode) };
    }
    return node;
  });
}

/**
 * Incrementally update a tree with new untracked files (avoids full reload).
 * Returns a new tree array with the changes applied.
 */
export function incrementallyUpdateTree(prevTreeData, changes, rootPath) {
  const normalizedRoot = normalizePath(rootPath);
  let newData = [...prevTreeData];

  changes.newUntracked.forEach(({ path: filePath, stats }) => {
    const normalized = normalizePath(filePath);
    const lastSep = normalized.lastIndexOf('/');
    const parentPath = normalized.substring(0, lastSep);
    const fileName = normalized.substring(lastSep + 1);

    if (fileExistsInTree(newData, filePath)) {
      return; // Already in tree
    }

    const newNode = {
      name: fileName,
      path: filePath,
      is_dir: false,
      parent_path: parentPath
    };

    // Root-level file
    if (parentPath === normalizedRoot) {
      newNode.depth = 0;
      newData = [...newData, newNode];
      newData.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      return;
    }

    // Nested file - find parent and add
    newNode.depth = undefined; // will be relative to parent
    newData = addChildToParent(newData, parentPath, newNode);
  });

  return newData;
}
