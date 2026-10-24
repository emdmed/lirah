import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogGroup,
  DialogEmpty,
} from './ui/dialog';
import { PickerRow, OpenTabTag, tildePath, useOpenTabsByPath } from './ui/picker';
import { useBookmarks } from '../features/bookmarks';
import { LirahLockup } from './LirahMark';

export function InitialProjectDialog({ open, onOpenChange, onSelectProject, workspaces, onOpenWorkspace }) {
  const { bookmarks } = useBookmarks();
  const openTabs = useOpenTabsByPath();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedItemRef = useRef(null);

  // Sort bookmarks by lastAccessedAt (most recent first)
  const sortedBookmarks = [...bookmarks].sort((a, b) =>
    (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0)
  );

  // Combined list: workspaces first, then bookmarks
  const items = useMemo(() => {
    const wsItems = (workspaces || []).map(ws => ({
      type: 'workspace',
      id: ws.id,
      name: ws.name,
      subtitle: ws.projects.map(p => p.name).join(', '),
      data: ws,
    }));
    const bkItems = sortedBookmarks.map(b => ({
      type: 'bookmark',
      id: b.id,
      name: b.name,
      subtitle: tildePath(b.path),
      data: b,
    }));
    return [...wsItems, ...bkItems];
  }, [workspaces, sortedBookmarks]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          handleSelectItem(items[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex, items, onOpenChange]);

  const handleSelectItem = async (item) => {
    onOpenChange(false);
    if (item.type === 'workspace' && onOpenWorkspace) {
      onOpenWorkspace(item.data.path);
    } else if (item.type === 'bookmark' && onSelectProject) {
      onSelectProject(item.data);
    }
  };

  const renderRow = (item) => {
    const index = items.indexOf(item);
    const selected = index === selectedIndex;
    return (
      <PickerRow
        key={item.id}
        ref={selected ? selectedItemRef : null}
        selected={selected}
        glyph={item.type === 'workspace' ? '◇' : '★'}
        name={item.name}
        path={item.subtitle}
        tag={item.type === 'bookmark' ? <OpenTabTag tab={openTabs.get(item.data.path)} /> : null}
        onClick={() => handleSelectItem(item)}
        onMouseMove={() => setSelectedIndex(index)}
      />
    );
  };
  const wsItems = items.filter(i => i.type === 'workspace');
  const bkItems = items.filter(i => i.type === 'bookmark');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        hints={items.length > 0 ? [{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: 'open' }] : undefined}
      >
        <DialogTitle>Open project</DialogTitle>
        <DialogDescription className="sr-only">Open a starred project or workspace.</DialogDescription>

        <div className="flex justify-center py-2">
          <LirahLockup size={40} wordmarkSize={36} />
        </div>

        {items.length === 0 ? (
          <DialogEmpty>
            No starred projects yet. Press Esc, open a project folder, then use the star button in the files pane header and choose Star this project.
          </DialogEmpty>
        ) : (
          <div className="-mx-2 flex max-h-[300px] flex-col gap-3 overflow-y-auto px-2" role="listbox" aria-label="Projects">
            {wsItems.length > 0 && (
              <div className="flex flex-col gap-1.5" role="group" aria-label="Workspaces">
                <DialogGroup label="workspaces" />
                <div className="-mx-2 flex flex-col">{wsItems.map(renderRow)}</div>
              </div>
            )}
            {bkItems.length > 0 && (
              <div className="flex flex-col gap-1.5" role="group" aria-label="Starred">
                <DialogGroup label="starred" />
                <div className="-mx-2 flex flex-col">{bkItems.map(renderRow)}</div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
