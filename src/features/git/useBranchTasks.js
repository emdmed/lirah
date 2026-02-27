import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const STORAGE_KEY = 'nevo-terminal:branch-tasks';

function getStoredTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function storeTasks(branchName, tasks, lastCommitHash) {
  try {
    const allTasks = getStoredTasks();
    allTasks[branchName] = {
      tasks,
      lastCommitHash,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allTasks));
  } catch (e) {
    console.warn('Failed to store tasks:', e);
  }
}

function getCurrentCommitHash() {
  // This will be set when we get the result from the backend
  return null;
}

export function useBranchTasks(cli = 'claude-code') {
  const [stage, setStage] = useState('idle'); // idle | loading | generating | done | error
  const [tasks, setTasks] = useState([]);
  const [baseBranch, setBaseBranch] = useState('');
  const [currentBranch, setCurrentBranch] = useState('');
  const [error, setError] = useState(null);
  const currentPathRef = useRef(null);
  const baseBranchRef = useRef(null);
  const currentBranchRef = useRef(null);
  const isDialogOpenRef = useRef(false);

  const reset = useCallback(() => {
    setStage('idle');
    setTasks([]);
    setBaseBranch('');
    setCurrentBranch('');
    setError(null);
  }, []);

  const generateTasks = useCallback(async (currentPath, baseBranchName, currentBranchName) => {
    if (!currentPath || !baseBranchName) return;
    currentPathRef.current = currentPath;
    baseBranchRef.current = baseBranchName;
    currentBranchRef.current = currentBranchName;
    
    // Check localStorage first and verify commit hash hasn't changed
    const stored = getStoredTasks();
    if (stored[currentBranchName]) {
      console.log('[useBranchTasks] Found cached tasks for branch:', currentBranchName);
      
      // Get current commit hash to compare
      try {
        const result = await invoke('run_git_command', {
          repoPath: currentPath,
          args: ['rev-parse', 'HEAD']
        });
        const currentHash = result.trim();
        const storedHash = stored[currentBranchName].lastCommitHash;
        
        if (currentHash === storedHash) {
          console.log('[useBranchTasks] Commit hash matches, using cached tasks');
          setTasks(stored[currentBranchName].tasks);
          setBaseBranch(baseBranchName);
          setCurrentBranch(currentBranchName);
          setStage('done');
          return;
        } else {
          console.log('[useBranchTasks] Commit hash changed, regenerating tasks');
          console.log('[useBranchTasks] Stored:', storedHash, 'Current:', currentHash);
        }
      } catch (e) {
        console.warn('[useBranchTasks] Failed to check commit hash:', e);
      }
    }
    
    reset();
    setStage('loading');

    try {
      setStage('generating');
      
      const result = await invoke('generate_branch_tasks', {
        projectDir: currentPath,
        baseBranch: baseBranchName,
        currentBranch: currentBranchName,
        cli,
      });

      const newTasks = result.tasks || [];
      const lastCommitHash = result.last_commit_hash;
      
      setTasks(newTasks);
      setBaseBranch(result.base_branch);
      setCurrentBranch(result.current_branch);
      setStage('done');
      
      // Store in localStorage with commit hash
      storeTasks(currentBranchName, newTasks, lastCommitHash);
    } catch (err) {
      console.error('Failed to generate tasks:', err);
      setError(err.toString());
      setStage('error');
    }
  }, [reset, cli]);

  // Listen for commit events to regenerate tasks when dialog is open
  useEffect(() => {
    let unlisten;
    
    const setupListener = async () => {
      unlisten = await listen('commit-detected', async (event) => {
        // Only regenerate if the dialog is currently open
        if (isDialogOpenRef.current && currentPathRef.current && baseBranchRef.current && currentBranchRef.current) {
          const branchName = currentBranchRef.current;
          const newCommitHash = event.payload?.commit_hash;
          
          console.log('[useBranchTasks] Commit detected on branch:', branchName, 'hash:', newCommitHash);
          
          // Check if we have cached tasks and if the commit hash changed
          const stored = getStoredTasks();
          if (stored[branchName] && stored[branchName].lastCommitHash === newCommitHash) {
            console.log('[useBranchTasks] Commit hash unchanged, skipping regeneration');
            return;
          }
          
          console.log('[useBranchTasks] New commit detected, regenerating tasks...');
          // Clear the cache for this branch so it regenerates
          try {
            const allTasks = getStoredTasks();
            delete allTasks[branchName];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allTasks));
          } catch (e) {
            console.warn('Failed to clear cached tasks:', e);
          }
          generateTasks(currentPathRef.current, baseBranchRef.current, currentBranchRef.current);
        }
      });
    };
    
    setupListener();
    
    return () => {
      if (unlisten) unlisten();
    };
  }, [generateTasks]);

  const setDialogOpen = useCallback((isOpen) => {
    isDialogOpenRef.current = isOpen;
  }, []);

  return { 
    stage, 
    tasks, 
    baseBranch, 
    currentBranch, 
    error, 
    generateTasks, 
    reset,
    setDialogOpen
  };
}
