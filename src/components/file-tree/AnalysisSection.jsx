import React from "react";
import { CornerDownRight } from "lucide-react";

/**
 * Renders a section of analysis results (hooks, components, functions)
 * @param {string} title - Section title (e.g., "HOOKS", "FUNCTIONS")
 * @param {Array} items - Array of item names to display
 * @param {number} indent - Left padding in pixels
 * @param {Function} onSendItem - Callback when item is clicked
 */
export function AnalysisSection({ title, items, indent, onSendItem }) {
  const getCategoryLabel = (title) => {
    switch(title) {
      case 'HOOKS':
        return 'hook';
      case 'DEFINED COMPONENTS':
        return 'Defined component';
      case 'USED COMPONENTS':
        return 'Used component';
      case 'FUNCTIONS':
        return 'Function';
      default:
        return '';
    }
  };

  const categoryLabel = getCategoryLabel(title);

  return (
    <div className="py-0">
      <div
        style={{ paddingLeft: `${indent}px` }}
        className="text-[0.65rem] font-semibold opacity-60 mb-0"
      >
        {title} ({items.length})
      </div>
      {items.map((item, idx) => (
        <button
          key={idx}
          style={{ paddingLeft: `${indent + 8}px` }}
          className="w-full text-left text-xs py-0 hover:bg-white/5 flex items-center gap-1 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onSendItem(item, categoryLabel);
          }}
          title={`Send "${item}" to terminal`}
        >
          <CornerDownRight className="w-2.5 h-2.5 opacity-50 flex-shrink-0" />
          <span className="truncate">{item}</span>
        </button>
      ))}
    </div>
  );
}
