import { invoke } from '@tauri-apps/api/core';

/**
 * Check if a file path is a Python file
 * @param {string} path - File path to check
 * @returns {boolean}
 */
export const isPythonParseable = (path) => path.endsWith('.py');

/**
 * Extract skeleton from Python source code using Rust backend
 * @param {string} code - Source code to parse
 * @param {string} filePath - File path for error reporting
 * @returns {Promise<Object|null>} Skeleton data or null on error
 */
export const extractSkeleton = async (code, filePath) => {
  try {
    return await invoke('parse_python_skeleton', { content: code, filePath });
  } catch (error) {
    console.warn('Python parse error:', error);
    return null;
  }
};

/**
 * Format Python skeleton for prompt output
 * @param {Object} skeleton - Skeleton data object
 * @returns {string}
 */
export const formatSkeletonForPrompt = (skeleton) => {
  if (!skeleton) return '';

  const lines = [];

  // Imports - local (file relationships) vs external (just counted)
  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.module.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...local.map(i => i.module));
    lines.push(`imports: ${parts.join(', ')}`);
  }

  // Classes (with bases and decorators - high value for Python)
  if (skeleton.classes.length > 0) {
    const classList = skeleton.classes.map(c => {
      const parts = [c.name];
      if (c.decorators.length > 0) parts.push(`@${c.decorators[0]}`);
      if (c.bases.length > 0) parts.push(`(${c.bases.join(',')})`);
      return `${parts.join(' ')}:${c.line}`;
    }).join(', ');
    lines.push(`classes: ${classList}`);
  }

  // Functions
  if (skeleton.functions.length > 0) {
    const funcList = skeleton.functions.map(f => {
      const deco = f.decorators.length > 0 ? `@${f.decorators[0]} ` : '';
      return `${deco}${f.name}:${f.line}`;
    }).join(', ');
    lines.push(`fn: ${funcList}`);
  }

  return lines.join('\n');
};
