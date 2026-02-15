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

function getDetailLines(node) {
  const lines = [];
  for (const c of (node.components || [])) {
    const label = c.replace(/:\d+$/, '');
    lines.push({ label, type: 'component' });
  }
  for (const f of (node.functions || [])) {
    const label = f.replace(/:\d+$/, '');
    lines.push({ label, type: 'function' });
  }
  for (const c of (node.constants || [])) {
    lines.push({ label: c, type: 'constant' });
  }
  // Hooks last — they tend to be numerous and less important for overview
  for (const h of (node.hooks || [])) {
    const label = h.replace(/:\d+$/, '');
    lines.push({ label, type: 'hook' });
  }
  return lines;
}

function computeNodeSize(node, expanded) {
  const nameW = measureText(node.fileName) + NODE_PAD_X * 2;
  if (!expanded) {
    return { w: Math.max(NODE_MIN_W, nameW), h: NODE_H_COLLAPSED };
  }
  const details = getDetailLines(node);
  const typeTags = { component: 'COMP', function: 'FN', hook: 'HOOK', constant: 'CONST' };
  let maxW = nameW;
  for (const d of details) {
    const tag = typeTags[d.type] || '';
    const tagW = measureText(tag) + 6;
    maxW = Math.max(maxW, tagW + 4 + measureText(d.label) + NODE_PAD_X * 2);
  }
  const h = NODE_H_COLLAPSED + (details.length > 0 ? NODE_PAD_Y + details.length * NODE_LINE_H : 0);
  return { w: Math.max(NODE_MIN_W, maxW), h };
}

/**
 * Lay out groups left-to-right. Each group is a vertical column of nodes.
 * Returns positioned groups + nodes with x,y,w,h.
 */
function layoutGraph(groups, nodes, expandedSet) {
  const positioned = new Map();
  const groupRects = [];
  let cursorX = GROUP_PAD;

  for (const group of groups) {
    let maxNodeW = 0;
    const nodeSizes = [];
    for (const nid of group.nodeIds) {
      const node = nodes.get(nid);
      const size = computeNodeSize(node, expandedSet.has(nid));
      nodeSizes.push({ nid, ...size });
      maxNodeW = Math.max(maxNodeW, size.w);
    }

    const hasLabel = group.label !== null;
    const headerOffset = hasLabel ? GROUP_HEADER : 0;
    let cursorY = GROUP_PAD + headerOffset;

    for (const ns of nodeSizes) {
      positioned.set(ns.nid, {
        x: cursorX + GROUP_PAD,
        y: cursorY,
        w: maxNodeW,
        h: ns.h,
      });
      cursorY += ns.h + NODE_GAP;
    }

    const labelW = hasLabel ? measureText(group.label) + GROUP_PAD * 2 : 0;
    const groupW = Math.max(maxNodeW + GROUP_PAD * 2, labelW);
    const groupH = cursorY - NODE_GAP + GROUP_PAD;

    groupRects.push({
      ...group,
      x: cursorX,
      y: 0,
      w: groupW,
      h: groupH,
    });

    cursorX += groupW + GROUP_GAP_X;
  }

  return { positioned, groupRects, totalW: cursorX, totalH: Math.max(...groupRects.map(g => g.h), 200) };
}

