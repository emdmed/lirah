import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  extractSymbols,
  extractSignatures,
  extractSkeleton,
  isBabelParseable,
  formatSymbolsForPrompt,
  formatSignaturesForPrompt,
  formatSkeletonForPrompt,
} from '../../utils/babelSymbolParser';

// View modes for file analysis
export const VIEW_MODES = {
  SYMBOLS: 'symbols',       // Symbol list with line numbers (default for 500+ lines)
  SIGNATURES: 'signatures', // Function signatures only
  SKELETON: 'skeleton',     // Structural overview
};

/**
 * Hook for managing file symbol extraction state
 * @returns {Object} Symbol extraction state and methods
 */
export function useFileSymbols() {
  // Map<filePath, { symbols, signatures, skeleton, isParsing, error, lineCount }>
  const [fileSymbols, setFileSymbols] = useState(new Map());

  // Per-file view mode override (Map<filePath, viewMode>)
  const [fileViewModes, setFileViewModes] = useState(new Map());

  /**
   * Extract all analysis data from a file
   * @param {string} filePath - Absolute path to the file
   */
  const extractFileSymbols = useCallback(async (filePath) => {
    if (!isBabelParseable(filePath)) {
      return;
    }

    // Set parsing state
    setFileSymbols(prev => {
      const next = new Map(prev);
      next.set(filePath, {
        symbols: [],
        signatures: [],
        skeleton: null,
        isParsing: true,
        error: null,
        lineCount: 0,
      });
      return next;
    });

    try {
      // Read file content via Tauri
      const content = await invoke('read_file_content', { path: filePath });

      // Count lines
      const lineCount = content.split('\n').length;

      // Parse all three formats
      const symbols = extractSymbols(content, filePath);
      const signatures = extractSignatures(content, filePath);
      const skeleton = extractSkeleton(content, filePath);

      // Store results
      setFileSymbols(prev => {
        const next = new Map(prev);
        next.set(filePath, {
          symbols,
          signatures,
          skeleton,
          isParsing: false,
          error: null,
          lineCount,
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to extract symbols from:', filePath, error);
      setFileSymbols(prev => {
        const next = new Map(prev);
        next.set(filePath, {
          symbols: [],
          signatures: [],
          skeleton: null,
          isParsing: false,
          error: String(error),
          lineCount: 0,
        });
        return next;
      });
    }
  }, []);

  /**
   * Set view mode for a specific file
   * @param {string} filePath - Absolute path to the file
   * @param {string} mode - View mode (symbols, signatures, skeleton)
   */
  const setFileViewMode = useCallback((filePath, mode) => {
    setFileViewModes(prev => {
      const next = new Map(prev);
      next.set(filePath, mode);
      return next;
    });
  }, []);

  /**
   * Get view mode for a file (defaults based on line count)
   * @param {string} filePath - Absolute path to the file
   * @returns {string} View mode
   */
  const getFileViewMode = useCallback((filePath) => {
    // Check for explicit override
    const override = fileViewModes.get(filePath);
    if (override) return override;

    // Default: skeleton for very large files (800+), signatures for large (300+), symbols for smaller
    const data = fileSymbols.get(filePath);
    if (!data) return VIEW_MODES.SYMBOLS;

    if (data.lineCount >= 800) return VIEW_MODES.SKELETON;
    if (data.lineCount >= 300) return VIEW_MODES.SIGNATURES;
    return VIEW_MODES.SYMBOLS;
  }, [fileViewModes, fileSymbols]);

  /**
   * Clear symbols for a specific file (when deselected)
   */
  const clearFileSymbols = useCallback((filePath) => {
    setFileSymbols(prev => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
    setFileViewModes(prev => {
      const next = new Map(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  /**
   * Clear all symbols
   */
  const clearAllSymbols = useCallback(() => {
    setFileSymbols(new Map());
    setFileViewModes(new Map());
  }, []);

  /**
   * Get symbols for a specific file
   */
  const getSymbolsForFile = useCallback((filePath) => {
    return fileSymbols.get(filePath) || null;
  }, [fileSymbols]);

  /**
   * Check if any files are currently being parsed
   */
  const isAnyParsing = useCallback(() => {
    for (const data of fileSymbols.values()) {
      if (data.isParsing) return true;
    }
    return false;
  }, [fileSymbols]);

  /**
   * Get symbol count for a file
   */
  const getSymbolCount = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    if (!data) return 0;
    if (data.isParsing) return -1;
    return data.symbols?.length || 0;
  }, [fileSymbols]);

  /**
   * Get line count for a file
   */
  const getLineCount = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    return data?.lineCount || 0;
  }, [fileSymbols]);

  /**
   * Format file analysis for prompt output (uses appropriate mode)
   * @param {string} filePath - Absolute path to the file
   * @returns {string} Formatted analysis string
   */
  const formatFileAnalysis = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    if (!data || data.isParsing) return '';

    const mode = getFileViewMode(filePath);

    switch (mode) {
      case VIEW_MODES.SIGNATURES:
        return formatSignaturesForPrompt(data.signatures);
      case VIEW_MODES.SKELETON:
        return formatSkeletonForPrompt(data.skeleton);
      case VIEW_MODES.SYMBOLS:
      default:
        return formatSymbolsForPrompt(data.symbols);
    }
  }, [fileSymbols, getFileViewMode]);

  /**
   * Get the label for the current view mode
   */
  const getViewModeLabel = useCallback((filePath) => {
    const mode = getFileViewMode(filePath);
    switch (mode) {
      case VIEW_MODES.SIGNATURES: return 'Signatures';
      case VIEW_MODES.SKELETON: return 'Skeleton';
      case VIEW_MODES.SYMBOLS:
      default: return 'Symbols';
    }
  }, [getFileViewMode]);

  return {
    fileSymbols,
    fileViewModes,
    extractFileSymbols,
    clearFileSymbols,
    clearAllSymbols,
    getSymbolsForFile,
    isAnyParsing,
    getSymbolCount,
    getLineCount,
    setFileViewMode,
    getFileViewMode,
    formatFileAnalysis,
    getViewModeLabel,
    isBabelParseable,
    VIEW_MODES,
  };
}
