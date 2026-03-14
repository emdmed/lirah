import React, { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { layoutGraph, edgePath, measureText, NODE_PAD_X } from "./graphLayout";
import { GraphNode, getThemeColors } from "./GraphNode";
import { useGraphInteraction } from "./useGraphInteraction";

const GROUP_PAD = 12;

export function FlowchartDialog({ open, onOpenChange, graphData }) {
  const interaction = useGraphInteraction();
  const {
    svgRef, graphGRef, containerRef,
    expandedNodes, setExpandedNodes,
    selectedNode, selectedProp, setSelectedProp,
    transform, panState,
    containerSize,
    resetState, toggleNode,
    onPanStart, onPanMove, onPanEnd, onPanLeave,
    zoomIn, zoomOut, resetZoom,
  } = interaction;

  const { groups = [], nodes = new Map(), edges = [] } = graphData || {};

  // Reset on open
  useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  const { positioned, groupRects } = useMemo(
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

      const sx = tx + (rect.x + rect.w / 2) * scale;
      const sy = ty + (rect.y + rect.h / 2) * scale;

      const margin = 20;
      if (sx >= -margin && sx <= vw + margin && sy >= -margin && sy <= vh + margin) continue;

      const offLeft = sx < -margin;
      const offRight = sx > vw + margin;
      const offTop = sy < -margin;
      const offBottom = sy > vh + margin;

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

    const LABEL_H = 22;
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) {
      const prev = labels[i - 1];
      const curr = labels[i];
      const overlap = (prev.y + LABEL_H) - curr.y;
      if (overlap > 0) {
        curr.y += overlap;
        curr.y = Math.min(curr.y, vh - PAD - 6);
      }
    }

    return labels;
  }, [connectedIds, selectedNode, positioned, nodes, transform, containerSize]);

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
          onMouseLeave={onPanLeave}
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
                      x={g.x} y={g.y} width={g.w} height={g.h} rx={6}
                      fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                    />
                    <text x={g.x + GROUP_PAD} y={g.y + 16} fill={colors.mutedText} fontSize={10} fontFamily="monospace">
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
                    <path key={i} d={edgePath(fromR, toR)} fill="none" stroke={colors.edge} strokeWidth={1.5} />
                  );
                });
              })()}

              {/* Incoming props labels */}
              {selectedNode && (() => {
                const node = nodes.get(selectedNode);
                const rect = positioned.get(selectedNode);
                if (!node || !rect || !node.propsReceived || node.propsReceived.length === 0) return null;

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
                    <text x={labelX} y={labelY + 12} fill={colors.mutedText} fontSize={8} fontFamily="monospace" fontWeight={500}>
                      incoming props
                    </text>
                    <rect
                      x={labelX} y={labelY + TITLE_H} width={boxW} height={contentH} rx={3}
                      fill={colors.propsBg} stroke={colors.propsStroke} strokeWidth={1}
                    />
                    <text x={labelX + PAD_X} y={labelY + TITLE_H + PAD_Y + LINE_H - 2} fill={colors.props} fontSize={9} fontFamily="monospace" fontWeight={500}>
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
                            onClick={(e) => { e.stopPropagation(); setSelectedProp(prev => prev === prop ? null : prop); }}
                            style={{ cursor: 'pointer' }}
                          >
                            {isSelected && (
                              <rect x={colX + PAD_X - 2} y={propY - 10} width={measureText(`  ${prop}`) + 4} height={LINE_H} rx={2} fill={`${colors.props}66`} />
                            )}
                            <text x={colX + PAD_X} y={propY} fill={isSelected ? colors.text : colors.props} fontSize={9} fontFamily="monospace" fontWeight={500}>
                              {`  ${prop}`}
                            </text>
                          </g>
                        );
                      });
                    })}
                    <text x={labelX + PAD_X} y={labelY + TITLE_H + PAD_Y + (rowCount + 2) * LINE_H - 2} fill={colors.props} fontSize={9} fontFamily="monospace" fontWeight={500}>
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
                const isHighlighted = isPropDrillingActive
                  ? propDrillingNodes.has(node.id)
                  : isConnectedActive ? connectedIds.has(node.id) : false;
                const isDimmed = isPropDrillingActive
                  ? !propDrillingNodes.has(node.id)
                  : isConnectedActive ? !connectedIds.has(node.id) : false;
                const highlightColor = isPropDrillingActive && propDrillingNodes.has(node.id)
                  ? getThemeColors().props : undefined;
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

            {/* Ghost labels for off-screen connected nodes */}
            {(() => {
              const colors = getThemeColors();
              return ghostLabels.map(gl => {
                const labelText = `${gl.arrow}${gl.name}`;
                const textW = measureText(labelText);
                const boxW = textW + 16;
                const boxH = 20;
                const boxX = gl.anchor === 'start' ? gl.x : gl.anchor === 'end' ? gl.x - boxW : gl.x - boxW / 2;
                const textX = gl.anchor === 'start' ? gl.x + 8 : gl.anchor === 'end' ? gl.x - 8 : gl.x;
                return (
                  <g key={`ghost-${gl.id}`} style={{ pointerEvents: 'none' }}>
                    <rect x={boxX} y={gl.y - boxH / 2} width={boxW} height={boxH} rx={4} fill="rgba(15,23,42,0.85)" stroke={`${colors.highlight}66`} strokeWidth={1} />
                    <text x={textX} y={gl.y + 4} textAnchor={gl.anchor} fill={colors.highlight} fontSize={11} fontFamily="monospace" fontWeight={500}>
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
            <Button variant="outline" size="sm" onClick={zoomOut}>-</Button>
            <Button variant="outline" size="sm" onClick={resetZoom}>Reset</Button>
            <Button variant="outline" size="sm" onClick={zoomIn}>+</Button>
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
