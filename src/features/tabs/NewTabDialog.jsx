import { useState, useEffect, useRef, useMemo } from 'react';
import { open as openFolderPicker } from '@tauri-apps/plugin-dialog';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogGroup, DialogEmpty } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { PickerRow, OpenTabTag, tildePath, useOpenTabsByPath } from '../../components/ui/picker';
import { useBookmarks } from '../bookmarks/BookmarksContext';

function folderName(path) {
  return path.split('/').filter(Boolean).pop() || path;
}

// Picks the project a new tab opens in: the current project, a starred
// project, or any folder from the system picker. Nothing opens until a
// choice is made; Esc cancels.
export function NewTabDialog({ open, onOpenChange, currentPath, onOpenProject }) {
  const { bookmarks, updateBookmark } = useBookmarks();
  const openTabs = useOpenTabsByPath();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    setPicking(false);
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (name, path) => !q || name.toLowerCase().includes(q) || path.toLowerCase().includes(q);
    const list = [];
    if (currentPath && hit(folderName(currentPath), currentPath)) {
      list.push({ kind: 'current', id: 'current', name: folderName(currentPath), path: currentPath });
    }
    list.push({ kind: 'browse', id: 'browse', name: 'choose a folder', path: 'system folder picker' });
    [...bookmarks]
      .sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0))
      .filter(b => b.path !== currentPath && hit(b.name, b.path))
      .forEach(b => list.push({ kind: 'bookmark', id: b.id, name: b.name, path: b.path }));
    return list;
  }, [bookmarks, currentPath, query]);

  useEffect(() => {
    if (selectedIndex >= items.length) setSelectedIndex(Math.max(0, items.length - 1));
  }, [items.length, selectedIndex]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const finish = (path) => {
    onOpenChange(false);
    onOpenProject(path);
  };

  const browse = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await openFolderPicker({
        directory: true,
        multiple: false,
        defaultPath: currentPath || undefined,
        title: 'Open folder in new tab',
      });
      if (typeof picked === 'string' && picked) finish(picked);
    } catch (err) {
      console.error('Folder picker failed:', err);
    } finally {
      setPicking(false);
      inputRef.current?.focus();
    }
  };

  const choose = (item) => {
    if (!item) return;
    if (item.kind === 'browse') {
      browse();
      return;
    }
    if (item.kind === 'bookmark') updateBookmark(item.id, { lastAccessedAt: Date.now() });
    finish(item.path);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[selectedIndex]);
    }
  };

  const glyph = { current: '↵', bookmark: '★', browse: '…' };
  const places = items.filter(i => i.kind !== 'browse').length;
  const renderRow = (item) => {
    const index = items.indexOf(item);
    const selected = index === selectedIndex;
    const tab = item.kind === 'browse' ? null : openTabs.get(item.path);
    return (
      <PickerRow
        key={item.id}
        ref={selected ? selectedRef : null}
        selected={selected}
        glyph={glyph[item.kind]}
        name={item.name}
        path={item.kind === 'browse' ? item.path : tildePath(item.path)}
        tag={tab ? <OpenTabTag tab={tab} /> : item.kind === 'current' ? 'current' : null}
        disabled={item.kind === 'browse' && picking}
        onClick={() => choose(item)}
        onMouseMove={() => setSelectedIndex(index)}
      />
    );
  };
  const here = items.filter(i => i.kind !== 'bookmark');
  const starred = items.filter(i => i.kind === 'bookmark');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        keys={['^', 'T']}
        status={`${places} ${places === 1 ? 'place' : 'places'}`}
        hints={[{ keys: ['↑', '↓'], label: 'move' }, { keys: ['↵'], label: 'open' }]}
        onKeyDown={handleKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle>New tab</DialogTitle>
        <DialogDescription className="sr-only">Choose the project this tab opens in.</DialogDescription>

        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="Choose the project this tab opens in…"
          aria-label="Filter starred projects"
        />

        <div className="-mx-2 flex max-h-[320px] flex-col gap-3 overflow-y-auto px-2" role="listbox" aria-label="Projects">
          <div className="flex flex-col gap-1.5" role="group" aria-label="Here">
            <DialogGroup label="here" />
            <div className="-mx-2 flex flex-col">{here.map(renderRow)}</div>
          </div>
          <div className="flex flex-col gap-1.5" role="group" aria-label="Starred">
            <DialogGroup label="starred" />
            {starred.length > 0 ? (
              <div className="-mx-2 flex flex-col">{starred.map(renderRow)}</div>
            ) : bookmarks.length === 0 ? (
              <DialogEmpty>None yet. Star a project from the files pane header.</DialogEmpty>
            ) : (
              <DialogEmpty>No starred project matches “{query.trim()}”.</DialogEmpty>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
