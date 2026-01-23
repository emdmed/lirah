import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useClaudeLauncher(terminalSessionId, terminalRef) {
  const launchClaude = useCallback(async () => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready, cannot launch Claude');
      return;
    }

    try {
      // Check if 'claude' command exists in PATH
      const claudeExists = await invoke('check_command_exists', {
        command: 'claude'
      });

      // Choose command based on availability
      const command = claudeExists
        ? 'claude\n'
        : 'npx @anthropic-ai/claude-code\n';

      console.log('Launching Claude with command:', command.trim());

      // Send command to terminal
      await invoke('write_to_terminal', {
        sessionId: terminalSessionId,
        data: command
      });

      // Focus terminal to show output
      if (terminalRef.current?.focus) {
        terminalRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to launch Claude:', error);
    }
  }, [terminalSessionId, terminalRef]);

  return { launchClaude };
}
