import React, { useMemo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { TreeNode } from "./TreeNode";
import { EmptyState } from "./EmptyState";
import { useGitStats } from "../../features/git/useGitStats";
import { filterTreeByGitChanges, filterTreeByMarkdown } from "./utils/filterUtils";
import { flattenVisibleTree } from "./utils/flattenTree";
import { basename } from "../../utils/pathUtils";

// Row pitch: rows fill it edge to edge so indent guides run unbroken.
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 18;
const SEPARATOR_HEIGHT = 9;

const rowHeight = (row) =>
  row.kind === 'separator' ? SEPARATOR_HEIGHT : row.kind === 'node' ? ROW_HEIGHT : HEADER_HEIGHT;

/**
 * Main FileTree component - renders a tree view of files and folders
 * Supports git stats display and filtering.
 *
 * The nested tree is flattened into the rows that are currently visible
 * (pinned section first, then the tree) and only the rows in the viewport
 * are rendered, positioned inside `scrollRef` (the pane's scroll container).
 */
export function FileTree({
  nodes,
  searchQuery,
  expandedFolders,
  currentPath,
  showGitChangesOnly,
  showMarkdownOnly,
  onToggle,
  onSendToTerminal,
  onViewDiff,
  onViewMarkdown,
  selectedFiles,
  onToggleFileSelection,
  pinnedFiles,
  pinnedPaths,
  onTogglePin,
  isTextareaPanelOpen,
  fileWatchingEnabled,
  onGitChanges,
  onClearSearch,
  onToggleGitFilter,
  onToggleMarkdownFilter,
  truncated = false,
  scrollRef,
  cursorIndex = null,
  registerList,
}) {
  // Fetch git stats periodically with git changes callback
  const { gitStats } = useGitStats(currentPath, fileWatchingEnabled, onGitChanges);

  // Apply filters to get displayed nodes
  const displayedNodes = useMemo(() => {
    let filtered = nodes;

    // Apply git changes filter if enabled
    if (showGitChangesOnly) {
      filtered = filterTreeByGitChanges(filtered, gitStats);
    }

    // Apply markdown filter if enabled
    if (showMarkdownOnly) {
      filtered = filterTreeByMarkdown(filtered);
    }

    return filtered;
  }, [nodes, showGitChangesOnly, showMarkdownOnly, gitStats]);

  // When showing only git changes, clicking a file should show its diff
  // instead of adding it to file selection
  const handleToggleFileSelection = useCallback((filePath) => {
    if (showGitChangesOnly && onViewDiff) {
      onViewDiff(filePath);
    } else if (showMarkdownOnly && onViewMarkdown) {
      onViewMarkdown(filePath);
    } else {
      onToggleFileSelection(filePath);
    }
  }, [showGitChangesOnly, showMarkdownOnly, onViewDiff, onViewMarkdown, onToggleFileSelection]);

  // Clicking (or Enter on) a file: select it into the prompt when the panel
  // is open, otherwise send it to the terminal. Deleted files are inert.
  const handleActivateFile = useCallback((filePath, isDeleted) => {
    if (isDeleted) return;
    if (isTextareaPanelOpen) handleToggleFileSelection(filePath);
    else onSendToTerminal(filePath);
  }, [isTextareaPanelOpen, handleToggleFileSelection, onSendToTerminal]);

  // Flat list of every visible row: pinned section, then the tree.
  const rows = useMemo(() => {
    const result = [];
    if (pinnedPaths && pinnedPaths.length > 0) {
      result.push({ kind: 'pinned-header', key: 'pinned-header' });
      for (const path of pinnedPaths) {
        result.push({
          kind: 'node',
          key: `pinned:${path}`,
          node: { path, name: basename(path), is_dir: false },
          depth: 0,
        });
      }
      result.push({ kind: 'separator', key: 'pinned-separator' });
    }
    for (const { node, depth } of flattenVisibleTree(displayedNodes, expandedFolders)) {
      result.push({ kind: 'node', key: node.path, node, depth });
    }
    return result;
  }, [pinnedPaths, displayedNodes, expandedFolders]);

  const treeIsEmpty = !displayedNodes || displayedNodes.length === 0;
  const hasPinned = !!pinnedPaths && pinnedPaths.length > 0;
  const showList = !treeIsEmpty || hasPinned;

  const allRows = useMemo(
    () => (truncated && !treeIsEmpty ? [...rows, { kind: 'truncated', key: 'truncated' }] : rows),
    [rows, truncated, treeIsEmpty]
  );

  // Keyboard-cursor index (navigable rows only) <-> row index
  const navRowIndices = useMemo(() => {
    const indices = [];
    allRows.forEach((row, i) => { if (row.kind === 'node') indices.push(i); });
    return indices;
  }, [allRows]);
  const cursorRowIndex = cursorIndex != null ? navRowIndices[cursorIndex] ?? -1 : -1;

  // The pane's scroll container. On the first commit the parent's ref may not
  // be attached yet when our layout effects run, so fall back to the list's
  // parent element (which is that same container).
  const listRef = useRef(null);
  const getScrollElement = useCallback(
    () => scrollRef?.current ?? listRef.current?.parentElement ?? null,
    [scrollRef]
  );

  // Offset of the list inside the scroll container (its padding), so the
  // virtualizer's viewport math lines up with the real row positions.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    const scroller = getScrollElement();
    if (!list || !scroller) return;
    const margin = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    setScrollMargin(Math.max(0, Math.round(margin)));
  }, [getScrollElement, showList]);

  const estimateSize = useCallback((i) => rowHeight(allRows[i]), [allRows]);
  const getItemKey = useCallback((i) => allRows[i].key, [allRows]);
  const virtualizer = useVirtualizer({
    count: showList ? allRows.length : 0,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: 12,
    scrollMargin,
  });

  // Expose the navigable rows to the keyboard cursor (see useRowCursor)
  useEffect(() => {
    if (!registerList) return;
    const nodeAt = (i) => allRows[navRowIndices[i]]?.node;
    registerList({
      count: navRowIndices.length,
      activate: (i) => {
        const node = nodeAt(i);
        if (!node) return;
        if (node.is_dir) onToggle(node.path);
        else handleActivateFile(node.path, !!node.is_deleted || gitStats?.get(node.path)?.status === 'deleted');
      },
      pin: (i) => {
        const node = nodeAt(i);
        if (!node || node.is_dir || !onTogglePin) return;
        if (node.is_deleted || gitStats?.get(node.path)?.status === 'deleted') return;
        onTogglePin(node.path);
      },
      // Right: open a folder, or step into an open one. Returns the new cursor.
      expand: (i) => {
        const row = allRows[navRowIndices[i]];
        if (!row?.node.is_dir) return undefined;
        if (!expandedFolders.has(row.node.path)) {
          onToggle(row.node.path);
          return undefined;
        }
        const child = allRows[navRowIndices[i + 1]];
        return child && child.depth > row.depth ? i + 1 : undefined;
      },
      // Left: close an open folder, otherwise jump to the parent folder.
      collapse: (i) => {
        const row = allRows[navRowIndices[i]];
        if (!row) return undefined;
        if (row.node.is_dir && expandedFolders.has(row.node.path) && !row.key.startsWith('pinned:')) {
          onToggle(row.node.path);
          return undefined;
        }
        for (let j = i - 1; j >= 0; j--) {
          const prev = allRows[navRowIndices[j]];
          if (prev.depth < row.depth) return j;
        }
        return undefined;
      },
      scrollToIndex: (i) => {
        const rowIndex = navRowIndices[i];
        if (rowIndex != null) virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
      },
    });
  }, [registerList, allRows, navRowIndices, expandedFolders, onToggle, handleActivateFile, onTogglePin, gitStats, virtualizer]);
  useEffect(() => (registerList ? () => registerList(null) : undefined), [registerList]);

  if (!showList) {
    return (
      <EmptyState searchQuery={searchQuery} showGitChangesOnly={showGitChangesOnly} showMarkdownOnly={showMarkdownOnly} onClearSearch={onClearSearch} onToggleGitFilter={onToggleGitFilter} onToggleMarkdownFilter={onToggleMarkdownFilter} />
    );
  }

  return (
    <SidebarMenu
      ref={listRef}
      className="filetree-container relative"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const row = allRows[item.index];
        const style = {
          height: item.size,
          transform: `translateY(${item.start - scrollMargin}px)`,
        };
        const itemClass = "absolute left-0 top-0 my-0 p-0 w-full";

        if (row.kind === 'pinned-header') {
          return (
            <SidebarMenuItem key={row.key} className={`${itemClass} flex items-center gap-1 px-1 select-none`} style={style}>
              <span className="engraved-label" title="Pinned files stay at the top of the file list. Pinning adds nothing to the prompt.">pinned</span>
              <span className="ml-auto pr-1 text-[10px] tabular-nums text-muted-foreground">{pinnedPaths.length}</span>
            </SidebarMenuItem>
          );
        }
        if (row.kind === 'separator') {
          return (
            <SidebarMenuItem key={row.key} className={`${itemClass} flex items-center`} style={style} aria-hidden>
              <div className="border-t border-foreground/10 mx-1 w-full" />
            </SidebarMenuItem>
          );
        }
        if (row.kind === 'truncated') {
          return (
            <SidebarMenuItem
              key={row.key}
              className={`${itemClass} flex items-center px-1 select-none text-muted-foreground opacity-70`}
              style={style}
              title="The project has more entries than the tree loads; search and listings are partial"
            >
              <span className="truncate" style={{ fontSize: 'var(--font-sm)' }}>… tree truncated</span>
            </SidebarMenuItem>
          );
        }

        const { node, depth } = row;
        const path = node.path;
        const stats = gitStats?.get(path);
        return (
          <SidebarMenuItem key={row.key} className={itemClass} style={style}>
            <TreeNode
              path={path}
              name={node.name}
              depth={depth}
              isDir={!!node.is_dir}
              isExpanded={node.is_dir ? expandedFolders.has(path) : false}
              isCurrentPath={currentPath === path}
              isCursor={item.index === cursorRowIndex}
              isSelected={!!(isTextareaPanelOpen && selectedFiles?.has(path))}
              isPinned={!!pinnedFiles?.has(path)}
              isDeleted={!!node.is_deleted}
              gitAdded={stats?.added || 0}
              gitDeleted={stats?.deleted || 0}
              gitStatus={stats?.status || undefined}
              onToggle={onToggle}
              onActivateFile={handleActivateFile}
              onTogglePin={onTogglePin}
            />
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
