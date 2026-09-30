import { useCallback, useEffect, useState } from 'react';

// Computed styles copied onto the mirror so its text wraps exactly like the textarea's.
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'tabSize',
];

/**
 * Tracks where a terminal-style block cursor should be drawn over a textarea.
 * WebKit ignores `caret-shape`, so the caret position is measured with a hidden
 * mirror element and the block is drawn by the caller.
 * Returns `{ caret: { left, top, width, height } | null }` relative to the textarea.
 */
export function useBlockCaret(textareaRef, value) {
  const [caret, setCaret] = useState(null);

  const measure = useCallback(() => {
    const el = textareaRef.current;
    if (!el || document.activeElement !== el || el.selectionStart !== el.selectionEnd) {
      setCaret(null);
      return;
    }
    const styles = window.getComputedStyle(el);
    const mirror = document.createElement('div');
    for (const prop of MIRRORED) mirror.style[prop] = styles[prop];
    Object.assign(mirror.style, {
      position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px',
      whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    });
    const pos = el.selectionStart;
    mirror.textContent = el.value.slice(0, pos);
    const marker = document.createElement('span');
    // The block covers the next character, or one space at the end of a line.
    const next = el.value[pos];
    marker.textContent = !next || next === '\n' ? ' ' : next;
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const lineHeight = parseFloat(styles.lineHeight) || marker.offsetHeight;
    setCaret({
      left: marker.offsetLeft - el.scrollLeft,
      top: marker.offsetTop - el.scrollTop,
      width: marker.offsetWidth || parseFloat(styles.fontSize) * 0.6,
      height: lineHeight,
    });
    document.body.removeChild(mirror);
  }, [textareaRef]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const hide = () => setCaret(null);
    el.addEventListener('focus', measure);
    el.addEventListener('blur', hide);
    el.addEventListener('scroll', measure);
    document.addEventListener('selectionchange', measure);
    return () => {
      el.removeEventListener('focus', measure);
      el.removeEventListener('blur', hide);
      el.removeEventListener('scroll', measure);
      document.removeEventListener('selectionchange', measure);
    };
  }, [textareaRef, measure]);

  // Value changes can move the caret without a selectionchange (e.g. programmatic sets).
  useEffect(() => {
    measure();
  }, [value, measure]);

  return { caret };
}
