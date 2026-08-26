import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveLastPrompt } from "./useTextareaShortcuts";
import { buildPrompt } from "./buildPrompt";

/**
 * Hook that builds and sends prompts to the terminal.
 *
 * The assembly itself lives in `buildPrompt` so the composer can render the
 * same payload before it is sent. This hook owns only the send and the
 * post-send state reset.
 */
export function usePromptSender({
  terminalSessionId,
  terminalRef,
  textareaContent,
  selectedFiles,
  currentPath,
  fileStates,
  keepFilesAfterSend,
  selectedTemplateId,
  getTemplateById,

  formatFileAnalysis,
  getLineCount,
  getViewModeLabel,
  selectedElements,
  compactedProject,
  // State setters (callbacks)
  setTextareaContent,
  setCompactedProject,
  clearFileSelection,
  clearSelectedElements,
  selectedPatterns,
  getPatternInstructions,
  clearPatterns,
  clearSelectedTemplate,
}) {
  const sendPrompt = useCallback(async () => {
    if (!terminalSessionId) return;

    const { text: fullCommand } = buildPrompt({
      textareaContent,
      selectedFiles,
      currentPath,
      fileStates,
      selectedTemplateId,
      getTemplateById,
      formatFileAnalysis,
      getLineCount,
      getViewModeLabel,
      selectedElements,
      compactedProject,
      selectedPatterns,
      getPatternInstructions,
    });

    if (!fullCommand) return;

    try {
      // Send text content first
      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: fullCommand
      });

      // Small delay then send Enter (carriage return) to submit
      setTimeout(async () => {
        try {
          await invoke('write_to_terminal', {
            sessionId: terminalSessionId,
            data: '\r'
          });
        } catch (error) {
          console.error('Failed to send Enter:', error);
        }
      }, 500);

      // Focus terminal
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }

      // Save prompt before clearing (for Ctrl+Z restore)
      saveLastPrompt(textareaContent);

      // Clear textarea content (always)
      setTextareaContent('');

      // Clear file selection only if persistence is disabled
      if (!keepFilesAfterSend) {
        clearFileSelection();
        clearSelectedElements();
      }

      // Clear compacted project after sending
      setCompactedProject(null);

      // Clear selected template after sending
      if (clearSelectedTemplate) clearSelectedTemplate();

      // Clear patterns after sending
      if (clearPatterns) clearPatterns();
    } catch (error) {
      console.error('Failed to send to terminal:', error);
    }
  }, [terminalSessionId, textareaContent, selectedFiles, currentPath, fileStates, keepFilesAfterSend, selectedTemplateId, getTemplateById, formatFileAnalysis, getLineCount, getViewModeLabel, selectedElements, clearSelectedElements, compactedProject, setCompactedProject, terminalRef, setTextareaContent, clearFileSelection, selectedPatterns, getPatternInstructions, clearPatterns, clearSelectedTemplate]);

  return sendPrompt;
}