function edgePath(fromRect, toRect) {
  // Determine the dominant direction between node centers
  const fromCx = fromRect.x + fromRect.w / 2;
  const fromCy = fromRect.y + fromRect.h / 2;
  const toCx = toRect.x + toRect.w / 2;
  const toCy = toRect.y + toRect.h / 2;

  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  let x1, y1, x2, y2;

  if (Math.abs(dx) >= Math.abs(dy)) {
    // Horizontal: exit right/left
    if (dx >= 0) {
      x1 = fromRect.x + fromRect.w; y1 = fromCy;
      x2 = toRect.x;               y2 = toCy;
    } else {
      x1 = fromRect.x;             y1 = fromCy;
      x2 = toRect.x + toRect.w;    y2 = toCy;
    }
    const cx = (x1 + x2) / 2;
    return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
  } else {
    // Vertical: exit bottom/top
    if (dy >= 0) {
      x1 = fromCx; y1 = fromRect.y + fromRect.h;
      x2 = toCx;   y2 = toRect.y;
    } else {
      x1 = fromCx; y1 = fromRect.y;
      x2 = toCx;   y2 = toRect.y + toRect.h;
    }
    const cy = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`;
  }
}

const TYPE_COLORS = {
  component: '#7dd3fc',
  function: '#fbbf24',
  hook: '#a78bfa',
  constant: '#94a3b8',
};

function GraphNode({ node, rect, expanded, highlighted, dimmed, onToggle }) {
  const details = expanded ? getDetailLines(node) : [];
  const opacity = dimmed ? 0.25 : 1;

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
        fill={highlighted ? 'rgba(125,211,252,0.12)' : expanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}
        stroke={highlighted ? 'rgba(125,211,252,0.5)' : expanded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'}
        strokeWidth={highlighted ? 1.5 : 1}
      />
      <text
        x={rect.x + NODE_PAD_X}
        y={rect.y + 18}
        fill={highlighted ? '#7dd3fc' : '#e2e8f0'}
        fontSize={12}
        fontFamily="monospace"
        fontWeight={expanded || highlighted ? 600 : 400}
      >
        {node.fileName}
      </text>
      {expanded && details.map((d, i) => {
        const typeTag = { component: 'COMP', function: 'FN', hook: 'HOOK', constant: 'CONST' }[d.type] || d.type;
        const color = TYPE_COLORS[d.type] || '#94a3b8';
        const tagBg = { component: 'rgba(125,211,252,0.15)', function: 'rgba(251,191,36,0.15)', hook: 'rgba(167,139,250,0.15)', constant: 'rgba(148,163,184,0.12)' }[d.type] || 'rgba(148,163,184,0.1)';
        const tagW = measureText(typeTag) + 6;
        const tagX = rect.x + NODE_PAD_X;
        const tagY = rect.y + NODE_H_COLLAPSED + NODE_PAD_Y + i * NODE_LINE_H;
        return (
          <g key={i}>
            <rect
              x={tagX}
              y={tagY - 4}
              width={tagW}
              height={13}
              rx={2}
              fill={tagBg}
            />
            <text
              x={tagX + 3}
              y={tagY + 7}
              fill={color}
              fontSize={8}
              fontFamily="monospace"
              fontWeight={600}
            >
              {typeTag}
            </text>
            <text
              x={tagX + tagW + 4}
              y={tagY + 8}
              fill={color}
              fontSize={10}
              fontFamily="monospace"
              opacity={0.85}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function FlowchartDialog({ open, onOpenChange, graphData }) {
  const svgRef = useRef(null);
  const containerElRef = useRef(null);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set());
  const [selectedNode, setSelectedNode] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const panState = useRef({ active: false, startX: 0, startY: 0, tx: 0, ty: 0 });

  const { groups = [], nodes = new Map(), edges = [] } = graphData || {};

  // Reset on open
  useEffect(() => {
    if (open) {
      setExpandedNodes(new Set());
      setSelectedNode(null);
      setTransform({ x: 40, y: 40, scale: 1 });
    }
  }, [open]);

  const toggleNode = useCallback((id) => {
    setSelectedNode(prev => prev === id ? null : id);
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  // Pan handlers
  const onPanStart = useCallback((e) => {
    if (e.target.closest('g[style]')) return; // don't pan when clicking nodes
    panState.current = { active: true, startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const onPanMove = useCallback((e) => {
    if (!panState.current.active) return;
    const ps = panState.current;
    setTransform(t => ({
      ...t,
      x: ps.tx + (e.clientX - ps.startX),
      y: ps.ty + (e.clientY - ps.startY),
    }));
  }, []);

  const onPanEnd = useCallback(() => {
    panState.current.active = false;
  }, []);

  // Wheel zoom via callback ref to ensure listener attaches after mount
  const wheelHandler = useRef(null);
  wheelHandler.current = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setTransform(t => ({ ...t, scale: Math.min(Math.max(t.scale * delta, 0.1), 5) }));
  };

  const containerRef = useCallback((el) => {
    if (containerElRef.current) {
      containerElRef.current.removeEventListener('wheel', containerElRef.current._wheelFn);
    }
    containerElRef.current = el;
    if (el) {
      const fn = (e) => wheelHandler.current(e);
      el._wheelFn = fn;
      el.addEventListener('wheel', fn, { passive: false });
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
            Click a node to expand its details. Scroll to zoom, drag to pan.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden border border-border rounded-md bg-background/50"
          style={{ cursor: panState.current.active ? 'grabbing' : 'grab' }}
          onMouseDown={onPanStart}
          onMouseMove={onPanMove}
          onMouseUp={onPanEnd}
          onMouseLeave={onPanEnd}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ display: 'block' }}
          >
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Group backgrounds */}
              {groupRects.map(g => g.label !== null && (
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
                    fill="#64748b"
                    fontSize={10}
                    fontFamily="monospace"
                  >
                    {g.label}
                  </text>
                </g>
              ))}

              {/* Edges — only when a node is selected */}
              {selectedNode && edges.map((edge, i) => {
                if (edge.from !== selectedNode && edge.to !== selectedNode) return null;
                const fromR = positioned.get(edge.from);
                const toR = positioned.get(edge.to);
                if (!fromR || !toR) return null;
                return (
                  <path
                    key={i}
                    d={edgePath(fromR, toR)}
                    fill="none"
                    stroke="rgba(148,163,184,0.4)"
                    strokeWidth={1.5}
                  />
                );
              })}

              {/* Nodes */}
              {[...nodes.values()].map(node => {
                const rect = positioned.get(node.id);
                if (!rect) return null;
                return (
                  <GraphNode
                    key={node.id}
                    node={node}
                    rect={rect}
                    expanded={expandedNodes.has(node.id)}
                    highlighted={connectedIds !== null && connectedIds.has(node.id)}
                    dimmed={connectedIds !== null && !connectedIds.has(node.id)}
                    onToggle={toggleNode}
                  />
                );
              })}
            </g>
          </svg>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 border-t border-border pt-4">
          <div className="flex gap-1 mr-auto">
            <Button variant="outline" size="sm" onClick={() => setTransform(t => ({ ...t, scale: Math.max(t.scale / 1.3, 0.1) }))}>-</Button>
            <Button variant="outline" size="sm" onClick={() => setTransform({ x: 40, y: 40, scale: 1 })}>Reset</Button>
            <Button variant="outline" size="sm" onClick={() => setTransform(t => ({ ...t, scale: Math.min(t.scale * 1.3, 5) }))}>+</Button>
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
