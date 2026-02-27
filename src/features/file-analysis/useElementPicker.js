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

  const clearSelectedElements = useCallback(() => {
    setSelectedElements(new Map());
  }, []);

  return {
    elementPickerOpen, setElementPickerOpen,
    elementPickerFilePath,
    selectedElements,
    handleOpenElementPicker,
    handleAddElements,
    clearSelectedElements,
  };
}
