import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useBranchName(repoPath) {
  const [branchName, setBranchName] = useState(null);
  const lastBranchRef = useRef(null);
  const intervalRef = useRef(null);

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
    if (!repoPath) {
      setBranchName(null);
      lastBranchRef.current = null;
      return;
    }

    // Initial fetch
    fetchBranch();

    // Poll every 500ms to detect branch changes
    intervalRef.current = setInterval(fetchBranch, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [repoPath, fetchBranch]);

  return branchName;
}
