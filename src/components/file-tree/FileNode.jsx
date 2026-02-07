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
      className={`flex h-[18px] items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent' : ''} ${
        isTextareaPanelOpen && isSelected ? 'bg-blue-500/20' : ''
      } ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Element picker button - always rendered for alignment, enabled for parseable files in Claude mode */}
      <button
        className={`p-0 transition-opacity duration-200 rounded flex-shrink-0 ${
          isTextareaPanelOpen && isParseable && !isDeleted
            ? 'opacity-40 hover:opacity-100 hover:bg-white/10 cursor-pointer'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenElementPicker?.(node.path);
        }}
        title="Pick elements from file"
        tabIndex={isTextareaPanelOpen && isParseable && !isDeleted ? 0 : -1}
      >
        <Search className="w-2.5 h-2.5" />
      </button>

      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 flex-1 gap-0.5 ${isDeleted ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'}`}
        onClick={handleFileClick}
      >
        {/* Git diff button - always rendered for alignment, enabled when file has git changes */}
        <button
          className={`p-0 transition-opacity duration-200 rounded flex-shrink-0 ${
            hasGitChanges && !isDeleted
              ? 'opacity-60 hover:opacity-100 hover:bg-white/10 cursor-pointer'
              : 'opacity-0 pointer-events-none'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onViewDiff?.(node.path);
          }}
          title="View git diff"
          tabIndex={hasGitChanges && !isDeleted ? 0 : -1}
        >
          <GitBranch className="w-2.5 h-2.5" />
        </button>
        <span className={`truncate leading-normal ${isDeleted ? 'line-through text-git-deleted' : ''} ${isUntracked ? 'text-git-added' : ''}`} style={{ fontSize: 'var(--font-lg)' }}>{node.name}</span>

        {/* Git stats badge */}
        {hasGitChanges && <GitStatsBadge stats={stats} />}
      </div>
    </div>
  );
}
