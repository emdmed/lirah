import React from "react";
import { GitBranch, Search } from "lucide-react";
import { GitStatsBadge } from "./GitStatsBadge";
import { INDENT_PX } from "./constants";
import { isBabelParseable } from "@/utils/babelSymbolParser";
import { isPythonParseable } from "@/utils/pythonSymbolParser";

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
  onViewDiff,
  onOpenElementPicker,
}) {
  const hasGitChanges = stats && (stats.added > 0 || stats.deleted > 0 || stats.status);
  const isDeleted = node.is_deleted || (stats && stats.status === 'deleted');
  const isUntracked = stats && stats.status === 'untracked';
  const isParseable = isBabelParseable(node.path) || isPythonParseable(node.path);

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
      className={`flex h-4 items-center justify-between w-full ${isCurrentPath ? 'bg-accent' : ''} ${
        isTextareaPanelOpen && isSelected ? 'bg-blue-500/20' : ''
      } ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Element picker button - only for parseable files in Claude mode */}
      {isTextareaPanelOpen && isParseable && !isDeleted && (
        <button
          className="p-0 mr-1 transition-opacity duration-200 rounded opacity-40 hover:opacity-100 hover:bg-white/10 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onOpenElementPicker?.(node.path);
          }}
          title="Pick elements from file"
        >
          <Search className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 flex-1 gap-0.5 ${isDeleted ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'}`}
        onClick={handleFileClick}
      >
        {/* Git diff button inline */}
        {hasGitChanges && !isDeleted && (
          <button
            className="p-0 transition-opacity duration-200 rounded opacity-60 hover:opacity-100 hover:bg-white/10 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onViewDiff?.(node.path);
            }}
            title="View git diff"
          >
            <GitBranch className="w-2.5 h-2.5" />
          </button>
        )}
        <span className={`truncate text-[11px] leading-none ${isDeleted ? 'line-through text-git-deleted' : ''} ${isUntracked ? 'text-git-added' : ''}`}>{node.name}</span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>
    </div>
  );
}
