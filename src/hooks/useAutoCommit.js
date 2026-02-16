import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const stripAnsi = (str) => str
  .replace(/\x1b\[[0-9;?<>=!]*[a-zA-Z~]/g, '') // CSI sequences (all variants: ?25h, <u, etc.)
  .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
  .replace(/\x1b[()][A-Z0-9]/g, '')          // Character set selection
  .replace(/\x1b[>=<]/g, '')                  // Keypad/cursor modes
  .replace(/\x1b\x1b/g, '')                  // Double escape
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // Control characters
  .replace(/\[<\d*[a-zA-Z]/g, '');            // Stray bracketed sequences without ESC

const DEFAULT_PROMPT = 'Generate a concise conventional commit message for this diff. Reply with ONLY the commit message, no explanation, no markdown formatting, no backticks:';

export function useAutoCommit(cli = 'claude-code', customPrompt = '') {
  const [stage, setStage] = useState('idle'); // idle | loading-files | generating-message | ready | committing | done | error
  const [files, setFiles] = useState([]);
  const [diff, setDiff] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [error, setError] = useState(null);
  const currentPathRef = useRef(null);

  const reset = useCallback(() => {
    setStage('idle');
    setFiles([]);
    setDiff('');
    setCommitMessage('');
    setError(null);
  }, []);

  const trigger = useCallback(async (currentPath) => {
    if (!currentPath) return;
    currentPathRef.current = currentPath;
    reset();
    setStage('loading-files');

    try {
      // Get committable files
      const committableFiles = await invoke('get_committable_files', { repoPath: currentPath });
      if (!committableFiles || committableFiles.length === 0) {
        setError('No committable files found');
        setStage('error');
        return;
      }
      setFiles(committableFiles);

      // Stage the files
      const filePaths = committableFiles.map(f => f.path);
      await invoke('run_git_command', { repoPath: currentPath, args: ['add', ...filePaths] });

      // Get staged diff
      const stagedDiff = await invoke('run_git_command', { repoPath: currentPath, args: ['diff', '--staged'] });
      setDiff(stagedDiff);

      // Generate commit message via hidden terminal
      setStage('generating-message');

      const truncatedDiff = stagedDiff.length > 8000 ? stagedDiff.slice(0, 8000) + '\n... (truncated)' : stagedDiff;
      const escaped = truncatedDiff.replace(/'/g, "'\\''");
      const basePrompt = customPrompt.trim()
        ? `${DEFAULT_PROMPT}\n\nAdditional instructions: ${customPrompt.trim()}`
        : DEFAULT_PROMPT;
      const prompt = `${basePrompt}\n\n${escaped}`;
      const escapedPrompt = prompt.replace(/'/g, "'\\''");
      const command = cli === 'opencode'
        ? `opencode run -m opencode/kimi-k2.5-free '${escapedPrompt}'`
        : `claude --print '${escapedPrompt}'`;

      const sessionId = await invoke('spawn_hidden_terminal', {
        projectDir: currentPath,
        command,
      });

      // Collect output from hidden terminal
      let output = '';
      const unlistenOutput = await listen('hidden-terminal-output', (event) => {
        if (event.payload.session_id === sessionId) {
          output += event.payload.data;
        }
      });

      const unlistenClose = await listen('hidden-terminal-closed', (event) => {
        if (event.payload.session_id === sessionId) {
          unlistenOutput();
          unlistenClose();

          if (event.payload.error) {
            setError('Failed to generate commit message');
            setStage('error');
            return;
          }

          // Clean up the output
          const cleaned = stripAnsi(output).trim();
          // Take last meaningful line(s) - the actual commit message
          const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
          const msg = lines.length > 0 ? lines.join('\n') : 'chore: update files';
          setCommitMessage(msg);
          setStage('ready');
        }
      });
    } catch (err) {
      setError(err.toString());
      setStage('error');
    }
  }, [reset, cli, customPrompt]);

  const confirm = useCallback(async (editedMessage) => {
    const repoPath = currentPathRef.current;
    if (!repoPath) return;
    setStage('committing');
    try {
      await invoke('run_git_command', { repoPath, args: ['commit', '-m', editedMessage] });
      setStage('done');
      setTimeout(reset, 1500);
    } catch (err) {
      setError(err.toString());
      setStage('error');
    }
  }, [reset]);

  const cancel = useCallback(async () => {
    const repoPath = currentPathRef.current;
    if (repoPath && (stage === 'ready' || stage === 'generating-message')) {
      try {
        await invoke('run_git_command', { repoPath, args: ['reset', 'HEAD'] });
      } catch {}
    }
    reset();
  }, [stage, reset]);

  // Quick commit: if ready, commit immediately; if generating, mark for auto-commit when ready
  const autoConfirmRef = useRef(false);

  const quickCommit = useCallback(() => {
    if (stage === 'ready' && commitMessage.trim()) {
      confirm(commitMessage);
    } else if (stage === 'loading-files' || stage === 'generating-message') {
      autoConfirmRef.current = true;
    }
  }, [stage, commitMessage, confirm]);

  // Auto-confirm when message becomes ready if flagged
  const prevStageRef = useRef(stage);
  if (stage === 'ready' && prevStageRef.current !== 'ready' && autoConfirmRef.current) {
    autoConfirmRef.current = false;
    setTimeout(() => confirm(commitMessage), 0);
  }
  prevStageRef.current = stage;

  return { stage, files, diff, commitMessage, setCommitMessage, error, trigger, confirm, cancel, quickCommit };
}
