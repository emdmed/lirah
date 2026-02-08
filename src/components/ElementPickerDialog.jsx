import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { extractSkeleton as extractBabelSkeleton, isBabelParseable } from "@/utils/babelSymbolParser";
import { normalizePath, getRelativePath } from "@/utils/pathUtils";
import { extractSkeleton as extractPythonSkeleton, isPythonParseable } from "@/utils/pythonSymbolParser";

/**
 * Generate unique key for an element
 */
const getElementKey = (type, name, line) => `${type}:${name}:${line}`;

/**
 * Parse skeleton into flat element list for selection
 */
const skeletonToElements = (skeleton, isPython = false) => {
  if (!skeleton) return [];

  const elements = [];

  // Components
  if (skeleton.components?.length > 0) {
    skeleton.components.forEach(c => {
      const hocSuffix = c.hoc ? ` (${c.hoc})` : '';
      elements.push({
        key: getElementKey('component', c.name, c.line),
        name: c.name,
        type: 'component',
        typeLabel: 'Components',
        line: c.line,
        endLine: c.endLine || c.line,
        displayName: `${c.name}${hocSuffix}`,
      });
    });
  }

  // Functions
  if (skeleton.functions?.length > 0) {
    skeleton.functions.forEach(f => {
      const deco = f.decorators?.length > 0 ? ` @${f.decorators[0]}` : '';
      elements.push({
        key: getElementKey('function', f.name, f.line),
        name: f.name,
        type: 'function',
        typeLabel: 'Functions',
        line: f.line,
        endLine: f.endLine || f.line,
        displayName: `${f.name}${deco}`,
      });
    });
  }

  // useEffect hooks (JS/TS only)
  if (skeleton.hooks?.useEffect?.length > 0) {
    skeleton.hooks.useEffect.forEach(eff => {
      const depsStr = eff.deps === null
        ? 'no deps'
        : eff.deps === '?'
          ? '?'
          : Array.isArray(eff.deps)
            ? `[${eff.deps.join(', ')}]`
            : '?';
      elements.push({
        key: getElementKey('hook', 'useEffect', eff.line),
        name: 'useEffect',
        type: 'hook',
        typeLabel: 'Hooks',
        line: eff.line,
        endLine: eff.endLine || eff.line,
        displayName: `useEffect ${depsStr}`,
        deps: eff.deps,
      });
    });
  }

  // Custom hooks (JS/TS only)
  if (skeleton.hooks?.custom?.length > 0) {
    skeleton.hooks.custom.forEach((hookName, idx) => {
      elements.push({
        key: getElementKey('hook', hookName, idx),
        name: hookName,
        type: 'hook',
        typeLabel: 'Hooks',
        line: 0,
        endLine: 0,
        displayName: hookName,
      });
    });
  }

  // Classes
  if (skeleton.classes?.length > 0) {
    skeleton.classes.forEach(c => {
      const bases = c.bases?.length > 0 ? `(${c.bases.join(', ')})` : '';
      const deco = c.decorators?.length > 0 ? ` @${c.decorators[0]}` : '';
      elements.push({
        key: getElementKey('class', c.name, c.line),
        name: c.name,
        type: 'class',
        typeLabel: 'Classes',
        line: c.line,
        endLine: c.endLine || c.line,
        displayName: `${c.name}${bases}${deco}`,
      });
    });
  }

  // Contexts (JS/TS only)
  if (skeleton.contexts?.length > 0) {
    skeleton.contexts.forEach(c => {
      elements.push({
        key: getElementKey('context', c.name, c.line),
        name: c.name,
        type: 'context',
        typeLabel: 'Contexts',
        line: c.line,
        endLine: c.endLine || c.line,
        displayName: c.name,
      });
    });
  }

  // Types/Interfaces (TypeScript only)
  if (skeleton.interfaces?.length > 0) {
    skeleton.interfaces.forEach(t => {
      elements.push({
        key: getElementKey('interface', t.name, t.line),
        name: t.name,
        type: 'interface',
        typeLabel: 'Types',
        line: t.line,
        endLine: t.endLine || t.line,
        displayName: t.name,
      });
    });
  }

  if (skeleton.types?.length > 0) {
    skeleton.types.forEach(t => {
      elements.push({
        key: getElementKey('type', t.name, t.line),
        name: t.name,
        type: 'type',
        typeLabel: 'Types',
        line: t.line,
        endLine: t.endLine || t.line,
        displayName: t.name,
      });
    });
  }

  return elements;
};

/**
 * Group elements by their typeLabel
 */
