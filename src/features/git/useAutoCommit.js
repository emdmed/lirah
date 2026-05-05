import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useAutoCommit(cli = 'claude-code', customPrompt = '') {
  const [stage, setStage] = useState('idle'); // idle | loading-files | generating-message | ready | committing | done | error
  const [files, setFiles] = useState([]);
  const [diff, setDiff] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [error, setError] = useState(null);
  const currentPathRef = useRef(null);
  const cancelledRef = useRef(false);

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
    cancelledRef.current = false;
    reset();
    setStage('loading-files');

    try {
      // Get committable files
      const committableFiles = await invoke('get_committable_files', { repoPath: currentPath });
      if (cancelledRef.current) return;
      if (!committableFiles || committableFiles.length === 0) {
        setError('No committable files found');
        setStage('error');
        return;
      }
      setFiles(committableFiles);

      // Stage the files (use -- separator and handle deleted files)
      const deleted = committableFiles.filter(f => f.status === 'deleted').map(f => f.path);
      const other = committableFiles.filter(f => f.status !== 'deleted').map(f => f.path);
      if (other.length > 0) {
        await invoke('run_git_command', { repoPath: currentPath, args: ['add', '--', ...other] });
        if (cancelledRef.current) return;
      }
      if (deleted.length > 0) {
        await invoke('run_git_command', { repoPath: currentPath, args: ['rm', '--cached', '--', ...deleted] });
        if (cancelledRef.current) return;
      }

      // Generate commit message via backend (which gets diff via git command)
      setStage('generating-message');

      const msg = await invoke('generate_commit_message', {
        projectDir: currentPath,
        cli,
        customPrompt: customPrompt.trim() || null,
      });
      if (cancelledRef.current) return;

      const lines = msg.split('\n').filter(l => l.trim().length > 0);
      setCommitMessage(lines.length > 0 ? lines.join('\n') : 'chore: update files');
      setStage('ready');
    } catch (err) {
      if (cancelledRef.current) return;
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
      setTimeout(reset, 2000);
    } catch (err) {
      setError(err.toString());
      setStage('error');
    }
  }, [reset]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
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
