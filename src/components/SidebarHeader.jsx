import { Input } from './ui/input';
import { PanelButton } from './instrument/PanelButton';
import { CornerLeftUp, RefreshCw } from 'lucide-react';
import { BookmarksDropdown } from '../features/bookmarks';
import { Keycap } from './instrument/Keycap';

export function SidebarHeader({
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
  onSyncTree,
  treeLoading,
  onNavigateParent,
  currentPath,
}) {
  const dirName = currentPath ? currentPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || currentPath : '';
  const searchWell = showSearch && (
    <div className="ins-well relative flex-1 min-w-0 flex items-center focus-within:outline focus-within:outline-1 focus-within:outline-[var(--ins-lamp)] focus-within:-outline-offset-1">
      <Keycap size="sm" className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none">/</Keycap>
      <Input
        ref={searchInputRef}
        type="text"
        placeholder="search"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-6 pl-7 pr-6 py-0 leading-6 bg-transparent border-0 shadow-none focus-visible:outline-none focus-visible:ring-0"
        style={{ fontSize: 'var(--font-xs)', backgroundColor: 'transparent', boxShadow: 'none' }}
      />
      {searchQuery && (
        <button
          onClick={onSearchClear}
          className="absolute right-1 top-1/2 -translate-y-1/2 px-1 text-muted-foreground hover:text-foreground focus-ring"
          title="Clear search"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );

  // One row: search (tree mode) or parent nav (flat mode) on the left, the
  // control bank on the right. Filters are latching switches; adding a
  // bookmark lives in the bookmarks menu.
  return (
    <div className="px-1.5 pt-1 pb-2 edge-b-engraved flex items-center gap-1.5 h-9 text-xs flex-shrink-0">
      {onNavigateParent && (
        <div className="mr-auto flex items-center gap-2 min-w-0 pr-2">
          <PanelButton
            icon={CornerLeftUp}
            onClick={onNavigateParent}
            title="Parent directory (Backspace)"
            aria-label="Go to parent directory"
          >
            up
          </PanelButton>
          <span className="truncate text-foreground" title={currentPath}>{dirName}/</span>
        </div>
      )}
      {searchWell}
      {showSearch && (
        <>
          <PanelButton
            latched={showMarkdownOnly}
            onClick={onToggleMarkdownFilter}
            title={showMarkdownOnly ? "Show all files (Ctrl+M)" : "Show only markdown files (Ctrl+M)"}
          >
            md
          </PanelButton>
          <PanelButton
            latched={showGitChangesOnly}
            onClick={onToggleGitFilter}
            className={!fileWatchingEnabled ? 'opacity-40' : undefined}
            title={showGitChangesOnly ? "Show all files (Ctrl+G)" : "Show only git changes (Ctrl+G)"}
          >
            git
          </PanelButton>
          <PanelButton
            icon={RefreshCw}
            onClick={onSyncTree}
            disabled={treeLoading}
            className={treeLoading ? '[&_svg]:animate-spin' : undefined}
            title="Sync file tree"
            aria-label="Sync file tree"
          />
        </>
      )}
      <BookmarksDropdown
        onNavigate={onNavigateBookmark}
        onAdd={hasTerminalSession ? onAddBookmark : undefined}
      />
    </div>
  );
}
