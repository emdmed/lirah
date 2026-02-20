import React, { memo } from "react";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { FolderNode } from "./FolderNode";
import { FileNode } from "./FileNode";
import { INDENT_PX } from "./constants";

/**
 * Compare two Sets for equality
 * @param {Set} a
 * @param {Set} b
 * @returns {boolean}
 */
function setsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/**
 * Compare two Maps for shallow equality (same keys, same values by reference)
 * @param {Map} a
 * @param {Map} b
 * @returns {boolean}
 */
function mapsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (!b.has(key) || b.get(key) !== value) return false;
  }
  return true;
}

/**
 * Renders a tree node (file or folder) with all interactions
 * Recursively renders children for expanded folders
 */
export const TreeNode = memo(function TreeNode({
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
  onCheckFileTypes,
  onOpenElementPicker,
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isCurrentPath = currentPath === node.path;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const isSelected = selectedFiles && selectedFiles.has(node.path);
  const depth = node.depth || 0;
  const isDotfile = node.name?.startsWith('.');

  // Git stats
  const stats = gitStats?.get(node.path);

  // Type check state
  const typeCheckResult = typeCheckResults && typeCheckResults.get(node.path);
  const isCheckingTypes = checkingFiles && checkingFiles.has(node.path);
  const isTypeCheckSuccess = successfulChecks && successfulChecks.has(node.path);

  return (
    <>
      <SidebarMenuItem className="my-0 p-0 w-full" style={isDotfile ? { opacity: 0.45 } : undefined}>
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
            onOpenElementPicker={onOpenElementPicker}
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
            onOpenElementPicker={onOpenElementPicker}
          />
        ))
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - handle Sets and Maps properly
  if (prevProps.node !== nextProps.node) return false;
  if (prevProps.currentPath !== nextProps.currentPath) return false;
  if (prevProps.isTextareaPanelOpen !== nextProps.isTextareaPanelOpen) return false;
  if (prevProps.onToggle !== nextProps.onToggle) return false;
  if (prevProps.onSendToTerminal !== nextProps.onSendToTerminal) return false;
  if (prevProps.onViewDiff !== nextProps.onViewDiff) return false;
  if (prevProps.onToggleFileSelection !== nextProps.onToggleFileSelection) return false;
  if (prevProps.onCheckFileTypes !== nextProps.onCheckFileTypes) return false;
  if (prevProps.onOpenElementPicker !== nextProps.onOpenElementPicker) return false;

  // Compare Sets and Maps
  if (!setsEqual(prevProps.expandedFolders, nextProps.expandedFolders)) return false;
  if (!mapsEqual(prevProps.gitStats, nextProps.gitStats)) return false;
  if (!setsEqual(prevProps.selectedFiles, nextProps.selectedFiles)) return false;
  if (!mapsEqual(prevProps.typeCheckResults, nextProps.typeCheckResults)) return false;
  if (!setsEqual(prevProps.checkingFiles, nextProps.checkingFiles)) return false;
  if (!setsEqual(prevProps.successfulChecks, nextProps.successfulChecks)) return false;

  return true;
});
