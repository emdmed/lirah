import { useState, useRef, useCallback, useEffect } from "react";

export function useGraphInteraction() {
  const svgRef = useRef(null);
  const containerElRef = useRef(null);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedProp, setSelectedProp] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const panState = useRef({ active: false, startX: 0, startY: 0, tx: 0, ty: 0 });
  const graphGRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const resizeObserverRef = useRef(null);

  const resetState = useCallback(() => {
    setExpandedNodes(new Set());
    setSelectedNode(null);
    setSelectedProp(null);
    const t = { x: 40, y: 40, scale: 1 };
    transformRef.current = t;
    setTransform(t);
  }, []);

  const toggleNode = useCallback((id) => {
    setSelectedNode(prev => prev === id ? null : id);
    setSelectedProp(null);
    setExpandedNodes(prev => {
      if (prev.has(id)) return new Set();
      return new Set([id]);
    });
  }, []);

  const applyTransform = useCallback((t) => {
    transformRef.current = t;
    if (graphGRef.current) {
      graphGRef.current.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.scale})`);
    }
  }, []);

  const syncTransformState = useCallback(() => {
    setTransform({ ...transformRef.current });
  }, []);

  // Pan handlers — middle mouse button only
  const onPanStart = useCallback((e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    panState.current = { active: true, startX: e.clientX, startY: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y };
  }, []);

  const onPanMove = useCallback((e) => {
    if (!panState.current.active) return;
    const ps = panState.current;
    applyTransform({
      ...transformRef.current,
      x: ps.tx + (e.clientX - ps.startX),
      y: ps.ty + (e.clientY - ps.startY),
    });
  }, [applyTransform]);

  const onPanEnd = useCallback((e) => {
    if (e.button !== 1) return;
    panState.current.active = false;
    syncTransformState();
  }, [syncTransformState]);

  const onPanLeave = useCallback(() => {
    if (panState.current.active) {
      panState.current.active = false;
      syncTransformState();
    }
  }, [syncTransformState]);

  // Wheel zoom via callback ref
  const wheelHandler = useRef(null);
  wheelHandler.current = (e) => {
    e.preventDefault();
    const t = transformRef.current;
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.min(Math.max(t.scale * delta, 0.1), 5);
    applyTransform({ ...t, scale: newScale });
    syncTransformState();
  };

  const containerRef = useCallback((el) => {
    if (containerElRef.current) {
      containerElRef.current.removeEventListener('wheel', containerElRef.current._wheelFn);
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    containerElRef.current = el;
    if (el) {
      const fn = (e) => wheelHandler.current(e);
      el._wheelFn = fn;
      el.addEventListener('wheel', fn, { passive: false });
      const ro = new ResizeObserver(([entry]) => {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      });
      ro.observe(el);
      resizeObserverRef.current = ro;
    }
  }, []);

  const zoomIn = useCallback(() => {
    const t = transformRef.current;
    const n = { ...t, scale: Math.min(t.scale * 1.3, 5) };
    applyTransform(n);
    syncTransformState();
  }, [applyTransform, syncTransformState]);

  const zoomOut = useCallback(() => {
    const t = transformRef.current;
    const n = { ...t, scale: Math.max(t.scale / 1.3, 0.1) };
    applyTransform(n);
    syncTransformState();
  }, [applyTransform, syncTransformState]);

  const resetZoom = useCallback(() => {
    const n = { x: 40, y: 40, scale: 1 };
    applyTransform(n);
    syncTransformState();
  }, [applyTransform, syncTransformState]);

  return {
    svgRef, graphGRef, containerRef,
    expandedNodes, setExpandedNodes,
    selectedNode, setSelectedNode,
    selectedProp, setSelectedProp,
    transform, transformRef,
    panState, containerSize,
    resetState, toggleNode,
    applyTransform, syncTransformState,
    onPanStart, onPanMove, onPanEnd, onPanLeave,
    zoomIn, zoomOut, resetZoom,
  };
}
