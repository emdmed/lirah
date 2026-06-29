import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const PinnedFilesContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:pinned-files';
const MAX_PINS = 50;

// Pins are global: they store the absolute file path and are shared across all
// project tabs. Older entries carried a `projectPath` field that scoped them to
// a single project — those are migrated here by keeping only the absolute path
// and de-duplicating, so previously pinned files survive the upgrade.
function validatePins(pins) {
  if (!Array.isArray(pins)) return [];

  const seen = new Set();
  return pins
    .filter(p => p && typeof p.path === 'string' && p.path.trim() !== '')
    .filter(p => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    })
    .map(p => ({
      path: p.path,
      pinnedAt: typeof p.pinnedAt === 'number' ? p.pinnedAt : Date.now(),
    }));
}

function loadPins() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return [];
    return validatePins(JSON.parse(saved));
  } catch (error) {
    console.warn('Failed to load pinned files from localStorage:', error);
    return [];
  }
}

function savePins(pins) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch (error) {
    console.warn('Failed to save pinned files to localStorage:', error);
  }
}

export function PinnedFilesProvider({ children }) {
  const [pins, setPins] = useState(() => loadPins());

  useEffect(() => {
    savePins(pins);
  }, [pins]);

  // Ordered list of all pinned absolute paths (pin order preserved). Pins are
  // global and shared across every project tab.
  const getPinnedPaths = useCallback(() => {
    return pins.map(p => p.path);
  }, [pins]);

  const isPinned = useCallback((path) => {
    return pins.some(p => p.path === path);
  }, [pins]);

  const togglePin = useCallback((path) => {
    if (!path) return;
    setPins(prev => {
      const exists = prev.some(p => p.path === path);
      if (exists) {
        return prev.filter(p => p.path !== path);
      }
      if (prev.length >= MAX_PINS) {
        console.warn(`Maximum ${MAX_PINS} pinned files reached`);
        return prev;
      }
      return [...prev, { path, pinnedAt: Date.now() }];
    });
  }, []);

  const value = useMemo(() => ({
    pins,
    getPinnedPaths,
    isPinned,
    togglePin,
  }), [pins, getPinnedPaths, isPinned, togglePin]);

  return (
    <PinnedFilesContext.Provider value={value}>
      {children}
    </PinnedFilesContext.Provider>
  );
}

export function usePinnedFiles() {
  const context = useContext(PinnedFilesContext);
  if (context === undefined) {
    throw new Error('usePinnedFiles must be used within a PinnedFilesProvider');
  }
  return context;
}
