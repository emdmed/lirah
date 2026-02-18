import React from "react";
import { FolderOpen } from "lucide-react";
import { EmptyState as EmptyStateBase } from "../EmptyState";

/**
 * Empty state display for file tree when no files are found
 * @param {string} searchQuery - Current search query if any
 */
export function EmptyState({ searchQuery }) {
  if (searchQuery) {
    return (
      <EmptyStateBase
        icon={FolderOpen}
        title={`No files match "${searchQuery}"`}
        description="Try a different search term or clear the search to see all files"
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
