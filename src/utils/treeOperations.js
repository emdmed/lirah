/**
 * Pure tree utility functions for building and updating file tree structures.
 */

import { normalizePath } from './pathUtils';
import { compareTreeEntries } from '../components/file-tree/utils/lsColors';

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
 * Sort tree nodes recursively (see compareTreeEntries: folders first,
 * dimmed entries last).
 */
export function sortChildren(nodes) {
  nodes.forEach(node => {
    if (node.children && node.children.length > 0) {
      sortChildren(node.children);
    }
  });
  nodes.sort(compareTreeEntries);
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
        newNode.children.sort(compareTreeEntries);
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

  // Parents before children, so a directory created in the same batch as
  // its contents exists by the time its children are attached.
  const created = [...changes.newUntracked].sort((a, b) => a.path.length - b.path.length);

  created.forEach(({ path: filePath, is_dir: isDir }) => {
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
      is_dir: !!isDir,
      parent_path: parentPath,
      children: isDir ? [] : undefined,
    };

    // Root-level file
    if (parentPath === normalizedRoot) {
      newNode.depth = 0;
      newData = [...newData, newNode];
      newData.sort(compareTreeEntries);
      return;
    }

    // Nested file - find parent and add
    newNode.depth = undefined; // will be relative to parent
    newData = addChildToParent(newData, parentPath, newNode);
  });

  return newData;
}
