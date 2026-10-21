import { useCallback, useMemo, useRef, useState } from 'react';
import { rowMatches, SECTIONS } from './settingsSections';

// Where the dialog reopens: the last section viewed this session.
let lastSectionId = SECTIONS[0].id;

/**
 * The Settings dialog's navigation: the active section, the filter and its
 * match counts, and the keys: `/` filters, 1–6 pick a section, arrows move
 * through the rail, Esc clears the filter before closing.
 */
export function useSettingsNav() {
  const [activeId, setActiveId] = useState(lastSectionId);
  const [query, setQuery] = useState('');
  const filterRef = useRef(null);
  const tabRefs = useRef({});

  const normalizedQuery = query.trim().toLowerCase();
  const filtering = normalizedQuery.length > 0;
  const filterValue = useMemo(() => ({ query: normalizedQuery, filtering }), [normalizedQuery, filtering]);

  const matchCounts = useMemo(() => {
    if (!filtering) return null;
    return Object.fromEntries(SECTIONS.map((s) => [
      s.id, Object.values(s.rows).filter((w) => rowMatches(w, normalizedQuery)).length,
    ]));
  }, [filtering, normalizedQuery]);
  const totalMatches = matchCounts ? Object.values(matchCounts).reduce((a, b) => a + b, 0) : 0;

  const selectSection = useCallback((id, { focus = false } = {}) => {
    lastSectionId = id;
    setActiveId(id);
    setQuery('');
    if (focus) tabRefs.current[id]?.focus();
  }, []);

  // Open on the active section's rail key, so arrows and 1–6 work at once.
  const handleOpenAutoFocus = useCallback((e) => {
    e.preventDefault();
    tabRefs.current[activeId]?.focus();
  }, [activeId]);

  // Esc clears an active filter before it closes the dialog.
  const handleEscape = useCallback((e) => {
    if (!query) return;
    e.preventDefault();
    setQuery('');
    tabRefs.current[activeId]?.focus();
  }, [query, activeId]);

  // `/` filters and 1–6 jump to a section, unless the user is typing.
  const handleKeyDown = useCallback((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      filterRef.current?.focus();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= SECTIONS.length) {
      e.preventDefault();
      selectSection(SECTIONS[n - 1].id, { focus: true });
    }
  }, [selectSection]);

  // Vertical tablist: arrows, Home and End move and select.
  const handleRailKeyDown = useCallback((e) => {
    const i = SECTIONS.findIndex((s) => s.id === activeId);
    const next = {
      ArrowDown: (i + 1) % SECTIONS.length,
      ArrowUp: (i - 1 + SECTIONS.length) % SECTIONS.length,
      Home: 0,
      End: SECTIONS.length - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectSection(SECTIONS[next].id, { focus: true });
  }, [activeId, selectSection]);

  return {
    activeId, query, setQuery, filtering, filterValue, matchCounts, totalMatches, filterRef, tabRefs,
    selectSection, handleOpenAutoFocus, handleEscape, handleKeyDown, handleRailKeyDown,
  };
}
