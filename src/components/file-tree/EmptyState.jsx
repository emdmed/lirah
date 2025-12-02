import React from "react";

/**
 * Empty state display for file tree when no files are found
 * @param {string} searchQuery - Current search query if any
 */
export function EmptyState({ searchQuery }) {
  return (
    <div className="p-4 text-center opacity-50 text-xs">
      {searchQuery ? (
        <>
          <div>No files match "{searchQuery}"</div>
          <div className="mt-2 text-[0.65rem]">
            Try a different search term
          </div>
        </>
      ) : (
        'No files or folders found'
      )}
    </div>
  );
}
