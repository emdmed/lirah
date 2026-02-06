import React, { useEffect, useRef } from 'react';
import { File, Folder } from 'lucide-react';

/**
 * Modal for @ mention file selection
 * Shows filtered files with keyboard navigation
 */
export function AtMentionModal({
  results,
  selectedIndex,
  onSelect,
  currentPath,
  position = 'bottom'
}) {
  const selectedItemRef = useRef(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  if (!results || results.length === 0) {
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

  // Limit to first 10 results
  const displayedResults = results.slice(0, 10);

  return (
    <div
      className="absolute left-0 right-0 bg-background border border-primary/30 rounded shadow-lg z-50 max-h-[300px] overflow-y-auto"
      style={{
        bottom: position === 'top' ? '100%' : 'auto',
        top: position === 'bottom' ? '100%' : 'auto',
        marginTop: position === 'bottom' ? '4px' : '0',
        marginBottom: position === 'top' ? '4px' : '0'
      }}
    >
      <div className="py-1">
        {displayedResults.map((result, index) => {
          const isSelected = index === selectedIndex;
          const relativePath = getRelativePath(result.path);

          return (
            <div
              key={result.path}
              ref={isSelected ? selectedItemRef : null}
              onClick={() => onSelect(result.path, result.is_dir)}
              className={`
                flex items-center gap-2 px-3 py-1.5 transition-colors
                ${result.is_dir ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${!result.is_dir && isSelected ? 'bg-primary/20' : ''}
                ${!result.is_dir && !isSelected ? 'hover:bg-accent/50' : ''}
              `}
              style={{ fontSize: 'var(--font-xs)' }}
            >
              {result.is_dir ? (
                <Folder className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              ) : (
                <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <span className="truncate">
                {relativePath}
              </span>
            </div>
          );
        })}
      </div>
      {results.length > 10 && (
        <div className="px-3 py-1 text-muted-foreground border-t border-t-sketch" style={{ fontSize: 'var(--font-xs)' }}>
          +{results.length - 10} more results
        </div>
      )}
    </div>
  );
}
