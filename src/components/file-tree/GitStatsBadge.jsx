import React from "react";

/**
 * Displays git statistics (added/deleted lines) for a file
 * @param {Object} stats - Git stats object with added and deleted counts
 */
export function GitStatsBadge({ stats }) {
  if (!stats || (stats.added === 0 && stats.deleted === 0)) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[0.65rem] font-mono flex-shrink-0">
      <span style={{ color: '#98BB6C' }}>+{stats.added}</span>
      <span style={{ color: '#C34043' }}>-{stats.deleted}</span>
    </span>
  );
}
