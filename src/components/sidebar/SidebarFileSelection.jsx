import React from "react";
import { Button } from "../ui/button";
import { SelectedFileItem } from "../textarea-panel/SelectedFileItem";
import { useFileListKeyboardNav } from "../../hooks/useFileListKeyboardNav";
import { Badge } from "../ui/badge";
import { File, X } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * File selection panel in sidebar showing selected files with state buttons
 * @param {Array} filesWithRelativePaths - Array of file objects
 * @param {Map} fileStates - Map of file absolute paths to states
 * @param {Function} onSetFileState - Callback to set file state
 * @param {Function} onRemoveFile - Callback to remove file
 * @param {Function} onClearAllFiles - Callback to clear all files
 */
export function SidebarFileSelection({
  filesWithRelativePaths,
  fileStates,
  onSetFileState,
  onRemoveFile,
  onClearAllFiles
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
            />
          );
        })}
      </div>
    </div>
  );
}
