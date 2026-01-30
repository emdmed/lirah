import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
          const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));
          if (parentDir === dirPath) {
            const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
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
      // Escape path for shell safety (handle spaces and special characters)
      const safePath = `'${path.replace(/'/g, "'\\''")}'`;
      const command = `cd ${safePath}\n`;

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
    if (!currentPath || currentPath === '/') {
      return; // Already at root
    }

    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    await loadFolders(parentPath);
  };

  return {
    folders,
    currentPath,
    setCurrentPath,
    loadFolders,
    navigateToParent
  };
}
