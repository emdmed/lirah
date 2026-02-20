import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isBabelParseable, extractSkeleton as extractBabelSkeleton, formatSkeletonForPrompt as formatBabelSkeleton } from '../utils/babelSymbolParser';
import { isPythonParseable, extractSkeleton as extractPythonSkeleton, formatSkeletonForPrompt as formatPythonSkeleton } from '../utils/pythonSymbolParser';

/**
 * Estimate token count for a string
 * Uses ~4 characters per token as approximation (common for code)
 * @param {string} text - Text to estimate tokens for
 * @returns {number} - Estimated token count
 */
export const estimateTokens = (text) => {
  if (!text) return 0;
  // Code typically averages ~4 characters per token
  // This is a rough estimate - actual tokenization varies by model
  return Math.ceil(text.length / 4);
};

/**
 * Format token count for display
 * @param {number} count - Token count
 * @returns {string} - Formatted string (e.g., "12.5K")
 */
export const formatTokenCount = (count) => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

// Directories to skip during compacting
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  'target',
  'build',
  '.next',
  '.turbo',
  'out',
  'coverage',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

/**
 * Hook for compacting all parseable files in a project into a structural overview
 * @returns {{ isCompacting: boolean, progress: { current: number, total: number } | null, compactProject: Function }}
 */
export function useProjectCompact() {
  const [isCompacting, setIsCompacting] = useState(false);
  const [progress, setProgress] = useState(null);

  /**
   * Filter files that should be processed
   * @param {Array} allFiles - All files from recursive directory read
   * @returns {Array} - Filtered list of parseable files
   */
  const filterParseableFiles = useCallback((allFiles) => {
    return allFiles.filter(file => {
      // Skip directories
      if (file.is_dir) return false;

      // Check if any parent directory should be skipped
      const pathParts = file.path.split(/[/\\]/);
      for (const part of pathParts) {
        if (SKIP_DIRECTORIES.has(part)) {
          return false;
        }
      }

      // Include Babel-parseable files (JS/TS) and Python files
      return isBabelParseable(file.path) || isPythonParseable(file.path);
    });
  }, []);

  /**
   * Process files in batches to avoid UI freeze
   * @param {Array} files - Files to process
   * @param {string} rootPath - Project root path
   * @returns {Promise<{results: Array, originalSize: number}>} - Results and total original size
   */
  const processFilesInBatches = useCallback(async (files, rootPath) => {
    const results = [];
    let originalSize = 0;
    const batchSize = 50; // Increased from 10 to 50 for better throughput

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await invoke('read_file_content', { path: file.path });
            const contentSize = content.length;
            const lines = content.split('\n');
            const lineCount = lines.length;

            // Use appropriate parser based on file type
            const skeleton = isPythonParseable(file.path)
              ? await extractPythonSkeleton(content, file.path)
              : extractBabelSkeleton(content, file.path);

            // Get relative path
            const relativePath = file.path.startsWith(rootPath + '/')
              ? file.path.slice(rootPath.length + 1)
              : file.path;

            return {
              path: relativePath,
              lineCount,
              skeleton,
              contentSize,
            };
          } catch (error) {
            console.warn(`Failed to process file: ${file.path}`, error);
            return null;
          }
        })
      );

      // Add successful results and accumulate original size
      const validResults = batchResults.filter(Boolean);
      validResults.forEach(r => {
        originalSize += r.contentSize;
      });
      results.push(...validResults);

      // Update progress
      setProgress({
        current: Math.min(i + batchSize, files.length),
        total: files.length,
        phase: 'parsing',
      });

      // Yield to main thread for UI updates (minimal delay)
      if (typeof scheduler !== 'undefined' && scheduler.yield) {
        await scheduler.yield();
      }
      // No artificial delay - let the browser schedule naturally
    }

    return { results, originalSize };
  }, []);

  /**
   * Format compacted results into output string
   * @param {Array} results - Array of processed file results
   * @returns {string} - Formatted output
   */
  const formatOutput = useCallback((results) => {
    const lines = [];

    // Sort by path for consistent output
    results.sort((a, b) => a.path.localeCompare(b.path));

    for (const result of results) {
      lines.push(`## ${result.path}`);

      if (result.skeleton) {
        const skeletonOutput = isPythonParseable(result.path)
          ? formatPythonSkeleton(result.skeleton)
          : formatBabelSkeleton(result.skeleton);
        if (skeletonOutput) {
          lines.push(skeletonOutput);
        }
      }
    }

    return lines.join('\n');
  }, []);

  /**
   * Compact all parseable files in the project
   * @param {string} rootPath - Project root path
   * @param {Array} allFiles - All files from recursive directory read
   * @returns {Promise<{output: string, originalSize: number} | null>} - Formatted compact output and original size
   */
  const compactProject = useCallback(async (rootPath, allFiles) => {
    if (isCompacting) {
      return null;
    }

    setIsCompacting(true);
    setProgress({ current: 0, total: 0, phase: 'scanning' });

    try {
      // Filter to parseable files
      const parseableFiles = filterParseableFiles(allFiles);

      if (parseableFiles.length === 0) {
        // Show "no files" state briefly (minimal delay for UX)
        setProgress({ current: 0, total: 0, phase: 'empty' });
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsCompacting(false);
        setProgress(null);
        return null; // Signal no files found
      }

      setProgress({ current: 0, total: parseableFiles.length, phase: 'parsing' });

      // Process files in batches
      const { results, originalSize } = await processFilesInBatches(parseableFiles, rootPath);

      // Brief pause before finishing (minimal delay for UX)
      setProgress({ current: parseableFiles.length, total: parseableFiles.length, phase: 'finishing' });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Format output
      const output = formatOutput(results);

      return { output, originalSize };
    } catch (error) {
      console.error('Failed to compact project:', error);
      return { output: `# Project Compact\n# Error: ${error.message}`, originalSize: 0 };
    } finally {
      setIsCompacting(false);
      setProgress(null);
    }
  }, [isCompacting, filterParseableFiles, processFilesInBatches, formatOutput]);

  return {
    isCompacting,
    progress,
    compactProject,
  };
}
