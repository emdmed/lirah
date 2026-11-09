import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FloatPane } from '../../components/ui/float-pane';
import { focusPane } from '../../hooks/usePaneShortcuts';
import { closeDrawer, useOpenDrawer } from './zenDrawerStore';

const GAP = 4;

// A Zen drawer: a FloatPane rising from the ZenLine segment that opened it,
// over the terminal (fixed, so nothing resizes). One open at a time. It closes
// on Esc, its key again, a click outside, or a key typed into the terminal,
// and hands focus back to the terminal. `focus` picks what takes focus on open.
export function ZenDrawer({ id, focus, className, children, ...pane }) {
  const open = useOpenDrawer();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const isOpen = open?.id === id;
  const anchor = isOpen ? open.anchor : null;

  useLayoutEffect(() => {
    if (!isOpen) return setPos(null);
    const r = anchor?.getBoundingClientRect();
    const bottom = window.innerHeight - (r?.top ?? window.innerHeight) + GAP;
    // A strip's drawer spans its column; the line's drawers keep their own width.
    const col = anchor?.closest('[data-tab-pane]')?.getBoundingClientRect();
    setPos(col
      ? { left: col.left + GAP, width: col.width - 2 * GAP, bottom }
      : { left: Math.max(GAP, r?.left ?? GAP), bottom });
  }, [isOpen, anchor]);

  useEffect(() => {
    if (!isOpen || !pos) return;
    const el = ref.current;
    // An empty drawer (nothing to focus) takes focus itself, so Esc still reaches it.
    (el.querySelector(focus) ?? el.querySelector('button, [tabindex]:not([tabindex="-1"])') ?? el).focus({ preventScroll: true });
    const onPointer = (e) => {
      // Menus and dialogs a row opens are portalled out of the drawer but belong to it.
      if (e.target.closest?.('[data-radix-popper-content-wrapper], [role="dialog"], [role="menu"]')) return;
      if (!el.contains(e.target) && !anchor?.contains(e.target)) closeDrawer(id);
    };
    const onKey = (e) => {
      if (e.altKey) return; // Alt keys are app shortcuts (Alt+4 toggles itself)
      if (e.target instanceof Element && e.target.closest('.xterm')) closeDrawer(id);
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      // Back to the terminal, unless the drawer closed because you clicked elsewhere.
      if (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement)) {
        requestAnimationFrame(() => focusPane(2));
      }
    };
  }, [isOpen, !!pos]);

  // Zen off (ZenLine unmounts) closes the drawer, so it doesn't reopen next time.
  useEffect(() => () => closeDrawer(id), [id]);

  if (!isOpen || !pos) return null;
  return createPortal(
    <FloatPane
      ref={ref}
      data-side="top"
      data-state="open"
      className={`ins-pop fixed z-50 flex flex-col max-h-[60vh] overflow-y-auto ${className ?? ''}`}
      style={pos}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault();
          closeDrawer(id);
        }
      }}
      {...pane}
    >
      {children}
    </FloatPane>,
    document.body,
  );
}
