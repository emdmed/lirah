import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { getWorkspaceData, setWorkspaceData } from '../../lib/workspaceStore';
import { useTabManager } from '../tabs/TabContext';

const PinnedFilesContext = createContext(undefined);

const MAX_PINS = 50;

// Pins belong to the active workspace (workspace.json `pins`) and store absolute
// paths. Older entries carried a `projectPath` field that scoped them to a
// single project — those are migrated here by keeping only the absolute path
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

export function PinnedFilesProvider({ children }) {
  const { activeWorkspaceId } = useTabManager();
  const [rev, setRev] = useState(0); // bumped after each write, to re-read
  const pins = useMemo(() => validatePins(getWorkspaceData(activeWorkspaceId, 'pins')), [activeWorkspaceId, rev]);

  // Ordered list of the workspace's pinned absolute paths (pin order preserved).
  const getPinnedPaths = useCallback(() => {
    return pins.map(p => p.path);
  }, [pins]);

  const isPinned = useCallback((path) => {
    return pins.some(p => p.path === path);
  }, [pins]);

  const togglePin = useCallback((path) => {
    if (!path) return;
    const prev = pins;
    let next;
    if (prev.some(p => p.path === path)) {
      next = prev.filter(p => p.path !== path);
    } else if (prev.length >= MAX_PINS) {
      console.warn(`Maximum ${MAX_PINS} pinned files reached`);
      return;
    } else {
      next = [...prev, { path, pinnedAt: Date.now() }];
    }
    setWorkspaceData(activeWorkspaceId, 'pins', next);
    setRev(r => r + 1);
  }, [pins, activeWorkspaceId]);

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
