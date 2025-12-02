import React, { useMemo } from "react";
import { SidebarMenu } from "@/components/ui/sidebar";
import { TreeNode } from "./TreeNode";
import { EmptyState } from "./EmptyState";
import { useGitStats } from "./hooks/useGitStats";
import { filterTreeByGitChanges } from "./utils/filterUtils";

/**
 * Main FileTree component - renders a tree view of files and folders
 * Supports git stats display, filtering, and file analysis
 */
export function FileTree({
  nodes,
  searchQuery,
  expandedFolders,
  currentPath,
  showGitChangesOnly,
  onToggle,
  onSendToTerminal,
  analyzedFiles,
  expandedAnalysis,
  onAnalyzeFile,
  onToggleAnalysis,
  onSendAnalysisItem,
  selectedFiles,
  onToggleFileSelection,
  isTextareaPanelOpen
}) {
  // Fetch git stats periodically
  const gitStats = useGitStats(currentPath);

  // Apply filters to get displayed nodes
  const displayedNodes = useMemo(() => {
    let filtered = nodes;

    // Apply git changes filter if enabled
    if (showGitChangesOnly && gitStats.size > 0) {
      filtered = filterTreeByGitChanges(filtered, gitStats);
    }

    return filtered;
  }, [nodes, showGitChangesOnly, gitStats]);

  if (!displayedNodes || displayedNodes.length === 0) {
    return <EmptyState searchQuery={searchQuery} />;
  }

  return (
    <SidebarMenu>
      {displayedNodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          expandedFolders={expandedFolders}
          currentPath={currentPath}
          gitStats={gitStats}
          onToggle={onToggle}
          onSendToTerminal={onSendToTerminal}
          analyzedFiles={analyzedFiles}
          expandedAnalysis={expandedAnalysis}
          onAnalyzeFile={onAnalyzeFile}
          onToggleAnalysis={onToggleAnalysis}
          onSendAnalysisItem={onSendAnalysisItem}
          selectedFiles={selectedFiles}
          onToggleFileSelection={onToggleFileSelection}
          isTextareaPanelOpen={isTextareaPanelOpen}
        />
      ))}
    </SidebarMenu>
  );
}
