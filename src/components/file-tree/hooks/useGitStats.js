import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Custom hook to fetch and manage git statistics for files
 * @param {string} currentPath - The current directory path to fetch stats for
 * @param {boolean} enabled - Whether to enable git stats polling (default: true)
 * @returns {Map} Map of file paths to git stats {added, deleted}
 */
export function useGitStats(currentPath, enabled = true) {
  const [gitStats, setGitStats] = useState(new Map());

  useEffect(() => {
    if (!currentPath || !enabled) {
      setGitStats(new Map());
      return;
    }

    const fetchGitStats = async () => {
      try {
        const statsData = await invoke('get_git_stats', { path: currentPath });
        setGitStats(new Map(Object.entries(statsData)));
      } catch (error) {
        console.warn('Failed to load git stats:', error);
        setGitStats(new Map());
      }
    };

    // Initial fetch
    fetchGitStats();

    // Set up 1-second interval
    const interval = setInterval(fetchGitStats, 1000);

    // Cleanup on unmount or path change
    return () => clearInterval(interval);
  }, [currentPath, enabled]);

  return gitStats;
}
