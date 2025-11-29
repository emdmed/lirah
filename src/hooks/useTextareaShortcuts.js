import { useEffect } from 'react';

export function useTextareaShortcuts({
  textareaVisible,
  setTextareaVisible,
  textareaRef,
  onSendContent,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+T: Toggle textarea
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        e.stopPropagation();

        const newVisible = !textareaVisible;
        setTextareaVisible(newVisible);

        // Auto-focus textarea when opening
        if (newVisible) {
          setTimeout(() => {
            textareaRef.current?.focus();
          }, 50); // Small delay to ensure DOM update
        }
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
  }, [textareaVisible, setTextareaVisible, textareaRef, onSendContent]);
}
