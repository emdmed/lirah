import { useState, useCallback } from "react";

export function useElementPicker() {
  const [elementPickerOpen, setElementPickerOpen] = useState(false);
  const [elementPickerFilePath, setElementPickerFilePath] = useState(null);
  const [selectedElements, setSelectedElements] = useState(new Map());

  const handleOpenElementPicker = useCallback((filePath) => {
    setElementPickerFilePath(filePath);
    setElementPickerOpen(true);
  }, []);

  const handleAddElements = useCallback((filePath, elements) => {
    setSelectedElements(prev => {
      const next = new Map(prev);
      const existing = next.get(filePath) || [];
      const existingKeys = new Set(existing.map(e => e.key));
      const newElements = elements.filter(e => !existingKeys.has(e.key));
      next.set(filePath, [...existing, ...newElements]);
      return next;
    });
  }, []);

  // Drops one element; a file left with none is dropped too, so the prompt
  // never lists an empty ELEMENTS block.
  const removeElement = useCallback((filePath, key) => {
    setSelectedElements(prev => {
      const existing = prev.get(filePath);
      if (!existing) return prev;
      const next = new Map(prev);
      const remaining = existing.filter(e => e.key !== key);
      if (remaining.length > 0) next.set(filePath, remaining);
      else next.delete(filePath);
      return next;
    });
  }, []);

  const clearSelectedElements = useCallback(() => {
    setSelectedElements(new Map());
  }, []);

  return {
    elementPickerOpen, setElementPickerOpen,
    elementPickerFilePath,
    selectedElements,
    handleOpenElementPicker,
    handleAddElements,
    removeElement,
    clearSelectedElements,
  };
}
