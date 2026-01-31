import React from "react";
import { X, Loader2, Braces, FileText, List } from "lucide-react";
import { FileStateSelector } from "./FileStateSelector";
import { cn } from "@/lib/utils";

/**
 * Individual file item in the selected files list
 * Shows file state segmented control and remove button
 * @param {Object} file - File object with absolute path, relative path, and name
 * @param {string} currentState - Current file state
 * @param {Function} onSetFileState - Callback to set file state
 * @param {Function} onRemoveFile - Callback to remove file
 * @param {boolean} isSelected - Whether this item is currently selected (for keyboard nav)
 * @param {Function} itemRef - Ref callback for keyboard navigation
 * @param {number} symbolCount - Number of symbols extracted (-1 if parsing, 0 if not parseable or no symbols)
 * @param {number} lineCount - Number of lines in the file
 * @param {string} viewModeLabel - Current view mode label (Symbols, Signatures, Skeleton)
 * @param {Function} onCycleViewMode - Callback to cycle through view modes
 */
export function SelectedFileItem({
  file,
  currentState,
  onSetFileState,
  onRemoveFile,
  isSelected = false,
  itemRef,
  showKeyboardHints = false,
  symbolCount = 0,
  lineCount = 0,
  viewModeLabel = null,
  onCycleViewMode = null,
}) {
  // Only show view mode for large files (300+ lines)
  const showViewMode = lineCount >= 300 && viewModeLabel;

  const getViewModeIcon = () => {
    switch (viewModeLabel) {
      case 'Signatures': return <FileText className="w-2.5 h-2.5" />;
      case 'Skeleton': return <List className="w-2.5 h-2.5" />;
      default: return <Braces className="w-2.5 h-2.5" />;
    }
  };

  return (
    <div
      ref={itemRef}
      role="listitem"
      aria-selected={isSelected}
      aria-label={`${file.name}, state: ${currentState.replace(/-/g, ' ')}`}
      tabIndex={-1}
      className={cn(
        "flex items-center justify-between gap-1 px-1 py-0.5 rounded-sm transition-colors",
        isSelected && "bg-accent/20 border-l-2 border-accent"
      )}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <FileStateSelector
          value={currentState}
          onValueChange={(newState) => onSetFileState(file.absolute, newState)}
          showKeyboardHints={showKeyboardHints && isSelected}
        />
        <span className="text-xs truncate" title={file.absolute}>
          {file.name}
        </span>
        {/* Analysis indicator */}
        {symbolCount === -1 ? (
          <Loader2 className="w-3 h-3 animate-spin opacity-50 flex-shrink-0" title="Parsing..." />
        ) : showViewMode ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCycleViewMode?.(file.absolute);
            }}
            className="flex items-center gap-0.5 text-[10px] px-1 py-0 rounded bg-accent/20 text-accent opacity-70 hover:opacity-100 flex-shrink-0 transition-opacity"
            title={`${viewModeLabel} view (${lineCount} lines) - click to change`}
          >
            {getViewModeIcon()}
            {viewModeLabel.slice(0, 3)}
          </button>
        ) : symbolCount > 0 ? (
          <span
            className="flex items-center gap-0.5 text-[10px] px-1 py-0 rounded bg-accent/20 text-accent opacity-70 flex-shrink-0"
            title={`${symbolCount} symbols extracted`}
          >
            <Braces className="w-2.5 h-2.5" />
            {symbolCount}
          </span>
        ) : null}
      </div>
      <button
        onClick={() => onRemoveFile(file.absolute)}
        aria-label={`Remove ${file.name}`}
        className="p-0.5 opacity-60 hover:opacity-100 hover:bg-white/10 rounded flex-shrink-0"
        title="Remove file"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
