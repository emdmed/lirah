import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { useBookmarks } from '../contexts/BookmarksContext';
import { FolderOpen } from 'lucide-react';

export function InitialProjectDialog({ open, onOpenChange, onNavigate, onLaunchClaude, onSwitchToClaudeMode }) {
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
    if (onNavigate) {
      await onNavigate(bookmark);
    }
    // Switch to Claude mode (tree view) and launch Claude after navigation completes
    setTimeout(() => {
      if (onSwitchToClaudeMode) {
        onSwitchToClaudeMode();
      }
      if (onLaunchClaude) {
        onLaunchClaude();
      }
    }, 200);
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Open Project
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto py-1">
          {sortedBookmarks.map((bookmark, index) => (
            <button
              key={bookmark.id}
              ref={index === selectedIndex ? selectedItemRef : null}
              onClick={() => handleSelectBookmark(bookmark)}
              className={`flex flex-col items-start px-3 py-2 rounded text-left transition-colors ${
                index === selectedIndex
                  ? 'bg-white/10'
                  : 'hover:bg-white/5'
              }`}
            >
              <span className="text-sm font-medium">{bookmark.name}</span>
              <span className="text-xs opacity-50">{bookmark.path}</span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip}>
            Skip (Esc)
          </Button>
          <Button
            onClick={() => sortedBookmarks[selectedIndex] && handleSelectBookmark(sortedBookmarks[selectedIndex])}
            disabled={sortedBookmarks.length === 0}
          >
            Confirm (Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
