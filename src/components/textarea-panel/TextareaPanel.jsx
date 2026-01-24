import React, { useRef } from "react";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { SelectedFilesList } from "./SelectedFilesList";
import { ActionButtons } from "./ActionButtons";
import { TemplateSelector } from "./TemplateSelector";

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
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,
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
        <div className="flex items-center gap-4">
          <span id="textarea-instructions" className="text-xs text-muted-foreground font-mono">
            {selectedTemplateId && !value?.trim() ? (
              <span className="text-primary">Ctrl+Enter to send template</span>
            ) : (
              "Multi-line Input (Ctrl+Enter: send, Tab: navigate files)"
            )}
          </span>
          {onToggleKeepFiles && (
            <div className="flex items-center gap-2">
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
                keep files
              </label>
            </div>
          )}
        </div>
        <TemplateSelector
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={onSelectTemplate}
          onManageTemplates={onManageTemplates}
        />
      </div>

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
        onSend={handleSend}
        disabled={disabled || (!value?.trim() && fileArray.length === 0 && !selectedTemplateId)}
      />
    </div>
  );
}
