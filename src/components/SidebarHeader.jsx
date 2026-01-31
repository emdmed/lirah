import { Button } from './ui/button';
import { Input } from './ui/input';
import { BookmarksDropdown } from './BookmarksDropdown';
import { Search, X, GitBranch, Star } from 'lucide-react';

export function SidebarHeader({
  viewMode,
  currentPath,
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
    <div className="px-3 py-2 border-b border-b-sketch flex flex-col gap-2 flex-shrink-0">
      {/* Branding + Mode indicator + controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="text-xl font-bold leading-tight"
            style={{ fontFamily: "'Grenze Gotisch', serif", display: 'flex', alignItems: 'center' }}
          >
            Lirah
          </span>
          <span
            className={`text-xs font-medium px-1 mt-1 rounded ${viewMode === 'tree' ? 'text-primary bg-primary/10' : 'text-muted-foreground bg-muted/10'}`}
          >
            {viewMode === 'tree' ? 'agent' : 'nav'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <BookmarksDropdown onNavigate={onNavigateBookmark} />
          {hasTerminalSession && (
            <Button
              onClick={onAddBookmark}
              size="icon-xs"
              variant="ghost"
              className="h-6 w-6 hover:bg-accent/60"
              title="Bookmark current directory"
              aria-label="Bookmark current directory"
            >
              <Star className="w-3 h-3" />
            </Button>
          )}
          {showSearch && (
            <Button
              onClick={onToggleGitFilter}
              size="icon-xs"
              variant={showGitChangesOnly ? 'default' : 'ghost'}
              className={`h-6 w-6 ${!fileWatchingEnabled ? 'opacity-40' : ''} ${showGitChangesOnly ? '' : 'hover:bg-accent/60'}`}
              title={showGitChangesOnly ? "Show all files (Ctrl+G)" : "Show only git changes (Ctrl+G)"}
              aria-label={showGitChangesOnly ? "Show all files" : "Show only git changes"}
              aria-pressed={showGitChangesOnly}
            >
              <GitBranch className="w-3 h-3" />
            </Button>
          )}

        </div>
      </div>

      {/* Search input - tree mode only */}
      {showSearch && (
        <div className="relative group">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 group-focus-within:opacity-70 transition-opacity" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 pl-7 pr-7 py-0 text-xs leading-7 bg-muted/30 border-muted/50 focus:bg-background focus:border-primary/50"
          />
          {searchQuery && (
            <button
              onClick={onSearchClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 hover:bg-muted/50 transition-all p-0.5 rounded focus-ring"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
