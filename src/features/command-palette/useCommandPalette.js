import { useCallback, useEffect, useState } from 'react';

// Anything that takes typed text — including xterm's hidden textarea — keeps
// its `:` so the palette never steals a keystroke from the shell or the prompt.
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Opens the command line with `:` (when focus isn't in a text field) or
 * Ctrl+: from anywhere. Only the active tab listens.
 */
export function useCommandPalette({ isActive }) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e) => {
      if (open) return;
      const ctrlColon = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'Semicolon';
      const bareColon = e.key === ':' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(document.activeElement);
      if (!ctrlColon && !bareColon) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isActive, open]);

  return { open, setOpen, close };
}
