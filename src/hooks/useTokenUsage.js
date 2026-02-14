import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useTokenUsage(projectPath, enabled = true) {
  const [tokenUsage, setTokenUsage] = useState(null);
  const [projectStats, setProjectStats] = useState(null);
  const lastUsageRef = useRef(null);
  const checkIntervalRef = useRef(null);

  const checkUsage = useCallback(async () => {
    if (!projectPath || !enabled) return;

    try {
      const usage = await invoke('get_session_token_usage', { projectPath });

      const usageKey = `${usage.input_tokens}-${usage.output_tokens}`;
      if (usageKey !== lastUsageRef.current) {
        lastUsageRef.current = usageKey;
        setTokenUsage(usage);
      }
    } catch (error) {
    }
  }, [projectPath, enabled]);

  const fetchProjectStats = useCallback(async () => {
    if (!projectPath || !enabled) return;

    try {
      const stats = await invoke('get_project_stats', { projectPath });
      setProjectStats(stats);
    } catch (error) {
      console.error('Failed to fetch project stats:', error);
    }
  }, [projectPath, enabled]);

  // Only poll for current session token usage (not projectStats)
  useEffect(() => {
    if (!enabled || !projectPath) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    checkUsage();

    checkIntervalRef.current = setInterval(() => {
      checkUsage();
    }, 5000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [projectPath, enabled, checkUsage]);

  // Fetch project stats only once on mount or when explicitly requested
  useEffect(() => {
    if (enabled && projectPath) {
      fetchProjectStats();
    }
  }, [projectPath, enabled, fetchProjectStats]);

  const refreshProjectStats = useCallback(() => {
    fetchProjectStats();
  }, [fetchProjectStats]);

  return { tokenUsage, projectStats, refreshProjectStats };
}
