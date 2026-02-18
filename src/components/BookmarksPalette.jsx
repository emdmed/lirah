import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Input } from './ui/input';
import { useBookmarks } from '../contexts/BookmarksContext';
import { EmptyState } from './EmptyState';
import { Search, Star, Bookmark } from 'lucide-react';

export function BookmarksPalette({ open, onOpenChange, onNavigate }) {
  const { bookmarks } = useBookmarks();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef(null);
  const selectedItemRef = useRef(null);

  // Filter bookmarks based on search query
  const filteredBookmarks = bookmarks.filter(bookmark => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      bookmark.name.toLowerCase().includes(query) ||
      bookmark.path.toLowerCase().includes(query)
    );
  });

  // Reset search and selection when palette opens/closes
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedIndex(0);
      // Auto-focus search input
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [open]);

  // Reset selection when filtered results change
  useEffect(() => {
    if (selectedIndex >= filteredBookmarks.length) {
      setSelectedIndex(Math.max(0, filteredBookmarks.length - 1));
    }
  }, [filteredBookmarks.length, selectedIndex]);

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
        setSelectedIndex(prev => Math.min(prev + 1, filteredBookmarks.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredBookmarks[selectedIndex]) {
          handleSelectBookmark(filteredBookmarks[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, filteredBookmarks, onOpenChange]);

  const handleSelectBookmark = (bookmark) => {
    if (onNavigate) {
      onNavigate(bookmark);
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[50vh]">
        <SheetHeader>
          <SheetTitle>Project Bookmarks</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 h-full">
          {/* Search input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Bookmarks list */}
          <div className="flex-1 overflow-y-auto">
            {filteredBookmarks.length === 0 ? (
              bookmarks.length === 0 ? (
                <EmptyState
                  icon={Bookmark}
                  title="No bookmarks yet"
                  description="Save frequently used directories for quick access. Open the sidebar (Ctrl+S) and click the star icon to add one."
                />
              ) : (
                <EmptyState
                  icon={Search}
                  title="No bookmarks match your search"
                  description="Try a different search term or clear the search to see all bookmarks"
                />
              )
            ) : (
              <div className="flex flex-col gap-1">
                {filteredBookmarks.map((bookmark, index) => (
                  <button
                    key={bookmark.id}
                    ref={index === selectedIndex ? selectedItemRef : null}
                    onClick={() => handleSelectBookmark(bookmark)}
                    className={`flex flex-col items-start gap-1 px-4 py-3 rounded-md text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-white/10'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="font-medium">{bookmark.name}</span>
                    <span className="text-xs opacity-50">{bookmark.path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Keyboard hints */}
          <div className="flex items-center gap-4 text-xs opacity-50 border-t pt-2">
            <span>↑↓ Navigate</span>
            <span>Enter Select</span>
            <span>ESC Close</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
