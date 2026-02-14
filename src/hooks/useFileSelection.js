import { useState, useMemo, useCallback } from "react";
import { getRelativePath, basename } from "../utils/pathUtils";

export function useFileSelection({ currentPath, clearFileSymbols, isBabelParseable, extractFileSymbols, clearAllSymbols }) {
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [fileStates, setFileStates] = useState(new Map());

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
        clearFileSymbols(filePath);
      } else {
        next.add(filePath);
        setFileStates(prevStates => {
          const nextStates = new Map(prevStates);
          nextStates.set(filePath, 'modify');
          return nextStates;
        });
        if (isBabelParseable(filePath)) {
          extractFileSymbols(filePath);
        }
      }
      return next;
    });
  }, [clearFileSymbols, isBabelParseable, extractFileSymbols]);

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
    clearAllSymbols();
  }, [clearAllSymbols]);

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
      if (isBabelParseable(absolutePath)) {
        extractFileSymbols(absolutePath);
      }
    });
    setSelectedFiles(newSelectedFiles);
    setFileStates(newFileStates);
  }, [currentPath, isBabelParseable, extractFileSymbols]);

  return {
    selectedFiles, setSelectedFiles,
    fileStates,
    toggleFileSelection,
    removeFileFromSelection,
    clearFileSelection,
    setFileState,
    filesWithRelativePaths,
    filesForGroup,
    handleLoadFileGroup,
  };
}
