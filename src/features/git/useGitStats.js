import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Custom hook to fetch and manage git statistics for files
 * @param {string} currentPath - The current directory path to fetch stats for
 * @param {boolean} enabled - Whether to enable git stats polling (default: true)
 * @param {Function} onGitChanges - Callback for specific git changes (type, data)
 * @returns {Object} Object containing gitStats Map
 */
export function useGitStats(currentPath, enabled = true, onGitChanges) {
  const [gitStats, setGitStats] = useState(new Map());
  const prevStatsRef = useRef(new Map());

  useEffect(() => {
    if (!currentPath || !enabled) {
      setGitStats(new Map());
      prevStatsRef.current = new Map();
      return;
    }

    const fetchGitStats = async () => {
      try {
        const statsData = await invoke('get_git_stats', { path: currentPath });
        const newStats = new Map(Object.entries(statsData));

        // Detect specific git changes for targeted updates
        if (onGitChanges) {
          const changes = detectGitChanges(prevStatsRef.current, newStats);
          if (changes.hasChanges) {
            console.log('Git changes detected:', changes);
            onGitChanges(changes);
          }
        }

        // Only update state if contents actually changed to avoid unnecessary re-renders
        if (!mapsEqual(prevStatsRef.current, newStats)) {
          setGitStats(newStats);
        }
        prevStatsRef.current = newStats;
      } catch (error) {
        console.warn('Failed to load git stats:', error);
        setGitStats(new Map());
        prevStatsRef.current = new Map();
      }
    };

    // Initial fetch
    fetchGitStats();

    // Set up 3-second interval (was 1s - reduced to minimize git process spawning)
    const interval = setInterval(fetchGitStats, 3000);

    // Cleanup on unmount or path change
    return () => clearInterval(interval);
  }, [currentPath, enabled, onGitChanges]);

  return { gitStats };
}

function mapsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, valA] of a) {
    const valB = b.get(key);
    if (!valB) return false;
    if (valA.status !== valB.status || valA.added !== valB.added || valA.deleted !== valB.deleted) return false;
  }
  return true;
}

/**
 * Detect specific git changes for targeted updates
 * @param {Map} prevStats - Previous git stats
 * @param {Map} newStats - New git stats
 * @returns {Object} Changes object with arrays of affected files
 */
function detectGitChanges(prevStats, newStats) {
  const changes = {
    hasChanges: false,
    newUntracked: [],
    newDeleted: [],
    noLongerUntracked: [],
    filesModified: []
  };

  // Skip on initial load - but log for debugging
  if (prevStats.size === 0) {
    if (newStats.size > 0) {
      console.log('[useGitStats] Initial load, skipping change detection. New stats count:', newStats.size);
    }
    return changes;
  }

  // Find new untracked files
  for (const [filePath, stats] of newStats.entries()) {
    if (stats.status === 'untracked' && !prevStats.has(filePath)) {
      console.log('[useGitStats] New untracked file detected:', filePath);
      changes.newUntracked.push({ path: filePath, stats });
      changes.hasChanges = true;
    }
    // Files that became deleted
    else if (stats.status === 'deleted' && prevStats.has(filePath) && prevStats.get(filePath).status !== 'deleted') {
      changes.newDeleted.push({ path: filePath, stats });
      changes.hasChanges = true;
    }
    // Files that were modified (line count changes)
    else if (prevStats.has(filePath) && stats.status !== 'deleted' && stats.status !== 'untracked') {
      const prevStat = prevStats.get(filePath);
      if (prevStat.added !== stats.added || prevStat.deleted !== stats.deleted) {
        changes.filesModified.push({ path: filePath, stats });
        // Don't set hasChanges for pure modifications to avoid triggering tree refresh
      }
    }
  }

  // Files that were previously untracked/deleted but no longer appear
  for (const [filePath, stats] of prevStats.entries()) {
    if ((stats.status === 'untracked' || stats.status === 'deleted') && !newStats.has(filePath)) {
      changes.noLongerUntracked.push({ path: filePath });
      changes.hasChanges = true;
    }
  }

  return changes;
}
