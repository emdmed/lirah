import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Custom hook to fetch and manage git statistics for files
 * @param {string} currentPath - The current directory path to fetch stats for
 * @returns {Map} Map of file paths to git stats {added, deleted}
 */
export function useGitStats(currentPath) {
  const [gitStats, setGitStats] = useState(new Map());

  useEffect(() => {
    if (!currentPath) return;

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
  }, [currentPath]);

  return gitStats;
}
