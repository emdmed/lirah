import { useCallback, useEffect, useRef, useState } from 'react';

// Computed styles copied onto the mirror so its text wraps exactly like the textarea's.
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'tabSize',
];

const sameCaret = (a, b) =>
  a && b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

/**
 * Tracks where a terminal-style block cursor should be drawn over a textarea.
 * WebKit ignores `caret-shape`, so the caret position is measured with a hidden
 * mirror element and the block is drawn by the caller.
 * Returns `{ caret: { left, top, width, height } | null }` relative to the textarea.
 */
export function useBlockCaret(textareaRef, value) {
  const [caret, setCaret] = useState(null);
  // One mirror for the hook's lifetime: { root, text, marker }. Its styles are
  // copied from the textarea once and again only after a resize or theme change.
  const mirrorRef = useRef(null);
  const stylesRef = useRef(null); // { lineHeight, fontSize } while the mirror's styles are current
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    frameRef.current = 0;
    const el = textareaRef.current;
    if (!el || document.activeElement !== el || el.selectionStart !== el.selectionEnd) {
      setCaret(null);
      return;
    }
    let mirror = mirrorRef.current;
    if (!mirror) {
      const root = document.createElement('div');
      Object.assign(root.style, {
        position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
      });
      const text = document.createTextNode('');
      const marker = document.createElement('span');
      root.append(text, marker);
      document.body.appendChild(root);
      mirror = mirrorRef.current = { root, text, marker };
    }
    if (!stylesRef.current) {
      const styles = window.getComputedStyle(el);
      for (const prop of MIRRORED) mirror.root.style[prop] = styles[prop];
      stylesRef.current = { lineHeight: parseFloat(styles.lineHeight), fontSize: parseFloat(styles.fontSize) };
    }
    const { lineHeight, fontSize } = stylesRef.current;
    const pos = el.selectionStart;
    mirror.text.data = el.value.slice(0, pos);
    // The block covers the next character, or one space at the end of a line.
    const next = el.value[pos];
    mirror.marker.textContent = !next || next === '\n' ? ' ' : next;
    const { marker } = mirror;
    const nextCaret = {
      left: marker.offsetLeft - el.scrollLeft,
      top: marker.offsetTop - el.scrollTop,
      width: marker.offsetWidth || fontSize * 0.6,
      height: lineHeight || marker.offsetHeight,
    };
    setCaret((prev) => (sameCaret(prev, nextCaret) ? prev : nextCaret));
  }, [textareaRef]);

  // Selection moves and value changes usually arrive together; measure once per frame.
  const schedule = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const hide = () => setCaret(null);
    const invalidate = () => {
      stylesRef.current = null;
      schedule();
    };
    el.addEventListener('focus', schedule);
    el.addEventListener('blur', hide);
    el.addEventListener('scroll', schedule);
    document.addEventListener('selectionchange', schedule);
    window.addEventListener('resize', invalidate);
    // Pane resizes change the wrap width; theme changes land on the root element.
    const resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(el);
    const themeObserver = new MutationObserver(invalidate);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => {
      el.removeEventListener('focus', schedule);
      el.removeEventListener('blur', hide);
      el.removeEventListener('scroll', schedule);
      document.removeEventListener('selectionchange', schedule);
      window.removeEventListener('resize', invalidate);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [textareaRef, schedule]);

  // Value changes can move the caret without a selectionchange (e.g. programmatic sets).
  useEffect(() => {
    schedule();
  }, [value, schedule]);

  useEffect(() => () => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    mirrorRef.current?.root.remove();
    mirrorRef.current = null;
  }, []);

  return { caret };
}
