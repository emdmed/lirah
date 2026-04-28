import React, { useMemo, useCallback } from "react";
import { SidebarMenu } from "@/components/ui/sidebar";
import { TreeNode } from "./TreeNode";
import { EmptyState } from "./EmptyState";
import { useGitStats } from "../../features/git";
import { filterTreeByGitChanges, filterTreeByMarkdown } from "./utils/filterUtils";

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

  if (!displayedNodes || displayedNodes.length === 0) {
    return <EmptyState searchQuery={searchQuery} showGitChangesOnly={showGitChangesOnly} showMarkdownOnly={showMarkdownOnly} onClearSearch={onClearSearch} onToggleGitFilter={onToggleGitFilter} onToggleMarkdownFilter={onToggleMarkdownFilter} />;
  }

  return (
    <SidebarMenu className="filetree-container">
      {displayedNodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          expandedFolders={expandedFolders}
          currentPath={currentPath}
          gitStats={gitStats}
          onToggle={onToggle}
          onSendToTerminal={onSendToTerminal}
          onViewDiff={onViewDiff}
          selectedFiles={selectedFiles}
          showGitChangesOnly={showGitChangesOnly}
          onToggleFileSelection={handleToggleFileSelection}
          isTextareaPanelOpen={isTextareaPanelOpen}
          typeCheckResults={typeCheckResults}
          checkingFiles={checkingFiles}
          successfulChecks={successfulChecks}
          onCheckFileTypes={onCheckFileTypes}
          onOpenElementPicker={onOpenElementPicker}
        />
      ))}
    </SidebarMenu>
  );
}
