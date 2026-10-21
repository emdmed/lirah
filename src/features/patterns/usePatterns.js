import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const STARTER_FILE = 'conventions.md';

const PATTERNS_INDEX_STARTER = `# Patterns

Project conventions for coding agents. Each \`.md\` file in this folder is one
pattern; select patterns in Lirah's instructions picker and the prompt asks the
agent to read and follow them.

- \`conventions.md\`: general code conventions
`;

const CONVENTIONS_STARTER = `# Conventions

## Rules
- Describe one rule per line, in the imperative ("Use named exports").
- Say where things live ("Hooks go in src/hooks/").

## Examples
- \`path/to/a/good/example\`: why it is the model to copy
`;

export function usePatterns(currentPath) {
  const [patternFiles, setPatternFiles] = useState([]);
  const [selectedPatterns, setSelectedPatterns] = useState(new Set());

  // Bumped after creating .patterns/ so the listing re-runs.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!currentPath) {
      setPatternFiles([]);
      setSelectedPatterns(new Set());
      return;
    }

    let cancelled = false;
    const loadPatterns = async () => {
      try {
        const patternsDir = `${currentPath}/.patterns`;
        const { entries } = await invoke('read_directory_recursive', { path: patternsDir, maxDepth: 10 });
        if (cancelled) return;
        const files = entries
          .filter(e => !e.is_dir && e.name.endsWith('.md') && e.name !== 'patterns.md')
          .map(e => e.path.slice(patternsDir.length + 1))
          .sort();
        setPatternFiles(files);
        setSelectedPatterns(prev => {
          const next = new Set();
          prev.forEach(name => { if (files.includes(name)) next.add(name); });
          return next.size === prev.size ? prev : next;
        });
      } catch {
        if (!cancelled) setPatternFiles([]);
      }
    };

    loadPatterns();
    return () => { cancelled = true; };
  }, [currentPath, reloadKey]);

  // Seed .patterns/ for a repo that has none: an index (patterns.md, which the
  // picker hides) plus one starter pattern so there is something to select.
  // Never overwrites an existing file.
  const createPatterns = useCallback(async () => {
    if (!currentPath) return null;
    const dir = `${currentPath}/.patterns`;
    const writeIfMissing = async (path, content) => {
      if (await invoke('path_exists', { path })) return;
      await invoke('write_file_content', { path, content });
    };
    await writeIfMissing(`${dir}/patterns.md`, PATTERNS_INDEX_STARTER);
    await writeIfMissing(`${dir}/${STARTER_FILE}`, CONVENTIONS_STARTER);
    setReloadKey(k => k + 1);
    return `${dir}/${STARTER_FILE}`;
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

  return { patternFiles, selectedPatterns, togglePattern, clearPatterns, getPatternInstructions, createPatterns };
}
