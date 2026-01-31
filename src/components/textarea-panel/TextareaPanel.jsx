import React, { useRef } from "react";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
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
  keepFilesAfterSend = false,
  onToggleKeepFiles,
  selectedTemplateId,
  onSelectTemplate,
  onManageTemplates,
  appendOrchestration = true,
  onToggleOrchestration,
}) {

  const handleKeyDown = (e) => {
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

  return (
    <div className="flex flex-col border-t border-t-sketch bg-background p-2 gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onToggleOrchestration && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="orchestration"
                checked={appendOrchestration}
                onCheckedChange={onToggleOrchestration}
                disabled={disabled}
              />
              <label
                htmlFor="orchestration"
                className="text-xs text-muted-foreground cursor-pointer select-none"
              >
                orchestration
              </label>
            </div>
          )}
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
      <div className="min-h-[120px] max-h-[300px]">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Waiting for terminal session..." : "Type your command here... (Ctrl+Enter to send)"}
          aria-label="Multi-line command input"
          aria-describedby="textarea-instructions"
          className="w-full h-full resize-none"
        />
      </div>

      {/* Footer row: instructions + action buttons */}
      <div className="flex items-center justify-between">
        <span id="textarea-instructions" className="text-xs text-muted-foreground font-mono">
          {selectedTemplateId && !value?.trim() ? (
            <span className="text-primary">Ctrl+Enter to send template</span>
          ) : (
            "Ctrl+Enter: send"
          )}
        </span>
        <ActionButtons
          onSend={handleSend}
          disabled={disabled || (!value?.trim() && fileArray.length === 0 && !selectedTemplateId)}
        />
      </div>
    </div>
  );
}
