import React from "react";
import { X } from "lucide-react";
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
 */
export function SelectedFileItem({
  file,
  currentState,
  onSetFileState,
  onRemoveFile,
  isSelected = false,
  itemRef,
  showKeyboardHints = false
}) {
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
