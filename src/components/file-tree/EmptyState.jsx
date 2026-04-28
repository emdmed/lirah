import React from "react";
import { FolderOpen, GitBranch, FileText } from "lucide-react";
import { EmptyState as EmptyStateBase } from "../EmptyState";

/**
 * Empty state display for file tree when no files are found
 * @param {string} searchQuery - Current search query if any
 * @param {boolean} showGitChangesOnly - Whether git changes filter is enabled
 * @param {boolean} showMarkdownOnly - Whether markdown filter is enabled
 * @param {Function} onClearSearch - Callback to clear search query
 * @param {Function} onToggleGitFilter - Callback to toggle git filter off
 * @param {Function} onToggleMarkdownFilter - Callback to toggle markdown filter off
 */
export function EmptyState({ searchQuery, showGitChangesOnly, showMarkdownOnly, onClearSearch, onToggleGitFilter, onToggleMarkdownFilter }) {
  if (searchQuery) {
    return (
      <EmptyStateBase
        icon={FolderOpen}
        title={`No files match "${searchQuery}"`}
        description="Try a different search term or show all files"
        action={onClearSearch ? { onClick: onClearSearch, label: 'Clear search' } : undefined}
      />
    );
  }

  if (showGitChangesOnly) {
    return (
      <EmptyStateBase
        icon={GitBranch}
        title="No uncommitted changes"
        description="All files are clean in this directory"
        action={onToggleGitFilter ? { onClick: onToggleGitFilter, label: 'Show all files' } : undefined}
      />
    );
  }

  if (showMarkdownOnly) {
    return (
      <EmptyStateBase
        icon={FileText}
        title="No markdown files"
        description="This directory has no .md files"
        action={onToggleMarkdownFilter ? { onClick: onToggleMarkdownFilter, label: 'Show all files' } : undefined}
      />
    );
  }

  return (
    <EmptyStateBase
      icon={FolderOpen}
      title="Empty directory"
      description="No files or folders here"
    />
  );
}
