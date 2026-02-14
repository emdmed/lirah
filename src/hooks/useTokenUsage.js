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

  // Fetch project stats once, then start polling only session usage
  useEffect(() => {
    if (!enabled || !projectPath) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // Fetch full stats once on mount, then poll lightweight session usage
    fetchProjectStats();

    // Delay first session poll to avoid overlapping with fetchProjectStats on startup
    const initialTimeout = setTimeout(() => {
      checkUsage();
      checkIntervalRef.current = setInterval(checkUsage, 5000);
    }, 2000);

    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [projectPath, enabled, checkUsage, fetchProjectStats]);

  const refreshProjectStats = useCallback(() => {
    fetchProjectStats();
  }, [fetchProjectStats]);

  return { tokenUsage, projectStats, refreshProjectStats };
}
