import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const CLI_COMMANDS = {
  'claude-code': {
    check: 'claude',
    fallback: 'npx @anthropic-ai/claude-code',
    command: 'claude'
  },
  'opencode': {
    check: 'opencode',
    fallback: null, // No fallback for opencode
    command: 'opencode'
  }
};

export function useClaudeLauncher(terminalSessionId, terminalRef, selectedCli = 'claude-code') {
  const [cliAvailability, setCliAvailability] = useState({
    'claude-code': true, // Always available via npx fallback
    'opencode': false
  });

  // Check CLI availability on mount and when terminal session changes
  useEffect(() => {
    async function checkAvailability() {
      try {
        const opencodeExists = await invoke('check_command_exists', { command: 'opencode' });

        setCliAvailability({
          'claude-code': true, // Always available via npx fallback
          'opencode': opencodeExists
        });
      } catch (error) {
        console.error('Failed to check CLI availability:', error);
      }
    }

    checkAvailability();
  }, [terminalSessionId]);

  const launchCli = useCallback(async () => {
    if (!terminalSessionId) {
      console.warn('Terminal session not ready, cannot launch CLI');
      return;
    }

    const cliConfig = CLI_COMMANDS[selectedCli];
    if (!cliConfig) {
      console.error('Unknown CLI:', selectedCli);
      return;
    }

    try {
      // Check if the selected CLI's command exists
      const cliExists = await invoke('check_command_exists', {
        command: cliConfig.check
      });

      let command;
      if (cliExists) {
        command = cliConfig.command + '\n';
      } else if (cliConfig.fallback) {
        command = cliConfig.fallback + '\n';
      } else {
        console.error(`${selectedCli} is not available and has no fallback`);
        return;
      }

      console.log('Launching CLI with command:', command.trim());

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
      console.error('Failed to launch CLI:', error);
    }
  }, [terminalSessionId, terminalRef, selectedCli]);

  // Keep backward compatibility
  const launchClaude = launchCli;

  return { launchClaude, launchCli, cliAvailability };
}
