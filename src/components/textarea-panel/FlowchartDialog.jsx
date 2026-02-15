import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { getFlowchartColors } from "../../themes/theme-config";

// Layout constants
const NODE_H_COLLAPSED = 28;
const NODE_LINE_H = 16;
const NODE_PAD_X = 12;
const NODE_PAD_Y = 6;
const NODE_MIN_W = 100;
const GROUP_PAD = 12;
const GROUP_HEADER = 22;
const GROUP_GAP_X = 40;
const GROUP_GAP_Y = 12;
const NODE_GAP = 8;
const CHAR_W = 7.2;

function measureText(str) {
  return str.length * CHAR_W;
}

const COL_THRESHOLD = 5;

/**
 * Expand a signature like "Foo({ a, b, c, d, e, f })" into multiple labels
 * when params exceed COL_THRESHOLD: "Foo({", "  a, b,", "  c, d,", ... "})"
 * Returns array of label strings.
 */
function expandSignature(sig) {
  // Find the last top-level parenthesized group: "Name(hoc)(params)" or "Name(params)"
  // Walk backwards to find the last matching '(' for the trailing ')'
  const trimmed = sig.replace(/[*!]$/, ''); // strip export markers
  if (!trimmed.endsWith(')')) return [sig];
  let depth = 0;
  let lastOpenIdx = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === ')') depth++;
    else if (trimmed[i] === '(') { depth--; if (depth === 0) { lastOpenIdx = i; break; } }
  }
  if (lastOpenIdx <= 0) return [sig];
  const prefix = trimmed.slice(0, lastOpenIdx);
  let inner = trimmed.slice(lastOpenIdx + 1, trimmed.length - 1).trim();
  if (!inner) return [sig];
  // Unwrap destructured braces
  const hasBraces = inner.startsWith('{') && inner.endsWith('}');
  if (hasBraces) inner = inner.slice(1, -1).trim();
  const params = inner.split(',').map(p => p.trim()).filter(Boolean);
  if (params.length <= COL_THRESHOLD) return [sig];
  const open = hasBraces ? '({' : '(';
  const close = hasBraces ? '})' : ')';
  const lines = [`${prefix}${open}`];
  for (let i = 0; i < params.length; i += COL_THRESHOLD) {
    const chunk = params.slice(i, i + COL_THRESHOLD);
    const trailing = i + COL_THRESHOLD < params.length ? ',' : '';
    lines.push(`  ${chunk.join(', ')}${trailing}`);
  }
  lines.push(close);
  return lines;
}

function getDetailGroups(node) {
  const groups = [];
  const types = [
    { key: 'components', type: 'component', strip: true },
    { key: 'functions', type: 'function', strip: true },
    { key: 'constants', type: 'constant', strip: false },
    { key: 'hooks', type: 'hook', strip: true },
  ];
  for (const { key, type, strip } of types) {
    const items = node[key] || [];
    if (items.length === 0) continue;
    const labels = [];
    for (const item of items) {
      const cleaned = strip ? item.replace(/:\d+$/, '') : item;
      labels.push(...expandSignature(cleaned));
    }
    groups.push({ type, labels });
  }
  return groups;
}

/**
 * Compute layout rows from detail groups. Each group becomes one or more visual rows.
 * When a group has > COL_THRESHOLD items, items are split into columns.
 * Returns { rows: [{ type, columns: [[label,...], ...] }], totalLines, maxItemW }
 */
function computeDetailLayout(groups) {
  const typeTags = { component: 'COMP', function: 'FN', hook: 'HOOK', constant: 'CONST' };
  const rows = [];
  let totalLines = 0;
  let maxItemW = 0;

  for (const group of groups) {
    const tag = typeTags[group.type] || '';
    const tagW = measureText(tag) + 6;
    const numCols = group.labels.length > COL_THRESHOLD ? Math.ceil(group.labels.length / COL_THRESHOLD) : 1;
    const perCol = Math.ceil(group.labels.length / numCols);
    const columns = [];
    for (let c = 0; c < numCols; c++) {
      columns.push(group.labels.slice(c * perCol, (c + 1) * perCol));
    }
    // Measure widths per column
    const colWidths = columns.map(col => {
      let w = 0;
      for (const label of col) {
        w = Math.max(w, tagW + 4 + measureText(label) + NODE_PAD_X * 2);
      }
      return w;
    });
    const rowLines = Math.max(...columns.map(c => c.length));
    totalLines += rowLines;
    const totalW = colWidths.reduce((a, b) => a + b, 0) + (numCols - 1) * 8;
    maxItemW = Math.max(maxItemW, totalW);
    rows.push({ type: group.type, columns, colWidths, rowLines });
  }
  return { rows, totalLines, maxItemW };
}

