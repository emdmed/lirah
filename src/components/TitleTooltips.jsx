import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY = 350;
const GAP = 6;
const EDGE = 8;
// Holds the title while the pointer is on its element.
const HELD = 'data-lirah-title';

/**
 * Draws every native `title` hint as an instrument tooltip, so the app has no
 * OS-styled popups. While the pointer is on an element its title is held in
 * HELD, which keeps the OS tooltip from showing; it goes back on leave so the
 * attribute still names the control for screen readers.
 * Mounted once at the app root.
 */
export function TitleTooltips() {
  const [tip, setTip] = useState(null); // { text, rect }
  const [pos, setPos] = useState(null);
  const tipRef = useRef(null);

  useEffect(() => {
    let el = null;
    let timer = null;

    const hide = () => {
      clearTimeout(timer);
      setTip(null);
    };

    const release = () => {
      hide();
      if (!el) return;
      const held = el.getAttribute(HELD);
      el.removeAttribute(HELD);
      // React may have set a new title meanwhile; that one wins.
      if (held != null && !el.hasAttribute('title')) el.setAttribute('title', held);
      el = null;
    };

    const onOver = (e) => {
      const target = e.target instanceof Element ? e.target.closest(`[title], [${HELD}]`) : null;
      if (target === el) return;
      release();
      if (!target) return;
      const text = target.getAttribute('title')?.trim();
      if (!text) return;
      el = target;
      el.setAttribute(HELD, el.getAttribute('title'));
      el.removeAttribute('title');
      timer = setTimeout(() => {
        if (el === target && target.isConnected) setTip({ text, rect: target.getBoundingClientRect() });
      }, SHOW_DELAY);
    };

    const onOut = (e) => {
      if (!e.relatedTarget) release(); // left the window
    };

    window.addEventListener('pointerover', onOver, true);
    window.addEventListener('pointerout', onOut, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', release);
    return () => {
      release();
      window.removeEventListener('pointerover', onOver, true);
      window.removeEventListener('pointerout', onOut, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('wheel', hide, { capture: true });
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', release);
    };
  }, []);

  // Below the element, or above when there's no room; kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) { setPos(null); return; }
    const { width, height } = tipRef.current.getBoundingClientRect();
    const { rect } = tip;
    const below = rect.bottom + GAP + height <= window.innerHeight - EDGE;
    const top = below ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - height);
    const centered = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE, centered), window.innerWidth - EDGE - width);
    setPos({ top, left, side: below ? 'bottom' : 'top' });
  }, [tip]);

  if (!tip) return null;

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      data-state="open"
      data-side={pos?.side ?? 'bottom'}
      className="ins-pop ins-tip fixed z-[1000] pointer-events-none max-w-80 px-2 py-1 text-xs font-mono whitespace-pre-line text-balance"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
