import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { useBookmarks } from '../features/bookmarks';
import { FolderOpen } from 'lucide-react';

export function InitialProjectDialog({ open, onOpenChange, onSelectProject }) {
  const { bookmarks } = useBookmarks();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedItemRef = useRef(null);

  // Sort bookmarks by lastAccessedAt (most recent first)
  const sortedBookmarks = [...bookmarks].sort((a, b) =>
    (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0)
  );

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
        setSelectedIndex(prev => Math.min(prev + 1, sortedBookmarks.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (sortedBookmarks[selectedIndex]) {
          handleSelectBookmark(sortedBookmarks[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, sortedBookmarks, onOpenChange]);

  const handleSelectBookmark = async (bookmark) => {
    onOpenChange(false);
    if (onSelectProject) {
      onSelectProject(bookmark);
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
          {sortedBookmarks.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm opacity-50">
              <div className="text-center">
                <p>No bookmarks yet.</p>
                <p className="text-xs mt-2">
                  Open the sidebar (Ctrl+S) and click the star icon to add one.
                </p>
              </div>
            </div>
          ) : (
            sortedBookmarks.map((bookmark, index) => (
              <button
                key={bookmark.id}
                ref={index === selectedIndex ? selectedItemRef : null}
                onClick={() => handleSelectBookmark(bookmark)}
                className={`flex flex-col items-start gap-1 px-4 py-3 text-left font-mono border border-sketch shadow-xs transition-colors ${
                  index === selectedIndex
                    ? 'outline outline-1 outline-dashed outline-ring/70 outline-offset-0'
                    : 'hover:bg-white/5'
                }`}
                style={{ backgroundColor: 'var(--color-input-background)' }}
              >
                <span className="font-medium">{bookmark.name}</span>
                <span className="text-xs opacity-50">{bookmark.path}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 text-xs opacity-50 border-t pt-2">
          <span>↑↓ Navigate</span>
          <span>Enter Select</span>
          <span>ESC Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
