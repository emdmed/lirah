import { Button } from './ui/button';
import { Input } from './ui/input';
import { ChevronUp, Search, X, GitBranch } from 'lucide-react';

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
  fileWatchingEnabled
}) {
  return (
    <div className="px-2 py-1.5 border-b border-white/10 flex flex-col gap-1.5 flex-shrink-0">
      {/* Mode indicator + controls */}
      <div className="flex items-center justify-between gap-1.5">
        {/* Minimal mode indicator */}
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${viewMode === 'tree' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
          <span className="text-[0.65rem] font-medium opacity-60 tracking-wide uppercase">
            {viewMode === 'tree' ? 'Claude Mode' : 'Navigation Mode'}
          </span>
          {!fileWatchingEnabled && (
            <span className="text-[0.55rem] font-medium px-1 py-0.5 rounded bg-red-500/20 text-red-400 tracking-wide">
              WATCHERS OFF
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {showSearch && (
            <Button
              onClick={onToggleGitFilter}
              size="icon-xs"
              variant={showGitChangesOnly ? 'default' : 'ghost'}
              className={`h-5 w-5 ${!fileWatchingEnabled ? 'opacity-40' : ''}`}
              title={showGitChangesOnly ? "Show all files (Ctrl+G)" : "Show only git changes (Ctrl+G)"}
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
              className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity p-0.5 rounded"
              title="Clear search"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
