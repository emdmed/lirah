import React from "react";
import { File, GitBranch } from "lucide-react";
import { GitStatsBadge } from "./GitStatsBadge";
import { INDENT_PX } from "./constants";

/**
 * Renders a file node in the tree with action buttons
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
  onViewDiff
}) {
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0);

  const handleFileClick = () => {
    if (isTextareaPanelOpen) {
      onToggleFileSelection(node.path);
    } else {
      onSendToTerminal(node.path);
    }
  };

  return (
    <div
      style={{ paddingLeft: `${depth * INDENT_PX}px` }}
      className={`flex h-5 items-center justify-between w-full py-0 pr-px ${isCurrentPath ? 'bg-accent' : ''} ${
        isTextareaPanelOpen && isSelected ? 'bg-blue-500/20' : ''
      }`}
    >
      {/* Left side - diff button column (fixed width for alignment) */}
      <div className="w-5 flex items-center justify-center flex-shrink-0">
        {hasGitChanges && (
          <button
            className="p-1 transition-opacity duration-200 rounded opacity-60 hover:opacity-100 hover:bg-white/10"
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

      {/* Main file display */}
      <div
        className="flex items-center justify-start min-w-0 gap-1 cursor-pointer hover:bg-white/5 flex-1"
        onClick={handleFileClick}
      >
        <File className="w-3 h-3 flex-shrink-0" />
        <span className="truncate text-xs">{node.name}</span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>
    </div>
  );
}
