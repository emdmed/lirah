import React from "react";
import { Pin, PinOff } from "lucide-react";
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
  isPinned = false,
  onTogglePin,
  lineCount,
  viewModeLabel,
  onCycleViewMode,
}) {
  // Below 300 lines the whole file goes to the agent, so there is no detail
  // level to choose — the digest only exists for larger files.
  const hasDetailLevel = lineCount != null && lineCount >= 300 && !!viewModeLabel;
  return (
    <div
      ref={itemRef}
      role="listitem"
      aria-selected={isSelected}
      aria-label={
        hasDetailLevel
          ? `${file.name}, state: ${currentState.replace(/-/g, ' ')}, sending ${viewModeLabel.toLowerCase()} of ${lineCount} lines`
          : `${file.name}, state: ${currentState.replace(/-/g, ' ')}${lineCount != null ? `, ${lineCount} lines, sent in full` : ''}`
      }
      tabIndex={-1}
      className={cn(
        "group flex items-center gap-1 px-1 py-0.5 rounded-sm transition-colors",
        isSelected && "bg-accent/20",
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
      {hasDetailLevel ? (
        <button
          onClick={(e) => { e.stopPropagation(); onCycleViewMode?.(file.absolute); }}
          disabled={!onCycleViewMode}
          title={`Sending ${viewModeLabel.toLowerCase()} of this ${lineCount}-line file. Click${isSelected ? ' or press V' : ''} to change.`}
          aria-label={`Detail level: ${viewModeLabel}. Change.`}
          className="flex-shrink-0 flex items-center gap-1 px-1 h-3.5 border edge-engraved text-[11px] font-mono leading-none text-muted-foreground hover:text-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors disabled:pointer-events-none"
        >
          <span className="engraved-label">{viewModeLabel}</span>
          <span className="tube-idle">{lineCount}L</span>
          {showKeyboardHints && isSelected && (
            <span className="text-muted-foreground/40">V</span>
          )}
        </button>
      ) : lineCount != null ? (
        <span
          title={`${lineCount} lines — sent in full`}
          className="flex-shrink-0 px-1 text-[11px] font-mono leading-none tube-idle"
        >
          {lineCount}L
        </span>
      ) : null}
      {onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(file.absolute); }}
          title={isPinned ? 'Unpin from sidebar' : 'Pin to top of sidebar'}
          aria-label={isPinned ? 'Unpin from sidebar' : 'Pin to top of sidebar'}
          aria-pressed={isPinned}
          className={cn(
            "ml-auto flex-shrink-0 flex items-center justify-center h-3.5 w-3.5 rounded-sm hover:bg-foreground/10 transition-opacity bg-transparent border-0 p-0 cursor-pointer",
            isPinned
              ? "opacity-80 text-primary"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
          )}
        >
          {isPinned ? <PinOff className="w-2.5 h-2.5" /> : <Pin className="w-2.5 h-2.5" />}
        </button>
      )}
    </div>
  );
}
