import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { loadJson, saveJson } from '../../lib/storage';

// User-facing name: "context sets" — saved, named context (file
// selections) per project. Storage key and shape stay "file groups".
const FileGroupsContext = createContext(undefined);

const STORAGE_KEY = 'nevo-terminal:file-groups';
const MAX_GROUPS = 100;

function validateGroups(groups) {
  if (!Array.isArray(groups)) return [];

  return groups.filter(g =>
    g &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    typeof g.projectPath === 'string' &&
    Array.isArray(g.files) &&
    g.name.trim() !== '' &&
    g.files.every(f =>
      f &&
      typeof f.relativePath === 'string' &&
      ['modify', 'do-not-modify', 'use-as-example'].includes(f.state)
    )
  );
}

function loadGroups() {
  return validateGroups(loadJson(STORAGE_KEY, []));
}

function saveGroups(groups) {
  saveJson(STORAGE_KEY, groups);
}

export function FileGroupsProvider({ children }) {
  const [groups, setGroups] = useState(() => loadGroups());

  useEffect(() => {
    saveGroups(groups);
  }, [groups]);

  const getGroupsForProject = useCallback((projectPath) => {
    return groups.filter(g => g.projectPath === projectPath);
  }, [groups]);

  const addGroup = useCallback((name, projectPath, files) => {
    if (groups.length >= MAX_GROUPS) {
      throw new Error(`Maximum ${MAX_GROUPS} context sets reached`);
    }

    if (!name || name.trim() === '') {
      throw new Error('Name cannot be empty');
    }

    if (!projectPath || projectPath.trim() === '') {
      throw new Error('Project path cannot be empty');
    }

    if (!files || files.length === 0) {
      throw new Error('A context set needs at least one file');
    }

    const newGroup = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      projectPath: projectPath.trim(),
      files: files.map(f => ({
        relativePath: f.relativePath,
        state: f.state
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setGroups(prev => [...prev, newGroup]);
    return newGroup;
  }, [groups.length]);

  const removeGroup = useCallback((id) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  }, []);

  // `updates` may carry `name` and/or `files` ([{ relativePath, state }]).
  const updateGroup = useCallback((id, updates) => {
    const clean = {};
    if (typeof updates.name === 'string') {
      if (updates.name.trim() === '') throw new Error('Name cannot be empty');
      clean.name = updates.name.trim();
    }
    if (Array.isArray(updates.files)) {
      if (updates.files.length === 0) throw new Error('A context set needs at least one file');
      clean.files = updates.files.map(f => ({ relativePath: f.relativePath, state: f.state }));
    }
    setGroups(prev =>
      prev.map(g => (g.id === id ? { ...g, ...clean, updatedAt: Date.now() } : g))
    );
  }, []);

  const value = useMemo(() => ({
    groups,
    getGroupsForProject,
    addGroup,
    removeGroup,
    updateGroup,
  }), [groups, getGroupsForProject, addGroup, removeGroup, updateGroup]);

  return <FileGroupsContext.Provider value={value}>{children}</FileGroupsContext.Provider>;
}

export function useFileGroups() {
  const context = useContext(FileGroupsContext);
  if (context === undefined) {
    throw new Error('useFileGroups must be used within a FileGroupsProvider');
  }
  return context;
}
