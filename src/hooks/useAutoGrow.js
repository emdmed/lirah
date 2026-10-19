import { useEffect, useLayoutEffect, useRef } from 'react';

// Ancestor that should overlay its growth onto the content above it instead of
// pushing that content up (see Layout: the terminal must keep its row count).
const OVERLAY_SLOT = '[data-grow-overlay]';

function metrics(el) {
  const styles = window.getComputedStyle(el);
  return {
    lineHeight: parseFloat(styles.lineHeight) || 20,
    chrome: parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom),
  };
}

// True when `next` is `prev` with text inserted at one point and nothing
// removed. Inserting can only add lines, so the textarea need not collapse
// to measure.
function isInsertion(prev, next) {
  if (next.length <= prev.length) return false;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  return next.endsWith(prev.slice(i));
}

function resize(el, maxLines, { lineHeight, chrome }, { grewOnly = false } = {}) {
  const max = lineHeight * maxLines + chrome;
  const prevHeight = el.style.height;
  // Growing: the current height is a floor, so read scrollHeight as is and
  // skip the collapse to 'auto' (a second layout pass on every keystroke).
  if (grewOnly && prevHeight && el.scrollHeight <= el.clientHeight) return;
  if (!grewOnly || !prevHeight) el.style.height = 'auto';
  const slot = el.closest(OVERLAY_SLOT);
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
  // Line height and padding, read once and again only when the width changes.
  const metricsRef = useRef(null);
  const prevValueRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!enabled) {
      el.style.height = '';
      el.closest(OVERLAY_SLOT)?.style.removeProperty('--grow-overlay');
      prevValueRef.current = null;
      return;
    }
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    metricsRef.current ??= metrics(el);
    resize(el, maxLines, metricsRef.current, {
      grewOnly: typeof prev === 'string' && typeof value === 'string' && isInsertion(prev, value),
    });
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
      frame = requestAnimationFrame(() => {
        metricsRef.current = metrics(el);
        resize(el, maxLines, metricsRef.current);
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [textareaRef, maxLines, enabled]);
}
