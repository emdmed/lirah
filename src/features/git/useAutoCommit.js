import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { git, currentBranch } from "../../lib/git";

// The branch's last few commits, newest first: { hash, time (ms), subject }.
// A repo with no commits yet (git log fails) reads as none.
async function recentCommits(repoPath, n = 5) {
  try {
    const out = await git(repoPath, ['log', `-${n}`, '--format=%h%x1f%ct%x1f%s']);
    return out.split('\n').filter(Boolean).map((line) => {
      const [hash, ct, subject = ''] = line.split('\x1f');
      return { hash, time: Number(ct) * 1000, subject };
    });
  } catch {
    return [];
  }
}

// Added/removed line totals from `git diff --numstat` (binary files show `-`).
function numstatTotals(out) {
  let added = 0;
  let removed = 0;
  for (const line of out.split('\n')) {
    const [a, r] = line.split('\t');
    added += Number(a) || 0;
    removed += Number(r) || 0;
  }
  return { added, removed };
}

// Tidy a generated message without losing its shape: trim trailing spaces,
// collapse runs of blank lines, and keep one blank line between the subject
// and the body so git reads the first line alone as the subject.
export function tidyMessage(raw) {
  const lines = (raw || '').replace(/\r/g, '').split('\n').map((l) => l.trimEnd());
  const out = [];
  for (const line of lines) {
    if (!line && (!out.length || !out[out.length - 1])) continue;
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  if (out.length > 1 && out[1]) out.splice(1, 0, '');
  return out.join('\n');
}

export function useAutoCommit(cli = 'claude-code', customPrompt = '') {
  const [stage, setStage] = useState('idle'); // idle | loading-files | generating-message | ready | committing | done | error
  const [files, setFiles] = useState([]);
  const [totals, setTotals] = useState({ added: 0, removed: 0 });
  const [log, setLog] = useState({ branch: null, commits: [] });
  const [commitMessage, setCommitMessage] = useState('');
  // Set alongside an error: where it happened ('files' | 'message' | 'commit').
  // Message and commit failures stay in 'ready' so the message can still be
  // edited and committed; only 'files' settles into the error stage.
  const [error, setError] = useState(null);
  const [failedAt, setFailedAt] = useState(null);
  // Short hash of the commit just made, for the done line.
  const [hash, setHash] = useState(null);
  // Enter was pressed before the message was ready: commit as soon as it is.
  const [queued, setQueued] = useState(false);
  // Hidden: the dialog is closed but the run goes on. A run starts hidden
  // (the tab shows a spinner, then a ready lamp) and the dialog opens only when
  // asked: the status-bar chip or auto commit again.
  const [hidden, setHidden] = useState(false);
  const currentPathRef = useRef(null);
  const cancelledRef = useRef(false);
  const autoConfirmRef = useRef(false);

  const reset = useCallback(() => {
    setStage('idle');
    setFiles([]);
    setTotals({ added: 0, removed: 0 });
    setLog({ branch: null, commits: [] });
    setCommitMessage('');
    setError(null);
    setFailedAt(null);
    setHash(null);
    setQueued(false);
    setHidden(false);
  }, []);

  const hide = useCallback(() => setHidden(true), []);
  const show = useCallback(() => setHidden(false), []);

  const trigger = useCallback(async (currentPath) => {
    if (!currentPath) return;
    currentPathRef.current = currentPath;
    cancelledRef.current = false;
    autoConfirmRef.current = false;
    reset();
    setHidden(true);
    setStage('loading-files');
    let phase = 'files';

    try {
      // Get committable files
      const committableFiles = await invoke('get_committable_files', { repoPath: currentPath });
      if (cancelledRef.current) return;
      if (!committableFiles || committableFiles.length === 0) {
        setFailedAt('files');
        setStage('error');
        setHidden(false);
        return;
      }
      setFiles(committableFiles);

      // History the new commit lands on; never blocks the commit.
      Promise.all([currentBranch(currentPath).catch(() => null), recentCommits(currentPath)])
        .then(([branch, commits]) => { if (!cancelledRef.current) setLog({ branch, commits }); });

      // Stage the files (use -- separator and handle deleted files)
      const deleted = committableFiles.filter(f => f.status === 'deleted').map(f => f.path);
      const other = committableFiles.filter(f => f.status !== 'deleted').map(f => f.path);
      if (other.length > 0) {
        await git(currentPath, ['add', '--', ...other]);
        if (cancelledRef.current) return;
      }
      if (deleted.length > 0) {
        // --ignore-unmatch: a deletion already staged is no longer in the index.
        await git(currentPath, ['rm', '--cached', '--ignore-unmatch', '--', ...deleted]);
        if (cancelledRef.current) return;
      }

      // Line totals of what is staged, for the header's diff bar.
      git(currentPath, ['diff', '--cached', '--numstat'])
        .then((out) => { if (!cancelledRef.current) setTotals(numstatTotals(out)); })
        .catch(() => {});

      // Generate commit message via backend (which gets diff via git command)
      setStage('generating-message');
      phase = 'message';

      const msg = await invoke('generate_commit_message', {
        projectDir: currentPath,
        cli,
        customPrompt: customPrompt.trim() || null,
      });
      if (cancelledRef.current) return;

      setCommitMessage(tidyMessage(msg) || 'chore: update files');
      setStage('ready');
    } catch (err) {
      if (cancelledRef.current) return;
      setError(String(err));
      // Once files are staged, a failed message is not the end: open an
      // empty message so it can be written by hand.
      autoConfirmRef.current = false;
      setQueued(false);
      if (phase === 'message') {
        setFailedAt('message');
        setStage('ready');
      } else {
        setFailedAt('files');
        setStage('error');
      }
      setHidden(false);
    }
  }, [reset, cli, customPrompt]);

  const confirm = useCallback(async (editedMessage) => {
    const repoPath = currentPathRef.current;
    if (!repoPath) return;
    setStage('committing');
    setHidden(false);
    setQueued(false);
    setError(null);
    setFailedAt(null);
    try {
      await git(repoPath, ['commit', '-m', editedMessage]);
      const short = await git(repoPath, ['rev-parse', '--short', 'HEAD']).catch(() => '');
      setHash(short.trim() || null);
      setStage('done');
      setTimeout(reset, 2000);
    } catch (err) {
      // A rejected commit (a hook, a signing failure) keeps the message and
      // the staged files, so it can be fixed and tried again.
      setError(String(err));
      setFailedAt('commit');
      setStage('ready');
    }
  }, [reset]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    const repoPath = currentPathRef.current;
    if (repoPath && (stage === 'ready' || stage === 'generating-message')) {
      try {
        await git(repoPath, ['reset', 'HEAD']);
      } catch {}
    }
    reset();
  }, [stage, reset]);

  // Quick commit: if ready, commit immediately; if generating, mark for auto-commit when ready

  const quickCommit = useCallback(() => {
    if (stage === 'ready' && commitMessage.trim()) {
      confirm(commitMessage);
    } else if (stage === 'loading-files' || stage === 'generating-message') {
      autoConfirmRef.current = true;
      setQueued(true);
    }
  }, [stage, commitMessage, confirm]);

  // Auto-confirm when message becomes ready if flagged
  const prevStageRef = useRef(stage);
  if (stage === 'ready' && prevStageRef.current !== 'ready' && autoConfirmRef.current) {
    autoConfirmRef.current = false;
    setTimeout(() => confirm(commitMessage), 0);
  }
  prevStageRef.current = stage;

  return { stage, hidden, hide, show, files, totals, log, commitMessage, setCommitMessage, error, failedAt, hash, queued, trigger, confirm, cancel, quickCommit };
}
