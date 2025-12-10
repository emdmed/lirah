import { createContext, useContext, useState, useEffect } from 'react';

const WatcherContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:file-watching-enabled';

function loadWatcherState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : JSON.parse(saved);
  } catch (error) {
    console.warn('Failed to load watcher state from localStorage:', error);
    return true; // Default: enabled
  }
}

function saveWatcherState(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  } catch (error) {
    console.warn('Failed to save watcher state to localStorage:', error);
  }
}

export function WatcherProvider({ children }) {
  const [fileWatchingEnabled, setFileWatchingEnabled] = useState(() => loadWatcherState());

  useEffect(() => {
    saveWatcherState(fileWatchingEnabled);
  }, [fileWatchingEnabled]);

  const toggleWatchers = () => {
    setFileWatchingEnabled(prev => !prev);
  };

  const value = {
    fileWatchingEnabled,
    toggleWatchers,
  };

  return <WatcherContext.Provider value={value}>{children}</WatcherContext.Provider>;
}

export function useWatcher() {
  const context = useContext(WatcherContext);
  if (context === undefined) {
    throw new Error('useWatcher must be used within a WatcherProvider');
  }
  return context;
}
