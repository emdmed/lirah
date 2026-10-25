import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { saveLastPrompt } from "./useTextareaShortcuts";
import { buildPrompt } from "./buildPrompt";
import { useToast } from "../features/toast";

/**
 * Hook that builds and sends prompts to the terminal.
 *
 * The assembly itself lives in `buildPrompt` so the composer can render the
 * same payload before it is sent. This hook owns only the send and the
 * post-send state reset. On a failed write it shows an error toast and
 * leaves the prompt and context in place, so nothing typed is lost.
 */
export function usePromptSender({
  terminalSessionId,
  terminalRef,
  getTextareaContent,
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
  // State setters (callbacks)
  setTextareaContent,
  clearFileSelection,
  clearSelectedElements,
  selectedPatterns,
  getPatternInstructions,
  clearPatterns,
  clearSelectedTemplate,
  linkedRepos,
  clearLinkedRepos,
}) {
  const { error: toastError } = useToast();
  const sendingRef = useRef(false);

  const sendPrompt = useCallback(async () => {
    if (!terminalSessionId) return;

    const textareaContent = getTextareaContent();
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
      selectedPatterns,
      getPatternInstructions,
      linkedRepos,
    });

    if (!fullCommand) return;
    // A second Ctrl+Enter during the Enter delay would type the prompt twice.
    if (sendingRef.current) return;
    sendingRef.current = true;

    try {
      // Type the payload, then submit it with a separate carriage return
      // after a short delay.
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: fullCommand });
    } catch (error) {
      sendingRef.current = false;
      console.error('Failed to send to terminal:', error);
      toastError(`Prompt not sent: ${error?.message || error || 'terminal write failed'}. Your prompt and context are kept.`);
      return;
    }

    terminalRef.current?.focus?.();

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await invoke('write_to_terminal', { sessionId: terminalSessionId, data: '\r' });
    } catch (error) {
      sendingRef.current = false;
      console.error('Failed to send Enter:', error);
      toastError('Prompt was typed into the terminal but not submitted. Press Enter there; your prompt and context are kept.');
      return;
    }
    sendingRef.current = false;

    // Sent: save the prompt so Ctrl+Shift+Z can restore it, then reset.
    saveLastPrompt(textareaContent);

    // Only clear the text that was sent; anything typed during the delay stays.
    setTextareaContent((prev) => (prev === textareaContent ? '' : prev));

    // Clear file selection only if persistence is disabled
    if (!keepFilesAfterSend) {
      clearFileSelection();
      clearSelectedElements();
      if (clearLinkedRepos) clearLinkedRepos();
    }

    if (clearSelectedTemplate) clearSelectedTemplate();
    if (clearPatterns) clearPatterns();
  }, [terminalSessionId, getTextareaContent, selectedFiles, currentPath, fileStates, keepFilesAfterSend, selectedTemplateId, getTemplateById, formatFileAnalysis, getLineCount, getViewModeLabel, selectedElements, clearSelectedElements, terminalRef, setTextareaContent, clearFileSelection, selectedPatterns, getPatternInstructions, clearPatterns, clearSelectedTemplate, linkedRepos, clearLinkedRepos, toastError]);

  return sendPrompt;
}
