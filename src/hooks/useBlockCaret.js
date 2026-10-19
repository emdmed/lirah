import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

// Computed styles copied onto the mirror so its text wraps exactly like the textarea's.
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'tabSize',
];

// How long the caret holds solid after it moves, like a terminal cursor.
const BUSY_MS = 500;

/**
 * Draws a terminal-style block cursor over a textarea.
 * WebKit ignores `caret-shape`, so the caret position is measured with a hidden
 * mirror element. The caller renders an element with the returned `caretRef`;
 * it is positioned by direct style writes, never through React state, so the
 * block moves in the same frame as the text instead of one render behind it.
 */
export function useBlockCaret(textareaRef, value) {
  const caretRef = useRef(null);
  // One mirror for the hook's lifetime: { root, text, marker }. Its styles are
  // copied from the textarea once and again only after a resize or theme change.
  const mirrorRef = useRef(null);
  const stylesRef = useRef(null); // { lineHeight, fontSize } while the mirror's styles are current
  const lastRef = useRef(''); // position, scroll and text the caret was last measured from
  const busyTimerRef = useRef(0);

  const hide = useCallback(() => {
    const caret = caretRef.current;
    if (caret) caret.hidden = true;
    lastRef.current = '';
  }, []);

  const measure = useCallback(() => {
    const el = textareaRef.current;
    const caret = caretRef.current;
    if (!el || !caret) return;
    if (document.activeElement !== el || el.selectionStart !== el.selectionEnd) {
      hide();
      return;
    }
    const pos = el.selectionStart;
    // Input and selectionchange both report the same move; measure it once.
    const key = `${pos}|${el.scrollTop}|${el.scrollLeft}|${stylesRef.current ? 1 : 0}|${el.value}`;
    if (key === lastRef.current) return;
    lastRef.current = key;

    let mirror = mirrorRef.current;
    if (!mirror) {
      const root = document.createElement('div');
      Object.assign(root.style, {
        position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', contain: 'layout style',
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
    mirror.text.data = el.value.slice(0, pos);
    // The block covers the next character, or one space at the end of a line.
    const next = el.value[pos];
    mirror.marker.textContent = !next || next === '\n' ? ' ' : next;
    const { marker } = mirror;
    const left = marker.offsetLeft - el.scrollLeft;
    const top = marker.offsetTop - el.scrollTop;
    const style = caret.style;
    style.transform = `translate(${left}px, ${top}px)`;
    style.width = `${marker.offsetWidth || fontSize * 0.6}px`;
    style.height = `${lineHeight || marker.offsetHeight}px`;
    caret.hidden = false;
    // Hold solid while moving; the blink resumes once the caret rests.
    caret.dataset.busy = '';
    clearTimeout(busyTimerRef.current);
    busyTimerRef.current = setTimeout(() => {
      if (caretRef.current) delete caretRef.current.dataset.busy;
    }, BUSY_MS);
  }, [textareaRef, hide]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const invalidate = () => {
      stylesRef.current = null;
      measure();
    };
    el.addEventListener('focus', measure);
    el.addEventListener('blur', hide);
    el.addEventListener('scroll', measure);
    document.addEventListener('selectionchange', measure);
    window.addEventListener('resize', invalidate);
    // Pane resizes change the wrap width; theme changes land on the root element.
    const resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(el);
    const themeObserver = new MutationObserver(invalidate);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    return () => {
      el.removeEventListener('focus', measure);
      el.removeEventListener('blur', hide);
      el.removeEventListener('scroll', measure);
      document.removeEventListener('selectionchange', measure);
      window.removeEventListener('resize', invalidate);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [textareaRef, measure, hide]);

  // Before paint, so the block lands with the character that moved it.
  useLayoutEffect(() => {
    measure();
  }, [value, measure]);

  useEffect(() => () => {
    clearTimeout(busyTimerRef.current);
    mirrorRef.current?.root.remove();
    mirrorRef.current = null;
  }, []);

  return { caretRef };
}
