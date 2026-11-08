import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Star, Xmark } from 'iconoir-react';
import { PanelButton } from '../../components/instrument/PanelButton';
import { useBookmarks } from './BookmarksContext';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function BookmarksDropdown({ onNavigate, onAdd }) {
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
        <PanelButton icon={Star} title="Starred projects  ·  Ctrl+P" aria-label="Starred projects" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        <DropdownMenuLabel>Starred projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onAdd && (
          <>
            <DropdownMenuItem onSelect={onAdd} className="cursor-pointer text-xs">
              <Star className="w-3 h-3" />
              Star this project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {bookmarks.length === 0 ? (
          <div className="px-2 py-4 text-xs opacity-50 text-center">
            No starred projects yet.
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
                <span className="text-xs truncate w-full">
                  {bookmark.name}
                </span>
                <span className="text-[11px] opacity-50 truncate w-full">
                  {bookmark.path}
                </span>
                {hoveredId === bookmark.id && (
                  <button
                    onClick={(e) => handleDelete(e, bookmark.id)}
                    type="button"
                    data-icon-only
                    className={cn(buttonVariants({ variant: 'ghost', size: 'icon-panel' }), 'absolute right-1 top-1/2 -translate-y-1/2')}
                    title="Unstar project"
                    aria-label="Unstar project"
                  >
                    <Xmark className="w-2.5 h-2.5" />
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
