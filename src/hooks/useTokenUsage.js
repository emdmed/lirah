import { useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useTokenUsage(projectPath, enabled = true) {
  const [tokenUsage, setTokenUsage] = useState(null);
  const lastUsageRef = useRef(null);
  const checkIntervalRef = useRef(null);

  const checkUsage = useCallback(async () => {
    if (!projectPath || !enabled) return;

    try {
      const usage = await invoke('get_session_token_usage', { projectPath });

      // Only update if values changed
      const usageKey = `${usage.input_tokens}-${usage.output_tokens}`;
      if (usageKey !== lastUsageRef.current) {
        lastUsageRef.current = usageKey;
        setTokenUsage(usage);
      }
    } catch (error) {
      // Session files might not exist yet, ignore
    }
  }, [projectPath, enabled]);

  useEffect(() => {
    if (!enabled || !projectPath) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    // Initial check
    checkUsage();

    // Poll every 5 seconds
    checkIntervalRef.current = setInterval(checkUsage, 5000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [projectPath, enabled, checkUsage]);

  return tokenUsage;
}
