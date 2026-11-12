import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Long enough that passing over a control on the way to a click shows nothing.
const SHOW_DELAY = 650;
const GAP = 6;
const EDGE = 8;
// Holds the title while the pointer is on its element.
const HELD = 'data-lirah-title';

// A Radix tooltip trigger: its tooltip is the one hint there.
const RADIX_TRIGGER = '[data-slot="tooltip-trigger"]';

// The element a hover's hint belongs to: the nearest one with a title (live or
// held), or an svg element with a <title> child.
function hintOwner(el) {
  for (let n = el; n; n = n.parentElement) {
    if (n.hasAttribute('title') || n.hasAttribute(HELD)) return n;
    if (n instanceof SVGElement && n.querySelector(':scope > title')) return n;
  }
  return null;
}

/**
 * Draws every native hint (a `title` attribute or an SVG `<title>`) as an
 * instrument tooltip, so the app has no OS-styled popups and a hover shows one
 * hint. While the pointer is on an element every native hint from it up to the
 * root is held (titles in HELD, `<title>` text emptied), which keeps the OS
 * from drawing any of them; the innermost is the one shown. Inside a Radix
 * tooltip trigger nothing is drawn: the Radix tooltip is the hint. Everything
 * goes back on leave so the hints still name their controls for screen readers.
 * Mounted once at the app root.
 */
export function TitleTooltips() {
  const [tip, setTip] = useState(null); // { text, rect }
  const [pos, setPos] = useState(null);
  const tipRef = useRef(null);

  useEffect(() => {
    let owner = null;
    let radix = false;
    let timer = null;
    const held = new Map(); // element -> its title, or <title> text node -> its text

    // Hold every native hint from `from` up; returns the innermost one's text.
    // Safe to run again: only hints that came back live are held anew.
    const hold = (from) => {
      let text = null;
      for (let n = from; n; n = n.parentElement) {
        const live = n.getAttribute('title');
        if (live != null) {
          held.set(n, live);
          n.setAttribute(HELD, live);
          n.removeAttribute('title');
        }
        let hint = held.has(n) ? held.get(n) : null;
        const t = n instanceof SVGElement ? n.querySelector(':scope > title') : null;
        if (t) {
          // Empty the text nodes rather than the <title>, so React keeps the nodes it updates.
          for (const c of t.childNodes) {
            if (c.nodeType === Node.TEXT_NODE && c.nodeValue) {
              held.set(c, c.nodeValue);
              c.nodeValue = '';
            }
          }
          hint ??= [...t.childNodes].map((c) => held.get(c) ?? '').join('');
        }
        if (hint == null) continue;
        // A cal element repaints its <title> on every frame of a glide.
        watch.observe(n, t ? { attributeFilter: ['title'], childList: true, characterData: true, subtree: true } : { attributeFilter: ['title'] });
        text ??= hint;
      }
      return text?.trim();
    };

    // A live hint (a running clock, say) is set again while held: hold the new one too,
    // or the OS tooltip shows beside ours.
    const watch = new MutationObserver(() => {
      if (!owner) return;
      const text = hold(owner);
      setTip((t) => (t && text && t.text !== text ? { ...t, text } : t));
    });

    const hide = () => {
      clearTimeout(timer);
      setTip(null);
    };

    const release = () => {
      hide();
      watch.disconnect();
      for (const [n, v] of held) {
        if (n.nodeType === Node.TEXT_NODE) {
          if (!n.nodeValue) n.nodeValue = v;
        } else {
          n.removeAttribute(HELD);
          // React may have set a new title meanwhile; that one wins.
          if (!n.hasAttribute('title')) n.setAttribute('title', v);
        }
      }
      held.clear();
      owner = null;
      radix = false;
    };

    const onOver = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const next = target && hintOwner(target);
      const inRadix = !!target?.closest(RADIX_TRIGGER);
      if (next === owner && inRadix === radix) return;
      release();
      if (!next) return;
      owner = next;
      radix = inRadix;
      if (!hold(next) || radix) return;
      timer = setTimeout(() => {
        const text = owner === next && next.isConnected && hold(next);
        if (text) setTip({ text, rect: next.getBoundingClientRect() });
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
  // A multi-line title reads as a name over its note: the first line is the italic title.
  const [head, ...rest] = tip.text.split('\n');
  const body = rest.join('\n');

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      data-state="open"
      data-side={pos?.side ?? 'bottom'}
      className="ins-pop ins-tip fixed z-[1000] pointer-events-none max-w-80 px-2 py-1 text-xs font-mono whitespace-pre-line text-balance"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {head && body ? <><span className="ins-tip-title ins-name">{head}</span>{body}</> : tip.text}
    </div>,
    document.body,
  );
}
