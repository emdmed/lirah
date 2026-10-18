import { useCallback, useRef, useState } from 'react';

/**
 * Vim-style cursor over the rows of a list (j/k, g/G, Enter, p, /; with
 * `onParent`, Backspace / h / - go up a directory, as in ranger and netrw;
 * with `onCollapseAll`, X folds every folder).
 *
 * The cursor is an index into the list's navigable rows. The list (which may
 * be virtualized, so most rows have no DOM node) registers itself through
 * `registerList({ count, activate(i), pin(i), scrollToIndex(i) })` and marks
 * the row at `cursorIndex` with `data-cursor`, styled as a lamp marker. Tree
 * lists also pass `expand(i)` / `collapse(i)` for Right / l and Left, which
 * return the row to move the cursor to, if any.
 */
export function useRowCursor({ onSearch, onParent, onCollapseAll } = {}) {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const [index, setIndexState] = useState(null);
  // Mirrors `index` so key repeat faster than a render still steps one row per press.
  const indexRef = useRef(null);
  const setIndex = useCallback((i) => {
    indexRef.current = i;
    setIndexState(i);
  }, []);
  const [count, setCount] = useState(0);

  // Called by the rendered list whenever its rows change (and with null on unmount).
  const registerList = useCallback((api) => {
    listRef.current = api;
    const nextCount = api ? api.count : 0;
    setCount(nextCount);
    // Keep the cursor on a real row when the list shrinks (folder collapsed, filter).
    if (indexRef.current != null && indexRef.current >= nextCount) {
      setIndex(nextCount > 0 ? nextCount - 1 : null);
    }
  }, [setIndex]);

  const move = useCallback((next) => {
    const list = listRef.current;
    if (!list || list.count === 0) return;
    const clamped = Math.max(0, Math.min(list.count - 1, next));
    setIndex(clamped);
    list.scrollToIndex(clamped);
  }, [setIndex]);

  const onKeyDown = useCallback((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const list = listRef.current;
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
        move((list?.count ?? 0) - 1);
        break;
      case 'Enter':
      case 'o':
        if (!list || current < 0 || current >= list.count) return;
        list.activate(current);
        break;
      case 'ArrowRight':
      case 'l': {
        if (!list?.expand || current < 0 || current >= list.count) return;
        const next = list.expand(current);
        if (next != null) move(next);
        break;
      }
      case 'ArrowLeft': {
        if (!list?.collapse || current < 0 || current >= list.count) return;
        const next = list.collapse(current);
        if (next != null) move(next);
        break;
      }
      case 'X':
        if (!onCollapseAll) return;
        onCollapseAll();
        if (list?.count) move(0);
        break;
      case 'p':
        if (list && current >= 0 && current < list.count) list.pin?.(current);
        break;
      case '/':
        if (!onSearch) return;
        onSearch();
        break;
      case 'Backspace':
      case 'h':
      case '-':
        if (!onParent) return;
        onParent();
        setIndex(null);
        break;
      case 'Escape':
        setIndex(null);
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }, [move, onSearch, onParent, onCollapseAll, setIndex]);

  // Leaving the pane drops the cursor, so a stale highlight never lingers.
  const onBlur = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIndex(null);
  }, [setIndex]);

  return { containerRef, registerList, onKeyDown, onBlur, cursorIndex: index, rowCount: count };
}
