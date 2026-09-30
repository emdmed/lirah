import { useCallback, useEffect, useRef, useState } from 'react';

const ROW = '[data-nav-row]';

/**
 * Vim-style cursor over the rows of a list (j/k, g/G, Enter, p, /).
 * Works on the DOM rather than on data so it covers any list that marks its
 * rows with `data-nav-row`; Enter clicks the row's `[data-nav-activate]`
 * element (or the row), `p` clicks `[data-nav-pin]`.
 * The cursor row gets `data-cursor`, styled as inverse video.
 */
export function useRowCursor({ onSearch } = {}) {
  const containerRef = useRef(null);
  const [index, setIndexState] = useState(null);
  // Mirrors `index` so key repeat faster than a render still steps one row per press.
  const indexRef = useRef(null);
  const setIndex = useCallback((i) => {
    indexRef.current = i;
    setIndexState(i);
  }, []);
  const [count, setCount] = useState(0);

  const rows = useCallback(
    () => (containerRef.current ? [...containerRef.current.querySelectorAll(ROW)] : []),
    []
  );

  // Re-mark the cursor row after every render: rows are re-created as folders
  // expand or the list filters, and React doesn't own this attribute.
  useEffect(() => {
    const all = rows();
    if (all.length !== count) setCount(all.length);
    all.forEach((row, i) => {
      if (i === index) row.setAttribute('data-cursor', '');
      else row.removeAttribute('data-cursor');
    });
  });

  const move = useCallback((next) => {
    const all = rows();
    if (all.length === 0) return;
    const clamped = Math.max(0, Math.min(all.length - 1, next));
    setIndex(clamped);
    all[clamped].scrollIntoView({ block: 'nearest' });
  }, [rows, setIndex]);

  const onKeyDown = useCallback((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const all = rows();
    const current = indexRef.current ?? -1;
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        move(current + 1);
        break;
      case 'k':
      case 'ArrowUp':
        move(current < 0 ? 0 : current - 1);
        break;
      case 'g':
      case 'Home':
        move(0);
        break;
      case 'G':
      case 'End':
        move(all.length - 1);
        break;
      case 'Enter':
      case 'o': {
        const row = all[current];
        if (!row) return;
        (row.querySelector('[data-nav-activate]') || row).click();
        break;
      }
      case 'p': {
        all[current]?.querySelector('[data-nav-pin]')?.click();
        break;
      }
      case '/':
        if (!onSearch) return;
        onSearch();
        break;
      case 'Escape':
        setIndex(null);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }, [rows, move, onSearch, setIndex]);

  // Leaving the pane drops the cursor, so a stale highlight never lingers.
  const onBlur = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIndex(null);
  }, [setIndex]);

  return { containerRef, onKeyDown, onBlur, cursorIndex: index, rowCount: count };
}
