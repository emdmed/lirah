import { useEffect, useRef, useState } from 'react';
import { isFocusMode } from '../lib/focusMode';

// The last prompt sent, for Ctrl+Shift+Z. Memory only: unsent text survives a
// restart as the tab's draft (lib/promptDrafts).
let lastPrompt = null;

export const saveLastPrompt = (prompt) => {
  if (prompt?.trim()) lastPrompt = prompt;
};

export const getLastPrompt = () => lastPrompt;

export function useTextareaShortcuts({
  textareaVisible,
  setTextareaVisible,
  textareaRef,
  onSendContent,

  selectedTemplateId,
  onSelectTemplate,
  onRestoreLastPrompt,
  secondaryTerminalFocused,
  isActive = true,
}) {
  // Track last Alt keydown timestamp for double-tap detection
  const lastAltDownRef = useRef(0);
  const DOUBLE_TAP_THRESHOLD = 300; // ms

  // Template dropdown open state
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  // onSendContent changes whenever the prompt does; reading it through a ref
  // keeps the listener subscribed once instead of once per keystroke.
  const onSendContentRef = useRef(onSendContent);
  useEffect(() => { onSendContentRef.current = onSendContent; }, [onSendContent]);

  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (secondaryTerminalFocused || isFocusMode()) return;

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

      // Ctrl+T is the new-tab shortcut (App.jsx); the prompt is focused with
      // Alt+3, its pane number (usePaneShortcuts).

      // Ctrl+Enter: Send content to terminal (only when textarea focused)
      if (e.ctrlKey && e.key === 'Enter') {
        // Check if textarea is the active element
        if (document.activeElement === textareaRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onSendContentRef.current();
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
  }, [isActive, textareaVisible, setTextareaVisible, textareaRef, selectedTemplateId, onSelectTemplate, onRestoreLastPrompt, secondaryTerminalFocused]);

  return { templateDropdownOpen, setTemplateDropdownOpen };
}
