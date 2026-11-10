import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openFolderPicker } from '@tauri-apps/plugin-dialog';
import { DialogGroup, DialogEmpty } from '../../components/ui/dialog';
import { PickerRow, tildePath } from '../../components/ui/picker';
import { KeyChord } from '../../components/instrument/Keycap';
import { LirahMark } from '../../components/LirahMark';
import { SKY } from '../../components/Layout';
import { useBookmarks } from '../bookmarks/BookmarksContext';
import { isAbsolute } from '../../utils/pathUtils';

// The orrery: starred projects as bodies on orbits tilted -11deg around the mark, like the site's.
const W = 760;
const H = 290;
const CX = W / 2;
const CY = H / 2;
const ORBITS = [110, 165, 220, 280];
const RY = 0.47;
const TILT = (-11 * Math.PI) / 180;
const MAX_BODIES = 8;
const f = (n) => n.toFixed(1);

// Contour land along the bottom, after OrrerySky on the website.
const LAND_W = 1920;
const LAND_H = 220;
const LAND = Array.from({ length: 18 }, (_, i) => {
  const base = 60 + i * 8;
  const a = 46 - i * 1.4;
  let d = '';
  for (let x = 0; x <= LAND_W; x += 14) {
    const ridge = Math.sin(x / 150 + 0.4) * 0.55 + Math.sin(x / 61 + i * 0.18) * 0.25 + Math.sin(x / 23 + i * 0.5) * 0.08;
    d += `${x ? 'L' : 'M'}${x} ${f(base - a * Math.max(0, ridge + 0.35))}`;
  }
  return d;
});
const LAND_SVG = (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute inset-x-0 bottom-0 h-[220px] w-full"
    viewBox={`0 0 ${LAND_W} ${LAND_H}`}
    preserveAspectRatio="xMidYMax slice"
  >
    <g fill="none" stroke="var(--color-foreground)" strokeWidth="1" vectorEffect="non-scaling-stroke">
      {LAND.map((d, i) => (
        <path key={i} d={d} opacity={f(0.07 + (i / LAND.length) * 0.1)} />
      ))}
    </g>
  </svg>
);

// Places a body on its orbit: orbits alternate, angles step by the golden angle so labels spread.
function place(i) {
  const rx = ORBITS[i % ORBITS.length];
  const t = ((i * 137.5 + 205) * Math.PI) / 180;
  const ex = rx * Math.cos(t);
  const ey = rx * RY * Math.sin(t);
  return { rx, x: CX + ex * Math.cos(TILT) - ey * Math.sin(TILT), y: CY + ex * Math.sin(TILT) + ey * Math.cos(TILT) };
}

const parentDir = (path) => tildePath(path.replace(/\/[^/]+\/?$/, '') || '/');
const isPath = (q) => isAbsolute(q);

