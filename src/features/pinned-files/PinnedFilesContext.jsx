import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const PinnedFilesContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:pinned-files';
const MAX_PINS_PER_PROJECT = 50;

function validatePins(pins) {
  if (!Array.isArray(pins)) return [];

  return pins.filter(p =>
    p &&
    typeof p.path === 'string' &&
    p.path.trim() !== '' &&
    typeof p.projectPath === 'string'
  );
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

  // Ordered list of pinned absolute paths for a given project (pin order preserved)
  const getPinnedPaths = useCallback((projectPath) => {
    return pins
      .filter(p => p.projectPath === projectPath)
      .map(p => p.path);
  }, [pins]);

  const isPinned = useCallback((path, projectPath) => {
    return pins.some(p => p.path === path && p.projectPath === projectPath);
  }, [pins]);

  const togglePin = useCallback((path, projectPath) => {
    if (!path || !projectPath) return;
    setPins(prev => {
      const exists = prev.some(p => p.path === path && p.projectPath === projectPath);
      if (exists) {
        return prev.filter(p => !(p.path === path && p.projectPath === projectPath));
      }
      const projectCount = prev.filter(p => p.projectPath === projectPath).length;
      if (projectCount >= MAX_PINS_PER_PROJECT) {
        console.warn(`Maximum ${MAX_PINS_PER_PROJECT} pinned files reached for this project`);
        return prev;
      }
      return [...prev, { path, projectPath, pinnedAt: Date.now() }];
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
