import React, { useRef, useState } from "react";
import { FileStateSelector } from "./FileStateSelector";
import { Detent } from "../instrument/Detent";
import { cn } from "@/lib/utils";

/**
 * Individual file item in the selected files list
 * Shows file state segmented control and clickable filename to remove.
 * The detail-level readout opens a detent under the row (V still cycles).
 */
export function SelectedFileItem({
  file,
  currentState,
  onSetFileState,
  onRemoveFile,
  isSelected = false,
  itemRef,
  showKeyboardHints = false,
  lineCount,
  viewModeLabel,
  onCycleViewMode,
  viewMode,
  detailOptions,
  onSetViewMode,
}) {
  // Below 300 lines the whole file goes to the agent, so there is no detail
  // level to choose — the digest only exists for larger files.
  const hasDetailLevel = lineCount != null && lineCount >= 300 && !!viewModeLabel;
  const canAdjust = hasDetailLevel && !!onSetViewMode && !!detailOptions?.length;
  const [adjusting, setAdjusting] = useState(false);
  const detailButtonRef = useRef(null);

  const closeDetent = (refocus) => {
    setAdjusting(false);
    if (refocus) detailButtonRef.current?.focus();
  };

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
        "group flex flex-col px-1 py-0.5 rounded-sm transition-colors",
        isSelected && "bg-accent/20",
        !isSelected && "hover:bg-muted/10"
      )}
    >
    <div className="flex min-w-0 items-center gap-1">
      <FileStateSelector
        value={currentState}
        onValueChange={(newState) => onSetFileState(file.absolute, newState)}
        showKeyboardHints={showKeyboardHints && isSelected}
      />
      <button
        onClick={() => onRemoveFile(file.absolute)}
        className="min-w-0 truncate text-left text-xs font-mono font-medium hover:line-through hover:text-destructive transition-colors cursor-pointer bg-transparent border-0 p-0"
        title={`${file.absolute} — click to remove`}
      >
        {file.name}
      </button>
      {hasDetailLevel ? (
        <button
          ref={detailButtonRef}
          onClick={(e) => {
            e.stopPropagation();
            if (canAdjust) setAdjusting((v) => !v);
            else onCycleViewMode?.(file.absolute);
          }}
          disabled={!canAdjust && !onCycleViewMode}
          aria-expanded={canAdjust ? adjusting : undefined}
          title={`Sending ${viewModeLabel.toLowerCase()} of this ${lineCount}-line file. Click${isSelected ? ' or press V' : ''} to change.`}
          aria-label={`Detail level: ${viewModeLabel}. Change.`}
          className="flex-shrink-0 flex items-center gap-1 px-1 h-3.5 border edge-engraved text-[11px] font-mono leading-none text-muted-foreground hover:text-foreground hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors disabled:pointer-events-none"
        >
          <span className="engraved-label">{viewModeLabel}</span>
          <span className="tube-idle">{lineCount}L</span>
          {showKeyboardHints && isSelected && (
            <span className="text-faint">V</span>
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
    </div>
    {canAdjust && adjusting && (
      <div
        className="flex items-center gap-2 pl-1 pr-2 pt-1.5 pb-1"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          closeDetent(true);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== detailButtonRef.current) closeDetent(false);
        }}
      >
        <Detent
          label={`Detail level for ${file.name}`}
          value={viewMode}
          options={detailOptions}
          onChange={(mode) => onSetViewMode(file.absolute, mode)}
          className="w-full max-w-[220px]"
        />
      </div>
    )}
    </div>
  );
}
