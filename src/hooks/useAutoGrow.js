import { useEffect, useLayoutEffect } from 'react';

// Ancestor that should overlay its growth onto the content above it instead of
// pushing that content up (see Layout: the terminal must keep its row count).
const OVERLAY_SLOT = '[data-grow-overlay]';

function resize(el, maxLines) {
  const slot = el.closest(OVERLAY_SLOT);
  const styles = window.getComputedStyle(el);
  const lineHeight = parseFloat(styles.lineHeight) || 20;
  const chrome = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const prevHeight = el.style.height;
  el.style.height = 'auto';
  const max = lineHeight * maxLines + chrome;
  const height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  if (slot && height !== prevHeight) {
    // Measure the slot at one line and at the new height; the difference is
    // what the growth adds. Only when the line count changes, so typing
    // within a line costs no extra layout.
    el.style.height = `${lineHeight + chrome}px`;
    const base = slot.offsetHeight;
    el.style.height = height;
    slot.style.setProperty('--grow-overlay', `${Math.max(0, slot.offsetHeight - base)}px`);
  } else {
    el.style.height = height;
  }
}

/**
 * Sizes a textarea to its content, between one line and `maxLines`.
 * Runs whenever `value` changes, and when the textarea's width changes (the
 * text re-wraps); `enabled` false leaves sizing to CSS.
 * Inside a `[data-grow-overlay]` slot, the height the slot gains from the
 * textarea growing is published as `--grow-overlay` on that slot.
 */
export function useAutoGrow(textareaRef, value, { maxLines = 8, enabled = true } = {}) {
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!enabled) {
      el.style.height = '';
      el.closest(OVERLAY_SLOT)?.style.removeProperty('--grow-overlay');
      return;
    }
    resize(el, maxLines);
  }, [textareaRef, value, maxLines, enabled]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !enabled) return;
    // Width only: resize() itself changes the height, which must not loop.
    let width = el.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => resize(el, maxLines));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [textareaRef, maxLines, enabled]);
}
