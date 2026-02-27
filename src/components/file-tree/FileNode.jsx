import React from "react";
import { GitBranch, Search } from "lucide-react";
import { GitStatsBadge } from "../../features/git";
import { INDENT_PX } from "./constants";
import { isBabelParseable } from "@/features/file-analysis";
import { isPythonParseable } from "@/features/file-analysis";

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
      className={`flex h-[18px] items-center gap-0.5 w-full ${isCurrentPath ? 'bg-accent' : ''} ${isTextareaPanelOpen && isSelected ? 'outline-1 outline-dashed outline-ring/70 bg-primary/10' : ''
        } ${isDeleted ? 'opacity-60' : ''}`}
    >
      {/* Element picker button - always visible for discoverability */}
      <button
        className={`p-0 transition-all duration-200 rounded flex-shrink-0 ${isTextareaPanelOpen && isParseable && !isDeleted
            ? 'opacity-60 hover:opacity-100 hover:bg-white/10 cursor-pointer'
            : 'opacity-20 cursor-not-allowed grayscale'
          }`}
        onClick={(e) => {
          if (!isTextareaPanelOpen || !isParseable || isDeleted) return;
          e.stopPropagation();
          onOpenElementPicker?.(node.path);
        }}
        title={isTextareaPanelOpen && isParseable && !isDeleted ? "Pick elements from file (Ctrl+K to enable)" : "Open Claude mode to use element picker"}
        tabIndex={isTextareaPanelOpen && isParseable && !isDeleted ? 0 : -1}
        disabled={!(isTextareaPanelOpen && isParseable && !isDeleted)}
      >
        <Search className="w-2.5 h-2.5" />
      </button>

      {/* Main file display */}
      <div
        className={`flex items-center justify-start min-w-0 flex-1 gap-0.5 ${isDeleted ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'}`}
        onClick={handleFileClick}
      >
        {/* Git diff button - always visible for discoverability */}
        <button
          className={`p-0 transition-all duration-200 rounded flex-shrink-0 ${hasGitChanges && !isDeleted
              ? 'opacity-60 hover:opacity-100 hover:bg-white/10 cursor-pointer'
              : 'opacity-20 cursor-not-allowed grayscale'
            }`}
          onClick={(e) => {
            if (!hasGitChanges || isDeleted) return;
            e.stopPropagation();
            onViewDiff?.(node.path);
          }}
          title={hasGitChanges && !isDeleted ? "View git diff" : "No git changes to view"}
          tabIndex={hasGitChanges && !isDeleted ? 0 : -1}
          disabled={!(hasGitChanges && !isDeleted)}
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
