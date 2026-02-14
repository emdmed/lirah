import { useState, useEffect, useCallback, useMemo } from "react";

export function useSidebar({ resetTypeChecker }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!isResizing) return;
      const newWidth = Math.min(Math.max(200, e.clientX), 600);
      setSidebarWidth(newWidth);
    };
    const handleResizeEnd = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);

  // Clear expansion state when sidebar closes
  useEffect(() => {
    if (!sidebarOpen) {
      resetTypeChecker();
    }
  }, [sidebarOpen, resetTypeChecker]);

  return useMemo(() => ({
    sidebarOpen, setSidebarOpen,
    sidebarWidth,
    isResizing,
    handleResizeStart,
  }), [sidebarOpen, sidebarWidth, isResizing, handleResizeStart]);
}
