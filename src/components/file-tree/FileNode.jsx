import React, { useMemo } from "react";
import { Eye, Pin, PinSlash } from "iconoir-react";
import { GitStatsBadge } from "../../features/git/GitStatsBadge";
import { TreeGuide } from "./TreeGuide";
import { AgentMark } from "./AgentMark";
import { gitColorClass, splitExtension } from "./utils/lsColors";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Tree rows are short: their ghost keys stay 14px, not the 20px panel size.
const TREE_KEY = "h-3.5 w-3.5 p-0 mr-0.5";

/**
 * Renders a file node in the tree with action buttons
 */
export function FileNode({
  path,
  name,
  depth,
  isCurrentPath,
  isCursor,
  isDimmed,
  isSelected,
  isPinned,
  isDeleted: isDeletedEntry,
  gitAdded,
  gitDeleted,
  gitStatus,
  agentMark,
  featureMark,
  onActivateFile,
  onTogglePin,
  onViewFile,
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
  // The base name carries the row; the extension recedes. A git colour, when
  // present, tints both, with the extension a step dimmer.
  const gitClass = gitColorClass(stats);
  const [base, ext] = splitExtension(name);
  const baseClass = gitClass || (isDimmed ? 'text-faint' : 'text-foreground');
  const extClass = gitClass ? `${gitClass} opacity-80` : 'text-muted-foreground';

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
      className={`group flex h-6 items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent/15' : ''} ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Main file display */}
      <div
        className={`flex items-center justify-start self-stretch min-w-0 flex-1 ${isDeleted ? 'cursor-default' : 'cursor-pointer'}`}
        onClick={handleFileClick}
        data-nav-activate
      >
        <TreeGuide depth={depth} />
        {/* Chevron-width slot so file names share a column with folder names */}
        <span className="w-3 shrink-0" />
        {/* A long name loses the end of its base, never its extension. */}
        <span className="flex min-w-0 pl-1 leading-normal" style={{ fontSize: 'var(--font-lg)' }} title={name}>
          <span className={`truncate ${baseClass} ${isDeleted ? 'line-through' : ''}`}>{base}</span>
          {ext && <span className={`shrink-0 ${extClass} ${isDeleted ? 'line-through' : ''}`}>{ext}</span>}
        </span>

        {/* Git stats badge, then the agent mark, at the row end */}
        {(hasGitChanges || agentMark || featureMark > 0) && (
          <span className="ml-auto pl-1.5 shrink-0 flex items-center">
            {hasGitChanges && <GitStatsBadge stats={stats} />}
            {featureMark > 0 && <span className="pl-1 text-foreground leading-none" style={{ fontSize: 'var(--font-sm)' }} title="A file of the selected feature">◆</span>}
            <AgentMark mark={agentMark} />
          </span>
        )}
      </div>

      {/* Read-only preview */}
      {!isDeleted && onViewFile && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewFile(path); }}
          title="View: open a read-only preview (v)"
          aria-label="View file"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon-panel' }), TREE_KEY, 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        >
          <Eye className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Pin toggle */}
      {!isDeleted && onTogglePin && (
        <button
          type="button"
          onClick={handleTogglePin}
          data-nav-pin
          title={isPinned ? 'Unpin: stop keeping this file at the top of the file list' : 'Pin: keep this file at the top of the file list (adds nothing to the prompt)'}
          aria-label={isPinned ? 'Unpin file' : 'Pin file to the top of the file list'}
          aria-pressed={!!isPinned}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon-panel' }), TREE_KEY, 'group/pin', !isPinned && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        >
          {/* A pinned row carries a quiet pin; hovering the button offers the unpin. */}
          {isPinned ? (
            <>
              <Pin className="w-2.5 h-2.5 opacity-60 group-hover/pin:hidden" />
              <PinSlash className="w-2.5 h-2.5 hidden group-hover/pin:block" />
            </>
          ) : (
            <Pin className="w-2.5 h-2.5" />
          )}
        </button>
      )}
    </div>
  );
}
