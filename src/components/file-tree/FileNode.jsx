import React, { useState } from "react";
import { File, CheckCircle, Loader2, GitBranch } from "lucide-react";
import { GitStatsBadge } from "./GitStatsBadge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Renders a file node in the tree with action buttons
 * @param {Object} node - Node data (path, name, is_dir)
 * @param {number} depth - Tree depth for indentation
 * @param {boolean} isCurrentPath - Whether this is the current working directory
 * @param {Object} stats - Git stats for this file {added, deleted}
 * @param {boolean} isSelected - Whether file is selected for textarea panel
 * @param {boolean} isTextareaPanelOpen - Whether textarea panel is open
 * @param {Function} onSendToTerminal - Callback to send file path to terminal
 * @param {Function} onToggleFileSelection - Callback to toggle file selection
 */
export function FileNode({
  node,
  depth,
  isCurrentPath,
  stats,
  isSelected,
  isTextareaPanelOpen,
  onSendToTerminal,
  onToggleFileSelection,
  onViewDiff,
  typeCheckResult,
  isCheckingTypes,
  isTypeCheckSuccess,
  onCheckFileTypes
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isSupportedForTypeCheck = /\.(jsx?|tsx?)$/i.test(node.name);
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0);
  const hasTypeErrors = typeCheckResult && typeCheckResult.error_count > 0;

  const handleFileClick = () => {
    if (isTextareaPanelOpen) {
      onToggleFileSelection(node.path);
    } else {
      onSendToTerminal(node.path);
    }
  };

  return (
    <div
      style={{ paddingLeft: `${depth * 12}px` }}
      className={`flex h-5 items-center justify-between w-full py-0 pr-px ${isCurrentPath ? 'bg-accent' : ''} ${
        isTextareaPanelOpen && isSelected ? 'bg-blue-500/20' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main file display - clickable when textarea panel is open */}
      <div
        className="flex items-center justify-start min-w-0 gap-1 cursor-pointer hover:bg-white/5"
        onClick={handleFileClick}
      >
        <File className="w-3 h-3 ml-1 mr-1 flex-shrink-0" />
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="truncate text-xs"
                style={{ color: hasTypeErrors ? '#C34043' : 'inherit' }}
              >
                {node.name}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {node.name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>

      {/* Action buttons - fixed width columns for alignment */}
      <div className="flex flex-shrink-0">
        {/* Check types button column */}
        <div className="w-5 flex items-center justify-center">
          {isSupportedForTypeCheck && (
            <button
              className={`p-1 transition-all duration-200 rounded ${
                isTypeCheckSuccess
                  ? 'opacity-100 bg-green-500/30 hover:bg-green-500/40'
                  : isHovered
                  ? 'opacity-60 hover:opacity-100 hover:bg-white/10'
                  : 'opacity-0 pointer-events-none'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onCheckFileTypes(node.path);
              }}
              disabled={isCheckingTypes}
              title="Check types"
            >
              {isCheckingTypes ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className={`w-3 h-3 ${isTypeCheckSuccess ? 'text-green-400' : ''}`} />
              )}
            </button>
          )}
        </div>

        {/* View Diff button column */}
        <div className="w-5 flex items-center justify-center">
          {hasGitChanges && (
            <button
              className={`p-1 transition-opacity duration-200 rounded ${
                isHovered
                  ? 'opacity-60 hover:opacity-100 hover:bg-white/10'
                  : 'opacity-0 pointer-events-none'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onViewDiff?.(node.path);
              }}
              title="View git diff"
            >
              <GitBranch className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
