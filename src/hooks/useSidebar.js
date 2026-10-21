import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSeededSetting } from "../features/settings/settingsStore";

const clampWidth = (x) => Math.min(Math.max(200, x), 600);

export function useSidebar({ resetTypeChecker }) {
  // Seeded from the settings store: each tab keeps its own open state and
  // width, and the last one set is what the next tab (or restart) opens with.
  const [sidebarOpen, setSidebarOpen] = useSeededSetting('sidebarOpen');
  const [storedWidth, setSidebarWidth] = useSeededSetting('sidebarWidth');
  const sidebarWidth = clampWidth(storedWidth);
  const [isResizing, setIsResizing] = useState(false);
  // The sidebar element: a drag writes its width directly, once per frame, and
  // commits to state on mouseup so the tab doesn't re-render per mousemove.
  const sidebarRef = useRef(null);
  const endDragRef = useRef(null);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    let frame = 0;
    let pending = null;
    const apply = () => {
      frame = 0;
      if (sidebarRef.current) sidebarRef.current.style.width = `${pending}px`;
    };
    const onMove = (ev) => {
      pending = clampWidth(ev.clientX);
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const endDrag = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      endDragRef.current = null;
    };
    const onUp = () => {
      endDrag();
      setIsResizing(false);
      if (pending == null) return;
      // Flush the last move: state may already equal it, in which case React
      // wouldn't touch the element.
      apply();
      setSidebarWidth(pending);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    endDragRef.current = endDrag;
  }, []);

  // Drop the listeners if the tab unmounts mid-drag.
  useEffect(() => () => endDragRef.current?.(), []);

  // Clear expansion state when sidebar closes
  useEffect(() => {
    if (!sidebarOpen) {
      resetTypeChecker();
    }
  }, [sidebarOpen, resetTypeChecker]);

  return useMemo(() => ({
    sidebarOpen, setSidebarOpen,
    sidebarWidth,
    sidebarRef,
    isResizing,
    handleResizeStart,
  }), [sidebarOpen, sidebarWidth, isResizing, handleResizeStart]);
}
