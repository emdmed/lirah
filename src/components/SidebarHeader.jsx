import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { BookmarksDropdown } from './BookmarksDropdown';
import { ChevronUp, Search, X, GitBranch, Star } from 'lucide-react';

export function SidebarHeader({
  viewMode,
  currentPath,
  onNavigateParent,
  searchQuery,
  onSearchChange,
  onSearchClear,
  showSearch,
  searchInputRef,
  showGitChangesOnly,
  onToggleGitFilter,
  fileWatchingEnabled,
  onAddBookmark,
  onNavigateBookmark,
  hasTerminalSession
}) {
  return (
    <div className="px-2 py-1.5 border-b border-b-sketch flex flex-col gap-1.5 flex-shrink-0">
      {/* Branding + Mode indicator + controls */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-baseline gap-2">
          <span
            className="text-xl"
            style={{ fontFamily: "'Grenze Gotisch', serif", fontWeight: 600, lineHeight: 1 }}
          >
            Lirah
          </span>
          <Badge
            variant="outline"
            className={`px-1.5 py-0 text-[0.6rem] h-4 ${viewMode === 'tree' ? 'border-blue-400/50 text-blue-400' : 'border-emerald-400/50 text-emerald-400'}`}
          >
            {viewMode === 'tree' ? 'claude' : 'nav'}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          <BookmarksDropdown onNavigate={onNavigateBookmark} />
          {hasTerminalSession && (
            <Button
              onClick={onAddBookmark}
              size="icon-xs"
              variant="ghost"
              className="h-5 w-5"
              title="Bookmark current directory"
              aria-label="Bookmark current directory"
            >
              <Star className="w-2.5 h-2.5" />
            </Button>
          )}
          {showSearch && (
            <Button
              onClick={onToggleGitFilter}
              size="icon-xs"
              variant={showGitChangesOnly ? 'default' : 'ghost'}
              className={`h-5 w-5 ${!fileWatchingEnabled ? 'opacity-40' : ''}`}
              title={showGitChangesOnly ? "Show all files (Ctrl+G)" : "Show only git changes (Ctrl+G)"}
              aria-label={showGitChangesOnly ? "Show all files" : "Show only git changes"}
              aria-pressed={showGitChangesOnly}
            >
              <GitBranch className="w-2.5 h-2.5" />
            </Button>
          )}
          {currentPath && currentPath !== '/' && (
            <Button
              onClick={onNavigateParent}
              size="icon-xs"
              variant="ghost"
              className="h-5 w-5"
              title="Parent directory"
              aria-label="Navigate to parent directory"
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Search input - tree mode only */}
      {showSearch && (
        <div className="relative">
          <Search className="w-2.5 h-2.5 absolute left-2 top-1/2 -translate-y-1/2 opacity-40" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-6 pl-6 pr-6 text-xs"
          />
          {searchQuery && (
            <button
              onClick={onSearchClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity p-0.5 rounded focus-ring"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
