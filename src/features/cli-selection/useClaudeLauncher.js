import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../toast/ToastContext';

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
  const { error: toastError } = useToast();
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
      toastError('Terminal is still starting. Try launching again in a moment.');
      return;
    }

    const cliConfig = CLI_COMMANDS[selectedCli];
    if (!cliConfig) {
      console.error('Unknown CLI:', selectedCli);
      toastError(`Unknown CLI "${selectedCli}". Pick one in CLI settings.`);
      return;
    }

    try {
      // Check if the selected CLI's command exists
      const cliExists = await invoke('check_command_exists', {
        command: cliConfig.check
      });

      let command;
      if (cliExists) {
        command = cliConfig.command;
      } else if (cliConfig.fallback) {
        command = cliConfig.fallback;
      } else {
        console.error(`${selectedCli} is not available and has no fallback`);
        toastError(`Couldn't launch ${selectedCli}: "${cliConfig.check}" was not found on your PATH. Install it or pick another CLI.`);
        return;
      }
      // Claude Code reports its state (working, needs permission, done) to
      // the tab through Lirah's hook plugin, loaded for this session only.
      if (selectedCli === 'claude-code') {
        const pluginDir = await invoke('get_agent_hook_plugin_dir').catch(() => null);
        if (pluginDir) command += ` --plugin-dir '${pluginDir.replace(/'/g, "'\\''")}'`;
      }
      command += '\r';

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
      toastError(`Couldn't launch ${selectedCli}: ${error?.message || error}`);
    }
  }, [terminalSessionId, terminalRef, selectedCli, toastError]);

  // Keep backward compatibility
  const launchClaude = launchCli;

  return { launchClaude, launchCli, cliAvailability };
}
