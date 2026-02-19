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

      // Get staged diff from frontend (file-by-file to avoid backend git permission issues)
      let stagedDiff = '';
      for (const file of committableFiles) {
        try {
          const filePath = `${currentPath}/${file.path}`;
          const result = await invoke('get_git_diff', { filePath, repoPath: currentPath });
          if (result) {
            // Build a git-style diff header
            const isNew = result.is_new_file;
            const isDeleted = result.is_deleted_file;
            const oldPath = isNew ? '/dev/null' : `a/${file.path}`;
            const newPath = isDeleted ? '/dev/null' : `b/${file.path}`;
            const oldMode = isNew ? '0000000' : '100644';
            const newMode = isDeleted ? '0000000' : '100644';
            
            stagedDiff += `diff --git ${oldPath} ${newPath}\n`;
            stagedDiff += `index ${oldMode}..${newMode} ${newMode}\n`;
            if (isNew) {
              stagedDiff += `--- /dev/null\n`;
              stagedDiff += `+++ b/${file.path}\n`;
            } else if (isDeleted) {
              stagedDiff += `--- a/${file.path}\n`;
              stagedDiff += `+++ /dev/null\n`;
            } else {
              stagedDiff += `--- a/${file.path}\n`;
              stagedDiff += `+++ b/${file.path}\n`;
            }
            
            // Add actual diff content by comparing line by line
            const oldLines = result.old_content.split('\n');
            const newLines = result.new_content.split('\n');
            
            // Simple unified diff format
            let oldLineNum = 1;
            let newLineNum = 1;
            
            // Find differences and format them
            const maxLines = Math.max(oldLines.length, newLines.length);
            let hunkOldStart = 1;
            let hunkNewStart = 1;
            let hunkOldCount = 0;
            let hunkNewCount = 0;
            let hunkLines = [];
            
            for (let i = 0; i < maxLines; i++) {
              const oldLine = oldLines[i] || '';
              const newLine = newLines[i] || '';
              
              if (oldLine !== newLine) {
                if (i < oldLines.length && (i >= newLines.length || oldLine !== newLines[i])) {
                  hunkLines.push(`-${oldLine}`);
                  hunkOldCount++;
                }
                if (i < newLines.length && (i >= oldLines.length || newLine !== oldLines[i])) {
                  hunkLines.push(`+${newLine}`);
                  hunkNewCount++;
                }
              } else {
                if (hunkLines.length > 0) {
                  // Output the hunk
                  stagedDiff += `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@\n`;
                  stagedDiff += hunkLines.join('\n') + '\n';
                  hunkLines = [];
                }
                hunkOldStart = oldLineNum + 1;
                hunkNewStart = newLineNum + 1;
                hunkOldCount = 0;
                hunkNewCount = 0;
              }
              
              if (i < oldLines.length) oldLineNum++;
              if (i < newLines.length) newLineNum++;
            }
            
            // Output any remaining hunk
            if (hunkLines.length > 0) {
              stagedDiff += `@@ -${hunkOldStart},${hunkOldCount} +${hunkNewStart},${hunkNewCount} @@\n`;
              stagedDiff += hunkLines.join('\n') + '\n';
            }
            
            stagedDiff += '\n';
          }
        } catch (err) {
          console.warn(`Failed to get diff for ${file.path}:`, err);
        }
      }
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
      setTimeout(reset, 2000);
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
