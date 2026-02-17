import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useBranchName(repoPath) {
  const [branchName, setBranchName] = useState(null);

  useEffect(() => {
    if (!repoPath) {
      setBranchName(null);
      return;
    }

    const fetchBranch = async () => {
      try {
        const branch = await invoke('get_current_branch', { repoPath });
        setBranchName(branch);
      } catch (error) {
        console.error('Failed to get branch name:', error);
        setBranchName(null);
      }
    };

    fetchBranch();
  }, [repoPath]);

  return branchName;
}
