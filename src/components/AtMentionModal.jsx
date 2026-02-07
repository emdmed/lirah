import React, { useEffect, useRef, useMemo, memo } from 'react';
import { File, Folder, CornerDownLeft } from 'lucide-react';

/**
 * Autocomplete modal for @ mention file selection.
 * Appears above the textarea when the user types @filename.
 * Keyboard: ArrowUp/Down to navigate, Enter to select, Esc to dismiss.
 */
export const AtMentionModal = memo(function AtMentionModal({
  results,
  selectedIndex,
  onSelect,
  currentPath,
  query = '',
  selectedFiles,
}) {
  const listRef = useRef(null);
  const selectedItemRef = useRef(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // Separate files from directories, files first
  const displayedResults = useMemo(() => {
    if (!results) return [];
    const files = results.filter(r => !r.is_dir);
    const dirs = results.filter(r => r.is_dir);
    return [...files, ...dirs].slice(0, 12);
  }, [results]);

  if (!displayedResults || displayedResults.length === 0) {
    return null;
  }

  // Helper to get relative path
  const getRelativePath = (filePath) => {
    if (!filePath || !currentPath) return filePath || '';
    const normalizedCwd = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    if (filePath.startsWith(normalizedCwd + '/')) {
      return filePath.slice(normalizedCwd.length + 1);
    }
    return filePath;
  };

  // Split a relative path into directory part and filename
  const splitPath = (relativePath) => {
    const lastSlash = relativePath.lastIndexOf('/');
    if (lastSlash === -1) return { dir: '', name: relativePath };
    return {
      dir: relativePath.substring(0, lastSlash + 1),
      name: relativePath.substring(lastSlash + 1),
    };
  };

  // Highlight the matched portion of the filename
  const highlightMatch = (name, q) => {
    if (!q) return name;
    const lowerName = name.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerName.indexOf(lowerQ);
    if (idx === -1) return name;
    return (
      <>
        {name.substring(0, idx)}
        <span className="text-primary font-semibold">{name.substring(idx, idx + q.length)}</span>
        {name.substring(idx + q.length)}
      </>
    );
  };

  const alreadySelected = selectedFiles instanceof Set ? selectedFiles : new Set();

  return (
    <div
      className="absolute left-0 right-0 bg-background border border-sketch rounded-md shadow-lg z-50 overflow-hidden"
      style={{ bottom: '100%', marginBottom: '4px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-b-sketch bg-muted/20"
        style={{ fontSize: 'var(--font-xs)' }}
      >
        <span className="text-muted-foreground">
          {results.length} file{results.length !== 1 ? 's' : ''} found
        </span>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1 rounded bg-muted/50 border border-sketch text-[9px] font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 rounded bg-muted/50 border border-sketch text-[9px] font-mono">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 rounded bg-muted/50 border border-sketch text-[9px] font-mono">esc</kbd>
            close
          </span>
        </div>
      </div>

      {/* Results list */}
      <div ref={listRef} className="max-h-[240px] overflow-y-auto py-0.5" role="listbox">
        {displayedResults.map((result, index) => {
          const isSelected = index === selectedIndex;
          const isDir = result.is_dir;
          const relativePath = getRelativePath(result.path);
          const { dir, name } = splitPath(relativePath);
          const isAlreadySelected = alreadySelected.has(result.path);

          return (
            <div
              key={result.path}
              ref={isSelected ? selectedItemRef : null}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(result.path, isDir)}
              className={`
                flex items-center gap-2 px-3 py-1 mx-0.5 rounded-sm transition-colors
                ${isDir ? 'opacity-40 cursor-default' : 'cursor-pointer'}
                ${!isDir && isSelected ? 'bg-primary/15' : ''}
                ${!isDir && !isSelected ? 'hover:bg-accent/40' : ''}
              `}
              style={{ fontSize: 'var(--font-xs)' }}
            >
              {/* Icon */}
              {isDir ? (
                <Folder className="w-3.5 h-3.5 text-folder flex-shrink-0" />
              ) : (
                <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}

              {/* Path: directory dimmed, filename highlighted */}
              <span className="truncate flex-1 min-w-0">
                {dir && (
                  <span className="text-muted-foreground opacity-60">{dir}</span>
                )}
                <span className={isDir ? 'text-muted-foreground' : ''}>
                  {highlightMatch(name, query)}
                </span>
              </span>

              {/* Already-selected indicator */}
              {isAlreadySelected && !isDir && (
                <span className="text-primary text-[9px] flex-shrink-0 px-1 rounded bg-primary/10 border border-primary/20">
                  added
                </span>
              )}

              {/* Enter hint on selected row */}
              {isSelected && !isDir && !isAlreadySelected && (
                <CornerDownLeft className="w-3 h-3 text-primary flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Overflow indicator */}
      {results.length > 12 && (
        <div
          className="px-3 py-1 text-muted-foreground border-t border-t-sketch text-center"
          style={{ fontSize: 'var(--font-xs)' }}
        >
          +{results.length - 12} more &mdash; keep typing to narrow
        </div>
      )}
    </div>
  );
});
