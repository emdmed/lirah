import React, { useMemo, useCallback } from "react";
import { Pin } from "lucide-react";
import { SidebarMenu } from "@/components/ui/sidebar";
import { TreeNode } from "./TreeNode";
import { EmptyState } from "./EmptyState";
import { useGitStats } from "../../features/git";
import { filterTreeByGitChanges, filterTreeByMarkdown } from "./utils/filterUtils";
import { basename } from "../../utils/pathUtils";

/**
 * Main FileTree component - renders a tree view of files and folders
 * Supports git stats display and filtering
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
  typeCheckResults,
  checkingFiles,
  successfulChecks,
  onCheckFileTypes,
  fileWatchingEnabled,
  onGitChanges,
  onOpenElementPicker,
  onClearSearch,
  onToggleGitFilter,
  onToggleMarkdownFilter,
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

  // Build flat node objects for pinned files so they can be rendered through
  // the same TreeNode pipeline (selection highlight, git stats, type checks).
  const pinnedNodes = useMemo(() => {
    if (!pinnedPaths || pinnedPaths.length === 0) return [];
    return pinnedPaths.map((path) => ({
      path,
      name: basename(path),
      is_dir: false,
      depth: 0,
    }));
  }, [pinnedPaths]);

  const treeIsEmpty = !displayedNodes || displayedNodes.length === 0;

  // Shared props for every TreeNode (pinned section + main tree)
  const treeNodeProps = {
    expandedFolders,
    currentPath,
    gitStats,
    onToggle,
    onSendToTerminal,
    onViewDiff,
    selectedFiles,
    pinnedFiles,
    onTogglePin,
    showGitChangesOnly,
    onToggleFileSelection: handleToggleFileSelection,
    isTextareaPanelOpen,
    typeCheckResults,
    checkingFiles,
    successfulChecks,
    onCheckFileTypes,
    onOpenElementPicker,
  };

  return (
    <>
      {pinnedNodes.length > 0 && (
        <SidebarMenu className="filetree-container mb-0.5">
          <div className="flex items-center gap-1 px-1 pt-0.5 select-none">
            <Pin className="w-2.5 h-2.5 text-muted-foreground/60" fill="currentColor" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Pinned
            </span>
          </div>
          {pinnedNodes.map((node) => (
            <TreeNode key={`pinned:${node.path}`} node={node} {...treeNodeProps} />
          ))}
          <div className="border-t border-dashed border-foreground/10 mx-1 mt-1" />
        </SidebarMenu>
      )}

      {treeIsEmpty ? (
        pinnedNodes.length === 0 && (
          <EmptyState searchQuery={searchQuery} showGitChangesOnly={showGitChangesOnly} showMarkdownOnly={showMarkdownOnly} onClearSearch={onClearSearch} onToggleGitFilter={onToggleGitFilter} onToggleMarkdownFilter={onToggleMarkdownFilter} />
        )
      ) : (
        <SidebarMenu className="filetree-container">
          {displayedNodes.map((node) => (
            <TreeNode key={node.path} node={node} {...treeNodeProps} />
          ))}
        </SidebarMenu>
      )}
    </>
  );
}
