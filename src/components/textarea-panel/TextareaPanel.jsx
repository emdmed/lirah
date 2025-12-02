import React, { useRef } from "react";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { X } from "lucide-react";
import { SelectedFilesList } from "./SelectedFilesList";
import { ActionButtons } from "./ActionButtons";

/**
 * Main textarea panel component for multi-line input with file selection
 * Provides a space to compose commands and manage selected files
 */
export function TextareaPanel({
  value,
  onChange,
  onSend,
  onClose,
  textareaRef,
  disabled = false,
  selectedFiles,
  currentPath,
  onRemoveFile,
  onClearAllFiles,
  getRelativePath,
  fileStates,
  onSetFileState,
  keepFilesAfterSend = false,
  onToggleKeepFiles,
}) {
  const fileListRef = useRef(null);

  const handleKeyDown = (e) => {
    // Shift+Tab: move focus to file list (if files exist)
    if (e.shiftKey && e.key === 'Tab' && fileArray.length > 0) {
      e.preventDefault();
      fileListRef.current?.focus();
      return;
    }

    // Enter creates new lines (default behavior)
    // Ctrl+Enter is handled by the useTextareaShortcuts hook
    if (e.key === 'Enter' && !e.ctrlKey) {
      // Allow default newline behavior
    }
  };

  const handleSend = () => {
    onSend();
    // Note: File clearing is now handled by App.jsx based on keepFilesAfterSend state
  };

  const fileArray = Array.from(selectedFiles || new Set());
  const filesWithRelativePaths = fileArray.map(absPath => ({
    absolute: absPath,
    relative: getRelativePath(absPath, currentPath),
    name: absPath.split('/').pop()
  }));

  return (
    <div className="flex flex-col border-t border-input bg-background p-2 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span id="textarea-instructions" className="text-xs text-muted-foreground font-mono">
          Multi-line Input (Ctrl+Enter: send, Ctrl+T: close, Tab: navigate files)
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
          className="h-6 w-6"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Persistence toggle */}
      {onToggleKeepFiles && (
        <div className="flex items-center gap-2 py-1">
          <Checkbox
            id="keep-files"
            checked={keepFilesAfterSend}
            onCheckedChange={onToggleKeepFiles}
            disabled={disabled}
          />
          <label
            htmlFor="keep-files"
            className="text-xs text-muted-foreground cursor-pointer select-none"
          >
            Keep files selected after sending
          </label>
        </div>
      )}

      {/* Main content area */}
      <div className="flex gap-2 min-h-[120px] max-h-[300px]">
        <SelectedFilesList
          filesWithRelativePaths={filesWithRelativePaths}
          fileStates={fileStates}
          onSetFileState={onSetFileState}
          onRemoveFile={onRemoveFile}
          onClearAllFiles={onClearAllFiles}
          textareaRef={textareaRef}
        />

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Waiting for terminal session..." : "Type your command here... (Ctrl+Enter to send)"}
          aria-label="Multi-line command input"
          aria-describedby="textarea-instructions"
          className="flex-1 min-w-[250px] resize-none"
        />
      </div>

      {/* Action buttons */}
      <ActionButtons
        onClose={onClose}
        onSend={handleSend}
        disabled={disabled || (!value?.trim() && fileArray.length === 0)}
      />
    </div>
  );
}
