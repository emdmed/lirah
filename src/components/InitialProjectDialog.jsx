import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useBookmarks } from '../features/bookmarks';
import { FolderOpen, Layers } from 'lucide-react';

export function InitialProjectDialog({ open, onOpenChange, onSelectProject, workspaces, onOpenWorkspace }) {
  const { bookmarks } = useBookmarks();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedItemRef = useRef(null);

  // Sort bookmarks by lastAccessedAt (most recent first)
  const sortedBookmarks = [...bookmarks].sort((a, b) =>
    (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0)
  );

  // Combined list: workspaces first, then bookmarks
  const items = useMemo(() => {
    const wsItems = (workspaces || []).map(ws => ({
      type: 'workspace',
      id: ws.id,
      name: ws.name,
      subtitle: ws.projects.map(p => p.name).join(', '),
      data: ws,
    }));
    const bkItems = sortedBookmarks.map(b => ({
      type: 'bookmark',
      id: b.id,
      name: b.name,
      subtitle: b.path,
      data: b,
    }));
    return [...wsItems, ...bkItems];
  }, [workspaces, sortedBookmarks]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          handleSelectItem(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, items, onOpenChange]);

  const handleSelectItem = async (item) => {
    onOpenChange(false);
    if (item.type === 'workspace' && onOpenWorkspace) {
      onOpenWorkspace(item.data.path);
    } else if (item.type === 'bookmark' && onSelectProject) {
      onSelectProject(item.data);
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex justify-center pb-2">
          <span style={{ fontFamily: "'Grenze Gotisch', serif", fontSize: '42px', lineHeight: 1 }}>
            Lirah
          </span>
        </div>

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Open Project
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto border rounded-md p-2 border-sketch">
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm opacity-50">
              <div className="text-center">
                <p>No bookmarks yet.</p>
                <p className="text-xs mt-2">
                  Open the sidebar (Ctrl+S) and click the star icon to add one.
                </p>
              </div>
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                ref={index === selectedIndex ? selectedItemRef : null}
                onClick={() => handleSelectItem(item)}
                className={`flex flex-col items-start gap-1 px-4 py-2.5 text-left font-mono transition-colors rounded-sm ${
                  index === selectedIndex
                    ? 'bg-foreground/8 border-l-2 border-primary'
                    : 'hover:bg-foreground/5 border-l-2 border-transparent'
                }`}
              >
                <span className="font-medium flex items-center gap-2">
                  {item.type === 'workspace' && <Layers className="w-3 h-3 opacity-50" />}
                  {item.name}
                </span>
                <span className="text-xs opacity-50 truncate max-w-full">{item.subtitle}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 text-xs opacity-50 border-t border-foreground/10 pt-2">
          <span><span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm text-[10px]">↑↓</span> Navigate</span>
          <span><span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm text-[10px]">Enter</span> Select</span>
          <span><span className="px-1.5 py-0.5 bg-foreground/5 rounded-sm text-[10px]">ESC</span> Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
