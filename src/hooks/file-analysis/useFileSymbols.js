import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { extractSymbols, isBabelParseable, formatSymbolsForPrompt } from '../../utils/babelSymbolParser';

/**
 * Hook for managing file symbol extraction state
 * @returns {Object} Symbol extraction state and methods
 */
export function useFileSymbols() {
  // Map<filePath, { symbols: Array, isParsing: boolean, error: string|null, lineCount: number }>
  const [fileSymbols, setFileSymbols] = useState(new Map());

  /**
   * Extract symbols from a file
   * @param {string} filePath - Absolute path to the file
   */
  const extractFileSymbols = useCallback(async (filePath) => {
    if (!isBabelParseable(filePath)) {
      return;
    }

    // Set parsing state
    setFileSymbols(prev => {
      const next = new Map(prev);
      next.set(filePath, { symbols: [], isParsing: true, error: null, lineCount: 0 });
      return next;
    });

    try {
      // Read file content via Tauri
      const content = await invoke('read_file_content', { path: filePath });

      // Count lines
      const lineCount = content.split('\n').length;

      // Parse symbols
      const symbols = extractSymbols(content, filePath);

      // Store results with line count
      setFileSymbols(prev => {
        const next = new Map(prev);
        next.set(filePath, { symbols, isParsing: false, error: null, lineCount });
        return next;
      });
    } catch (error) {
      console.error('Failed to extract symbols from:', filePath, error);
      setFileSymbols(prev => {
        const next = new Map(prev);
        next.set(filePath, { symbols: [], isParsing: false, error: String(error), lineCount: 0 });
        return next;
      });
    }
  }, []);

  /**
   * Clear symbols for a specific file (when deselected)
   * @param {string} filePath - Absolute path to the file
   */
  const clearFileSymbols = useCallback((filePath) => {
    setFileSymbols(prev => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  /**
   * Clear all symbols (e.g., when clearing selection)
   */
  const clearAllSymbols = useCallback(() => {
    setFileSymbols(new Map());
  }, []);

  /**
   * Get symbols for a specific file
   * @param {string} filePath - Absolute path to the file
   * @returns {Object|null} Symbol data or null
   */
  const getSymbolsForFile = useCallback((filePath) => {
    return fileSymbols.get(filePath) || null;
  }, [fileSymbols]);

  /**
   * Check if any files are currently being parsed
   * @returns {boolean}
   */
  const isAnyParsing = useCallback(() => {
    for (const data of fileSymbols.values()) {
      if (data.isParsing) return true;
    }
    return false;
  }, [fileSymbols]);

  /**
   * Get symbol count for a file
   * @param {string} filePath - Absolute path to the file
   * @returns {number} Number of symbols, or -1 if parsing
   */
  const getSymbolCount = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    if (!data) return 0;
    if (data.isParsing) return -1;
    return data.symbols?.length || 0;
  }, [fileSymbols]);

  /**
   * Get line count for a file
   * @param {string} filePath - Absolute path to the file
   * @returns {number} Number of lines, or 0 if not available
   */
  const getLineCount = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    return data?.lineCount || 0;
  }, [fileSymbols]);

  /**
   * Format symbols for prompt output
   * @param {string} filePath - Absolute path to the file
   * @returns {string} Formatted symbols string
   */
  const formatSymbols = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    if (!data || !data.symbols || data.symbols.length === 0) {
      return '';
    }
    return formatSymbolsForPrompt(data.symbols);
  }, [fileSymbols]);

  return {
    fileSymbols,
    extractFileSymbols,
    clearFileSymbols,
    clearAllSymbols,
    getSymbolsForFile,
    isAnyParsing,
    getSymbolCount,
    getLineCount,
    formatSymbols,
    isBabelParseable,
  };
}
