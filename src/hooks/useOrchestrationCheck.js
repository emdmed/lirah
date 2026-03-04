import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';

const ORCHESTRATION_CDN_URL = 'https://agentic-orchestration-workflows.vercel.app/orchestration/orchestration.md';

export function useOrchestrationCheck() {
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);

  useEffect(() => {
    installingRef.current = installing;
  }, [installing]);

  const checkOrchestration = useCallback(async (projectPath) => {
    if (!projectPath) return { status: 'missing' };

    try {
      const localContent = await invoke('read_file_content', {
        path: `${projectPath}/.orchestration/orchestration.md`
      });

      try {
        const response = await fetch(ORCHESTRATION_CDN_URL, {
          method: 'GET',
          headers: { 'Accept': 'text/plain' }
        });

        if (!response.ok) return { status: 'installed' };

        const remoteContent = await response.text();
        const normalizedLocal = localContent.trim().replace(/\r\n/g, '\n');
        const normalizedRemote = remoteContent.trim().replace(/\r\n/g, '\n');

        return { status: normalizedLocal === normalizedRemote ? 'installed' : 'outdated' };
      } catch {
        return { status: 'installed' };
      }
    } catch {
      return { status: 'missing' };
    }
  }, []);

  const syncOrchestration = useCallback(async (projectPath) => {
    if (!projectPath || installingRef.current) return;

    setInstalling(true);
    installingRef.current = true;

    try {
      const response = await fetch(ORCHESTRATION_CDN_URL, {
        method: 'GET',
        headers: { 'Accept': 'text/plain' }
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to fetch from CDN' };
      }

      const content = await response.text();

      await invoke('write_file_content', {
        path: `${projectPath}/.orchestration/orchestration.md`,
        content
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to sync orchestration:', error);
      return { success: false, error: error.message };
    } finally {
      setInstalling(false);
      installingRef.current = false;
    }
  }, []);

  return useMemo(() => ({
    checkOrchestration,
    syncOrchestration,
    // Keep old names as aliases for backward compat in App.jsx
    installOrchestration: syncOrchestration,
    updateOrchestration: syncOrchestration,
    installing
  }), [checkOrchestration, syncOrchestration, installing]);
}
