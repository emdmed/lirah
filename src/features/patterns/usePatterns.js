import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function usePatterns(currentPath) {
  const [patternFiles, setPatternFiles] = useState([]);
  const [selectedPatterns, setSelectedPatterns] = useState(new Set());

  useEffect(() => {
    if (!currentPath) {
      setPatternFiles([]);
      setSelectedPatterns(new Set());
      return;
    }

    const loadPatterns = async () => {
      try {
        const entries = await invoke('read_directory', { path: `${currentPath}/.patterns` });
        const files = entries
          .filter(e => e.name !== 'patterns.md' && e.name.endsWith('.md'))
          .map(e => e.name)
          .sort();
        setPatternFiles(files);
        setSelectedPatterns(prev => {
          const next = new Set();
          prev.forEach(name => { if (files.includes(name)) next.add(name); });
          return next.size === prev.size ? prev : next;
        });
      } catch {
        setPatternFiles([]);
      }
    };

    loadPatterns();
  }, [currentPath]);

  const togglePattern = useCallback((filename) => {
    setSelectedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  const clearPatterns = useCallback(() => {
    setSelectedPatterns(new Set());
  }, []);

  const getPatternInstructions = useCallback(() => {
    if (selectedPatterns.size === 0) return '';
    const instructions = Array.from(selectedPatterns)
      .map(f => `Read and follow .patterns/${f}`)
      .join('\n');
    return instructions;
  }, [selectedPatterns]);

  return { patternFiles, selectedPatterns, togglePattern, clearPatterns, getPatternInstructions };
}
