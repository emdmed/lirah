import React, { useCallback } from "react";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { SelectedFileItem } from "../../components/textarea-panel/SelectedFileItem";
import { useFileListKeyboardNav } from "../../hooks/useFileListKeyboardNav";
import { Badge } from "../../components/ui/badge";
import { X } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Instruction for large files to prevent full file reads
 */
export const LARGE_FILE_INSTRUCTION = '\n\n[!] Grep symbol names from digests to locate code. Do NOT read full files.';

// Theme-specific accent colors for the file count badge
const THEME_BADGE_STYLES = {
  kanagawa:      'bg-[#76946A]/20 text-[#76946A] hover:bg-[#76946A]/30',
  light:         'bg-[#5e81ac]/20 text-[#5e81ac] hover:bg-[#5e81ac]/30',
  dracula:       'bg-[#bd93f9]/20 text-[#bd93f9] hover:bg-[#bd93f9]/30',
  monokai:       'bg-[#a6e22e]/20 text-[#a6e22e] hover:bg-[#a6e22e]/30',
  'emerald-mono':'bg-[#34d399]/20 text-[#34d399] hover:bg-[#34d399]/30',
  gruvbox:       'bg-[#fe8019]/20 text-[#fe8019] hover:bg-[#fe8019]/30',
};

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
}) {
  const { theme } = useTheme();
  const badgeStyle = THEME_BADGE_STYLES[theme.name?.toLowerCase()] || THEME_BADGE_STYLES.kanagawa;

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
    }
  });

  if (filesWithRelativePaths.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-t-sketch px-1.5 py-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 select-none">
            Context
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] font-mono px-1 py-0 h-4 gap-0.5 font-semibold border border-sketch ${badgeStyle}`}
          >
            {filesWithRelativePaths.length}
          </Badge>
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
              <label htmlFor="keep-files-sidebar" className="text-muted-foreground cursor-pointer select-none text-[10px] font-mono">
                keep
              </label>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAllFiles}
            className="h-5 px-1.5 text-[10px] font-mono text-destructive opacity-60 hover:opacity-100 hover:bg-destructive/10"
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

          return (
            <React.Fragment key={file.absolute}>
              {index > 0 && (
                <div className="border-t border-dashed border-foreground/8 mx-1" />
              )}
              <SelectedFileItem
                file={file}
                currentState={currentState}
                onSetFileState={onSetFileState}
                onRemoveFile={onRemoveFile}
                isSelected={selectedIndex === index}
                itemRef={(el) => (fileRefs.current[index] = el)}
                showKeyboardHints={true}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
