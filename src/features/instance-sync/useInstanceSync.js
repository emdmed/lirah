import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const INSTANCE_SYNC_INTERVAL = 5000; // Update every 5 seconds
export const INSTANCE_WATCH_INTERVAL = 2000; // Check for other instances every 2 seconds

export function useInstanceSync(currentPath, selectedFiles, claudeSessionId) {
  const [instanceId, setInstanceId] = useState(null);
  const [ownState, setOwnState] = useState(null);
  const [otherInstances, setOtherInstances] = useState([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState(null);
  
  // New: Track selected instance and its sessions
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [selectedInstanceSessions, setSelectedInstanceSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  
  const lastUpdateRef = useRef(0);
  const pendingUpdateRef = useRef(false);

  // Initialize and get instance ID
  useEffect(() => {
    const init = async () => {
      try {
        const id = await invoke('get_instance_id');
        setInstanceId(id);
      } catch (err) {
        setError(err.message || 'Failed to get instance ID');
        console.error('Failed to get instance ID:', err);
      }
    };
    
    init();
    
    // Cleanup on unmount - synchronous cleanup to avoid race conditions
    return () => {
      // Use a synchronous flag to prevent new updates
      pendingUpdateRef.current = false;
      lastUpdateRef.current = 0;
      
      // Fire and forget cleanup
      invoke('unregister_instance').catch((err) => {
        // Only log if it's not a "not registered" error
        if (!err.message?.includes('not registered')) {
          console.error('Failed to unregister instance:', err);
        }
      });
    };
  }, []);

  // Register instance when project path is available
  useEffect(() => {
    // Get home directory for comparison
    const homeDir = process.env.HOME || '/home/enrique';
    
    // Only register when we have a valid project path
    // - Not empty
    // - Not "Waiting for terminal..."
    // - Not just the home directory (must be a project subdirectory)
    const isValidPath = currentPath && 
                        currentPath.trim() !== '' && 
                        currentPath !== 'Waiting for terminal...' &&
                        !currentPath.startsWith('Waiting') &&
                        currentPath !== homeDir &&
                        currentPath !== '/' &&
                        currentPath.length > homeDir.length; // Must be longer than home dir (i.e., a subdirectory)
    
    if (!instanceId || !isValidPath || isRegistered) return;
    
    const register = async () => {
      try {
        const state = await invoke('register_instance', {
          projectPath: currentPath,
        });
        setOwnState(state);
        setIsRegistered(true);
        setError(null);
      } catch (err) {
        setError(err.message || 'Failed to register instance');
        console.error('Failed to register instance:', err);
      }
    };
    
    register();
  }, [instanceId, currentPath, isRegistered]);

  // Update instance state periodically
  useEffect(() => {
    // Get home directory for comparison
    const homeDir = process.env.HOME || '/home/enrique';
    
    // Skip updates if path is invalid or is just the home directory
    const isValidPath = currentPath && 
                        currentPath.trim() !== '' && 
                        currentPath !== 'Waiting for terminal...' &&
                        !currentPath.startsWith('Waiting') &&
                        currentPath !== homeDir &&
                        currentPath !== '/' &&
                        currentPath.length > homeDir.length;
    
    if (!isRegistered || !isValidPath) return;
    
    const updateState = async () => {
      try {
        const now = Date.now();
        
        // Skip if we recently updated and no significant changes occurred
        if (now - lastUpdateRef.current < INSTANCE_SYNC_INTERVAL && !pendingUpdateRef.current) {
          return;
        }
        
        const update = {
          project_path: currentPath,
          current_focus: '', // Could be set via UI
          active_files: selectedFiles || [],
          claude_session_id: claudeSessionId,
          status: 'active', // lowercase to match Rust enum
        };
        
        const state = await invoke('update_instance_state', { update });
        setOwnState(state);
        lastUpdateRef.current = now;
        pendingUpdateRef.current = false;
      } catch (err) {
        console.error('Failed to update instance state:', err);
      }
    };
    
    // Update immediately on initial registration or when data changes significantly
    pendingUpdateRef.current = true;
    updateState();
    
    // Set up interval for periodic heartbeats
    const interval = setInterval(() => {
      // Always update on interval to keep instance alive
      pendingUpdateRef.current = true;
      updateState();
    }, INSTANCE_SYNC_INTERVAL);
    
    return () => clearInterval(interval);
  }, [isRegistered, currentPath, selectedFiles, claudeSessionId]);

  // Poll for other instances
  useEffect(() => {
    if (!isRegistered) return;
    
    const pollInstances = async () => {
      try {
        const instances = await invoke('get_all_instances');
        setOtherInstances(instances);
      } catch (err) {
        console.error('Failed to get other instances:', err);
      }
    };
    
    pollInstances();
    const interval = setInterval(pollInstances, INSTANCE_WATCH_INTERVAL);
    return () => clearInterval(interval);
  }, [isRegistered]);

  // New: Fetch sessions when an instance is selected
  const selectInstance = useCallback(async (instance) => {
    if (!instance?.project_path) return;
    
    setSelectedInstance(instance);
    setIsLoadingSessions(true);
    setSelectedInstanceSessions([]);
    setSelectedSession(null);
    
    try {
      const sessions = await invoke('get_claude_sessions', {
        projectPath: instance.project_path,
      });
      setSelectedInstanceSessions(sessions);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setSelectedInstanceSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  // New: Clear selected instance
  const clearSelectedInstance = useCallback(() => {
    setSelectedInstance(null);
    setSelectedInstanceSessions([]);
    setSelectedSession(null);
  }, []);

  // New: Fetch specific session content
  const fetchSessionContent = useCallback(async (sessionId, projectPath) => {
    // If null is passed, clear the selected session (go back to sessions list)
    if (!sessionId || !projectPath) {
      setSelectedSession(null);
      return null;
    }
    
    try {
      const session = await invoke('get_claude_session', {
        sessionId,
        projectPath,
      });
      setSelectedSession(session);
      return session;
    } catch (err) {
      console.error('Failed to fetch session content:', err);
      return null;
    }
  }, []);

  // Manual refresh function
  const refreshInstances = useCallback(async () => {
    try {
      const instances = await invoke('get_all_instances');
      setOtherInstances(instances);
      return instances;
    } catch (err) {
      console.error('Failed to refresh instances:', err);
      return [];
    }
  }, []);

  // Cleanup stale instances
  const cleanupStaleInstances = useCallback(async () => {
    try {
      const removedCount = await invoke('cleanup_stale_instances');
      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} stale instance(s)`);
        // Refresh the list after cleanup
        await refreshInstances();
      }
      return removedCount;
    } catch (err) {
      console.error('Failed to cleanup stale instances:', err);
      return 0;
    }
  }, [refreshInstances]);

  // Sync with another instance (navigate to their project)
  const syncWithInstance = useCallback(async (instance) => {
    if (!instance?.project_path) return null;
    return instance.project_path;
  }, []);

  // New: Debug function to check Claude data paths
  const debugClaudeDataPaths = useCallback(async () => {
    try {
      const paths = await invoke('get_claude_data_paths');
      console.log('[Claude Debug] Searched paths:', paths);
      return paths;
    } catch (err) {
      console.error('Failed to get Claude data paths:', err);
      return [];
    }
  }, []);

  return {
    instanceId,
    ownState,
    otherInstances,
    isRegistered,
    error,
    selectedInstance,
    selectedInstanceSessions,
    selectedSession,
    isLoadingSessions,
    selectInstance,
    clearSelectedInstance,
    fetchSessionContent,
    refreshInstances,
    syncWithInstance,
    cleanupStaleInstances,
    debugClaudeDataPaths,
  };
}
