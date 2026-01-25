import React, { useState } from "react";
import { File, CornerDownRight, Plus, CheckCircle, Loader2 } from "lucide-react";
import { GitStatsBadge } from "./GitStatsBadge";

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
  typeCheckResult,
  isCheckingTypes,
  isTypeCheckSuccess,
  onCheckFileTypes
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isSupportedForTypeCheck = /\.(jsx?|tsx?)$/i.test(node.name);
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0);
  const hasTypeErrors = typeCheckResult && typeCheckResult.error_count > 0;

  return (
    <div
      style={{ paddingLeft: `${depth * 12}px` }}
      className={`flex h-5 items-center w-full py-0 pr-px ${isCurrentPath ? 'bg-accent' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main file display */}
      <div className="flex items-center justify-start flex-1 min-w-0 gap-1">
        <File className="w-3 h-3 ml-1 mr-1 flex-shrink-0" />
        <span
          className="truncate text-xs"
          style={{ color: hasTypeErrors ? '#C34043' : 'inherit' }}
          title={node.name}
        >
          {node.name}
        </span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}

        {/* Check types button - inline with filename, visible on hover */}
        {isSupportedForTypeCheck && (
          <button
            className={`p-1 flex-shrink-0 transition-all duration-200 rounded ${
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

      {/* Action buttons */}
      <div className="flex gap-1 flex-shrink-0">
        {/* Unified button - behavior depends on textarea panel state */}
        <button
          className={`p-1 transition-opacity duration-200 rounded ${isTextareaPanelOpen && isSelected
              ? 'opacity-100 bg-blue-500/30 hover:bg-blue-500/40'
              : 'opacity-60 hover:opacity-100 hover:bg-white/10'
            }`}
          onClick={(e) => {
            e.stopPropagation();
            if (isTextareaPanelOpen) {
              onToggleFileSelection(node.path);
            } else {
              onSendToTerminal(node.path);
            }
          }}
          title={
            isTextareaPanelOpen
              ? (isSelected ? "Remove from file list" : "Add to file list")
              : "Send path to terminal"
          }
        >
          {isTextareaPanelOpen ? (
            <Plus className={`w-3 h-3 ${isSelected ? 'text-blue-400' : ''}`} />
          ) : (
            <CornerDownRight className="w-3 h-3" />
          )}
        </button>
      </div>
    </div>
  );
}
