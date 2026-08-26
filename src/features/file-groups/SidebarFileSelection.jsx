import React, { useCallback } from "react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { SelectedFileItem } from "../../components/textarea-panel/SelectedFileItem";
import { useFileListKeyboardNav } from "../../hooks/useFileListKeyboardNav";
import { X } from "lucide-react";

/**
 * Instruction for large files to prevent full file reads
 */
export const LARGE_FILE_INSTRUCTION = '\n\n[!] Grep symbol names from digests to locate code. Do NOT read full files.';

/**
 * File selection panel in sidebar showing selected files with state buttons
 */
export function SidebarFileSelection({
  filesWithRelativePaths,
  fileStates,
  onSetFileState,
  onRemoveFile,
  onClearAllFiles,
  getSymbolCount,
  getLineCount,
  getViewModeLabel,
  setFileViewMode,
  fileSymbols,
  VIEW_MODES,
  keepFilesAfterSend = false,
  onToggleKeepFiles,
  pinnedFiles,
  onTogglePin,
}) {

  const cycleViewMode = useCallback((filePath) => {
    if (!VIEW_MODES || !setFileViewMode || !getViewModeLabel) return;

    const currentLabel = getViewModeLabel(filePath);
    let nextMode;

    switch (currentLabel) {
      case 'Symbols':
        nextMode = VIEW_MODES.SIGNATURES;
        break;
      case 'Signatures':
        nextMode = VIEW_MODES.SKELETON;
        break;
      case 'Skeleton':
      default:
        nextMode = VIEW_MODES.SYMBOLS;
        break;
    }

    setFileViewMode(filePath, nextMode);
  }, [VIEW_MODES, setFileViewMode, getViewModeLabel]);

  const { selectedIndex, handleKeyDown, fileRefs } = useFileListKeyboardNav({
    filesCount: filesWithRelativePaths.length,
    onRemoveFile: (index) => {
      const file = filesWithRelativePaths[index];
      if (file) {
        onRemoveFile(file.absolute);
      }
    },
    onFocusTextarea: () => {},
    onSetFileState: (index, state) => {
      const file = filesWithRelativePaths[index];
      if (file) {
        onSetFileState(file.absolute, state);
      }
    },
    onCycleViewMode: (index) => {
      const file = filesWithRelativePaths[index];
      if (file) {
        cycleViewMode(file.absolute);
      }
    }
  });

  if (filesWithRelativePaths.length === 0) {
    return null;
  }

  return (
    <div className="border-t edge-t-engraved px-1.5 py-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="engraved-label select-none">Context</span>
          <span className="tube font-mono leading-none" style={{ fontSize: 'var(--font-lg)' }}>
            {filesWithRelativePaths.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleKeepFiles && (
            <div className="flex items-center gap-1">
              <Checkbox
                id="keep-files-sidebar"
                checked={keepFilesAfterSend}
                onCheckedChange={onToggleKeepFiles}
                className="h-3.5 w-3.5"
              />
              <label htmlFor="keep-files-sidebar" className="engraved-label cursor-pointer select-none">
                keep
              </label>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAllFiles}
            className="h-5 px-1.5 text-[10px] font-mono text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10"
          >
            <X className="w-3 h-3 mr-0.5" />
            clear
          </Button>
        </div>
      </div>

      <div
        role="list"
        aria-label="Selected files for terminal command"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="space-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
      >
        {filesWithRelativePaths.map((file, index) => {
          const currentState = fileStates?.get(file.absolute) || 'modify';
          // getLineCount returns 0 for files that were never parsed; that is
          // "unknown", not "empty", so it must not render as 0L.
          const lineCount = getLineCount?.(file.absolute) || null;

          return (
            <React.Fragment key={file.absolute}>
              {index > 0 && (
                <div className="border-t border-foreground/8 mx-1" />
              )}
              <SelectedFileItem
                file={file}
                currentState={currentState}
                onSetFileState={onSetFileState}
                onRemoveFile={onRemoveFile}
                isSelected={selectedIndex === index}
                itemRef={(el) => (fileRefs.current[index] = el)}
                showKeyboardHints={true}
                isPinned={pinnedFiles?.has(file.absolute)}
                onTogglePin={onTogglePin}
                lineCount={lineCount}
                viewModeLabel={getViewModeLabel?.(file.absolute) ?? null}
                onCycleViewMode={cycleViewMode}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
