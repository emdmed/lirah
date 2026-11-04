import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openFolderPicker } from '@tauri-apps/plugin-dialog';
import { DialogGroup, DialogEmpty } from '../../components/ui/dialog';
import { PickerRow, tildePath } from '../../components/ui/picker';
import { KeyChord } from '../../components/instrument/Keycap';
import { LirahLockup } from '../../components/LirahMark';
import { useBookmarks } from '../bookmarks/BookmarksContext';

// Shown in place of the tabs when Lirah starts with none (first launch, or
// every startup project missing). Nothing opens until the user picks the
// folder the first tab works in.
export function FirstTabChooser({ onOpenProject }) {
  const { bookmarks, updateBookmark } = useBookmarks();
  const [home, setHome] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    invoke('get_home_dir').then(setHome).catch(() => setHome(null));
    listRef.current?.focus();
  }, []);

  const items = useMemo(() => {
    const list = [{ kind: 'browse', id: 'browse', name: 'choose a folder', path: 'system folder picker' }];
    if (home) list.push({ kind: 'home', id: 'home', name: 'home', path: home });
    [...bookmarks]
      .sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0))
      .forEach((b) => list.push({ kind: 'bookmark', id: b.id, name: b.name, path: b.path }));
    return list;
  }, [bookmarks, home]);

  const browse = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await openFolderPicker({
        directory: true,
        multiple: false,
        defaultPath: home || undefined,
        title: 'Open folder in the first tab',
      });
      if (typeof picked === 'string' && picked) onOpenProject(picked);
    } catch (err) {
      console.error('Folder picker failed:', err);
    } finally {
      setPicking(false);
      listRef.current?.focus();
    }
  };

  const choose = (item) => {
    if (!item) return;
    if (item.kind === 'browse') {
      browse();
      return;
    }
    if (item.kind === 'bookmark') updateBookmark(item.id, { lastAccessedAt: Date.now() });
    onOpenProject(item.path);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[selectedIndex]);
    }
  };

  const glyph = { browse: '…', home: '~', bookmark: '★' };
  const renderRow = (item) => {
    const index = items.indexOf(item);
    return (
      <PickerRow
        key={item.id}
        selected={index === selectedIndex}
        glyph={glyph[item.kind]}
        name={item.name}
        path={item.kind === 'browse' ? item.path : tildePath(item.path)}
        disabled={item.kind === 'browse' && picking}
        onClick={() => choose(item)}
        onMouseMove={() => setSelectedIndex(index)}
        // Tabbing onto a row selects it, so Enter opens the focused row.
        onFocus={() => setSelectedIndex(index)}
      />
    );
  };
  const places = items.filter((i) => i.kind !== 'bookmark');
  const starred = items.filter((i) => i.kind === 'bookmark');

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-[440px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <LirahLockup stacked size={56} wordmarkSize={40} />
          <p className="text-center font-mono text-xs text-muted-foreground">
            Choose the folder your first tab opens in.
          </p>
        </div>

        <div
          ref={listRef}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className="flex flex-col gap-3 outline-none"
          role="listbox"
          aria-label="Where the first tab opens"
        >
          <div className="flex flex-col gap-1.5" role="group" aria-label="Places">
            <DialogGroup label="places" />
            <div className="flex flex-col">{places.map(renderRow)}</div>
          </div>
          <div className="flex flex-col gap-1.5" role="group" aria-label="Starred">
            <DialogGroup label="starred" />
            {starred.length > 0 ? (
              <div className="flex flex-col">{starred.map(renderRow)}</div>
            ) : (
              <DialogEmpty>None yet. Star a project from the files pane header.</DialogEmpty>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-4 text-[11px]">
          <KeyChord keys={['↑', '↓']} label="move" />
          <KeyChord keys={['↵']} label="open" />
        </div>
      </div>
    </div>
  );
}
