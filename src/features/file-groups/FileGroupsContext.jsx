import { createContext, useContext, useState, useEffect } from 'react';

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
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return [];
    const parsed = JSON.parse(saved);
    return validateGroups(parsed);
  } catch (error) {
    console.warn('Failed to load file groups from localStorage:', error);
    return [];
  }
}

function saveGroups(groups) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch (error) {
    console.warn('Failed to save file groups to localStorage:', error);
  }
}

export function FileGroupsProvider({ children }) {
  const [groups, setGroups] = useState(() => loadGroups());

  useEffect(() => {
    saveGroups(groups);
  }, [groups]);

  const getGroupsForProject = (projectPath) => {
    return groups.filter(g => g.projectPath === projectPath);
  };

  const addGroup = (name, projectPath, files) => {
    if (groups.length >= MAX_GROUPS) {
      throw new Error(`Maximum ${MAX_GROUPS} file groups reached`);
    }

    if (!name || name.trim() === '') {
      throw new Error('Group name cannot be empty');
    }

    if (!projectPath || projectPath.trim() === '') {
      throw new Error('Project path cannot be empty');
    }

    if (!files || files.length === 0) {
      throw new Error('Group must have at least one file');
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
  };

  const removeGroup = (id) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  const updateGroup = (id, updates) => {
    setGroups(prev =>
      prev.map(g => (g.id === id ? { ...g, ...updates, updatedAt: Date.now() } : g))
    );
  };

  const value = {
    groups,
    getGroupsForProject,
    addGroup,
    removeGroup,
    updateGroup,
  };

  return <FileGroupsContext.Provider value={value}>{children}</FileGroupsContext.Provider>;
}

export function useFileGroups() {
  const context = useContext(FileGroupsContext);
  if (context === undefined) {
    throw new Error('useFileGroups must be used within a FileGroupsProvider');
  }
  return context;
}
