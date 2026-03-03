import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const ORCHESTRATION_CDN_URL = 'https://agentic-orchestration-workflows.vercel.app/orchestration/orchestration.md';

export function useOrchestrationCheck() {
  const [installing, setInstalling] = useState(false);
  const installingRef = useRef(false);
  const installPromiseRef = useRef(null);

  // Keep ref in sync
  useEffect(() => {
    installingRef.current = installing;
  }, [installing]);

  const checkOrchestration = useCallback(async (projectPath) => {
    if (!projectPath) return { status: 'missing' };

    try {
      // Check if orchestration.md exists locally
      const localContent = await invoke('read_file_content', {
        path: `${projectPath}/.orchestration/orchestration.md`
      });

      // File exists, now check if it's outdated by comparing with CDN
      try {
        const response = await fetch(ORCHESTRATION_CDN_URL, {
          method: 'GET',
          headers: { 'Accept': 'text/plain' }
        });

        if (!response.ok) {
          // If CDN fetch fails, assume local is up-to-date
          return { status: 'installed' };
        }

        const remoteContent = await response.text();

        // Normalize content for comparison (trim whitespace, normalize line endings)
        const normalizedLocal = localContent.trim().replace(/\r\n/g, '\n');
        const normalizedRemote = remoteContent.trim().replace(/\r\n/g, '\n');

        if (normalizedLocal === normalizedRemote) {
          return { status: 'installed' };
        } else {
          return { status: 'outdated' };
        }
      } catch (fetchError) {
        // Network error or other fetch issue - assume installed
        console.warn('Failed to fetch remote orchestration version:', fetchError);
        return { status: 'installed' };
      }
    } catch (readError) {
      // File doesn't exist
      return { status: 'missing' };
    }
  }, []);

  const installOrchestration = useCallback(async (projectPath) => {
    if (!projectPath || installingRef.current) return;

    setInstalling(true);
    installingRef.current = true;

    try {
      // Run npx agentic-orchestration via hidden terminal
      const sessionId = await invoke('spawn_hidden_terminal', {
        projectDir: projectPath,
        command: 'npx agentic-orchestration'
      });

      // Create a promise that resolves when the hidden terminal closes
      installPromiseRef.current = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Orchestration install timeout'));
        }, 120000); // 2 minute timeout

        listen('hidden-terminal-closed', (event) => {
          if (event.payload.session_id === sessionId) {
            clearTimeout(timeout);
            if (event.payload.error) {
              reject(new Error(event.payload.error));
            } else {
              resolve();
            }
          }
        }).then(() => {}); // Handle promise rejection silently
      });

      await installPromiseRef.current;
      return { success: true };
    } catch (error) {
      console.error('Failed to install orchestration:', error);
      return { success: false, error: error.message };
    } finally {
      setInstalling(false);
      installingRef.current = false;
      installPromiseRef.current = null;
    }
  }, []);

  const updateOrchestration = useCallback(async (projectPath) => {
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
      console.error('Failed to update orchestration:', error);
      return { success: false, error: error.message };
    } finally {
      setInstalling(false);
      installingRef.current = false;
    }
  }, []);

  return {
    checkOrchestration,
    installOrchestration,
    updateOrchestration,
    installing
  };
}
