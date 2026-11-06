import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../toast/ToastContext';
import { getSettings } from '../settings/settingsStore';

export const CLI_COMMANDS = {
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

      // PowerShell 5.1 has no `&&` and escapes ' as '' inside single quotes.
      const powershell = await invoke('get_shell_kind').then((k) => k === 'powershell', () => false);

      // A custom start command (settings) wins: PATH detection fails on some setups and falls back to npx.
      const custom = selectedCli === 'claude-code' ? getSettings().claudeCommand?.trim() : '';
      let command;
      if (custom) {
        command = custom;
      } else if (cliExists) {
        command = cliConfig.command;
      } else if (cliConfig.fallback) {
        command = cliConfig.fallback;
      } else {
        console.error(`${selectedCli} is not available and has no fallback`);
        toastError(`Couldn't launch ${selectedCli}: "${cliConfig.check}" was not found on your PATH. Install it or pick another CLI.`);
        return;
      }
      // Lirah's base plugin, loaded for this session only, built from the
      // parts on in settings. Agent state: the agent reports working / needs
      // permission / done to the tab. Compaction: its hook only acts for tabs
      // with compaction switched on, so that per-tab switch needs no relaunch.
      // Agent control: the skill that teaches the agent the lirah command.
      if (selectedCli === 'claude-code') {
        const { agentStateHook, compactionHook, agentControl } = getSettings();
        const base = await invoke('install_base_plugin', {
          agentState: !!agentStateHook, compaction: !!compactionHook, agentControl: !!agentControl,
        }).catch(() => null);
        // PowerShell also reads the curly quotes as quote characters; doubling any of them keeps the string whole.
        const quote = (v) => `'${powershell ? v.replace(/['‘’‚‛]/g, '$&$&') : v.replace(/'/g, "'\\''")}'`;
        if (base) command += ` --plugin-dir ${quote(base)}`;
        // User plugins: rebuilt each launch from their folder; a broken one is skipped, not fatal.
        for (const p of (getSettings().plugins || []).filter((x) => x.enabled)) {
          try {
            const dir = await invoke('install_user_plugin', { id: p.id, name: p.name, folder: p.folder, prompt: p.prompt });
            command += ` --plugin-dir ${quote(dir)} --add-dir ${quote(p.folder)}`;
          } catch (e) {
            toastError(`Plugin ${p.name}: ${e?.message || e}`);
          }
        }
      }
      // Clear the screen first so the agent starts on a clean terminal.
      command = `${powershell ? 'Clear-Host;' : 'clear &&'} ${command}\r`;

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
