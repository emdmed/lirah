import React from "react";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { FolderNode } from "./FolderNode";
import { FileNode } from "./FileNode";
import { AnalysisPanel } from "./AnalysisPanel";

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
  analyzedFiles,
  expandedAnalysis,
  onAnalyzeFile,
  onToggleAnalysis,
  onSendAnalysisItem,
  selectedFiles,
  onToggleFileSelection,
  isTextareaPanelOpen,
  typeCheckResults,
  checkingFiles,
  successfulChecks,
  onCheckFileTypes
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isCurrentPath = currentPath === node.path;
  const hasChildren = node.children && Array.isArray(node.children) && node.children.length > 0;
  const isSelected = selectedFiles && selectedFiles.has(node.path);
  const depth = node.depth || 0;

  // Analysis state
  const isAnalyzed = analyzedFiles && analyzedFiles.has(node.path);
  const isAnalysisExpanded = expandedAnalysis && expandedAnalysis.has(node.path);
  const analysisData = analyzedFiles && analyzedFiles.get(node.path);

  // Git stats
  const stats = gitStats?.get(node.path);

  // Type check state
  const typeCheckResult = typeCheckResults && typeCheckResults.get(node.path);
  const isCheckingTypes = checkingFiles && checkingFiles.has(node.path);
  const isTypeCheckSuccess = successfulChecks && successfulChecks.has(node.path);

  return (
    <>
      <SidebarMenuItem className="me-4 relative my-0 p-0">
        {/* Indentation guide line */}
        {depth > 0 && (
          <div
            className="absolute top-0 bottom-0 border-l border-white/10"
            style={{ left: `${(depth - 1) * 12 + 6}px` }}
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
            onAnalyzeFile={onAnalyzeFile}
            onToggleFileSelection={onToggleFileSelection}
            typeCheckResult={typeCheckResult}
            isCheckingTypes={isCheckingTypes}
            isTypeCheckSuccess={isTypeCheckSuccess}
            onCheckFileTypes={onCheckFileTypes}
          />
        )}
      </SidebarMenuItem>

      {/* Analysis expansion panel */}
      {!node.is_dir && isAnalyzed && isAnalysisExpanded && (
        <AnalysisPanel
          data={analysisData}
          depth={depth}
          onSendItem={onSendAnalysisItem}
        />
      )}

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
            analyzedFiles={analyzedFiles}
            expandedAnalysis={expandedAnalysis}
            onAnalyzeFile={onAnalyzeFile}
            onToggleAnalysis={onToggleAnalysis}
            onSendAnalysisItem={onSendAnalysisItem}
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
