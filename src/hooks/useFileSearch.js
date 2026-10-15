import { useRef, useCallback } from 'react';

/**
 * Lowercased search keys for one file entry. Paths are matched relative to
 * the project root, so the root's own directories never match every file.
 */
function buildSearchEntry(file, rootPrefix) {
  const path = file.path || '';
  const relPath = rootPrefix && path.startsWith(rootPrefix) ? path.slice(rootPrefix.length) : path;
  return {
    lowerName: (file.name || '').toLowerCase(),
    lowerPath: relPath.replace(/\\/g, '/').toLowerCase(),
  };
}

/**
 * Score one entry against the query tokens; 0 means no match. Every token
 * must occur in the relative path. A token that hits the file name ranks
 * higher than one that only hits a parent directory.
 */
export function scoreSearchEntry(entry, tokens) {
  let score = 0;
  for (const token of tokens) {
    if (entry.lowerName === token) score += 100;
    else if (entry.lowerName.startsWith(token)) score += 60;
    else if (entry.lowerName.includes(token)) score += 40;
    else if (entry.lowerPath.includes(token)) score += 10;
    else return 0;
  }
  return score;
}

/**
 * Plain substring search over the file list. There is no prebuilt index:
 * the list is the one the tree already keeps, and each file's lowercased
 * keys are computed on first search and cached per entry object, so an fs
 * change that adds or drops a few entries costs nothing to "reindex".
 */
export function useFileSearch() {
  const filesRef = useRef([]);
  const rootPrefixRef = useRef('');
  const cacheRef = useRef(new WeakMap());

  /**
   * Point the search at the current file list. O(1): unchanged entry objects
   * keep their cached keys.
   * @param {Array} files - Flat array of all file entries
   * @param {string} [rootPath] - Project root, used to match relative paths
   */
  const initializeSearch = useCallback((files, rootPath) => {
    const rootPrefix = rootPath ? rootPath.replace(/[\\/]+$/, '') + '/' : '';
    if (rootPrefix !== rootPrefixRef.current) {
      rootPrefixRef.current = rootPrefix;
      cacheRef.current = new WeakMap();
    }
    filesRef.current = files || [];
  }, []);

  /**
   * Search for files matching query
   * @param {string} query - Search query (whitespace-separated tokens, all required)
   * @returns {Array|null} - Matching file entries, best first
   */
  const search = useCallback((query) => {
    const files = filesRef.current;
    if (!files.length || !query || query.trim() === '') {
      return null;
    }

    const tokens = query.trim().toLowerCase().split(/\s+/);
    const cache = cacheRef.current;
    const rootPrefix = rootPrefixRef.current;
    const matches = [];
    for (const file of files) {
      let entry = cache.get(file);
      if (!entry) {
        entry = buildSearchEntry(file, rootPrefix);
        cache.set(file, entry);
      }
      const score = scoreSearchEntry(entry, tokens);
      if (score > 0) matches.push({ file, score, len: entry.lowerPath.length });
    }

    matches.sort((a, b) => b.score - a.score || a.len - b.len);
    return matches.map(m => m.file);
  }, []);

  /**
   * Clear search index
   */
  const clearSearch = useCallback(() => {
    filesRef.current = [];
  }, []);

  return {
    initializeSearch,
    search,
    clearSearch
  };
}
