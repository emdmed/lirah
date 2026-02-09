import React, { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";
import { estimateTokens, formatTokenCount } from "../../hooks/useProjectCompact";

/**
 * Parse compacted output into sections by file path
 * Format: "## path/to/file\n<content>\n## next/file\n..."
 */
function parseSections(output) {
  if (!output) return [];
  const sections = [];
  const lines = output.split('\n');
  let currentPath = null;
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentPath !== null) {
        sections.push({ path: currentPath, content: currentLines.join('\n') });
      }
      currentPath = line.slice(3).trim();
      currentLines = [];
    } else if (currentPath !== null) {
      currentLines.push(line);
    }
  }
  if (currentPath !== null) {
    sections.push({ path: currentPath, content: currentLines.join('\n') });
  }
  return sections;
}

/**
 * Group sections into a directory tree structure
 */
function groupByDirectory(sections) {
  const tree = {};
  for (const section of sections) {
    const parts = section.path.split('/');
    const fileName = parts.pop();
    const dirPath = parts.join('/') || '.';
    if (!tree[dirPath]) tree[dirPath] = [];
    tree[dirPath].push({ ...section, fileName });
  }
  return Object.entries(tree).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Rebuild compacted output from sections, excluding disabled paths
 */
function rebuildOutput(sections, disabledPaths) {
  return sections
    .filter(s => !disabledPaths.has(s.path))
    .map(s => `## ${s.path}\n${s.content}`)
    .join('\n');
}

/**
 * Dialog for toggling compacted project sections on/off
 */
export function CompactSectionsDialog({ open, onOpenChange, compactedProject, onUpdateCompactedProject }) {
  const [disabledPaths, setDisabledPaths] = useState(() => new Set(compactedProject?.disabledPaths || []));
  const [collapsedDirs, setCollapsedDirs] = useState(() => {
    const parsed = parseSections(compactedProject?.fullOutput || compactedProject?.output);
    const dirs = new Set();
    for (const s of parsed) {
      const parts = s.path.split('/');
      parts.pop();
      dirs.add(parts.join('/') || '.');
    }
    return dirs;
  });

  const sections = useMemo(() => {
    const parsed = parseSections(compactedProject?.fullOutput || compactedProject?.output);
    return parsed.map(s => ({
      ...s,
      tokens: estimateTokens(`## ${s.path}\n${s.content}`),
    }));
  }, [compactedProject]);
  const grouped = useMemo(() => groupByDirectory(sections), [sections]);

  const liveTokenEstimate = useMemo(() => {
    return sections.reduce((sum, s) => disabledPaths.has(s.path) ? sum : sum + s.tokens, 0);
  }, [sections, disabledPaths]);

  const togglePath = useCallback((path) => {
    setDisabledPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleDir = useCallback((dirPath, filePaths) => {
    setDisabledPaths(prev => {
      const next = new Set(prev);
      const allDisabled = filePaths.every(p => next.has(p));
      if (allDisabled) {
        filePaths.forEach(p => next.delete(p));
      } else {
        filePaths.forEach(p => next.add(p));
      }
      return next;
    });
  }, []);

  const toggleDirCollapse = useCallback((dirPath) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  }, []);

  const enabledCount = sections.length - disabledPaths.size;

  const handleApply = useCallback(() => {
    const fullOutput = compactedProject?.fullOutput || compactedProject?.output;
    const allSections = parseSections(fullOutput);
    const newOutput = rebuildOutput(allSections, disabledPaths);
    const enabledSections = allSections.filter(s => !disabledPaths.has(s.path));

    const newTokenEstimate = estimateTokens(newOutput);
    onUpdateCompactedProject({
      ...compactedProject,
      output: newOutput,
      fullOutput: fullOutput,
      fileCount: enabledSections.length,
      tokenEstimate: newTokenEstimate,
      formattedTokens: formatTokenCount(newTokenEstimate),
      disabledPaths: Array.from(disabledPaths),
    });
    onOpenChange(false);
  }, [compactedProject, disabledPaths, onUpdateCompactedProject, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Compacted Sections</DialogTitle>
          <DialogDescription>
            {enabledCount}/{sections.length} files · ~{formatTokenCount(liveTokenEstimate)} tokens
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {grouped.map(([dirPath, files]) => {
            const filePaths = files.map(f => f.path);
            const enabledInDir = filePaths.filter(p => !disabledPaths.has(p)).length;
            const allDisabled = enabledInDir === 0;
            const collapsed = collapsedDirs.has(dirPath);
            const dirTokens = files.reduce((sum, f) => disabledPaths.has(f.path) ? sum : sum + f.tokens, 0);

            return (
              <div key={dirPath} className="mb-0.5">
                {/* Directory row */}
                <div
                  className={`flex items-center gap-1.5 py-1 rounded px-1 select-none transition-opacity ${allDisabled ? 'opacity-35' : ''}`}
                >
                  <div
                    className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleDirCollapse(dirPath)}
                  >
                    {collapsed
                      ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    }
                    <span
                      className="shrink-0 px-1 py-0 rounded-full bg-primary/15 border border-primary/25 text-primary/70 font-mono cursor-pointer hover:bg-primary/25 hover:text-primary transition-colors text-center"
                      style={{ fontSize: '9px', lineHeight: '14px', minWidth: '38px' }}
                      onClick={(e) => { e.stopPropagation(); toggleDir(dirPath, filePaths); }}
                    >
                      {formatTokenCount(dirTokens)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors">
                      {dirPath}
                    </span>
                    <span className="text-muted-foreground/50 font-mono" style={{ fontSize: '9px' }}>
                      {enabledInDir}/{filePaths.length}
                    </span>
                  </div>
                </div>
                {/* Files */}
                {!collapsed && (
                  <div className="ml-4 border-l border-border/20 pl-1.5">
                    {files.map(file => {
                      const isDisabled = disabledPaths.has(file.path);
                      return (
                        <div
                          key={file.path}
                          className={`flex items-center gap-1.5 py-0.5 rounded px-1 select-none transition-all ${
                            isDisabled
                              ? 'opacity-30 hover:opacity-50'
                              : 'opacity-100'
                          }`}
                        >
                          <span
                            className="shrink-0 px-1 py-0 rounded-full bg-primary/15 border border-primary/25 text-primary/70 font-mono cursor-pointer hover:bg-primary/25 hover:text-primary transition-colors text-center"
                            style={{ fontSize: '9px', lineHeight: '14px', minWidth: '38px' }}
                            onClick={() => togglePath(file.path)}
                          >
                            {formatTokenCount(file.tokens)}
                          </span>
                          <span className={`text-xs font-mono transition-all ${isDisabled ? 'line-through' : 'text-foreground'}`}>
                            {file.fileName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2 sm:gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
