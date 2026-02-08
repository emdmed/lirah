import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

const IS_WINDOWS = navigator.platform.startsWith('Win');
const SEP = IS_WINDOWS ? '\\' : '/';

function lastSepIndex(p) {
  return Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
}

function isRoot(p) {
  if (!p) return true;
  if (p === '/') return true;
  // Windows drive root like "C:\" or "C:"
  return /^[A-Za-z]:[\\/]?$/.test(p);
}

function parentPath(p) {
  const i = lastSepIndex(p);
  if (i <= 0) return IS_WINDOWS ? p.slice(0, 3) : '/';
  // Keep drive root on Windows (e.g. "C:\")
  if (IS_WINDOWS && i <= 2) return p.slice(0, 3);
  return p.slice(0, i);
}

export function useFlatViewNavigation(terminalSessionId) {
  const [folders, setFolders] = useState([]);
  const [currentPath, setCurrentPath] = useState('');

  // Merge deleted files from git stats into directory listing
  const mergeDeletedFiles = useCallback(async (directories, dirPath) => {
    try {
      const gitStats = await invoke('get_git_stats', { path: dirPath });
      const deletedFiles = [];

      for (const [filePath, stats] of Object.entries(gitStats)) {
        if (stats.status === 'deleted') {
          // Only include deleted files from the current directory
          const sepIdx = lastSepIndex(filePath);
          const parentDir = filePath.substring(0, sepIdx);
          if (parentDir === dirPath) {
            const fileName = filePath.substring(sepIdx + 1);
            deletedFiles.push({
              name: fileName,
              path: filePath,
              is_dir: false,
              is_deleted: true
            });
          }
        }
      }

      return [...directories, ...deletedFiles];
    } catch (error) {
      console.warn('Failed to merge deleted files:', error);
      return directories;
    }
  }, []);

  const navigateTerminalToPath = async (path) => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready, skipping terminal navigation');
      return;
    }

    try {
      // Escape path for shell safety
      let command;
      if (IS_WINDOWS) {
        // PowerShell: use double quotes, escape internal double quotes
        const safePath = `"${path.replace(/"/g, '`"')}"`;
        command = `cd ${safePath}\r`;
      } else {
        const safePath = `'${path.replace(/'/g, "'\\''")}'`;
        command = `cd ${safePath}\r`;
      }

      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: command
      });
    } catch (error) {
      console.error('Failed to navigate terminal to path:', path, error);
      // Don't throw - sidebar update should succeed even if terminal navigation fails
    }
  };

  const loadFolders = async (path) => {
    try {
      let targetPath = path;

      // If explicit path provided, navigate terminal FIRST
      if (path) {
        if (!terminalSessionId) {
          console.log('Terminal session not ready');
          setFolders([]);
          setCurrentPath('Waiting for terminal...');
          return;
        }

        // Send cd command to terminal and wait for it
        await navigateTerminalToPath(path);

        // Wait briefly for shell to process the cd command
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the terminal's actual CWD after navigation
        targetPath = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
        console.log('Terminal navigated to:', targetPath);
      } else {
        // No explicit path - sync to terminal's current CWD
        if (!terminalSessionId) {
          console.log('No terminal session yet');
          setFolders([]);
          setCurrentPath('Waiting for terminal...');
          return;
        }

        // Get terminal's actual CWD
        targetPath = await invoke('get_terminal_cwd', { sessionId: terminalSessionId });
        console.log('Terminal CWD:', targetPath);
      }

      // Now load files from the confirmed directory
      const directories = await invoke('read_directory', { path: targetPath });
      console.log('Loaded', directories.length, 'items from:', targetPath);

      // Merge in deleted files from git stats
      const mergedFolders = await mergeDeletedFiles(directories, targetPath);

      setFolders(mergedFolders);
      setCurrentPath(targetPath);
    } catch (error) {
      console.error('Failed to load folders:', error);
      setFolders([]);
      setCurrentPath('Error loading directory');
    }
  };

  const navigateToParent = async () => {
    if (isRoot(currentPath)) {
      return; // Already at root
    }

    await loadFolders(parentPath(currentPath));
  };

  return {
    folders,
    currentPath,
    setCurrentPath,
    loadFolders,
    navigateToParent
  };
}
