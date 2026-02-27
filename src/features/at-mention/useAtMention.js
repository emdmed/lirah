import { useState, useEffect, useMemo, useCallback } from "react";

export function useAtMention({ viewMode, search, toggleFileSelection, textareaContent, setTextareaContent, textareaRef }) {
  const [atMentionQuery, setAtMentionQuery] = useState(null);
  const [atMentionResults, setAtMentionResults] = useState(null);
  const [atMentionSelectedIndex, setAtMentionSelectedIndex] = useState(0);

  const extractAtMention = useCallback((text) => {
    if (viewMode !== 'tree') return null;
    const match = text.match(/@([^\s@]*)$/);
    return match ? match[1] : null;
  }, [viewMode]);

  const performAtMentionSearch = useCallback((query) => {
    if (!query || query.trim() === '') return null;
    return search(query);
  }, [search]);

  // Debounced @ mention search
  useEffect(() => {
    if (atMentionQuery === null) {
      setAtMentionResults(null);
      return;
    }
    const timer = setTimeout(() => {
      const results = performAtMentionSearch(atMentionQuery);
      setAtMentionResults(results);
    }, 200);
    return () => clearTimeout(timer);
  }, [atMentionQuery, performAtMentionSearch]);

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

  const handleAtMentionSelect = useCallback((filePath, isDirectory) => {
    if (!filePath || isDirectory) return;
    toggleFileSelection(filePath);
    const newContent = textareaContent.replace(/@[^\s@]*$/, '');
    setTextareaContent(newContent);
    setAtMentionQuery(null);
    setAtMentionSelectedIndex(0);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [toggleFileSelection, textareaContent, setTextareaContent, textareaRef]);

  const handleAtMentionClose = useCallback(() => {
    setTextareaContent(prev => prev.replace(/@[^\s@]*$/, ''));
    setAtMentionQuery(null);
    setAtMentionSelectedIndex(0);
  }, [setTextareaContent]);

  return {
    atMentionQuery, setAtMentionQuery,
    atMentionSelectedIndex,
    atMentionDisplayedResults,
    extractAtMention,
    handleAtMentionNavigate,
    handleAtMentionSelect,
    handleAtMentionClose,
  };
}
