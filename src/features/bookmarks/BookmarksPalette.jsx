import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { Input } from '../../components/ui/input';
import { DialogEmpty } from '../../components/ui/dialog';
import { PickerRow, OpenTabTag, tildePath, useOpenTabsByPath } from '../../components/ui/picker';
import { Keycap } from '../../components/instrument/Keycap';
import { Lamp } from '../../components/instrument/Lamp';
import { useBookmarks } from './BookmarksContext';

// A key hint on the palette's bottom line: `↑ ↓ move`.
function Hint({ keys, label }) {
  return (
    <span className="inline-flex items-center gap-[3px] whitespace-nowrap">
      {keys.map((k, i) => <Keycap key={i} size="sm">{k}</Keycap>)}
      <span className="ml-[3px]">{label}</span>
    </span>
  );
}

export function BookmarksPalette({ open, onOpenChange, onNavigate }) {
  const { bookmarks } = useBookmarks();
  const openTabs = useOpenTabsByPath();
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

  // A pane rising from the window's bottom edge, like the `:` line: the
  // title sits in its top line, the key hints on its last line.
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[50vh] gap-3 border-t-[var(--ins-edge-focus)] bg-[var(--ins-raised)] px-5 pt-5 pb-3 font-mono shadow-none [&>[data-slot=sheet-close]]:hidden"
      >
        <SheetTitle className="ins-legend absolute -top-[6px] left-[10px] flex items-center gap-[7px] bg-[var(--ins-raised)] px-[5px] font-normal leading-[12px] text-foreground">
          <Keycap size="sm" lit>^P</Keycap>
          Starred projects
          <Lamp state="on" />
        </SheetTitle>
        <SheetDescription className="sr-only">Jump to a starred project.</SheetDescription>

        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Filter starred projects…"
          aria-label="Filter starred projects"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="-mx-2 flex-1 overflow-y-auto" role="listbox" aria-label="Starred projects">
          {filteredBookmarks.length === 0 ? (
            <div className="px-2">
              {bookmarks.length === 0 ? (
                <DialogEmpty>None yet. Open a project, then use the star button in the files pane header and choose Star this project.</DialogEmpty>
              ) : (
                <DialogEmpty>No starred project matches “{searchQuery.trim()}”.</DialogEmpty>
              )}
            </div>
          ) : (
            filteredBookmarks.map((bookmark, index) => (
              <PickerRow
                key={bookmark.id}
                ref={index === selectedIndex ? selectedItemRef : null}
                selected={index === selectedIndex}
                glyph="★"
                name={bookmark.name}
                path={tildePath(bookmark.path)}
                tag={<OpenTabTag tab={openTabs.get(bookmark.path)} />}
                onClick={() => handleSelectBookmark(bookmark)}
                onMouseMove={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-[9px] border-t border-[var(--ins-edge)] pt-2 text-[11px] text-muted-foreground">
          <Hint keys={['↑', '↓']} label="move" />
          <span className="ins-sep-star" aria-hidden="true" />
          <Hint keys={['↵']} label="open" />
          <span className="ins-sep-star" aria-hidden="true" />
          <span className="inline-flex items-center gap-[3px] whitespace-nowrap">
            <SheetClose className="ins-cap ins-round" data-size="sm">
              esc
              <span className="sr-only">Close</span>
            </SheetClose>
            <span className="ml-[3px]" aria-hidden="true">close</span>
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
