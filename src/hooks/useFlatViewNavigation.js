import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { normalizePath } from '../utils/pathUtils';

export function useFlatViewNavigation(terminalSessionId) {
  const [folders, setFolders] = useState([]);
  const [currentPath, setCurrentPath] = useState('');

  // Merge deleted files from git stats into directory listing
  const mergeDeletedFiles = useCallback(async (directories, dirPath) => {
    try {
      const gitStats = await invoke('get_git_stats', { path: dirPath });
      const deletedFiles = [];
      const normalizedDirPath = normalizePath(dirPath);

      for (const [filePath, stats] of Object.entries(gitStats)) {
        if (stats.status === 'deleted') {
          // Only include deleted files from the current directory
          const normalizedFilePath = normalizePath(filePath);
          const lastSlash = normalizedFilePath.lastIndexOf('/');
          const parentDir = normalizedFilePath.substring(0, lastSlash);
          if (parentDir === normalizedDirPath) {
            const fileName = normalizedFilePath.substring(lastSlash + 1);
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
      // Detect platform and escape path appropriately
      const isWindows = navigator.platform.toLowerCase().includes('win');
      let safePath;
      if (isWindows) {
        // PowerShell: use double quotes and escape internal double quotes
        safePath = `"${path.replace(/"/g, '`"')}"`;
      } else {
        // Unix shells: use single quotes and escape internal single quotes
        safePath = `'${path.replace(/'/g, "'\\''")}'`;
      }
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
    if (!currentPath) {
      return;
    }

    // Normalize to forward slashes for consistent handling
    const normalized = normalizePath(currentPath);

    // Check for root paths (Unix: "/" or Windows: "C:" after normalization)
    const isUnixRoot = normalized === '/';
    const isWindowsRoot = /^[a-zA-Z]:$/.test(normalized) || /^[a-zA-Z]:\/+$/.test(currentPath);
    if (isUnixRoot || isWindowsRoot) {
      return; // Already at root
    }

    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) {
      // On Windows, preserve drive letter; on Unix, go to /
      const parentPath = /^[a-zA-Z]:/.test(normalized) ? parts[0] : '/';
      await loadFolders(parentPath);
    } else {
      // Remove last segment
      parts.pop();
      const parentPath = /^[a-zA-Z]:/.test(normalized)
        ? parts.join('/')
        : '/' + parts.join('/');
      await loadFolders(parentPath);
    }
  };

  return {
    folders,
    currentPath,
    setCurrentPath,
    loadFolders,
    navigateToParent
  };
}
