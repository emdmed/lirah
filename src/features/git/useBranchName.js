import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePageVisible } from '../../hooks/usePageVisible';

// The fs watcher emits `branch-changed` when .git/HEAD moves, which covers the
// normal cases. The poll is only a slow safety net for what it can't see —
// watching disabled, a project nested inside a repo, a terminal cd'd into
// another repo — and the fetch on enable catches up on every tab activation.
const FALLBACK_POLL_MS = 30_000;

export function useBranchName(repoPath, enabled = true) {
  const [branchName, setBranchName] = useState(null);
  const lastBranchRef = useRef(null);
  const pageVisible = usePageVisible();

  const fetchBranch = useCallback(async () => {
    if (!repoPath) {
      setBranchName(null);
      lastBranchRef.current = null;
      return;
    }

    try {
      const branch = await invoke('get_current_branch', { repoPath });
      if (branch !== lastBranchRef.current) {
        lastBranchRef.current = branch;
        setBranchName(branch);
      }
    } catch (error) {
      console.error('Failed to get branch name:', error);
      setBranchName(null);
      lastBranchRef.current = null;
    }
  }, [repoPath]);

  useEffect(() => {
    if (!repoPath || !enabled) {
      // Don't clobber the last known branch when merely paused (inactive tab);
      // only reset when there's no repo at all.
      if (!repoPath) {
        setBranchName(null);
        lastBranchRef.current = null;
      }
      return;
    }

    // The event's path is whatever the watcher was started with, which can
    // differ from repoPath (subdirectory, symlink), so any HEAD move triggers
    // a refetch — it's one cheap git call.
    let unlisten = null;
    let cancelled = false;
    listen('branch-changed', () => { fetchBranch(); }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    fetchBranch();
    const interval = pageVisible ? setInterval(fetchBranch, FALLBACK_POLL_MS) : null;

    return () => {
      cancelled = true;
      unlisten?.();
      if (interval) clearInterval(interval);
    };
  }, [repoPath, enabled, pageVisible, fetchBranch]);

  return branchName;
}
