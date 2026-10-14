import { Input } from './ui/input';
import { PanelButton } from './instrument/PanelButton';
import { BookmarkPlus, CornerLeftUp, FileText, GitBranch, RefreshCw } from 'lucide-react';
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
  return (
    <div className="px-1.5 pt-1 pb-2 border-b edge-b-engraved flex flex-col gap-2 flex-shrink-0">
      {/* Filters and actions as panel buttons; a filter is a latching switch
          whose lamp lights while it is on. The mode indicator lives in the
          pane legend. */}
      <div className="flex items-center justify-end gap-1.5 h-7 text-xs">
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
        {showSearch && (
          <>
            <PanelButton
              icon={FileText}
              latched={showMarkdownOnly}
              onClick={onToggleMarkdownFilter}
              title={showMarkdownOnly ? "Show all files (Ctrl+M)" : "Show only markdown files (Ctrl+M)"}
            >
              md
            </PanelButton>
            <PanelButton
              icon={GitBranch}
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
        {hasTerminalSession && (
          <PanelButton
            icon={BookmarkPlus}
            onClick={onAddBookmark}
            title="Bookmark current directory"
            aria-label="Bookmark current directory"
          />
        )}
        <BookmarksDropdown onNavigate={onNavigateBookmark} />
      </div>

      {/* Search input - tree mode only */}
      {showSearch && (
        <div className="ins-well relative group flex items-center focus-within:outline focus-within:outline-1 focus-within:outline-[var(--ins-lamp)] focus-within:-outline-offset-1">
          <Keycap size="sm" className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none">/</Keycap>
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="search files"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-6 pl-7 pr-7 py-0 leading-6 bg-transparent border-0 shadow-none focus-visible:outline-none focus-visible:ring-0"
            style={{ fontSize: 'var(--font-xs)', backgroundColor: 'transparent', boxShadow: 'none' }}
          />
          {searchQuery && (
            <button
              onClick={onSearchClear}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1 text-muted-foreground hover:text-foreground focus-ring"
              title="Clear search"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}
