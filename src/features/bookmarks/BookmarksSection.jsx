import { useState } from 'react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '../../components/ui/sidebar';
import { Star, X } from 'lucide-react';
import { useBookmarks } from './BookmarksContext';
import { Button } from '../../components/ui/button';

export function BookmarksSection({ onNavigate }) {
  const { bookmarks, removeBookmark } = useBookmarks();
  const [hoveredId, setHoveredId] = useState(null);

  const handleNavigate = (bookmark) => {
    if (onNavigate) {
      onNavigate(bookmark);
    }
  };

  const handleDelete = (e, bookmarkId) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    removeBookmark(bookmarkId);
  };

  return (
    <SidebarGroup collapsible defaultOpen>
      <SidebarGroupLabel>
        <Star className="w-3 h-3" />
        <span>Bookmarks</span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {bookmarks.length === 0 ? (
          <div className="px-2 py-4 text-xs opacity-50 text-center">
            No bookmarks yet.
            <br />
            Click the star icon to bookmark the current directory.
          </div>
        ) : (
          <SidebarMenu>
            {bookmarks.map((bookmark) => (
              <SidebarMenuItem
                key={bookmark.id}
                onMouseEnter={() => setHoveredId(bookmark.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative"
              >
                <SidebarMenuButton
                  onClick={() => handleNavigate(bookmark)}
                  className="flex flex-col items-start gap-0.5 h-auto py-2 cursor-pointer hover:bg-white/5"
                >
                  <span className="text-xs font-medium truncate w-full">
                    {bookmark.name}
                  </span>
                  <span className="text-[0.65rem] opacity-50 truncate w-full">
                    {bookmark.path}
                  </span>
                </SidebarMenuButton>
                {hoveredId === bookmark.id && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={(e) => handleDelete(e, bookmark.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 opacity-60 hover:opacity-100 hover:bg-red-500/20"
                    title="Remove bookmark"
                  >
                    <X className="w-2.5 h-2.5" />
                  </Button>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