const groupElementsByType = (elements) => {
  const groups = {};
  const typeOrder = ['Components', 'Functions', 'Hooks', 'Contexts', 'Classes', 'Types'];

  elements.forEach(el => {
    if (!groups[el.typeLabel]) {
      groups[el.typeLabel] = [];
    }
    groups[el.typeLabel].push(el);
  });

  // Sort groups by predefined order
  const sortedGroups = [];
  typeOrder.forEach(type => {
    if (groups[type]) {
      sortedGroups.push({ type, elements: groups[type] });
    }
  });

  return sortedGroups;
};

/**
 * Element picker dialog for selecting specific code elements from a file
 */
export function ElementPickerDialog({
  open,
  onOpenChange,
  filePath,
  currentPath,
  onAddElements,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [elements, setElements] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Get relative path for display
  const relativePath = useMemo(() => {
    if (!filePath || !currentPath) return filePath || '';
    return getRelativePath(filePath, currentPath);
  }, [filePath, currentPath]);

  // Load and parse file when dialog opens
  useEffect(() => {
    if (!open || !filePath) {
      setElements([]);
      setSelectedKeys(new Set());
      setError(null);
      return;
    }

    const loadElements = async () => {
      setLoading(true);
      setError(null);

      try {
        // Read file content
        const content = await invoke('read_file_content', { path: filePath });

        let skeleton = null;
        let isPython = false;

        if (isBabelParseable(filePath)) {
          skeleton = extractBabelSkeleton(content, filePath);
        } else if (isPythonParseable(filePath)) {
          skeleton = await extractPythonSkeleton(content, filePath);
          isPython = true;
        }

        if (!skeleton) {
          setError('Could not parse file');
          setElements([]);
          return;
        }

        const parsedElements = skeletonToElements(skeleton, isPython);
        setElements(parsedElements);

        // Expand all groups by default
        const groupTypes = new Set(parsedElements.map(el => el.typeLabel));
        setExpandedGroups(groupTypes);
      } catch (err) {
        console.error('Failed to load elements:', err);
        setError(err.message || 'Failed to load file');
        setElements([]);
      } finally {
        setLoading(false);
      }
    };

    loadElements();
  }, [open, filePath]);

  // Group elements for display
  const groupedElements = useMemo(() => groupElementsByType(elements), [elements]);

  const toggleElement = (key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleGroup = (type) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleGroupSelection = (group) => {
    const groupKeys = group.elements.map(el => el.key);
    const allSelected = groupKeys.every(key => selectedKeys.has(key));

    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (allSelected) {
        // Deselect all in group
        groupKeys.forEach(key => next.delete(key));
      } else {
        // Select all in group
        groupKeys.forEach(key => next.add(key));
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const selectedElements = elements.filter(el => selectedKeys.has(el.key));
    onAddElements(filePath, selectedElements);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Select Elements
          </DialogTitle>
          <DialogDescription className="truncate">
            {relativePath}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-sm text-destructive">
              {error}
            </div>
          ) : elements.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No elements found in this file
            </div>
          ) : (
            <div className="space-y-2">
              {groupedElements.map(group => {
                const isExpanded = expandedGroups.has(group.type);
                const groupKeys = group.elements.map(el => el.key);
                const selectedCount = groupKeys.filter(key => selectedKeys.has(key)).length;
                const allSelected = selectedCount === groupKeys.length;
                const someSelected = selectedCount > 0 && !allSelected;

                return (
                  <div key={group.type} className="border border-border rounded-md">
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted"
                      onClick={() => toggleGroup(group.type)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleGroupSelection(group)}
                        onClick={(e) => e.stopPropagation()}
                        className={someSelected ? 'opacity-50' : ''}
                      />
                      <span className="font-medium text-sm flex-1">
                        {group.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {selectedCount > 0 && `${selectedCount}/`}{group.elements.length}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="px-3 py-1 space-y-1">
                        {group.elements.map(el => (
                          <div
                            key={el.key}
                            className="flex items-center gap-2 py-1 pl-6 hover:bg-muted/30 rounded cursor-pointer"
                            onClick={() => toggleElement(el.key)}
                          >
                            <Checkbox
                              checked={selectedKeys.has(el.key)}
                              onCheckedChange={() => toggleElement(el.key)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-sm flex-1 truncate">
                              {el.displayName}
                            </span>
                            {el.line > 0 && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {el.line === el.endLine ? `L${el.line}` : `L${el.line}-${el.endLine}`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleAddSelected}
            disabled={selectedKeys.size === 0}
          >
            Add {selectedKeys.size > 0 ? `(${selectedKeys.size})` : 'Selected'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
