import React, { useMemo } from "react";
import { Pin, PinOff } from "lucide-react";
import { GitStatsBadge } from "../../features/git/GitStatsBadge";
import { GUIDE_INDENT } from "./constants";
import { gitColorClass } from "./utils/lsColors";

/**
 * Renders a file node in the tree with action buttons
 */
export function FileNode({
  path,
  name,
  guide,
  isCurrentPath,
  isCursor,
  isSelected,
  isPinned,
  isDeleted: isDeletedEntry,
  gitAdded,
  gitDeleted,
  gitStatus,
  onActivateFile,
  onTogglePin,
}) {
  // Git stats arrive as primitives (so the row memo holds across git polls)
  const stats = useMemo(
    () => (gitStatus || gitAdded || gitDeleted
      ? { added: gitAdded || 0, deleted: gitDeleted || 0, status: gitStatus }
      : undefined),
    [gitAdded, gitDeleted, gitStatus]
  );
  const hasGitChanges = !!stats;
  const isDeleted = isDeletedEntry || gitStatus === 'deleted';

  // Deleted files ignore clicks (handled by onActivateFile)
  const handleFileClick = () => onActivateFile(path, isDeleted);

  const handleTogglePin = (e) => {
    e.stopPropagation();
    if (onTogglePin) onTogglePin(path);
  };

  return (
    <div
      data-nav-row
      data-cursor={isCursor ? '' : undefined}
      data-selected={isSelected || undefined}
      className={`group flex h-[18px] items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent' : ''} ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 flex-1 gap-0.5 ${isDeleted ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={handleFileClick}
        data-nav-activate
      >
        <span className="tui-tree-guide shrink-0 whitespace-pre" style={{ fontSize: 'var(--font-lg)' }}>{guide}{GUIDE_INDENT}</span>
        <span className={`truncate leading-normal ${gitColorClass(stats) || 'text-foreground/80'} ${isDeleted ? 'line-through' : ''}`} style={{ fontSize: 'var(--font-lg)' }}>{name}</span>

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
