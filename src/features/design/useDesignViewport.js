import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Viewport for the design diagram: drag anywhere to pan, wheel to zoom around
 * the pointer, and a fit-to-content helper.
 *
 * The compact flowchart's `useGraphInteraction` pans on middle-click only and
 * zooms about the origin, which is unusable on a diagram this wide. Panning is
 * driven through native listeners and a direct `setAttribute` on the graph
 * group, so a drag never re-renders the whole SVG; React state is synced once
 * the gesture ends (and on zoom, which is cheap enough).
 */

const MIN_SCALE = 0.12;
const MAX_SCALE = 4;
/** Movement beyond this (px) turns a click into a drag, suppressing selection. */
const DRAG_SLOP = 4;

const clamp = (v) => Math.min(Math.max(v, MIN_SCALE), MAX_SCALE);

export function useDesignViewport() {
  const svgRef = useRef(null);
  const graphGRef = useRef(null);
  const elRef = useRef(null);

  const [transform, setTransform] = useState({ x: 24, y: 24, scale: 1 });
  const tRef = useRef({ x: 24, y: 24, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, tx: 0, ty: 0 });
  /** True from the moment a drag passes the slop until the next click is over. */
  const draggedRef = useRef(false);

  const apply = useCallback((t) => {
    tRef.current = t;
    if (graphGRef.current) {
      graphGRef.current.setAttribute(
        'transform',
        `translate(${t.x},${t.y}) scale(${t.scale})`
      );
    }
  }, []);

  const sync = useCallback(() => setTransform({ ...tRef.current }), []);

  const setView = useCallback(
    (t) => {
      apply(t);
      sync();
    },
    [apply, sync]
  );

  /** Zoom about a point in container coordinates. */
  const zoomAt = useCallback(
    (px, py, factor) => {
      const t = tRef.current;
      const scale = clamp(t.scale * factor);
      if (scale === t.scale) return;
      const k = scale / t.scale;
      setView({ x: px - (px - t.x) * k, y: py - (py - t.y) * k, scale });
    },
    [setView]
  );

  const zoomBy = useCallback(
    (factor) => {
      const el = elRef.current;
      zoomAt(el ? el.clientWidth / 2 : 0, el ? el.clientHeight / 2 : 0, factor);
    },
    [zoomAt]
  );

  const zoomIn = useCallback(() => zoomBy(1.25), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / 1.25), [zoomBy]);

  /** Scale and centre the diagram so all of it is on screen. */
  const fitTo = useCallback(
    (contentW, contentH, pad = 40) => {
      const el = elRef.current;
      if (!el || !contentW || !contentH) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const scale = clamp(Math.min((w - pad * 2) / contentW, (h - pad * 2) / contentH, 1));
      setView({
        x: (w - contentW * scale) / 2,
        y: (h - contentH * scale) / 2,
        scale,
      });
    },
    [setView]
  );

  const resetZoom = useCallback(() => setView({ x: 24, y: 24, scale: 1 }), [setView]);

  // The container callback below runs once, so it reads the live handlers off
  // refs rather than closing over the first render's versions.
  const zoomAtRef = useRef(zoomAt);
  const applyRef = useRef(apply);
  const syncRef = useRef(sync);
  const setViewRef = useRef(setView);
  zoomAtRef.current = zoomAt;
  applyRef.current = apply;
  syncRef.current = sync;
  setViewRef.current = setView;

  // Native listeners: React's synthetic wheel is passive, and pointer moves
  // during a drag must not go through React state.
  const containerRef = useCallback((el) => {
    const prev = elRef.current;
    if (prev?._cleanup) prev._cleanup();
    elRef.current = el;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Shift+wheel scrolls sideways, like every other canvas.
        const t = tRef.current;
        setViewRef.current({ ...t, x: t.x - e.deltaY });
        return;
      }
      // Trackpad pinch arrives as ctrl+wheel with small deltas; the exponential
      // keeps both that and a chunky mouse wheel feeling the same.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey || e.metaKey ? 0.01 : 0.0022));
      zoomAtRef.current(px, py, factor);
    };

    const onMove = (e) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_SLOP) {
        d.moved = true;
        draggedRef.current = true;
        setPanning(true);
      }
      if (!d.moved) return;
      applyRef.current({ ...tRef.current, x: d.tx + dx, y: d.ty + dy });
    };

    const onUp = () => {
      if (!drag.current.active) return;
      drag.current.active = false;
      setPanning(false);
      syncRef.current();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    const onDown = (e) => {
      // Left or middle button; right-click is left alone for the menu.
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      drag.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        tx: tRef.current.x,
        ty: tRef.current.y,
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onDown);
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    ro.observe(el);

    el._cleanup = () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      ro.disconnect();
    };
  }, []);

  useEffect(() => () => elRef.current?._cleanup?.(), []);

  /** Did the gesture that produced this click actually pan the canvas? */
  const consumeDrag = useCallback(() => {
    const was = draggedRef.current;
    draggedRef.current = false;
    return was;
  }, []);

  return {
    svgRef,
    graphGRef,
    containerRef,
    transform,
    panning,
    containerSize: size,
    zoomIn,
    zoomOut,
    zoomAt,
    resetZoom,
    fitTo,
    consumeDrag,
  };
}
