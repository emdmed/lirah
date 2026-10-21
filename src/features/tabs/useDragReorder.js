import { useCallback, useState } from 'react';

/**
 * Drag-to-reorder for a vertical list: the row being dragged, where it would
 * land (before or after the row under the pointer), and `reorder(from, to)`
 * called on drop.
 */
export function useDragReorder(reorder) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dropAt, setDropAt] = useState(null); // { index, after }

  const onDragStart = useCallback((e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  }, []);

  const onDragOver = useCallback((e, index) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDropAt((prev) => (prev?.index === index && prev.after === after ? prev : { index, after }));
  }, [dragIndex]);

  const endDrag = useCallback(() => {
    setDragIndex(null);
    setDropAt(null);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    if (dragIndex !== null && dropAt) {
      let to = dropAt.after ? dropAt.index + 1 : dropAt.index;
      if (dragIndex < to) to -= 1;
      reorder(dragIndex, to);
    }
    endDrag();
  }, [dragIndex, dropAt, reorder, endDrag]);

  /** Where row `index` shows the drop line: 'before', 'after' or null. */
  const dropLineAt = useCallback((index) => {
    if (dragIndex === null || dropAt?.index !== index) return null;
    // The slot the drop would fill; the two slots beside the dragged row are no-ops.
    const slot = dropAt.after ? index + 1 : index;
    if (slot === dragIndex || slot === dragIndex + 1) return null;
    return dropAt.after ? 'after' : 'before';
  }, [dragIndex, dropAt]);

  return { dragIndex, onDragStart, onDragOver, onDrop, endDrag, dropLineAt };
}
