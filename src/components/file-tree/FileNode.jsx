import React from "react";
import { File, FileX, GitBranch } from "lucide-react";
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
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0 || stats.status);
  const isDeleted = node.is_deleted || (stats && stats.status === 'deleted');
  const isUntracked = stats && stats.status === 'untracked';

  const handleFileClick = () => {
    // Don't allow interaction with deleted files
    if (isDeleted) return;

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
      } ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Left side - diff button column (fixed width for alignment) */}
      <div className="w-5 flex items-center justify-center flex-shrink-0">
        {hasGitChanges && !isDeleted && (
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
        {isDeleted && (
          <span className="text-git-deleted text-[0.65rem] font-mono">D</span>
        )}
      </div>

      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 gap-1 flex-1 ${isDeleted ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'}`}
        onClick={handleFileClick}
      >
        {isDeleted ? (
          <FileX className="w-3 h-3 flex-shrink-0 text-git-deleted" />
        ) : (
          <File className={`w-3 h-3 flex-shrink-0 ${isUntracked ? 'text-git-added' : ''}`} />
        )}
        <span className={`truncate text-xs ${isDeleted ? 'line-through text-git-deleted' : ''} ${isUntracked ? 'text-git-added' : ''}`}>{node.name}</span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>
    </div>
  );
}
