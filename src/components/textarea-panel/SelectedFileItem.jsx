import React from "react";
import { FileStateSelector } from "./FileStateSelector";
import { cn } from "@/lib/utils";

/**
 * Individual file item in the selected files list
 * Shows file state segmented control and clickable filename to remove
 */
export function SelectedFileItem({
  file,
  currentState,
  onSetFileState,
  onRemoveFile,
  isSelected = false,
  itemRef,
  showKeyboardHints = false,
}) {
  return (
    <div
      ref={itemRef}
      role="listitem"
      aria-selected={isSelected}
      aria-label={`${file.name}, state: ${currentState.replace(/-/g, ' ')}`}
      tabIndex={-1}
      className={cn(
        "group flex items-center gap-1 px-1 py-0.5 rounded-sm transition-colors",
        isSelected && "bg-accent/20 border-l-2 border-accent",
        !isSelected && "hover:bg-muted/10"
      )}
    >
      <FileStateSelector
        value={currentState}
        onValueChange={(newState) => onSetFileState(file.absolute, newState)}
        showKeyboardHints={showKeyboardHints && isSelected}
      />
      <button
        onClick={() => onRemoveFile(file.absolute)}
        className="text-xs font-mono font-medium flex-shrink-0 hover:line-through hover:text-destructive transition-colors cursor-pointer bg-transparent border-0 p-0"
        title={`${file.absolute} — click to remove`}
      >
        {file.name}
      </button>
    </div>
  );
}
