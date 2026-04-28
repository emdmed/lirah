import React from "react";
import { GitStatsBadge } from "../../features/git";
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
  showGitChangesOnly,
  onToggleFileSelection,
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
      className={`flex h-[18px] items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent' : ''} ${isTextareaPanelOpen && isSelected ? 'bg-foreground/8 border-l-2 border-primary' : ''
        } ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 flex-1 gap-0.5 ${isDeleted ? 'cursor-default' : 'cursor-pointer hover:bg-foreground/5'}`}
        onClick={handleFileClick}
      >
        <span className={`truncate leading-normal ${isDeleted ? 'line-through text-git-deleted' : ''} ${isUntracked ? 'text-git-added' : ''}`} style={{ fontSize: 'var(--font-lg)' }}>{node.name}</span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>
    </div>
  );
}
