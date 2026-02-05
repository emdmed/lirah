import React, { useMemo } from "react";
import { SidebarMenu } from "@/components/ui/sidebar";
import { TreeNode } from "./TreeNode";
import { EmptyState } from "./EmptyState";
import { useGitStats } from "./hooks/useGitStats";
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
    if (showGitChangesOnly && gitStats.size > 0) {
      console.log('[FileTree] Filtering by git changes. nodes:', nodes.length, 'gitStats:', gitStats.size);
      filtered = filterTreeByGitChanges(filtered, gitStats);
      console.log('[FileTree] After filter:', filtered.length, 'nodes');
    }

    return filtered;
  }, [nodes, showGitChangesOnly, gitStats]);

  if (!displayedNodes || displayedNodes.length === 0) {
    return <EmptyState searchQuery={searchQuery} />;
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
          onToggleFileSelection={onToggleFileSelection}
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
