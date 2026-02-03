import { useEffect, useRef, useState } from 'react';

const LAST_PROMPT_KEY = 'nevo-terminal:last-prompt';

/**
 * Save prompt to localStorage before clearing
 * @param {string} prompt - The prompt content to save
 */
export const saveLastPrompt = (prompt) => {
  if (!prompt?.trim()) return;
  try {
    localStorage.setItem(LAST_PROMPT_KEY, prompt);
  } catch (error) {
    console.warn('Failed to save last prompt:', error);
  }
};

/**
 * Restore last prompt from localStorage
 * @returns {string|null} - The last saved prompt or null
 */
export const getLastPrompt = () => {
  try {
    return localStorage.getItem(LAST_PROMPT_KEY);
  } catch (error) {
    console.warn('Failed to get last prompt:', error);
    return null;
  }
};

export function useTextareaShortcuts({
  textareaVisible,
  setTextareaVisible,
  textareaRef,
  onSendContent,
  onToggleOrchestration,
  selectedTemplateId,
  onSelectTemplate,
  onRestoreLastPrompt,
}) {
  // Track last Ctrl keydown timestamp for double-tap detection
  const lastCtrlDownRef = useRef(0);
  // Track last Alt keydown timestamp for double-tap detection
  const lastAltDownRef = useRef(0);
  const DOUBLE_TAP_THRESHOLD = 300; // ms

  // Template dropdown open state
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Double-tap Ctrl: Toggle orchestration mode
      if (e.key === 'Control' && !e.repeat) {
        const now = Date.now();
        const timeSinceLastCtrl = now - lastCtrlDownRef.current;

        if (timeSinceLastCtrl < DOUBLE_TAP_THRESHOLD && timeSinceLastCtrl > 50) {
          // Double-tap detected (with minimum 50ms to filter out held keys)
          e.preventDefault();
          onToggleOrchestration?.((prev) => !prev);
          lastCtrlDownRef.current = 0; // Reset to prevent triple-tap
          return;
        }

        lastCtrlDownRef.current = now;
        return;
      }

      // Double-tap Alt: Clear selected template OR open dropdown
      if (e.key === 'Alt' && !e.repeat) {
        const now = Date.now();
        const timeSinceLastAlt = now - lastAltDownRef.current;

        if (timeSinceLastAlt < DOUBLE_TAP_THRESHOLD && timeSinceLastAlt > 50) {
          // Double-tap detected (with minimum 50ms to filter out held keys)
          e.preventDefault();
          if (selectedTemplateId) {
            // Clear template if one is selected
            onSelectTemplate?.(null);
          } else {
            // Open dropdown if no template selected
            setTemplateDropdownOpen(true);
          }
          lastAltDownRef.current = 0; // Reset to prevent triple-tap
          return;
        }

        lastAltDownRef.current = now;
        return;
      }

      // Ctrl+T: Focus textarea
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        e.stopPropagation();

        // Focus textarea
        textareaRef.current?.focus();
        return;
      }

      // Ctrl+Enter: Send content to terminal (only when textarea focused)
      if (e.ctrlKey && e.key === 'Enter') {
        // Check if textarea is the active element
        if (document.activeElement === textareaRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onSendContent();
        }
        return;
      }

      // Ctrl+Shift+Z: Restore last prompt (only when textarea is focused and empty)
      if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        if (document.activeElement === textareaRef.current) {
          const textarea = textareaRef.current;
          // Only restore if textarea is empty (don't interfere with normal undo)
          if (!textarea.value?.trim()) {
            const lastPrompt = getLastPrompt();
            if (lastPrompt) {
              e.preventDefault();
              e.stopPropagation();
              onRestoreLastPrompt?.(lastPrompt);
            }
          }
        }
        return;
      }
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [textareaVisible, setTextareaVisible, textareaRef, onSendContent, onToggleOrchestration, selectedTemplateId, onSelectTemplate, onRestoreLastPrompt]);

  return { templateDropdownOpen, setTemplateDropdownOpen };
}