// Shown in place of the tabs when Lirah starts with none (first launch, or
// every startup project missing). Nothing opens until the user picks the
// folder the first tab works in.
export function FirstTabChooser({ onOpenProject }) {
  const { bookmarks, updateBookmark } = useBookmarks();
  const [home, setHome] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    invoke('get_home_dir').then(setHome).catch(() => setHome(null));
    listRef.current?.focus();
  }, []);

  const starred = useMemo(
    () =>
      [...bookmarks]
        .sort((a, b) => (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0))
        .map((b) => ({ kind: 'bookmark', id: b.id, name: b.name, path: b.path })),
    [bookmarks],
  );

  const q = query.trim().toLowerCase();

  const items = useMemo(() => {
    const list = [{ kind: 'browse', id: 'browse', name: 'choose a folder', path: 'system folder picker' }];
    if (home) list.push({ kind: 'home', id: 'home', name: 'home', path: home });
    const matches = (b) => !q || isPath(q) || b.name.toLowerCase().includes(q);
    return [...list, ...starred.filter(matches)];
  }, [starred, home, q]);

  // Typing moves the selection to the first starred match.
  useEffect(() => {
    if (!q) return;
    const first = items.findIndex((i) => i.kind === 'bookmark');
    setSelectedIndex(first >= 0 ? first : 0);
  }, [q, items]);

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

  // A typed path opens directly, once it exists.
  const openTyped = async () => {
    const path = query.trim().replace(/(.)\/+$/, '$1');
    const exists = await invoke('path_exists', { path }).catch(() => false);
    if (exists) onOpenProject(path);
    else setMissing(true);
  };

  const type = (next) => {
    setQuery(next);
    setMissing(false);
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
      if (isPath(query.trim())) openTyped();
      else choose(items[selectedIndex]);
    } else if (e.key === '~' && !query && home) {
      e.preventDefault();
      onOpenProject(home);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      type('');
    } else if (e.key === 'Backspace' && query) {
      e.preventDefault();
      type(query.slice(0, -1));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && (query || e.key !== ' ')) {
      e.preventDefault();
      type(query + e.key);
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
  const starredRows = items.filter((i) => i.kind === 'bookmark');
  // Past eight bodies the orrery crowds; the list takes over.
  const orrery = starred.length > 0 && starred.length <= MAX_BODIES;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--ins-gutter)]">
      {SKY}
      {LAND_SVG}
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-6">
        <div className={`flex w-full flex-col gap-6 ${orrery ? 'max-w-[760px]' : 'max-w-[440px]'}`}>
          {orrery ? (
            <div className="flex flex-col items-center gap-1">
              <span className="[font-family:'Grenze_Gotisch',serif] text-[40px] leading-none">Lirah</span>
              <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full overflow-visible"
                  viewBox={`0 0 ${W} ${H}`}
                  style={{ '--sun-x': `${CX}px`, '--sun-y': `${CY}px` }}
                >
                  <g fill="none" stroke="var(--color-foreground)" strokeWidth="1" vectorEffect="non-scaling-stroke" transform={`rotate(-11 ${CX} ${CY})`}>
                    {ORBITS.map((rx, i) => (
                      <ellipse
                        key={rx}
                        cx={CX}
                        cy={CY}
                        rx={rx}
                        ry={rx * RY}
                        opacity={i === ORBITS.length - 1 ? 0.4 : 0.3}
                        strokeDasharray={i === ORBITS.length - 1 ? '5 4' : undefined}
                      />
                    ))}
                  </g>
                  {/* Spokes from the sun to each body. */}
                  <g stroke="var(--color-foreground)" strokeWidth="0.5" opacity=".25" vectorEffect="non-scaling-stroke">
                    {starred.map((item, i) => {
                      const { x, y } = place(i);
                      return <line key={item.id} x1={CX} y1={CY} x2={f(x)} y2={f(y)} />;
                    })}
                  </g>
                  {/* The sun: the mark in gold, ringed, with four rays (the site's sunMark). */}
                  <g fill="none" stroke="var(--ins-lamp)" vectorEffect="non-scaling-stroke">
                    <circle cx={CX} cy={CY} r="44" strokeWidth="0.6" strokeDasharray="1 3" />
                    <circle cx={CX} cy={CY} r="30" strokeWidth="0.8" fill="var(--ins-gutter)" />
                    <path d={`M${CX - 52} ${CY}H${CX - 34}M${CX + 34} ${CY}H${CX + 52}M${CX} ${CY - 52}V${CY - 34}M${CX} ${CY + 34}V${CY + 52}`} strokeWidth="0.8" />
                  </g>
                  {starred.map((item, i) => {
                    const { x, y } = place(i);
                    const index = items.indexOf(item);
                    const lit = index >= 0 && index === selectedIndex;
                    const left = x < CX - 10;
                    return (
                      <g
                        key={item.id}
                        className="ins-orrery-body cursor-pointer"
                        data-faded={index < 0 || undefined}
                        style={{ transform: `translate(${f(x)}px, ${f(y)}px) scale(1)`, '--i': i }}
                        onClick={() => choose(item)}
                        onMouseMove={() => index >= 0 && setSelectedIndex(index)}
                      >
                        {lit && <circle r="10" fill="none" stroke="var(--ins-lamp)" strokeDasharray="1 2.5" />}
                        <g stroke={lit ? 'var(--ins-lamp)' : 'var(--color-foreground)'} strokeWidth="1" fill="none">
                          <path d="M-8 0H8M0 -8V8" />
                          <circle r="4.5" fill="var(--ins-gutter)" />
                          <circle r="1.8" fill={lit ? 'var(--ins-lamp)' : 'var(--color-foreground)'} stroke="none" />
                        </g>
                        <g textAnchor={left ? 'end' : 'start'} stroke="var(--ins-gutter)" style={{ paintOrder: 'stroke' }}>
                          <text
                            x={left ? -13 : 13}
                            y="-2"
                            fontFamily="var(--font-name)"
                            fontStyle="italic"
                            fontWeight="300"
                            fontSize="16"
                            strokeWidth="4"
                            fill="var(--color-foreground)"
                          >
                            {item.name}
                          </text>
                          <text
                            x={left ? -13 : 13}
                            y="12"
                            fontFamily="var(--font-mono)"
                            fontSize="10"
                            strokeWidth="3"
                            fill="var(--color-muted-foreground)"
                          >
                            {parentDir(item.path)}
                          </text>
                        </g>
                        <circle r="16" fill="transparent" />
                      </g>
                    );
                  })}
                </svg>
                <LirahMark size={40} className="ins-sun absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <LirahMark size={56} />
              <span className="[font-family:'Grenze_Gotisch',serif] text-[40px] leading-none">Lirah</span>
            </div>
          )}

          <p className="text-center font-mono text-xs text-muted-foreground" aria-live="polite">
            {query ? (
              <>
                <span className="text-foreground">› {query}</span>
                {missing && <span className="text-[var(--ins-fault)]"> · no such folder</span>}
              </>
            ) : (
              'Choose the folder your first tab opens in. Type to filter, or a path.'
            )}
          </p>

          <div
            ref={listRef}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="mx-auto flex w-full max-w-[440px] flex-col gap-3 outline-none"
            role="listbox"
            aria-label="Where the first tab opens"
          >
            <div className="flex flex-col gap-1.5" role="group" aria-label="Places">
              <DialogGroup label="places" />
              <div className="flex flex-col">{places.map(renderRow)}</div>
            </div>
            {/* With the orrery up, the starred list stays for screen readers and the keyboard. */}
            <div className={`flex flex-col gap-1.5 ${orrery ? 'sr-only' : ''}`} role="group" aria-label="Starred">
              <DialogGroup label="starred" />
              {starredRows.length > 0 ? (
                <div className="flex flex-col">{starredRows.map(renderRow)}</div>
              ) : (
                <DialogEmpty>{q ? 'No starred project matches.' : 'None yet. Star a project from the files pane header.'}</DialogEmpty>
              )}
            </div>
          </div>

          <div className="flex justify-center gap-4 text-[11px]">
            <KeyChord keys={['↑', '↓']} label="move" />
            <KeyChord keys={['↵']} label="open" />
            {home && <KeyChord keys={['~']} label="home" />}
          </div>
        </div>
      </div>
    </div>
  );
}
