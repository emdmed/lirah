import React from "react";
import { Pin, PinOff } from "lucide-react";
import { GitStatsBadge } from "../../features/git";
import { GUIDE_BRANCH, GUIDE_LAST } from "./constants";
import { gitColorClass } from "./utils/lsColors";

/**
 * Renders a file node in the tree with action buttons
 */
export function FileNode({
  node,
  guide,
  isLast,
  isCurrentPath,
  stats,
  isSelected,
  isPinned,
  onTogglePin,
  isTextareaPanelOpen,
  onSendToTerminal,
  showGitChangesOnly,
  onToggleFileSelection,
}) {
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0 || stats.status);
  const isDeleted = node.is_deleted || (stats && stats.status === 'deleted');

  const handleFileClick = () => {
    // Don't allow interaction with deleted files
    if (isDeleted) return;

    if (isTextareaPanelOpen) {
      onToggleFileSelection(node.path);
    } else {
      onSendToTerminal(node.path);
    }
  };

  const handleTogglePin = (e) => {
    e.stopPropagation();
    if (onTogglePin) onTogglePin(node.path);
  };

  return (
    <div
      data-nav-row
      className={`group flex h-[18px] items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent' : ''} ${isTextareaPanelOpen && isSelected ? 'bg-primary/15' : ''
        } ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 flex-1 gap-0.5 ${isDeleted ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={handleFileClick}
        data-nav-activate
      >
        <span className="tui-tree-guide shrink-0 whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>{guide}{isLast ? GUIDE_LAST : GUIDE_BRANCH}</span>
        <span className={`truncate leading-normal ${gitColorClass(stats) || 'text-foreground/80'} ${isDeleted ? 'line-through' : ''}`} style={{ fontSize: 'var(--font-lg)' }}>{node.name}</span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>

      {/* Pin toggle */}
      {!isDeleted && onTogglePin && (
        <button
          type="button"
          onClick={handleTogglePin}
          data-nav-pin
          title={isPinned ? 'Unpin file' : 'Pin file to top'}
          aria-label={isPinned ? 'Unpin file' : 'Pin file to top'}
          aria-pressed={!!isPinned}
          className={`shrink-0 flex items-center justify-center h-3.5 w-3.5 mr-0.5 hover:bg-foreground hover:text-background text-muted-foreground ${
            isPinned ? 'opacity-80' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          {isPinned
            ? <PinOff className="w-2.5 h-2.5" />
            : <Pin className="w-2.5 h-2.5" />}
        </button>
      )}
    </div>
  );
}
