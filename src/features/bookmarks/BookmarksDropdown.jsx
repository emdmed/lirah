import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Button } from '../../components/ui/button';
import { Bookmark, X } from 'lucide-react';
import { useBookmarks } from './BookmarksContext';

export function BookmarksDropdown({ onNavigate }) {
  const { bookmarks, removeBookmark } = useBookmarks();
  const [hoveredId, setHoveredId] = useState(null);

  const handleNavigate = (bookmark) => {
    if (onNavigate) {
      onNavigate(bookmark);
    }
  };

  const handleDelete = (e, bookmarkId) => {
    e.stopPropagation();
    removeBookmark(bookmarkId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          className="h-5 w-5"
          title="Bookmarks"
        >
          <Bookmark className="w-2.5 h-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        <DropdownMenuLabel>Project Bookmarks</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {bookmarks.length === 0 ? (
          <div className="px-2 py-4 text-xs opacity-50 text-center">
            No bookmarks yet.
            <br />
            Click the star icon to add one.
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {bookmarks.map((bookmark) => (
              <DropdownMenuItem
                key={bookmark.id}
                onMouseEnter={() => setHoveredId(bookmark.id)}
                onMouseLeave={() => setHoveredId(null)}
                onSelect={() => handleNavigate(bookmark)}
                className="flex flex-col items-start gap-0.5 h-auto py-2 cursor-pointer relative pr-8"
              >
                <span className="text-xs font-medium truncate w-full">
                  {bookmark.name}
                </span>
                <span className="text-[0.65rem] opacity-50 truncate w-full">
                  {bookmark.path}
                </span>
                {hoveredId === bookmark.id && (
                  <button
                    onClick={(e) => handleDelete(e, bookmark.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded opacity-60 hover:opacity-100 hover:bg-red-500/20"
                    title="Remove bookmark"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
