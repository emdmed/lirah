import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogEmpty,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { Scanner } from "@/components/instrument/Scanner";
import { invoke } from "@tauri-apps/api/core";
import { isBabelParseable } from "./babelSupport";
import { analyzeSkeleton as extractBabelSkeleton } from "./babelClient";
import { normalizePath, getRelativePath } from "@/utils/pathUtils";
import { extractSkeleton as extractPythonSkeleton, isPythonParseable } from "./pythonSymbolParser";

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
          skeleton = await extractBabelSkeleton(content, filePath);
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
      <DialogContent
        size="md"
        className="max-h-[80vh] flex flex-col"
        lamp={loading ? 'blink' : 'on'}
        status={loading ? (
          <>
            <Scanner label="Reading file" />
            reading file
          </>
        ) : selectedKeys.size > 0 ? `${selectedKeys.size} selected` : null}
        escLabel="cancel"
      >
        <DialogHeader>
          <DialogTitle>Select elements</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs" title={relativePath}>
            {relativePath}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Scanner size="lg" />
            </div>
          ) : error ? (
            <p className="py-2 text-sm text-[var(--ins-fault)]" role="alert">
              {error}
            </p>
          ) : elements.length === 0 ? (
            <DialogEmpty>No elements found in this file</DialogEmpty>
          ) : (
            <div className="flex flex-col gap-3">
              {groupedElements.map(group => {
                const isExpanded = expandedGroups.has(group.type);
                const groupKeys = group.elements.map(el => el.key);
                const selectedCount = groupKeys.filter(key => selectedKeys.has(key)).length;
                const allSelected = selectedCount === groupKeys.length;
                const someSelected = selectedCount > 0 && !allSelected;

                return (
                  <div key={group.type} className="flex flex-col">
                    <div
                      className="flex cursor-pointer items-center gap-2 py-1"
                      onClick={() => toggleGroup(group.type)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-5 px-1.5 text-[11px]"
                        onClick={(e) => { e.stopPropagation(); toggleGroupSelection(group); }}
                      >
                        {allSelected ? 'none' : 'all'}
                      </Button>
                      <span className="ins-legend text-[10px]">
                        {group.type}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {selectedCount > 0 && `${selectedCount}/`}{group.elements.length}
                      </span>
                      <span aria-hidden="true" className="h-px flex-1 bg-[var(--ins-edge)]" />
                    </div>

                    {isExpanded && (
                      <div className="-mx-3 flex flex-col">
                        {group.elements.map(el => (
                          <div
                            key={el.key}
                            className="flex cursor-pointer items-center gap-2 py-[3px] pl-7 pr-3 hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)]"
                            onClick={() => toggleElement(el.key)}
                          >
                            <span className="w-4 h-4 flex items-center justify-center">
                              {selectedKeys.has(el.key) && <Check className="w-3.5 h-3.5 text-[var(--ins-lamp)]" />}
                            </span>
                            <span className="text-sm flex-1 truncate">
                              {el.displayName}
                            </span>
                            {el.line > 0 && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {el.line === el.endLine ? `${el.line}` : `${el.line}-${el.endLine}`}
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

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
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
