import React, { useMemo } from "react";
import { Pin, PinOff } from "lucide-react";
import { GitStatsBadge } from "../../features/git/GitStatsBadge";
import { TreeGuide } from "./TreeGuide";
import { gitColorClass } from "./utils/lsColors";

/**
 * Renders a file node in the tree with action buttons
 */
export function FileNode({
  path,
  name,
  depth,
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
      className={`group flex h-[22px] items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent' : ''} ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Main file display */}
      <div
        className={`flex items-center justify-start self-stretch min-w-0 flex-1 ${isDeleted ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={handleFileClick}
        data-nav-activate
      >
        <TreeGuide depth={depth} />
        {/* Chevron-width slot so file names share a column with folder names */}
        <span className="w-2.5 shrink-0" />
        <span className={`truncate pl-1 leading-normal ${gitColorClass(stats) || 'text-foreground/80'} ${isDeleted ? 'line-through' : ''}`} style={{ fontSize: 'var(--font-lg)' }}>{name}</span>

        {/* Git stats badge */}
        {hasGitChanges && (
          <span className="ml-auto pl-1.5 shrink-0">
            <GitStatsBadge stats={stats} />
          </span>
        )}
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
          className={`group/pin shrink-0 flex items-center justify-center h-3.5 w-3.5 mr-0.5 hover:bg-foreground hover:text-background text-muted-foreground ${
            isPinned ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          {/* A pinned row carries a quiet pin; hovering the button offers the unpin. */}
          {isPinned ? (
            <>
              <Pin className="w-2.5 h-2.5 opacity-60 group-hover/pin:hidden" />
              <PinOff className="w-2.5 h-2.5 hidden group-hover/pin:block" />
            </>
          ) : (
            <Pin className="w-2.5 h-2.5" />
          )}
        </button>
      )}
    </div>
  );
}
