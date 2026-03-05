import React, { useMemo, useCallback } from "react";
import { SidebarMenu } from "@/components/ui/sidebar";
import { TreeNode } from "./TreeNode";
import { EmptyState } from "./EmptyState";
import { useGitStats } from "../../features/git";
import { filterTreeByGitChanges } from "./utils/filterUtils";

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
  onToggle,
  onSendToTerminal,
  onViewDiff,
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
}) {
  // Fetch git stats periodically with git changes callback
  const { gitStats } = useGitStats(currentPath, fileWatchingEnabled, onGitChanges);

  // Apply filters to get displayed nodes
  const displayedNodes = useMemo(() => {
    let filtered = nodes;

    // Apply git changes filter if enabled
    if (showGitChangesOnly) {
      console.log('[FileTree] Filtering by git changes. nodes:', nodes.length, 'gitStats:', gitStats.size);
      filtered = filterTreeByGitChanges(filtered, gitStats);
      console.log('[FileTree] After filter:', filtered.length, 'nodes');
    }

    return filtered;
  }, [nodes, showGitChangesOnly, gitStats]);

  // When showing only git changes, clicking a file should show its diff
  // instead of adding it to file selection
  const handleToggleFileSelection = useCallback((filePath) => {
    if (showGitChangesOnly && onViewDiff) {
      onViewDiff(filePath);
    } else {
      onToggleFileSelection(filePath);
    }
  }, [showGitChangesOnly, onViewDiff, onToggleFileSelection]);

  if (!displayedNodes || displayedNodes.length === 0) {
    return <EmptyState searchQuery={searchQuery} showGitChangesOnly={showGitChangesOnly} />;
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
