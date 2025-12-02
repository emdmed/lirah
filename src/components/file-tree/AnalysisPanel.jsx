import React from "react";
import { AnalysisSection } from "./AnalysisSection";

/**
 * Displays analysis results for a JavaScript/TypeScript file
 * Shows hooks, defined components, used components, and functions
 * @param {Object} data - Analysis data containing hooks, components, functions
 * @param {number} depth - Tree depth for indentation
 * @param {Function} onSendItem - Callback when analysis item is clicked
 */
export function AnalysisPanel({ data, depth, onSendItem }) {
  if (data.error) {
    return (
      <div
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
        className="text-xs text-red-400 py-0 opacity-80"
      >
        ⚠️ Parse failed: {data.error}
      </div>
    );
  }

  const { hooks, definedComponents, usedComponents, functions } = data;
  const baseIndent = depth * 12 + 12;

  // Check if there are any results
  const hasResults = (hooks && hooks.length > 0) ||
    (definedComponents && definedComponents.length > 0) ||
    (usedComponents && usedComponents.length > 0) ||
    (functions && functions.length > 0);

  if (!hasResults) {
    return (
      <div
        style={{ paddingLeft: `${baseIndent}px` }}
        className="text-xs opacity-50 py-0"
      >
        No hooks, components, or functions found
      </div>
    );
  }

  return (
    <div className="border-l border-white/10 ml-2">
      {hooks && hooks.length > 0 && (
        <AnalysisSection
          title="HOOKS"
          items={hooks}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}

      {definedComponents && definedComponents.length > 0 && (
        <AnalysisSection
          title="DEFINED COMPONENTS"
          items={definedComponents}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}

      {usedComponents && usedComponents.length > 0 && (
        <AnalysisSection
          title="USED COMPONENTS"
          items={usedComponents}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}

      {functions && functions.length > 0 && (
        <AnalysisSection
          title="FUNCTIONS"
          items={functions}
          indent={baseIndent}
          onSendItem={onSendItem}
        />
      )}
    </div>
  );
}
