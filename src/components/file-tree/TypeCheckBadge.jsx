import React from "react";
import { XCircle, AlertTriangle } from "lucide-react";

/**
 * Displays TypeScript type check results (errors/warnings) for a file
 * @param {Object} result - TypeCheck result object with error_count and warning_count
 */
export function TypeCheckBadge({ result }) {
  if (!result || (result.error_count === 0 && result.warning_count === 0)) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[0.65rem] font-mono flex-shrink-0">
      {result.error_count > 0 && (
        <span className="inline-flex items-center gap-0.5" style={{ color: '#C34043' }}>
          <XCircle className="w-2.5 h-2.5" />
          {result.error_count}
        </span>
      )}
      {result.warning_count > 0 && (
        <span className="inline-flex items-center gap-0.5" style={{ color: '#E6C384' }}>
          <AlertTriangle className="w-2.5 h-2.5" />
          {result.warning_count}
        </span>
      )}
    </span>
  );
}
