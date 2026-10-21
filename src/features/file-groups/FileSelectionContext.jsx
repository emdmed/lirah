import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { getRelativePath, basename } from '../../utils/pathUtils';

const FileSelectionContext = createContext(undefined);

export function FileSelectionProvider({ children }) {
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [fileStates, setFileStates] = useState(new Map());

  // These will be set by App once fileSymbols hook is ready
  const [symbolCallbacks, setSymbolCallbacks] = useState(null);
  const [currentPath, setCurrentPath] = useState('');

  const registerSymbolCallbacks = useCallback((callbacks) => {
    setSymbolCallbacks(callbacks);
  }, []);

  const registerCurrentPath = useCallback((path) => {
    setCurrentPath(path);
  }, []);

  const toggleFileSelection = useCallback((filePath) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
        setFileStates(prevStates => {
          const nextStates = new Map(prevStates);
          nextStates.delete(filePath);
          return nextStates;
        });
        symbolCallbacks?.clearFileSymbols(filePath);
      } else {
        next.add(filePath);
        setFileStates(prevStates => {
          const nextStates = new Map(prevStates);
          nextStates.set(filePath, 'modify');
          return nextStates;
        });
        if (symbolCallbacks?.isBabelParseable(filePath)) {
          symbolCallbacks.extractFileSymbols(filePath);
        }
      }
      return next;
    });
  }, [symbolCallbacks]);

  // Selects every path not already selected; never deselects.
  const addFiles = useCallback((filePaths) => {
    setSelectedFiles(prev => {
      const added = filePaths.filter(p => !prev.has(p));
      if (added.length === 0) return prev;
      setFileStates(prevStates => {
        const nextStates = new Map(prevStates);
        added.forEach(p => nextStates.set(p, 'modify'));
        return nextStates;
      });
      added.forEach(p => {
        if (symbolCallbacks?.isBabelParseable(p)) symbolCallbacks.extractFileSymbols(p);
      });
      return new Set([...prev, ...added]);
    });
  }, [symbolCallbacks]);

  const removeFileFromSelection = useCallback((filePath) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
    setFileStates(prev => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  const clearFileSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setFileStates(new Map());
    symbolCallbacks?.clearAllSymbols();
  }, [symbolCallbacks]);

  const setFileState = useCallback((filePath, state) => {
    setFileStates(prev => {
      const next = new Map(prev);
      next.set(filePath, state);
      return next;
    });
  }, []);

  const filesWithRelativePaths = useMemo(() => {
    return Array.from(selectedFiles).map(absPath => ({
      absolute: absPath,
      relative: getRelativePath(absPath, currentPath),
      name: basename(absPath)
    }));
  }, [selectedFiles, currentPath]);

  const filesForGroup = useMemo(() => {
    return Array.from(selectedFiles).map(absolutePath => ({
      relativePath: getRelativePath(absolutePath, currentPath),
      state: fileStates.get(absolutePath) || 'modify'
    }));
  }, [selectedFiles, fileStates, currentPath]);

  // Load a context set. 'replace' swaps the whole context for the set;
  // 'add' merges it in, keeping files already attached (and their states).
  const handleLoadFileGroup = useCallback((group, mode = 'replace') => {
    const merge = mode === 'add';
    const incoming = group.files.map(file => ({
      absolutePath: `${currentPath}/${file.relativePath}`,
      state: file.state,
    }));
    // Work out the additions from current state up front: updaters must stay
    // pure (StrictMode runs them twice), so no setters or symbol work inside.
    const base = merge ? selectedFiles : new Set();
    const added = incoming.filter(f => !base.has(f.absolutePath));
    if (merge && added.length === 0) return;
    added.forEach(({ absolutePath }) => {
      if (symbolCallbacks?.isBabelParseable(absolutePath)) {
        symbolCallbacks.extractFileSymbols(absolutePath);
      }
    });
    setSelectedFiles(new Set([...base, ...added.map(f => f.absolutePath)]));
    setFileStates(prevStates => {
      const nextStates = merge ? new Map(prevStates) : new Map();
      added.forEach(f => nextStates.set(f.absolutePath, f.state));
      return nextStates;
    });
  }, [currentPath, symbolCallbacks, selectedFiles]);

  const value = useMemo(() => ({
    selectedFiles,
    fileStates,
    toggleFileSelection,
    addFiles,
    removeFileFromSelection,
    clearFileSelection,
    setFileState,
    filesWithRelativePaths,
    filesForGroup,
    handleLoadFileGroup,
    registerSymbolCallbacks,
    registerCurrentPath,
  }), [
    selectedFiles, fileStates, toggleFileSelection, addFiles, removeFileFromSelection,
    clearFileSelection, setFileState, filesWithRelativePaths, filesForGroup,
    handleLoadFileGroup, registerSymbolCallbacks, registerCurrentPath,
  ]);

  return (
    <FileSelectionContext.Provider value={value}>
      {children}
    </FileSelectionContext.Provider>
  );
}

export function useFileSelection() {
  const context = useContext(FileSelectionContext);
  if (context === undefined) {
    throw new Error('useFileSelection must be used within a FileSelectionProvider');
  }
  return context;
}
