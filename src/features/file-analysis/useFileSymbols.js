import { useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isBabelParseable } from './babelSupport';
import { formatSymbolsForPrompt, formatSignaturesForPrompt, formatSkeletonForPrompt } from './babelFormat';
import { analyzeFile } from './babelClient';
import {
  isPythonParseable,
  extractSkeleton as extractPythonSkeleton,
  formatSkeletonForPrompt as formatPythonSkeletonForPrompt,
} from './pythonSymbolParser';
import { toTokens } from '../token-budget/estimateTokens';

// View modes for file analysis
export const VIEW_MODES = {
  SYMBOLS: 'symbols',       // Symbol list with line numbers (default under 300 lines)
  SIGNATURES: 'signatures', // Function signatures only
  SKELETON: 'skeleton',     // Structural overview
};

// The level a file gets when the user hasn't picked one: skeleton for very
// large files (800+ lines), signatures for large ones (300+), symbols below.
export function defaultViewMode(lineCount) {
  if (lineCount >= 800) return VIEW_MODES.SKELETON;
  if (lineCount >= 300) return VIEW_MODES.SIGNATURES;
  return VIEW_MODES.SYMBOLS;
}

// Files whose detail-level token sizes can be measured (Babel or Python).
const isAnalyzable = (path) => isBabelParseable(path) || isPythonParseable(path);

/**
 * Token size of a file at each detail level, measured on the exact text the
 * prompt formatters produce (same 4-chars estimate as TokenCostEstimate).
 * `whole` is the full file. A level the language can't produce is null.
 */
export function levelTokensFor(content, { symbols, signatures, skeleton } = {}) {
  return {
    whole: toTokens(content.length),
    symbols: symbols ? toTokens(formatSymbolsForPrompt(symbols).length) : null,
    signatures: signatures ? toTokens(formatSignaturesForPrompt(signatures).length) : null,
    skeleton: skeleton ? toTokens(formatSkeletonForPrompt(skeleton).length) : null,
  };
}

// Python has only a skeleton (Rust parser); a failed parse leaves it null.
function pythonLevelTokensFor(content, skeleton) {
  return {
    whole: toTokens(content.length),
    symbols: null,
    signatures: null,
    skeleton: skeleton ? toTokens(formatPythonSkeletonForPrompt(skeleton).length) : null,
  };
}

/**
 * Hook for managing file symbol extraction state
 * @returns {Object} Symbol extraction state and methods
 */
export function useFileSymbols() {
  // Map<filePath, { symbols, signatures, skeleton, isParsing, error, lineCount, levelTokens }>
  const [fileSymbols, setFileSymbols] = useState(new Map());

  // Python files: Map<filePath, { lineCount, levelTokens }>. Kept out of
  // fileSymbols so their sidebar rows and prompt sections stay as before.
  const [pythonLevels, setPythonLevels] = useState(new Map());

  // Per-file view mode override (Map<filePath, viewMode>)
  const [fileViewModes, setFileViewModes] = useState(new Map());

  /**
   * Extract all analysis data from a file
   * @param {string} filePath - Absolute path to the file
   */
  const extractFileSymbols = useCallback(async (filePath) => {
    if (isPythonParseable(filePath)) {
      try {
        const content = await invoke('read_file_content', { path: filePath });
        const skeleton = await extractPythonSkeleton(content, filePath);
        const entry = {
          lineCount: content.split('\n').length,
          levelTokens: pythonLevelTokensFor(content, skeleton),
        };
        setPythonLevels(prev => new Map(prev).set(filePath, entry));
      } catch (error) {
        console.error('Failed to measure Python file:', filePath, error);
      }
      return;
    }

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
        levelTokens: null,
      });
      return next;
    });

    try {
      // Read file content via Tauri
      const content = await invoke('read_file_content', { path: filePath });

      // Count lines
      const lineCount = content.split('\n').length;

      // All three formats from one parse, off the main thread
      const { symbols, signatures, skeleton } = await analyzeFile(content, filePath);

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
          levelTokens: levelTokensFor(content, { symbols, signatures, skeleton }),
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
          levelTokens: null,
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

    const data = fileSymbols.get(filePath);
    if (!data) return VIEW_MODES.SYMBOLS;
    return defaultViewMode(data.lineCount);
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
    setPythonLevels(prev => {
      if (!prev.has(filePath)) return prev;
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
    setPythonLevels(new Map());
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
   * Token size per detail level: { whole, symbols, signatures, skeleton }
   * (null for levels the language lacks), or null while parsing/unknown.
   */
  const getLevelTokens = useCallback((filePath) => {
    const data = fileSymbols.get(filePath);
    if (data) return data.levelTokens || null;
    return pythonLevels.get(filePath)?.levelTokens || null;
  }, [fileSymbols, pythonLevels]);

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

  return useMemo(() => ({
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
    getLevelTokens,
    // Gate for extractFileSymbols: Babel files get full analysis, Python
    // files only levelTokens.
    isAnalyzable,
    VIEW_MODES,
  }), [
    fileSymbols, fileViewModes, extractFileSymbols, clearFileSymbols, clearAllSymbols,
    getSymbolsForFile, isAnyParsing, getSymbolCount, getLineCount, setFileViewMode,
    getFileViewMode, formatFileAnalysis, getViewModeLabel, getLevelTokens,
  ]);
}
