import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFileSearch } from "../../hooks/useFileSearch";

// `@query` ending at the caret. The `@` must open a word, so an e-mail address
// or `foo@bar` in the prose does not pop the file list.
const MENTION_AT_CARET = /(^|[\s([{"'`])@([^\s@]*)$/;
// The flat view never loads the recursive file list, so the mention keeps its
// own copy, refreshed when a mention starts and this one is older than this.
const OWN_INDEX_TTL_MS = 30_000;

/**
 * `@` file mentions in the prompt.
 *
 * Matches the `@query` that ends at the caret, anywhere in the text. Results
 * come from the sidebar's search (filled by the tree view); when that list is
 * empty, as in the flat view, the hook loads the project's files itself.
 */
export function useAtMention({ search, toggleFileSelection, setTextareaContent, textareaRef, rootPath }) {
  const [atMentionQuery, setAtMentionQuery] = useState(null);
  const [atMentionResults, setAtMentionResults] = useState(null);
  const [atMentionSelectedIndex, setAtMentionSelectedIndex] = useState(0);
  // Where the current mention sits in the text: `start` is the `@`, `end` the caret.
  const rangeRef = useRef(null);
  // The `@` the user dismissed with Esc; typing on after it keeps the popup shut.
  const dismissedAtRef = useRef(null);

  const ownSearch = useFileSearch();
  const ownIndexRef = useRef({ root: null, loadedAt: 0, loading: null });
  const [ownIndexVersion, setOwnIndexVersion] = useState(0);

  const ensureOwnIndex = useCallback(() => {
    const idx = ownIndexRef.current;
    if (!rootPath || idx.loading) return;
    if (idx.root === rootPath && Date.now() - idx.loadedAt < OWN_INDEX_TTL_MS) return;
    idx.loading = invoke('read_directory_recursive', { path: rootPath, maxDepth: 10, maxFiles: 10000 })
      .then((result) => {
        const entries = Array.isArray(result) ? result : (result?.entries || []);
        ownSearch.initializeSearch(entries, rootPath);
        idx.root = rootPath;
        idx.loadedAt = Date.now();
        setOwnIndexVersion((v) => v + 1);
      })
      .catch((err) => console.error('@mention: failed to list project files', err))
      .finally(() => { idx.loading = null; });
  }, [rootPath, ownSearch.initializeSearch]);

  const extractAtMention = useCallback((text) => {
    const el = textareaRef?.current;
    const caret = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length;
    const match = text.slice(0, caret).match(MENTION_AT_CARET);
    if (!match) {
      rangeRef.current = null;
      dismissedAtRef.current = null;
      return null;
    }
    const start = caret - match[2].length - 1;
    if (dismissedAtRef.current === start) return null;
    dismissedAtRef.current = null;
    rangeRef.current = { start, end: caret };
    return match[2];
  }, [textareaRef]);

  const performAtMentionSearch = useCallback((query) => {
    if (!query || query.trim() === '') return null;
    const results = search(query);
    if (results !== null) return results;
    // The sidebar has no file list (flat view): use the hook's own, loading
    // it on first use; the search re-runs when it arrives.
    ensureOwnIndex();
    return ownSearch.search(query);
  }, [search, ownSearch.search, ensureOwnIndex]);

  // Debounced @ mention search
  useEffect(() => {
    if (atMentionQuery === null) {
      setAtMentionResults(null);
      return;
    }
    const timer = setTimeout(() => {
      setAtMentionResults(performAtMentionSearch(atMentionQuery));
    }, 200);
    return () => clearTimeout(timer);
  }, [atMentionQuery, performAtMentionSearch, ownIndexVersion]);

  // Reset index when results change
  useEffect(() => {
    if (atMentionQuery !== null) {
      setAtMentionSelectedIndex(0);
    }
  }, [atMentionResults, atMentionQuery]);

  const atMentionDisplayedResults = useMemo(() => {
    if (!atMentionResults) return [];
    const files = atMentionResults.filter(r => !r.is_dir);
    const dirs = atMentionResults.filter(r => r.is_dir);
    return [...files, ...dirs].slice(0, 12);
  }, [atMentionResults]);

  const handleAtMentionNavigate = useCallback((direction) => {
    if (atMentionDisplayedResults.length === 0) return;
    setAtMentionSelectedIndex(prev => {
      let newIndex = prev;
      const maxIndex = atMentionDisplayedResults.length - 1;
      if (direction === 'up') {
        newIndex = prev > 0 ? prev - 1 : maxIndex;
      } else {
        newIndex = prev < maxIndex ? prev + 1 : 0;
      }
      let attempts = 0;
      while (atMentionDisplayedResults[newIndex]?.is_dir && attempts < atMentionDisplayedResults.length) {
        if (direction === 'up') {
          newIndex = newIndex > 0 ? newIndex - 1 : maxIndex;
        } else {
          newIndex = newIndex < maxIndex ? newIndex + 1 : 0;
        }
        attempts++;
      }
      if (attempts >= atMentionDisplayedResults.length) return prev;
      return newIndex;
    });
  }, [atMentionDisplayedResults]);

  // Picking a file attaches it and removes only the `@query` it was found by;
  // the text around it, and the caret position, stay. A file already attached
  // stays attached.
  const handleAtMentionSelect = useCallback((filePath, isDirectory, alreadySelected = false) => {
    if (!filePath || isDirectory) return;
    if (!alreadySelected) toggleFileSelection(filePath);
    const range = rangeRef.current;
    if (range) {
      setTextareaContent(prev => {
        if (prev.charAt(range.start) !== '@') return prev;
        return prev.slice(0, range.start) + prev.slice(range.end);
      });
    }
    rangeRef.current = null;
    setAtMentionQuery(null);
    setAtMentionSelectedIndex(0);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      if (range) {
        requestAnimationFrame(() => {
          try { el.setSelectionRange(range.start, range.start); } catch { /* detached */ }
        });
      }
    }
  }, [toggleFileSelection, setTextareaContent, textareaRef]);

  // Esc closes the list and leaves the typed `@query` in the text.
  const handleAtMentionClose = useCallback(() => {
    dismissedAtRef.current = rangeRef.current?.start ?? null;
    setAtMentionQuery(null);
    setAtMentionSelectedIndex(0);
  }, []);

  return useMemo(() => ({
    atMentionQuery, setAtMentionQuery,
    atMentionSelectedIndex,
    atMentionDisplayedResults,
    extractAtMention,
    handleAtMentionNavigate,
    handleAtMentionSelect,
    handleAtMentionClose,
  }), [
    atMentionQuery, setAtMentionQuery, atMentionSelectedIndex, atMentionDisplayedResults, extractAtMention, handleAtMentionNavigate, handleAtMentionSelect, handleAtMentionClose,
  ]);
}