function computeNodeSize(node, expanded) {
  const nameW = measureText(node.fileName) + NODE_PAD_X * 2;
  if (!expanded) {
    return { w: Math.max(NODE_MIN_W, nameW), h: NODE_H_COLLAPSED };
  }
  const groups = getDetailGroups(node);
  const { rows, totalLines, maxItemW } = computeDetailLayout(groups);
  const maxW = Math.max(nameW, maxItemW);
  const h = NODE_H_COLLAPSED + (totalLines > 0 ? NODE_PAD_Y + totalLines * NODE_LINE_H : 0);
  return { w: Math.max(NODE_MIN_W, maxW), h };
}

/**
 * Lay out groups in columns by parent directory path.
 * Groups sharing a parent dir stack vertically in the same column.
 * Different parent dirs are laid out left-to-right.
 */
function layoutGraph(groups, nodes, expandedSet) {
  const positioned = new Map();
  const groupRects = [];

  // Compute sizes for each group upfront
  const groupSizes = groups.map(group => {
    let maxNodeW = 0;
    const nodeSizes = [];
    for (const nid of group.nodeIds) {
      const node = nodes.get(nid);
      const size = computeNodeSize(node, expandedSet.has(nid));
      nodeSizes.push({ nid, ...size });
      maxNodeW = Math.max(maxNodeW, size.w);
    }
    const hasLabel = group.label !== null;
    const labelW = hasLabel ? measureText(group.label) + GROUP_PAD * 2 : 0;
    const groupW = Math.max(maxNodeW + GROUP_PAD * 2, labelW);
    const headerOffset = hasLabel ? GROUP_HEADER : 0;
    let contentH = GROUP_PAD + headerOffset;
    for (const ns of nodeSizes) {
      contentH += ns.h + NODE_GAP;
    }
    contentH = contentH - NODE_GAP + GROUP_PAD;
    return { group, nodeSizes, maxNodeW, groupW, contentH, hasLabel, headerOffset };
  });

  // Group by parent directory: extract parent from group.dir
  // e.g. "src/components/textarea-panel" -> "src/components"
  // Root groups (dir="src" or ".") get parent=""
  const columns = new Map(); // parentDir -> [groupSize entries]
  for (const gs of groupSizes) {
    const dir = gs.group.dir;
    const parts = dir.split('/');
    let parentDir;
    if (parts.length <= 1 || dir === 'src' || dir === '.') {
      parentDir = '';
    } else {
      parentDir = parts.slice(0, -1).join('/');
    }
    if (!columns.has(parentDir)) columns.set(parentDir, []);
    columns.get(parentDir).push(gs);
  }

  let cursorX = GROUP_PAD;

  for (const [, colGroups] of [...columns.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Find the widest group in this column
    const colW = Math.max(...colGroups.map(gs => gs.groupW));
    let cursorY = 0;

    for (const gs of colGroups) {
      const { group, nodeSizes, maxNodeW, contentH, hasLabel, headerOffset } = gs;
      let nodeY = cursorY + GROUP_PAD + headerOffset;

      for (const ns of nodeSizes) {
        positioned.set(ns.nid, {
          x: cursorX + GROUP_PAD,
          y: nodeY,
          w: maxNodeW,
          h: ns.h,
        });
        nodeY += ns.h + NODE_GAP;
      }

      groupRects.push({
        ...group,
        x: cursorX,
        y: cursorY,
        w: colW,
        h: contentH,
      });

      cursorY += contentH + GROUP_GAP_Y;
    }

    cursorX += colW + GROUP_GAP_X;
  }

  const maxH = groupRects.length > 0 ? Math.max(...groupRects.map(g => g.y + g.h), 200) : 200;
  return { positioned, groupRects, totalW: cursorX, totalH: maxH };
}

function edgePath(fromRect, toRect) {
  const fromCx = fromRect.x + fromRect.w / 2;
  const fromCy = fromRect.y + fromRect.h / 2;
  const toCx = toRect.x + toRect.w / 2;
  const toCy = toRect.y + toRect.h / 2;

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  let x1, y1, x2, y2;

  // If target is below, always exit from bottom and enter from top
  if (dy > 0) {
    x1 = fromCx; y1 = fromRect.y + fromRect.h;
    x2 = toCx;   y2 = toRect.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} V${my} H${x2} V${y2}`;
  }

  // If target is above, always exit from top and enter from bottom
  if (dy < 0) {
    x1 = fromCx; y1 = fromRect.y;
    x2 = toCx;   y2 = toRect.y + toRect.h;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} V${my} H${x2} V${y2}`;
  }

  // Same vertical level: exit right/left
  if (dx >= 0) {
    x1 = fromRect.x + fromRect.w; y1 = fromCy;
    x2 = toRect.x;               y2 = toCy;
  } else {
    x1 = fromRect.x;             y1 = fromCy;
    x2 = toRect.x + toRect.w;    y2 = toCy;
  }
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} H${mx} V${y2} H${x2}`;
}

// Flowchart colors from theme
const getThemeColors = () => {
  try {
    return getFlowchartColors();
  } catch (e) {
    // Fallback colors if theme not loaded
    return {
      component: '#7dd3fc',
      componentBg: 'rgba(125,211,252,0.15)',
      function: '#fbbf24',
      functionBg: 'rgba(251,191,36,0.15)',
      hook: '#a78bfa',
      hookBg: 'rgba(167,139,250,0.15)',
      constant: '#94a3b8',
      constantBg: 'rgba(148,163,184,0.12)',
      props: '#4ade80',
      propsBg: 'rgba(74,222,128,0.15)',
      propsStroke: 'rgba(74,222,128,0.4)',
      edge: 'rgba(148,163,184,0.4)',
      highlight: '#7dd3fc',
      text: '#e2e8f0',
      mutedText: '#64748b',
    };
  }
};

const TYPE_COLORS = {
  get component() { return getThemeColors().component; },
  get function() { return getThemeColors().function; },
  get hook() { return getThemeColors().hook; },
  get constant() { return getThemeColors().constant; },
  get props() { return getThemeColors().props; },
};

const TAG_BG = {
  get component() { return getThemeColors().componentBg; },
  get function() { return getThemeColors().functionBg; },
  get hook() { return getThemeColors().hookBg; },
  get constant() { return getThemeColors().constantBg; },
  get props() { return getThemeColors().propsBg; },
};

const TAG_LABELS = { component: 'COMP', function: 'FN', hook: 'HOOK', constant: 'CONST', props: 'PROPS' };

const GraphNode = React.memo(function GraphNode({ node, rect, expanded, highlighted, dimmed, onToggle, highlightColor }) {
  const opacity = dimmed ? 0.25 : 1;
  const colors = getThemeColors();
  const highlightFillColor = highlightColor || colors.highlight;

  const detailElements = [];
  if (expanded) {
    const groups = getDetailGroups(node);
    const { rows } = computeDetailLayout(groups);
    let lineOffset = 0;
    for (const row of rows) {
      const typeTag = TAG_LABELS[row.type] || row.type;
      const color = TYPE_COLORS[row.type] || '#94a3b8';
      const tagBg = TAG_BG[row.type] || 'rgba(148,163,184,0.1)';
      const tagW = measureText(typeTag) + 6;
      let colX = 0;
      for (let ci = 0; ci < row.columns.length; ci++) {
        const col = row.columns[ci];
        for (let li = 0; li < col.length; li++) {
          const itemX = rect.x + NODE_PAD_X + colX;
          const itemY = rect.y + NODE_H_COLLAPSED + NODE_PAD_Y + (lineOffset + li) * NODE_LINE_H;
          detailElements.push(
            <g key={`${row.type}-${ci}-${li}`}>
              <rect x={itemX} y={itemY - 4} width={tagW} height={13} rx={2} fill={tagBg} />
              <text x={itemX + 3} y={itemY + 7} fill={color} fontSize={8} fontFamily="monospace" fontWeight={600}>
                {typeTag}
              </text>
              <text x={itemX + tagW + 4} y={itemY + 8} fill={color} fontSize={10} fontFamily="monospace" opacity={0.85}>
                {col[li]}
              </text>
            </g>
          );
        }
        colX += row.colWidths[ci] + 8;
      }
      lineOffset += row.rowLines;
    }
  }

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
      style={{ cursor: 'pointer', opacity }}
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={4}
        fill={highlighted ? `${highlightFillColor}1E` : expanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}
        stroke={highlighted ? `${highlightFillColor}80` : expanded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'}
        strokeWidth={highlighted ? 1.5 : 1}
      />
      <text
        x={rect.x + NODE_PAD_X}
        y={rect.y + 18}
        fill={highlighted ? highlightFillColor : colors.text}
        fontSize={12}
        fontFamily="monospace"
        fontWeight={expanded || highlighted ? 600 : 400}
      >
        {node.fileName}
      </text>
      {detailElements}
    </g>
  );
});

export function FlowchartDialog({ open, onOpenChange, graphData }) {
  const svgRef = useRef(null);
  const containerElRef = useRef(null);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedProp, setSelectedProp] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const panState = useRef({ active: false, startX: 0, startY: 0, tx: 0, ty: 0 });
  const graphGRef = useRef(null);

  const { groups = [], nodes = new Map(), edges = [] } = graphData || {};

  // Reset on open
  useEffect(() => {
    if (open) {
      setExpandedNodes(new Set());
      setSelectedNode(null);
      setSelectedProp(null);
      const t = { x: 40, y: 40, scale: 1 };
      transformRef.current = t;
      setTransform(t);
    }
  }, [open]);

  const toggleNode = useCallback((id) => {
    setSelectedNode(prev => prev === id ? null : id);
    setSelectedProp(null); // Clear prop selection when switching nodes
    setExpandedNodes(prev => {
      // If clicking the same node, collapse it
      if (prev.has(id)) {
        return new Set();
      }
      // Otherwise, expand only the clicked node (collapse others)
      return new Set([id]);
    });
  }, []);

  const { positioned, groupRects, totalW, totalH } = useMemo(
    () => layoutGraph(groups, nodes, expandedNodes),
    [groups, nodes, expandedNodes]
  );

  const connectedIds = useMemo(() => {
    if (!selectedNode) return null;
    const set = new Set([selectedNode]);
    for (const e of edges) {
      if (e.from === selectedNode) set.add(e.to);
      if (e.to === selectedNode) set.add(e.from);
    }
    return set;
  }, [selectedNode, edges]);

  // Find all nodes that receive the selected prop (for prop drilling detection)
  const propDrillingNodes = useMemo(() => {
    if (!selectedProp) return null;
    const set = new Set();
    for (const [id, node] of nodes) {
      if (node.propsReceived && node.propsReceived.includes(selectedProp)) {
        set.add(id);
      }
    }
    return set;
  }, [selectedProp, nodes]);

  // Ghost labels for off-screen connected nodes
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const resizeObserverRef = useRef(null);

  const ghostLabels = useMemo(() => {
    if (!connectedIds || !selectedNode || containerSize.w === 0) return [];
    const { x: tx, y: ty, scale } = transform;
    const vw = containerSize.w;
    const vh = containerSize.h;
    const PAD = 8;
    const labels = [];

    for (const id of connectedIds) {
      if (id === selectedNode) continue;
      const rect = positioned.get(id);
      if (!rect) continue;
      const node = nodes.get(id);
      if (!node) continue;

      // Node center in screen space
      const sx = tx + (rect.x + rect.w / 2) * scale;
      const sy = ty + (rect.y + rect.h / 2) * scale;

      // Check if visible (with some margin)
      const margin = 20;
      if (sx >= -margin && sx <= vw + margin && sy >= -margin && sy <= vh + margin) continue;

      // Determine which edge(s) the node is beyond
      const offLeft = sx < -margin;
      const offRight = sx > vw + margin;
      const offTop = sy < -margin;
      const offBottom = sy > vh + margin;

      // Position: snap to edge, clamp the other axis
      let lx, ly, anchor, arrow;
      if (offLeft && !offTop && !offBottom) {
        lx = PAD; ly = Math.max(PAD + 10, Math.min(vh - PAD - 10, sy)); anchor = 'start'; arrow = '← ';
      } else if (offRight && !offTop && !offBottom) {
        lx = vw - PAD; ly = Math.max(PAD + 10, Math.min(vh - PAD - 10, sy)); anchor = 'end'; arrow = '→ ';
      } else if (offTop && !offLeft && !offRight) {
        lx = Math.max(PAD + 40, Math.min(vw - PAD - 40, sx)); ly = PAD + 10; anchor = 'middle'; arrow = '↑ ';
      } else if (offBottom && !offLeft && !offRight) {
        lx = Math.max(PAD + 40, Math.min(vw - PAD - 40, sx)); ly = vh - PAD - 6; anchor = 'middle'; arrow = '↓ ';
      } else if (offLeft && offTop) {
        lx = PAD; ly = PAD + 10; anchor = 'start'; arrow = '↖ ';
      } else if (offRight && offTop) {
        lx = vw - PAD; ly = PAD + 10; anchor = 'end'; arrow = '↗ ';
      } else if (offLeft && offBottom) {
        lx = PAD; ly = vh - PAD - 6; anchor = 'start'; arrow = '↙ ';
      } else if (offRight && offBottom) {
        lx = vw - PAD; ly = vh - PAD - 6; anchor = 'end'; arrow = '↘ ';
      } else {
        continue;
      }

      labels.push({ id, name: node.fileName, x: lx, y: ly, anchor, arrow });
    }

    // De-overlap: spread labels that are too close together
    const LABEL_H = 22;
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1];
      const curr = labels[i];
      const overlap = (prev.y + LABEL_H) - curr.y;
      if (overlap > 0) {
        curr.y += overlap;
        // Clamp within viewport
        curr.y = Math.min(curr.y, vh - PAD - 6);
      }
    }

    return labels;
  }, [connectedIds, selectedNode, positioned, nodes, transform, containerSize]);

  // Apply transform directly to DOM for smooth pan/zoom without React re-renders
  const applyTransform = useCallback((t) => {
    transformRef.current = t;
    if (graphGRef.current) {
      graphGRef.current.setAttribute('transform', `translate(${t.x},${t.y}) scale(${t.scale})`);
    }
  }, []);

  // Sync React state from ref (for ghost labels etc.)
  const syncTransformState = useCallback(() => {
    setTransform({ ...transformRef.current });
  }, []);

  // Pan handlers — middle mouse button only, always pans even over nodes
  const onPanStart = useCallback((e) => {
    if (e.button !== 1) return; // middle button only
    e.preventDefault();
    panState.current = { active: true, startX: e.clientX, startY: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y };
  }, []);

  const onPanMove = useCallback((e) => {
    if (!panState.current.active) return;
    const ps = panState.current;
    applyTransform({
      ...transformRef.current,
      x: ps.tx + (e.clientX - ps.startX),
      y: ps.ty + (e.clientY - ps.startY),
    });
  }, [applyTransform]);

  const onPanEnd = useCallback((e) => {
    if (e.button !== 1) return;
    panState.current.active = false;
    syncTransformState();
  }, [syncTransformState]);

  // Wheel zoom via callback ref to ensure listener attaches after mount
  const wheelHandler = useRef(null);
  wheelHandler.current = (e) => {
    e.preventDefault();
    const t = transformRef.current;
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newScale = Math.min(Math.max(t.scale * delta, 0.1), 5);
    applyTransform({ ...t, scale: newScale });
    syncTransformState();
  };

  const containerRef = useCallback((el) => {
    if (containerElRef.current) {
      containerElRef.current.removeEventListener('wheel', containerElRef.current._wheelFn);
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    containerElRef.current = el;
    if (el) {
      const fn = (e) => wheelHandler.current(e);
      el._wheelFn = fn;
      el.addEventListener('wheel', fn, { passive: false });
      const ro = new ResizeObserver(([entry]) => {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      });
      ro.observe(el);
      resizeObserverRef.current = ro;
    }
  }, []);

  if (!graphData || nodes.size === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-none !w-screen !h-screen !max-h-screen flex flex-col !rounded-none">
          <DialogHeader>
            <DialogTitle>Project Flowchart</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No data to display
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none !w-screen !h-screen !max-h-screen flex flex-col !rounded-none">
        <DialogHeader>
          <DialogTitle>Project Flowchart</DialogTitle>
          <DialogDescription>
            Click a node to expand its details. Scroll to zoom, middle-click drag to pan.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden border border-border rounded-md bg-background/50"
          style={{ cursor: panState.current.active ? 'grabbing' : 'default' }}
          onMouseDown={onPanStart}
          onMouseMove={onPanMove}
          onMouseUp={onPanEnd}
          onMouseLeave={() => { if (panState.current.active) { panState.current.active = false; syncTransformState(); } }}
          onAuxClick={(e) => e.preventDefault()}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ display: 'block' }}
          >
            <g ref={graphGRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Group backgrounds */}
              {(() => {
                const colors = getThemeColors();
                return groupRects.map(g => g.label !== null && (
                  <g key={g.dir}>
                    <rect
                      x={g.x}
                      y={g.y}
                      width={g.w}
                      height={g.h}
                      rx={6}
                      fill="rgba(255,255,255,0.02)"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth={1}
                    />
                    <text
                      x={g.x + GROUP_PAD}
                      y={g.y + 16}
                      fill={colors.mutedText}
                      fontSize={10}
                      fontFamily="monospace"
                    >
                      {g.label}
                    </text>
                  </g>
                ));
              })()}

              {/* Edges — only when a node is selected */}
              {selectedNode && (() => {
                const colors = getThemeColors();
                return edges.map((edge, i) => {
                  if (edge.from !== selectedNode && edge.to !== selectedNode) return null;
                  const fromR = positioned.get(edge.from);
                  const toR = positioned.get(edge.to);
                  if (!fromR || !toR) return null;
                  
                  return (
                    <path
                      key={i}
                      d={edgePath(fromR, toR)}
                      fill="none"
                      stroke={colors.edge}
                      strokeWidth={1.5}
                    />
                  );
                });
              })()}

              {/* Incoming props labels - to the left of selected node */}
              {selectedNode && (() => {
                const node = nodes.get(selectedNode);
                const rect = positioned.get(selectedNode);
                if (!node || !rect) return null;
                if (!node.propsReceived || node.propsReceived.length === 0) return null;

                const colors = getThemeColors();
                const LINE_H = 14;
                const PAD_X = 8;
                const PAD_Y = 6;
                const TITLE_H = 18;
                const PROPS_COL_THRESHOLD = 5;
                const COL_GAP = 12;

                const props = node.propsReceived;
                const numCols = props.length > PROPS_COL_THRESHOLD ? Math.ceil(props.length / PROPS_COL_THRESHOLD) : 1;
                const perCol = Math.ceil(props.length / numCols);
                const columns = [];
                for (let c = 0; c < numCols; c++) {
                  columns.push(props.slice(c * perCol, (c + 1) * perCol));
                }

                // Measure width per column
                const colWidths = columns.map(col => {
                  let w = 0;
                  for (const prop of col) {
                    w = Math.max(w, measureText(`  ${prop}`));
                  }
                  return w + PAD_X * 2;
                });
                const braceW = measureText('{') + PAD_X * 2;
                const totalColW = colWidths.reduce((a, b) => a + b, 0) + (numCols - 1) * COL_GAP;
                const boxW = Math.max(braceW, totalColW);
                const rowCount = Math.max(...columns.map(c => c.length));
                const contentH = PAD_Y * 2 + (rowCount + 2) * LINE_H;
                const boxH = contentH + TITLE_H;
                const labelX = rect.x - boxW - 16;
                const labelY = rect.y + (rect.h - boxH) / 2;

                return (
                  <g key="incoming-props">
                    <text
                      x={labelX}
                      y={labelY + 12}
                      fill={colors.mutedText}
                      fontSize={8}
                      fontFamily="monospace"
                      fontWeight={500}
                    >
                      incoming props
                    </text>
                    <rect
                      x={labelX}
                      y={labelY + TITLE_H}
                      width={boxW}
                      height={contentH}
                      rx={3}
                      fill={colors.propsBg}
                      stroke={colors.propsStroke}
                      strokeWidth={1}
                    />
                    <text
                      x={labelX + PAD_X}
                      y={labelY + TITLE_H + PAD_Y + LINE_H - 2}
                      fill={colors.props}
                      fontSize={9}
                      fontFamily="monospace"
                      fontWeight={500}
                    >
                      {'{'}
                    </text>
                    {columns.map((col, ci) => {
                      const colX = labelX + colWidths.slice(0, ci).reduce((a, b) => a + b, 0) + ci * COL_GAP;
                      return col.map((prop, li) => {
                        const isSelected = selectedProp === prop;
                        const propY = labelY + TITLE_H + PAD_Y + (li + 2) * LINE_H - 2;
                        return (
                          <g
                            key={`${ci}-${li}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProp(prev => prev === prop ? null : prop);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {isSelected && (
                              <rect
                                x={colX + PAD_X - 2}
                                y={propY - 10}
                                width={measureText(`  ${prop}`) + 4}
                                height={LINE_H}
                                rx={2}
                                fill={`${colors.props}66`}
                              />
                            )}
                            <text
                              x={colX + PAD_X}
                              y={propY}
                              fill={isSelected ? colors.text : colors.props}
                              fontSize={9}
                              fontFamily="monospace"
                              fontWeight={500}
                            >
                              {`  ${prop}`}
                            </text>
                          </g>
                        );
                      });
                    })}
                    <text
                      x={labelX + PAD_X}
                      y={labelY + TITLE_H + PAD_Y + (rowCount + 2) * LINE_H - 2}
                      fill={colors.props}
                      fontSize={9}
                      fontFamily="monospace"
                      fontWeight={500}
                    >
                      {'}'}
                    </text>
                  </g>
                );
              })()}

              {/* Nodes */}
              {[...nodes.values()].map(node => {
                const rect = positioned.get(node.id);
                if (!rect) return null;
                const isPropDrillingActive = propDrillingNodes !== null;
                const isConnectedActive = connectedIds !== null;
                // Highlight if node receives the selected prop (prop drilling mode)
                // OR if node is connected (connected mode)
                const isHighlighted = isPropDrillingActive
                  ? propDrillingNodes.has(node.id)
                  : isConnectedActive
                    ? connectedIds.has(node.id)
                    : false;
                // Dim if filtering is active and node doesn't match
                const isDimmed = isPropDrillingActive
                  ? !propDrillingNodes.has(node.id)
                  : isConnectedActive
                    ? !connectedIds.has(node.id)
                    : false;
                // Use prop color for highlighting when prop drilling
                const highlightColor = isPropDrillingActive && propDrillingNodes.has(node.id)
                  ? getThemeColors().props
                  : undefined;
                return (
                  <GraphNode
                    key={node.id}
                    node={node}
                    rect={rect}
                    expanded={expandedNodes.has(node.id)}
                    highlighted={isHighlighted}
                    dimmed={isDimmed}
                    onToggle={toggleNode}
                    highlightColor={highlightColor}
                  />
                );
              })}
            </g>

            {/* Ghost labels for off-screen connected nodes (screen-space) */}
            {(() => {
              const colors = getThemeColors();
              return ghostLabels.map(gl => {
                const labelText = `${gl.arrow}${gl.name}`;
                const textW = measureText(labelText);
                const boxW = textW + 16;
                const boxH = 20;
                // Compute box x based on text anchor
                const boxX = gl.anchor === 'start' ? gl.x
                  : gl.anchor === 'end' ? gl.x - boxW
                  : gl.x - boxW / 2;
                const textX = gl.anchor === 'start' ? gl.x + 8
                  : gl.anchor === 'end' ? gl.x - 8
                  : gl.x;
                return (
                  <g key={`ghost-${gl.id}`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={boxX}
                      y={gl.y - boxH / 2}
                      width={boxW}
                      height={boxH}
                      rx={4}
                      fill="rgba(15,23,42,0.85)"
                      stroke={`${colors.highlight}66`}
                      strokeWidth={1}
                    />
                    <text
                      x={textX}
                      y={gl.y + 4}
                      textAnchor={gl.anchor}
                      fill={colors.highlight}
                      fontSize={11}
                      fontFamily="monospace"
                      fontWeight={500}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              });
            })()}
          </svg>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 border-t border-border pt-4">
          <div className="flex gap-1 mr-auto">
            <Button variant="outline" size="sm" onClick={() => { const t = transformRef.current; const n = { ...t, scale: Math.max(t.scale / 1.3, 0.1) }; applyTransform(n); syncTransformState(); }}>-</Button>
            <Button variant="outline" size="sm" onClick={() => { const n = { x: 40, y: 40, scale: 1 }; applyTransform(n); syncTransformState(); }}>Reset</Button>
            <Button variant="outline" size="sm" onClick={() => { const t = transformRef.current; const n = { ...t, scale: Math.min(t.scale * 1.3, 5) }; applyTransform(n); syncTransformState(); }}>+</Button>
          </div>
          <Button variant="outline" onClick={() => {
            const all = expandedNodes.size > 0 ? new Set() : new Set([...nodes.keys()]);
            setExpandedNodes(all);
          }}>
            {expandedNodes.size > 0 ? 'Collapse All' : 'Expand All'}
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
