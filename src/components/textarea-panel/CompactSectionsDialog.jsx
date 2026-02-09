import React, { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { ChevronRight, ChevronDown, Folder, File } from "lucide-react";
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
  // Sort directories
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
    // Precompute tokens per section
    return parsed.map(s => ({
      ...s,
      tokens: estimateTokens(`## ${s.path}\n${s.content}`),
    }));
  }, [compactedProject]);
  const grouped = useMemo(() => groupByDirectory(sections), [sections]);

  // Real-time token estimate based on current toggle state
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
          <DialogTitle className="text-sm flex items-center gap-2">
            <span>Compacted Sections ({enabledCount}/{sections.length} files)</span>
            <span className="text-muted-foreground font-normal">~{formatTokenCount(liveTokenEstimate)} tokens</span>
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {grouped.map(([dirPath, files]) => {
            const filePaths = files.map(f => f.path);
            const allDisabled = filePaths.every(p => disabledPaths.has(p));
            const someDisabled = filePaths.some(p => disabledPaths.has(p));
            const collapsed = collapsedDirs.has(dirPath);

            return (
              <div key={dirPath} className="mb-1">
                <div className="flex items-center gap-1.5 py-1 hover:bg-muted/50 rounded px-1 cursor-pointer select-none">
                  <button
                    onClick={() => toggleDirCollapse(dirPath)}
                    className="p-0 bg-transparent border-none cursor-pointer text-muted-foreground"
                  >
                    {collapsed
                      ? <ChevronRight className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                    }
                  </button>
                  <Checkbox
                    checked={!allDisabled && (someDisabled ? 'indeterminate' : true)}
                    onCheckedChange={() => toggleDir(dirPath, filePaths)}
                  />
                  <Folder className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono">{dirPath}</span>
                  <span className="text-xs text-muted-foreground/60 ml-auto">
                    {filePaths.length - filePaths.filter(p => disabledPaths.has(p)).length}/{filePaths.length}
                    {' · '}
                    {formatTokenCount(files.reduce((sum, f) => disabledPaths.has(f.path) ? sum : sum + f.tokens, 0))}
                  </span>
                </div>
                {!collapsed && (
                  <div className="ml-5 border-l border-border/30 pl-2">
                    {files.map(file => (
                      <div
                        key={file.path}
                        className="flex items-center gap-1.5 py-0.5 hover:bg-muted/30 rounded px-1 cursor-pointer select-none"
                        onClick={() => togglePath(file.path)}
                      >
                        <Checkbox
                          checked={!disabledPaths.has(file.path)}
                          onCheckedChange={() => togglePath(file.path)}
                        />
                        <File className="w-3 h-3 text-muted-foreground" />
                        <span className={`text-xs font-mono ${disabledPaths.has(file.path) ? 'text-muted-foreground/40 line-through' : 'text-foreground'}`}>
                          {file.fileName}
                        </span>
                        <span className={`text-xs ml-auto ${disabledPaths.has(file.path) ? 'text-muted-foreground/30' : 'text-muted-foreground/60'}`}>
                          {formatTokenCount(file.tokens)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-2 border-t border-border">
          <button
            onClick={handleApply}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Apply
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
