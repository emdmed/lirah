import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { getRelativePath, basename } from '../utils/pathUtils';

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

  const handleLoadFileGroup = useCallback((group) => {
    const newSelectedFiles = new Set();
    const newFileStates = new Map();
    group.files.forEach(file => {
      const absolutePath = `${currentPath}/${file.relativePath}`;
      newSelectedFiles.add(absolutePath);
      newFileStates.set(absolutePath, file.state);
      if (symbolCallbacks?.isBabelParseable(absolutePath)) {
        symbolCallbacks.extractFileSymbols(absolutePath);
      }
    });
    setSelectedFiles(newSelectedFiles);
    setFileStates(newFileStates);
  }, [currentPath, symbolCallbacks]);

  const value = useMemo(() => ({
    selectedFiles,
    fileStates,
    toggleFileSelection,
    removeFileFromSelection,
    clearFileSelection,
    setFileState,
    filesWithRelativePaths,
    filesForGroup,
    handleLoadFileGroup,
    registerSymbolCallbacks,
    registerCurrentPath,
  }), [
    selectedFiles, fileStates, toggleFileSelection, removeFileFromSelection,
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
