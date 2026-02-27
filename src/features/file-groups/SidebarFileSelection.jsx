import React, { useCallback } from "react";
import { Button } from "../../components/ui/button";
import { SelectedFileItem } from "../../components/textarea-panel/SelectedFileItem";
import { useFileListKeyboardNav } from "../../hooks/useFileListKeyboardNav";
import { Badge } from "../../components/ui/badge";
import { File, X } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Instruction for large files to prevent full file reads
 */
export const LARGE_FILE_INSTRUCTION = '\n\n[!] Grep symbol names from digests to locate code. Do NOT read full files.';

/**
 * File selection panel in sidebar showing selected files with state buttons
 * @param {Array} filesWithRelativePaths - Array of file objects
 * @param {Map} fileStates - Map of file absolute paths to states
 * @param {Function} onSetFileState - Callback to set file state
 * @param {Function} onRemoveFile - Callback to remove file
 * @param {Function} onClearAllFiles - Callback to clear all files
 * @param {Function} getSymbolCount - Function to get symbol count for a file (-1 if parsing)
 * @param {Function} getLineCount - Function to get line count for a file
 * @param {Function} getViewModeLabel - Function to get current view mode label
 * @param {Function} setFileViewMode - Function to set view mode for a file
 * @param {Map} fileSymbols - Map of file paths to symbol data
 * @param {Object} VIEW_MODES - View modes enum
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
  VIEW_MODES
}) {
  const { theme } = useTheme();

  // Get theme-specific color for selected files badge (engineering sketch style)
  const getThemeBadgeStyle = () => {
    const themeStyles = {
      kanagawa: 'bg-[#76946A]/20 text-[#76946A] hover:bg-[#76946A]/30', // Spring Green
      light: 'bg-[#5e81ac]/20 text-[#5e81ac] hover:bg-[#5e81ac]/30', // Nordic Blue
      dracula: 'bg-[#bd93f9]/20 text-[#bd93f9] hover:bg-[#bd93f9]/30', // Dracula Purple
      monokai: 'bg-[#a6e22e]/20 text-[#a6e22e] hover:bg-[#a6e22e]/30', // Monokai Green
      'emerald-mono': 'bg-[#34d399]/20 text-[#34d399] hover:bg-[#34d399]/30', // Emerald
      gruvbox: 'bg-[#fe8019]/20 text-[#fe8019] hover:bg-[#fe8019]/30', // Gruvbox Orange
    };
    return themeStyles[theme.name?.toLowerCase()] || themeStyles.kanagawa;
  };

  // Cycle through view modes: symbols -> signatures -> skeleton -> symbols
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
    onFocusTextarea: () => {
      // No textarea focus in sidebar, so we'll keep focus here
    },
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
    <div className="border-t border-t-sketch p-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <File className="w-4 h-4" />
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4.5 gap-0.5 hover:bg-opacity-20 font-semibold border border-sketch ${getThemeBadgeStyle()}`}
          >
            {filesWithRelativePaths.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAllFiles}
          className="h-6 px-2 text-xs"
        >
          <X className="w-3 h-3 mr-1" />
          Clear
        </Button>
      </div>

      <div
        role="list"
        aria-label="Selected files for terminal command"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="space-y-1 max-h-64 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
      >
        {filesWithRelativePaths.map((file, index) => {
          const currentState = fileStates?.get(file.absolute) || 'modify';
          const symbolCount = getSymbolCount ? getSymbolCount(file.absolute) : 0;
          const lineCount = getLineCount ? getLineCount(file.absolute) : 0;
          const viewModeLabel = getViewModeLabel ? getViewModeLabel(file.absolute) : null;

          return (
            <SelectedFileItem
              key={file.absolute}
              file={file}
              currentState={currentState}
              onSetFileState={onSetFileState}
              onRemoveFile={onRemoveFile}
              isSelected={selectedIndex === index}
              itemRef={(el) => (fileRefs.current[index] = el)}
              showKeyboardHints={true}
              symbolCount={symbolCount}
              lineCount={lineCount}
              viewModeLabel={viewModeLabel}
              onCycleViewMode={cycleViewMode}
            />
          );
        })}
      </div>
    </div>
  );
}
