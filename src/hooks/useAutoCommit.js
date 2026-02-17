import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

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

      // Generate commit message via deterministic backend command
      setStage('generating-message');

      const truncatedDiff = stagedDiff.length > 8000 ? stagedDiff.slice(0, 8000) + '\n... (truncated)' : stagedDiff;
      const basePrompt = customPrompt.trim()
        ? `${DEFAULT_PROMPT}\n\nAdditional instructions: ${customPrompt.trim()}`
        : DEFAULT_PROMPT;
      const prompt = `${basePrompt}\n\n${truncatedDiff}`;

      const msg = await invoke('generate_commit_message', {
        projectDir: currentPath,
        cli,
        prompt,
      });

      const lines = msg.split('\n').filter(l => l.trim().length > 0);
      setCommitMessage(lines.length > 0 ? lines.join('\n') : 'chore: update files');
      setStage('ready');
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
