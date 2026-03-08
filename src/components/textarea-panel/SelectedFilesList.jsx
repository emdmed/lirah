import React from "react";
import { Button } from "../ui/button";
import { SelectedFileItem } from "./SelectedFileItem";
import { useFileListKeyboardNav } from "../../hooks/useFileListKeyboardNav";
import { X } from "lucide-react";

/**
 * Sidebar showing list of selected files with state buttons
 * Now includes keyboard navigation support
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
    <div className="flex flex-col w-1/3 p-1 flex-shrink-0">
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 select-none">
          Files ({filesWithRelativePaths.length})
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAllFiles}
          className="h-5 px-1.5 text-[10px] font-mono opacity-60 hover:opacity-100"
        >
          <X className="w-2.5 h-2.5 mr-0.5" />
          clear
        </Button>
      </div>
      <div
        role="list"
        aria-label="Selected files for terminal command"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 space-y-0 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
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
