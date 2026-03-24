import React from "react";
import { FolderOpen, GitBranch, FileText } from "lucide-react";
import { EmptyState as EmptyStateBase } from "../EmptyState";

/**
 * Empty state display for file tree when no files are found
 * @param {string} searchQuery - Current search query if any
 * @param {boolean} showGitChangesOnly - Whether git changes filter is enabled
 * @param {boolean} showMarkdownOnly - Whether markdown filter is enabled
 */
export function EmptyState({ searchQuery, showGitChangesOnly, showMarkdownOnly }) {
  if (searchQuery) {
    return (
      <EmptyStateBase
        icon={FolderOpen}
        title={`No files match "${searchQuery}"`}
        description="Try a different search term or clear the search to see all files"
      />
    );
  }

  if (showGitChangesOnly) {
    return (
      <EmptyStateBase
        icon={GitBranch}
        title="No changes yet"
        description="There are no modified files in this directory"
      />
    );
  }

  if (showMarkdownOnly) {
    return (
      <EmptyStateBase
        icon={FileText}
        title="No markdown files"
        description="There are no .md files in this directory"
      />
    );
  }

  return (
    <EmptyStateBase
      icon={FolderOpen}
      title="No files or folders found"
      description="Navigate to a different directory or check your file permissions"
    />
  );
}
