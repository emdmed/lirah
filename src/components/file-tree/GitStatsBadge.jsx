import React from "react";

/**
 * Displays git statistics (added/deleted lines) for a file
 * @param {Object} stats - Git stats object with added, deleted counts, and optional status
 */
export function GitStatsBadge({ stats }) {
  if (!stats || (stats.added === 0 && stats.deleted === 0 && !stats.status)) {
    return null;
  }

  // Show "U" badge for untracked files
  if (stats.status === "untracked") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-mono flex-shrink-0">
        <span className="text-git-added">U</span>
        {stats.added > 0 && <span className="text-git-added">+{stats.added}</span>}
      </span>
    );
  }

  // Show "D" badge for deleted files
  if (stats.status === "deleted") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-mono flex-shrink-0">
        <span className="text-git-deleted">D</span>
        {stats.deleted > 0 && <span className="text-git-deleted">-{stats.deleted}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[0.65rem] font-mono flex-shrink-0">
      <span className="text-git-added">+{stats.added}</span>
      <span className="text-git-deleted">-{stats.deleted}</span>
    </span>
  );
}
