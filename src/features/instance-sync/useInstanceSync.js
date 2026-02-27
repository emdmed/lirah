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
  
  const lastUpdateRef = useRef(0);

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
    
    // Cleanup on unmount
    return () => {
      invoke('unregister_instance').catch(console.error);
    };
  }, []);

  // Register instance when project path is available
  useEffect(() => {
    if (!instanceId || !currentPath || isRegistered) return;
    
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
    if (!isRegistered || !currentPath) return;
    
    const updateState = async () => {
      try {
        const now = Date.now();
        // Throttle updates to avoid excessive writes
        if (now - lastUpdateRef.current < INSTANCE_SYNC_INTERVAL) return;
        
        const update = {
          project_path: currentPath,
          current_focus: '', // Could be set via UI
          active_files: selectedFiles || [],
          claude_session_id: claudeSessionId,
          status: 'active',
        };
        
        const state = await invoke('update_instance_state', { update });
        setOwnState(state);
        lastUpdateRef.current = now;
      } catch (err) {
        console.error('Failed to update instance state:', err);
      }
    };
    
    // Update immediately on changes
    updateState();
    
    // Set up interval for periodic updates
    const interval = setInterval(updateState, INSTANCE_SYNC_INTERVAL);
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

  // Sync with another instance (navigate to their project)
  const syncWithInstance = useCallback(async (instance) => {
    if (!instance?.project_path) return null;
    return instance.project_path;
  }, []);

  return {
    instanceId,
    ownState,
    otherInstances,
    isRegistered,
    error,
    refreshInstances,
    syncWithInstance,
  };
}
