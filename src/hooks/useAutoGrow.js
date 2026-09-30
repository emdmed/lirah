import { useLayoutEffect } from 'react';

/**
 * Sizes a textarea to its content, between one line and `maxLines`.
 * Runs whenever `value` changes; `enabled` false leaves sizing to CSS.
 */
export function useAutoGrow(textareaRef, value, { maxLines = 8, enabled = true } = {}) {
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!enabled) {
      el.style.height = '';
      return;
    }
    const styles = window.getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    const chrome = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    el.style.height = 'auto';
    const max = lineHeight * maxLines + chrome;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [textareaRef, value, maxLines, enabled]);
}
