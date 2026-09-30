import { Button } from './ui/button';
import { Input } from './ui/input';
import { BookmarksDropdown } from '../features/bookmarks';
import { Search, X, Star, Shield, Eye, RefreshCw, FileText, GitBranch } from 'lucide-react';

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
  showMarkdownOnly,
  onToggleMarkdownFilter,
  fileWatchingEnabled,
  onAddBookmark,
  onNavigateBookmark,
  hasTerminalSession,
  sandboxEnabled,
  onSyncTree,
  treeLoading
}) {
  return (
    <div className="px-1 pb-1.5 border-b edge-b-engraved flex flex-col gap-1 flex-shrink-0">
      {/* Mode indicator + controls */}
      <div className="flex items-center justify-between gap-2 h-6">
        <div
          className="flex items-center text-xs select-none"
          title={`${viewMode === 'tree' ? 'Agent' : 'Navigation'} mode${sandboxEnabled ? ' — sandboxed' : ''}`}
          aria-label={`${viewMode === 'tree' ? 'Agent' : 'Navigation'} mode`}
        >
          {sandboxEnabled ? <Shield className="w-3.5 h-3.5 mr-1 text-primary" /> : <Eye className="w-3.5 h-3.5 mr-1 text-primary" />}
          <span className="text-primary">{viewMode === 'tree' ? 'agent' : 'nav'}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center">
          <BookmarksDropdown onNavigate={onNavigateBookmark} />
          {hasTerminalSession && (
            <Button
              onClick={onAddBookmark}
              size="icon-xs"
              variant="ghost"
              className="h-6 w-6"
              title="Bookmark current directory"
              aria-label="Bookmark current directory"
            >
              <Star className="w-3.5 h-3.5" />
            </Button>
          )}
          {showSearch && (
            <>
              <Button
                onClick={onSyncTree}
                disabled={treeLoading}
                size="icon-xs"
                variant="ghost"
                className="h-6 w-6"
                title="Sync file tree"
                aria-label="Sync file tree"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${treeLoading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                onClick={onToggleMarkdownFilter}
                size="icon-xs"
                variant={showMarkdownOnly ? 'default' : 'ghost'}
                className="h-6 w-6"
                title={showMarkdownOnly ? "Show all files (Ctrl+M)" : "Show only markdown files (Ctrl+M)"}
                aria-label={showMarkdownOnly ? "Show all files" : "Show only markdown files"}
                aria-pressed={showMarkdownOnly}
              >
                <FileText className="w-3.5 h-3.5" />
              </Button>
              <Button
                onClick={onToggleGitFilter}
                size="icon-xs"
                variant={showGitChangesOnly ? 'default' : 'ghost'}
                className={`h-6 w-6 ${!fileWatchingEnabled ? 'opacity-40' : ''}`}
                title={showGitChangesOnly ? "Show all files (Ctrl+G)" : "Show only git changes (Ctrl+G)"}
                aria-label={showGitChangesOnly ? "Show all files" : "Show only git changes"}
                aria-pressed={showGitChangesOnly}
              >
                <GitBranch className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search input - tree mode only */}
      {showSearch && (
        <div className="relative group">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-primary" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="search files"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-6 pl-6 pr-7 py-0 leading-6 bg-transparent border-0 shadow-none focus-visible:outline-none focus-visible:ring-0"
            style={{ fontSize: 'var(--font-xs)', backgroundColor: 'transparent' }}
          />
          {searchQuery && (
            <button
              onClick={onSearchClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 hover:bg-muted/50 transition-all p-0.5 rounded-xs focus-ring"
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
