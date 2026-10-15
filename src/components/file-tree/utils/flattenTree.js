/**
 * Flatten a nested file tree into the rows that are currently visible:
 * every root node, plus the children of each expanded folder, in display
 * order. Iterative (explicit stack) so deep trees can't overflow the stack.
 * @param {Array} nodes - Root tree nodes ({ path, is_dir, children })
 * @param {Set<string>} expandedFolders - Paths of expanded folders
 * @returns {Array<{node: Object, depth: number}>}
 */
export function flattenVisibleTree(nodes, expandedFolders) {
  const rows = [];
  if (!nodes || nodes.length === 0) return rows;

  // Stack of [children, nextIndex, depth] frames.
  const stack = [[nodes, 0, 0]];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const [list, i, depth] = frame;
    if (i >= list.length) {
      stack.pop();
      continue;
    }
    frame[1] = i + 1;
    const node = list[i];
    rows.push({ node, depth });
    if (
      node.is_dir &&
      node.children &&
      node.children.length > 0 &&
      expandedFolders.has(node.path)
    ) {
      stack.push([node.children, 0, depth + 1]);
    }
  }
  return rows;
}
