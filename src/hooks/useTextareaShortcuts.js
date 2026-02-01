import { useEffect, useRef, useState } from 'react';

export function useTextareaShortcuts({
  textareaVisible,
  setTextareaVisible,
  textareaRef,
  onSendContent,
  onToggleOrchestration,
  selectedTemplateId,
  onSelectTemplate,
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
    };

    // Use capture phase to intercept before terminal
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [textareaVisible, setTextareaVisible, textareaRef, onSendContent, onToggleOrchestration, selectedTemplateId, onSelectTemplate]);

  return { templateDropdownOpen, setTemplateDropdownOpen };
}
