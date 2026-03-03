import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await invoke('list_workspaces');
      setWorkspaces(list);
    } catch (err) {
      console.error('Failed to list workspaces:', err);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const createWorkspace = useCallback(async (name, projects) => {
    setLoading(true);
    try {
      const info = await invoke('create_workspace', {
        name,
        projects: projects.map(p => ({ name: p.name, path: p.path, description: p.description || null })),
      });
      setWorkspace(info);
      await refreshWorkspaces();
      return info;
    } finally {
      setLoading(false);
    }
  }, [refreshWorkspaces]);

  const openWorkspace = useCallback(async (workspacePath) => {
    setLoading(true);
    try {
      const info = await invoke('open_workspace', { workspacePath });
      setWorkspace(info);
      return info;
    } finally {
      setLoading(false);
    }
  }, []);

  const closeWorkspace = useCallback(async () => {
    try {
      await invoke('close_workspace');
      setWorkspace(null);
    } catch (err) {
      console.error('Failed to close workspace:', err);
    }
  }, []);

  const deleteWorkspace = useCallback(async (workspacePath) => {
    try {
      await invoke('delete_workspace', { workspacePath });
      if (workspace?.path === workspacePath) {
        setWorkspace(null);
      }
      await refreshWorkspaces();
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    }
  }, [workspace, refreshWorkspaces]);

  return {
    workspace,
    workspaces,
    loading,
    isWorkspace: workspace !== null,
    createWorkspace,
    openWorkspace,
    closeWorkspace,
    deleteWorkspace,
    refreshWorkspaces,
  };
}
