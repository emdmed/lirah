import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useClaudeDetection(sessionId, enabled) {
  const [isRunningInClaude, setIsRunningInClaude] = useState(false);

  useEffect(() => {
    if (!sessionId || !enabled) {
      setIsRunningInClaude(false);
      return;
    }

    const detectClaude = async () => {
      try {
        console.log('Checking for Claude environment...');
        const hasClaude = await invoke('detect_claude_env', { sessionId });
        console.log('Claude detection result:', hasClaude);
        setIsRunningInClaude(hasClaude);
      } catch (error) {
        console.error('Claude detection error:', error);
        setIsRunningInClaude(false);
      }
    };

    // Initial detection
    detectClaude();

    // Re-check every 3 seconds (environment doesn't change often)
    const interval = setInterval(detectClaude, 3000);

    return () => clearInterval(interval);
  }, [sessionId, enabled]);

  return isRunningInClaude;
}
