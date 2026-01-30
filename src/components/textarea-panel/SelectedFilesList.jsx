import React from "react";
import { Button } from "../ui/button";
import { SelectedFileItem } from "./SelectedFileItem";
import { useFileListKeyboardNav } from "../../hooks/useFileListKeyboardNav";

/**
 * Sidebar showing list of selected files with state buttons
 * Now includes keyboard navigation support
 * @param {Array} filesWithRelativePaths - Array of file objects
 * @param {Map} fileStates - Map of file absolute paths to states
 * @param {Function} onSetFileState - Callback to set file state
 * @param {Function} onRemoveFile - Callback to remove file
 * @param {Function} onClearAllFiles - Callback to clear all files
 * @param {React.RefObject} textareaRef - Reference to textarea for focus management
 */
export function SelectedFilesList({
  filesWithRelativePaths,
  fileStates,
  onSetFileState,
  onRemoveFile,
  onClearAllFiles,
  textareaRef
}) {
  const { selectedIndex, handleKeyDown, fileRefs } = useFileListKeyboardNav({
    filesCount: filesWithRelativePaths.length,
    onRemoveFile: (index) => {
      const file = filesWithRelativePaths[index];
      if (file) {
        onRemoveFile(file.absolute);
      }
    },
    onFocusTextarea: () => {
      textareaRef?.current?.focus();
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
    <div className="flex flex-col w-1/3 p-1 overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <div className="text-[0.65rem] font-semibold opacity-60">
          Files ({filesWithRelativePaths.length})
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAllFiles}
          className="text-[0.65rem] h-4 px-1"
        >
          Clear
        </Button>
      </div>
      <div
        role="list"
        aria-label="Selected files for terminal command"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto space-y-0 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
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
