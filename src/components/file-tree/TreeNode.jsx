import React from "react";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { FolderNode } from "./FolderNode";
import { FileNode } from "./FileNode";
import { INDENT_PX, GUIDE_OFFSET_PX } from "./constants";
import { normalizePath } from "@/utils/pathUtils";

/**
 * Renders a tree node (file or folder) with all interactions
 * Recursively renders children for expanded folders
 */
export function TreeNode({
  node,
  expandedFolders,
  currentPath,
  gitStats,
  onToggle,
  onSendToTerminal,
  onViewDiff,
  selectedFiles,
  onToggleFileSelection,
  isTextareaPanelOpen,
  typeCheckResults,
  checkingFiles,
  successfulChecks,
  onCheckFileTypes
}) {
  const normalizedNodePath = normalizePath(node.path);
  const normalizedCurrentPath = normalizePath(currentPath);
  const isExpanded = expandedFolders.has(normalizedNodePath);
  const isCurrentPath = normalizedCurrentPath === normalizedNodePath;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const isSelected = selectedFiles && selectedFiles.has(normalizedNodePath);
  const depth = node.depth || 0;

  // Git stats - try both normalized and original path since stats come from backend
  const stats = gitStats?.get(node.path) || gitStats?.get(normalizedNodePath);

  // Type check state - use normalized paths for consistency
  const typeCheckResult = typeCheckResults && (typeCheckResults.get(node.path) || typeCheckResults.get(normalizedNodePath));
  const isCheckingTypes = checkingFiles && (checkingFiles.has(node.path) || checkingFiles.has(normalizedNodePath));
  const isTypeCheckSuccess = successfulChecks && (successfulChecks.has(node.path) || successfulChecks.has(normalizedNodePath));

  return (
    <>
      <SidebarMenuItem className="relative my-0 p-0 w-full">
        {/* Indentation guide line */}
        {depth > 0 && (
          <div
            className="absolute top-0 bottom-0 border-l border-tree-guide"
            style={{ left: `${(depth - 1) * INDENT_PX + GUIDE_OFFSET_PX}px` }}
          />
        )}

        {node.is_dir ? (
          <FolderNode
            node={node}
            depth={depth}
            isExpanded={isExpanded}
            isCurrentPath={isCurrentPath}
            onToggle={onToggle}
          />
        ) : (
          <FileNode
            node={node}
            depth={depth}
            isCurrentPath={isCurrentPath}
            stats={stats}
            isSelected={isSelected}
            isTextareaPanelOpen={isTextareaPanelOpen}
            onSendToTerminal={onSendToTerminal}
            onToggleFileSelection={onToggleFileSelection}
            onViewDiff={onViewDiff}
            typeCheckResult={typeCheckResult}
            isCheckingTypes={isCheckingTypes}
            isTypeCheckSuccess={isTypeCheckSuccess}
            onCheckFileTypes={onCheckFileTypes}
          />
        )}
      </SidebarMenuItem>

      {/* Recursively render children if expanded */}
      {node.is_dir && isExpanded && hasChildren && (
        node.children.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
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
          />
        ))
      )}
    </>
  );
}
