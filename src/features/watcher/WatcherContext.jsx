import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { loadJson, saveJson } from '../../lib/storage';

const WatcherContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:file-watching-enabled';

function loadWatcherState() {
  return loadJson(STORAGE_KEY, true); // Default: enabled
}

function saveWatcherState(enabled) {
  saveJson(STORAGE_KEY, enabled);
}

export function WatcherProvider({ children }) {
  const [fileWatchingEnabled, setFileWatchingEnabled] = useState(() => loadWatcherState());

  // Sync with backend on mount
  useEffect(() => {
    const syncBackend = async () => {
      try {
        if (fileWatchingEnabled) {
          await invoke('enable_file_watchers');
        } else {
          await invoke('disable_file_watchers');
        }
      } catch (error) {
        console.error('Failed to sync watcher state with backend:', error);
      }
    };
    syncBackend();
  }, []); // Only run on mount

  useEffect(() => {
    saveWatcherState(fileWatchingEnabled);
  }, [fileWatchingEnabled]);

  const toggleWatchers = async () => {
    setFileWatchingEnabled(prev => {
      const newState = !prev;
      // Call backend command
      invoke(newState ? 'enable_file_watchers' : 'disable_file_watchers')
        .catch(error => {
          console.error('Failed to toggle backend watchers:', error);
        });
      return newState;
    });
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
