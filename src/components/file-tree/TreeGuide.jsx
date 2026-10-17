// Indent column for a tree row: an 8px lead column that hosts the keyboard
// cursor `›`, then one 14px step per depth carrying a hairline guide under the
// parent's chevron. Width and lines come from `.tui-tree-guide` (index.css).
export function TreeGuide({ depth }) {
  return <span className="tui-tree-guide" style={{ '--depth': depth }} aria-hidden="true" />;
}
