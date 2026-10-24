import React, { useEffect, useRef, useMemo, memo } from 'react';
import { getRelativePath } from '../../utils/pathUtils';
import { FloatPane } from '../../components/ui/float-pane';
import { PickerRow } from '../../components/ui/picker';

const MAX_SHOWN = 12;

// What a file already in the prompt is attached as; ←→ cycles it.
const MODES = {
  modify: 'modify',
  'do-not-modify': 'no modify',
  'use-as-example': 'example',
};

/**
 * Autocomplete for @ mention file selection, floating above the prompt.
 * Keyboard (handled by the prompt): ↑↓ move, ←→ mode, ↵ add, esc close.
 */
export const AtMentionModal = memo(function AtMentionModal({
  results,
  selectedIndex,
  onSelect,
  currentPath,
  query = '',
  selectedFiles,
  fileStates,
}) {
  const selectedItemRef = useRef(null);

  // Scroll selected item into view
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Separate files from directories, files first
  const displayedResults = useMemo(() => {
    if (!results) return [];
    const files = results.filter(r => !r.is_dir);
    const dirs = results.filter(r => r.is_dir);
    return [...files, ...dirs].slice(0, MAX_SHOWN);
  }, [results]);

  if (!displayedResults || displayedResults.length === 0) {
    return null;
  }

  // Split a relative path into directory part and filename
  const splitPath = (relativePath) => {
    const lastSlash = relativePath.lastIndexOf('/');
    if (lastSlash === -1) return { dir: '', name: relativePath };
    return {
      dir: relativePath.substring(0, lastSlash + 1),
      name: relativePath.substring(lastSlash + 1),
    };
  };

  // Light the matched part of the filename
  const highlightMatch = (name, q) => {
    if (!q) return name;
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return name;
    return (
      <>
        {name.substring(0, idx)}
        <span className="text-[var(--ins-lamp)]">{name.substring(idx, idx + q.length)}</span>
        {name.substring(idx + q.length)}
      </>
    );
  };

  const alreadySelected = selectedFiles instanceof Set ? selectedFiles : new Set();
  const more = results.length - MAX_SHOWN;
  const status = `${results.length} found${more > 0 ? ` · +${more} more` : ''}`;

  return (
    <FloatPane
      title="files"
      status={status}
      hints={[
        { keys: ['↑', '↓'], label: 'move' },
        { keys: ['←', '→'], label: 'mode' },
        { keys: ['↵'], label: 'add' },
        { keys: ['esc'], label: 'close' },
      ]}
      className="absolute left-0 right-0 z-50 px-1"
      style={{ bottom: '100%', marginBottom: '4px' }}
    >
      <div className="max-h-[240px] overflow-y-auto pt-1" role="listbox" aria-label="Files">
        {displayedResults.map((result, index) => {
          const isSelected = index === selectedIndex;
          const isDir = result.is_dir;
          const relativePath = getRelativePath(result.path, currentPath);
          const { dir, name } = splitPath(relativePath);
          const isAlreadySelected = alreadySelected.has(result.path);
          const mode = isAlreadySelected && !isDir
            ? MODES[(fileStates && fileStates.get(result.path)) || 'modify'] || MODES.modify
            : null;

          return (
            <PickerRow
              key={result.path}
              ref={isSelected ? selectedItemRef : null}
              selected={!isDir && isSelected}
              disabled={isDir}
              tabIndex={-1}
              glyph={isDir ? '/' : '·'}
              name={isDir ? <span className="text-muted-foreground">{name}/</span> : highlightMatch(name, query)}
              path={dir}
              tag={mode && (
                <span className={isSelected ? 'text-foreground' : undefined}>
                  {isSelected && <span className="text-[var(--ins-faint)]">‹ </span>}
                  {mode}
                  {isSelected && <span className="text-[var(--ins-faint)]"> ›</span>}
                </span>
              )}
              // Keep the prompt focused: the click picks, the prompt keeps typing.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(result.path, isDir)}
              className="text-xs"
            />
          );
        })}
      </div>
    </FloatPane>
  );
});
