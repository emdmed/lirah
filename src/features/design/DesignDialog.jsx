import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  History,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useDesignViewport } from './useDesignViewport';
import { layoutDesign, BODY_CHAR_W } from './designLayout';
import { CHANGE_STYLE, DesignNode, changeOf, getDesignColors, kindColor } from './DesignNode';
import { DesignPanel } from './DesignPanel';
import { DesignActivity } from './DesignActivity';
import { DesignAskBar } from './DesignAskBar';
import { DesignSourcePicker } from './DesignSourcePicker';
import { iconForLayer } from './designIcons';
import { buildAskPrompt, filesOfSelection } from './designAsk';

/** Above this many edges, contract labels are only drawn for the selected node. */
const LABEL_ALL_EDGES_BELOW = 9;

const EMPTY_ARRAY = [];
const EMPTY_MAP = new Map();
const EMPTY_SELECTION = { ids: EMPTY_ARRAY, primary: null };

/** Clip a contract label to something that fits above an arrow. */
function clipLabel(text, max = 46) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function DesignDialog({
  open,
  onOpenChange,
  extraction,
  projectPath,
  onOpenFile,
  onAsk,
}) {
  const { status, statusLabel, isRunning, error, spec, warnings, source } = extraction;

  const {
    svgRef, graphGRef, containerRef,
    transform, panning, containerSize,
    zoomIn, zoomOut, resetZoom, fitTo, consumeDrag,
  } = useDesignViewport();

  /**
   * `ids` is every clicked part in click order — one question can be about
   * several — and `primary` is the last one clicked, whose detail the side
   * panel shows. They move together, so they are one piece of state.
   */
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const selectedIds = selection.ids;
  const primaryId = selection.primary;
  const [hiddenLayers, setHiddenLayers] = useState(() => new Set());
  /** null = show every change class; otherwise only these are kept in focus. */
  const [changeFocus, setChangeFocus] = useState(null);
  const [showWarnings, setShowWarnings] = useState(false);
  /**
   * The summary is a paragraph, and a paragraph at the top of a diagram costs
   * the diagram a fifth of the screen. It stays folded until asked for.
   */
  const [showSummary, setShowSummary] = useState(false);
  /** The ask drawer is opened deliberately, not by merely clicking a box. */
  const [askOpen, setAskOpen] = useState(false);
  const [storedRun, setStoredRun] = useState(false);
  /**
   * What the last Generate was asked to cover. Held here so "Try again" and
   * "Regenerate" repeat that choice instead of silently falling back to the
   * conversation — a branch diagram that regenerates as a conversation diagram
   * reads as the feature being broken.
   */
  const [lastSource, setLastSource] = useState({ sourceKind: 'conversation', baseRef: null });

  // Offer a previous run only when one is actually on disk.
  // Depend on the stable callback, NOT on `extraction`: the hook returns a fresh
  // object every render, so depending on it re-ran this effect — and its two IPC
  // calls — on every single render.
  const { probeStoredRun } = extraction;
  useEffect(() => {
    if (!open || spec || isRunning) return;
    let live = true;
    probeStoredRun({ projectPath }).then((found) => {
      if (live) setStoredRun(found);
    });
    return () => { live = false; };
  }, [open, spec, isRunning, projectPath, probeStoredRun]);

  // A fresh spec invalidates any selection and viewport from the previous one.
  useEffect(() => {
    if (spec) {
      setSelection(EMPTY_SELECTION);
      setHiddenLayers(new Set());
      setChangeFocus(null);
      setShowWarnings(true);
      setShowSummary(false);
      setAskOpen(false);
    }
  }, [spec]);

  const colors = getDesignColors();
  // Stable identities: `spec?.layers || []` would mint a new array (and a new
  // Map) on every render, so the layout memo below would never hit its cache.
  const layers = spec?.layers || EMPTY_ARRAY;
  const nodes = spec?.nodes || EMPTY_MAP;
  const edges = spec?.edges || EMPTY_ARRAY;
  const concerns = spec?.concerns || EMPTY_ARRAY;

  const { positioned, bandRects, measured, routes, totalW, totalH } = useMemo(
    () => layoutDesign(layers, nodes, edges, hiddenLayers),
    [layers, nodes, edges, hiddenLayers]
  );

  // Frame the whole diagram whenever its extent changes — a new spec, a hidden
  // layer, or the dialog finally getting a size. Without this a wide diagram
  // opens scrolled into its top-left corner.
  const fitKey = `${totalW}x${totalH}`;
  useEffect(() => {
    if (!spec || !containerSize.w) return;
    fitTo(totalW, totalH);
  }, [spec, fitKey, containerSize.w, containerSize.h, fitTo, totalW, totalH]);

  const fitView = useCallback(() => fitTo(totalW, totalH), [fitTo, totalW, totalH]);

  // One icon per layer, keyed by layer id so the band header and the footer's
  // show/hide button can never disagree about what a layer looks like. Built
  // from every declared layer, not just the visible bands — hiding a layer must
  // not change its button.
  const layerIcons = useMemo(() => {
    const byLayer = new Map();
    for (const node of nodes.values()) {
      if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
      byLayer.get(node.layer).push(node);
    }
    return new Map(
      layers.map((layer) => [layer.id, iconForLayer(layer.label, byLayer.get(layer.id) || [])])
    );
  }, [layers, nodes]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const connectedIds = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const set = new Set(selectedIds);
    for (const edge of edges) {
      if (selectedSet.has(edge.from)) set.add(edge.to);
      if (selectedSet.has(edge.to)) set.add(edge.from);
    }
    return set;
  }, [selectedIds, selectedSet, edges]);

  // A click that ended a pan gesture must not also toggle a node.
  const selectNode = useCallback(
    (id, event) => {
      if (consumeDrag()) return;
      const additive = !!event && (event.ctrlKey || event.metaKey || event.shiftKey);
      setSelection(({ ids }) => {
        const next = additive
          ? ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [...ids, id]
          : // Plain click on the only selected part clears it; anything else
            // collapses the selection down to what was just clicked.
            ids.length === 1 && ids[0] === id
            ? []
            : [id];
        return { ids: next, primary: next.includes(id) ? id : (next[next.length - 1] ?? null) };
      });
    },
    [consumeDrag]
  );

  const deselectNode = useCallback((id) => {
    setSelection(({ ids, primary }) => {
      const next = ids.filter((x) => x !== id);
      return { ids: next, primary: primary === id ? (next[next.length - 1] ?? null) : primary };
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(EMPTY_SELECTION), []);

  // What this work did to the system, counted per class — the legend doubles as
  // the filter, so these numbers and the focus state come from the same place.
  const changeCounts = useMemo(() => {
    const counts = { added: 0, modified: 0, untouched: 0 };
    for (const node of nodes.values()) counts[changeOf(node)] += 1;
    return counts;
  }, [nodes]);

  const fadedIds = useMemo(() => {
    if (!changeFocus) return null;
    const set = new Set();
    for (const node of nodes.values()) {
      if (!changeFocus.has(changeOf(node))) set.add(node.id);
    }
    return set;
  }, [changeFocus, nodes]);

  const toggleChange = useCallback((cls) => {
    setChangeFocus((prev) => {
      // First click focuses just that class; further clicks add or drop others.
      if (!prev) return new Set([cls]);
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      // Everything or nothing selected both mean "no filter".
      if (next.size === 0 || next.size === Object.keys(CHANGE_STYLE).length) return null;
      return next;
    });
  }, []);

  const toggleLayer = useCallback((id) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Start a run for an explicitly chosen source, and remember the choice. */
  const handleGenerate = useCallback(
    ({ sourceKind, baseRef }) => {
      setLastSource({ sourceKind, baseRef });
      return extraction.generate({ projectPath, sourceKind, baseRef });
    },
    [extraction, projectPath]
  );

  /** Re-run whatever the last choice was. */
  const handleRegenerate = useCallback(
    () => extraction.generate({ projectPath, ...lastSource }),
    [extraction, projectPath, lastSource]
  );

  // Highlighted edges are drawn last so they sit above the dimmed ones —
  // SVG has no z-index, only document order.
  const orderedRoutes = useMemo(() => {
    if (selectedIds.length === 0) return routes;
    const hot = (r) => selectedSet.has(r.edge.from) || selectedSet.has(r.edge.to);
    return [...routes].sort((a, b) => Number(hot(a)) - Number(hot(b)));
  }, [routes, selectedIds, selectedSet]);

  const labelAllEdges = edges.length < LABEL_ALL_EDGES_BELOW;
  const selected = primaryId ? nodes.get(primaryId) : null;

  // Click order is what the reader built up, so the ask bar and the composed
  // prompt list the parts in that order rather than in layout order.
  const selectedNodes = useMemo(
    () => selectedIds.map((id) => nodes.get(id)).filter(Boolean),
    [selectedIds, nodes]
  );

  const attachableFiles = useMemo(() => filesOfSelection(selectedNodes), [selectedNodes]);

  const handleAsk = useCallback(
    (question, { attachFiles }) => {
      if (!spec || selectedNodes.length === 0) return;
      const prompt = buildAskPrompt({ selected: selectedNodes, question, spec });
      onAsk?.(prompt, { files: attachFiles ? attachableFiles : [] });
      onOpenChange(false);
    },
    [spec, selectedNodes, attachableFiles, onAsk, onOpenChange]
  );

  // ---- overlay states -------------------------------------------------------

  const overlay = (() => {
    if (isRunning) {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          <DesignActivity
            eventLog={extraction.eventLog}
            startedAt={extraction.startedAt}
            running
            logPath={extraction.logPath}
            statusLabel={statusLabel}
          />
          <div className="flex items-center justify-center gap-3 pb-2">
            <span className="text-[10px] text-muted-foreground max-w-[70ch]">
              Closing this dialog does not cancel the run — the diagram will be here when you reopen it.
            </span>
            <Button variant="outline" size="sm" onClick={extraction.cancel}>
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    if (status === 'error') {
      const hasActivity = extraction.eventLog.getSnapshot().events.length > 0;
      return (
        <div className="flex-1 flex flex-col min-h-0 gap-3 px-8 py-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <div className="font-mono text-sm">Could not build the diagram</div>
            <div className="text-xs text-muted-foreground max-w-[80ch] break-words">{error}</div>
          </div>
          {/* The activity log is the whole point after a failure — keep it visible. */}
          {hasActivity && (
            <DesignActivity
              eventLog={extraction.eventLog}
              startedAt={extraction.startedAt}
              running={false}
              logPath={extraction.logPath}
              statusLabel="What the extractor did"
            />
          )}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRegenerate}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try again
            </Button>
            {/* The failure is often the source itself — an empty session, a
                branch with no base — so the way back to the picker matters more
                here than a bare retry. */}
            <Button variant="outline" size="sm" onClick={extraction.reset}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Choose another source
            </Button>
            {storedRun && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => extraction.loadLastRun({ projectPath })}
              >
                <History className="w-3.5 h-3.5 mr-1.5" /> Load last run
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (!spec) {
      return (
        <DesignSourcePicker
          projectPath={projectPath}
          probeConversationSource={extraction.probeConversationSource}
          probeBranchSource={extraction.probeBranchSource}
          listBaseChoices={extraction.listBaseChoices}
          onGenerate={handleGenerate}
          storedRun={storedRun}
          onLoadLastRun={() => extraction.loadLastRun({ projectPath })}
        />
      );
    }
    return null;
  })();

  // ---- diagram --------------------------------------------------------------

  const diagram = (
    <div className="flex-1 flex min-h-0">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden border border-sketch rounded-none bg-background/50 select-none"
        style={{ cursor: panning ? 'grabbing' : 'grab' }}
        onClick={() => {
          if (!consumeDrag()) clearSelection();
        }}
        onDoubleClick={fitView}
        onAuxClick={(e) => e.preventDefault()}
      >
        <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
          <defs>
            <marker id="design-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={colors.edge} />
            </marker>
            <marker
              id="design-arrow-hot"
              viewBox="0 0 8 8"
              refX={7}
              refY={4}
              markerWidth={6}
              markerHeight={6}
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill={colors.highlight} />
            </marker>
          </defs>

          <g ref={graphGRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {/* Layer bands */}
            {bandRects.map((band) => {
              // A band is a row of the diagram, and rows are scanned, not read —
              // it gets the same icon treatment as the boxes inside it.
              const BandIcon = layerIcons.get(band.id);
              return (
                <g key={band.id}>
                  <rect
                    x={band.x}
                    y={band.y}
                    width={band.w}
                    height={band.h}
                    rx={6}
                    fill="rgba(255,255,255,0.02)"
                    stroke="rgba(255,255,255,0.06)"
                  />
                  {BandIcon && (
                    <BandIcon
                      x={band.x + 14}
                      y={band.y + 4}
                      width={11}
                      height={11}
                      stroke={colors.mutedText}
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={band.x + (BandIcon ? 29 : 14)}
                    y={band.y + 14}
                    fill={colors.mutedText}
                    fontSize={10}
                    fontFamily="monospace"
                  >
                    {band.label}
                  </text>
                </g>
              );
            })}

            {/* Edges — the union of every flow's steps, routed through the
                channels between bands so nothing crosses a box */}
            {orderedRoutes.map(({ key, edge, path, labelX, labelY }) => {
              const isHot = selectedSet.has(edge.from) || selectedSet.has(edge.to);
              // An arrow is only interesting while filtering if it still has an
              // end the reader is looking at.
              const filteredOut =
                fadedIds && fadedIds.has(edge.from) && fadedIds.has(edge.to);
              const dimmed = (selectedIds.length > 0 && !isHot) || filteredOut;
              const label = edge.contracts[0];
              const showLabel =
                !!label && (isHot || (labelAllEdges && selectedIds.length === 0));
              const text = showLabel ? clipLabel(label) : null;

              return (
                <g key={key} opacity={dimmed ? 0.12 : 1} style={{ pointerEvents: 'none' }}>
                  <path
                    d={path}
                    fill="none"
                    stroke={isHot ? colors.highlight : colors.edge}
                    strokeWidth={isHot ? 1.6 : 1.1}
                    markerEnd={isHot ? 'url(#design-arrow-hot)' : 'url(#design-arrow)'}
                  />
                  {text && (
                    <>
                      <rect
                        x={labelX - (text.length * BODY_CHAR_W) / 2 - 4}
                        y={labelY - 11}
                        width={text.length * BODY_CHAR_W + 8}
                        height={13}
                        rx={2}
                        fill="rgba(15,23,42,0.88)"
                      />
                      <text
                        x={labelX}
                        y={labelY - 1}
                        textAnchor="middle"
                        fill={isHot ? colors.highlight : colors.mutedText}
                        fontSize={9}
                        fontFamily="monospace"
                      >
                        {text}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {[...nodes.values()].map((node) => {
              const rect = positioned.get(node.id);
              if (!rect) return null;
              const m = measured.get(node.id);
              return (
                <DesignNode
                  key={node.id}
                  node={node}
                  rect={rect}
                  lines={m?.lines || []}
                  hasFooter={m?.hasFooter}
                  selected={selectedSet.has(node.id)}
                  primary={primaryId === node.id}
                  connected={!!connectedIds && connectedIds.has(node.id) && !selectedSet.has(node.id)}
                  dimmed={!!connectedIds && !connectedIds.has(node.id)}
                  faded={!!fadedIds && fadedIds.has(node.id)}
                  onSelect={selectNode}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {selected && (
        <DesignPanel
          node={selected}
          edges={edges}
          nodes={nodes}
          concerns={concerns}
          onSelectNode={(id) => selectNode(id)}
          onClose={() => deselectNode(primaryId)}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );

  // The diagram is only useful if you can keep talking about what you clicked —
  // this is the way back into the conversation.
  const askBar = onAsk && !overlay && (
    <DesignAskBar
      selected={selectedNodes}
      onDeselect={deselectNode}
      onClear={clearSelection}
      onAsk={handleAsk}
      attachFileCount={attachableFiles.length}
      open={askOpen}
      onOpenChange={setAskOpen}
    />
  );

  // ---- chrome ---------------------------------------------------------------

  const statusCounts = spec
    ? `${nodes.size} nodes · ${layers.length} layers · ${edges.length} arrows · ${spec.flows.length} flows`
    : '';

  const proposedCount = spec ? [...nodes.values()].filter((n) => n.status === 'proposed').length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-none !w-screen !h-screen !max-h-screen flex flex-col !rounded-none gap-2">
        <DialogHeader className="pr-8 gap-1">
          <DialogTitle className="font-mono text-base flex items-center gap-2">
            <span>{spec ? spec.title : 'Design View'}</span>
            {spec?.summary && (
              <button
                type="button"
                onClick={() => setShowSummary((v) => !v)}
                title={showSummary ? 'Hide the summary' : 'Show the summary'}
                className="flex items-center gap-0.5 font-mono text-[10px] font-normal text-muted-foreground border border-border/60 px-1 py-0.5 hover:text-foreground hover:border-border"
              >
                {showSummary ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                summary
              </button>
            )}
          </DialogTitle>
          {/* Always rendered for the dialog's accessible description, but only
              laid out when the reader asks for it. */}
          <DialogDescription className={spec && !showSummary ? 'sr-only' : 'text-xs'}>
            {spec ? (
              <span className="block max-w-[110ch]">{spec.summary}</span>
            ) : (
              'Turn a conversation into a system-design diagram.'
            )}
          </DialogDescription>
          {/* Which source produced this diagram is not a detail: it decides what
              the diagram can and cannot know, so it stays on screen. */}
          {spec && source && (
            <div className="font-mono text-[10px] text-muted-foreground truncate">
              {source.kind === 'branch' ? (
                <>
                  from branch {source.branch} vs {source.base} ({source.baseSha}) ·{' '}
                  {source.commitCount} commits · {source.fileCount} files
                  {source.dirtyCount ? ` · ${source.dirtyCount} uncommitted` : ''}
                </>
              ) : (
                <>
                  from session {source.sessionId.slice(0, 8)} · {source.messageCount} messages ·{' '}
                  {source.firstPrompt.slice(0, 80)}
                </>
              )}
            </div>
          )}
        </DialogHeader>

        {warnings.length > 0 && showWarnings && (
          <div className="border border-amber-500/40 bg-amber-500/5 rounded-none px-3 py-2 text-xs space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="text-amber-500/90">
                    · {w}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowWarnings(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* The drawer floats over the canvas, so it shares this box with it
            instead of taking a row of its own. */}
        <div className="relative flex-1 flex min-h-0">
          {overlay || diagram}
          {askBar}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-2 flex-wrap">
          {spec && (
            <>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={zoomOut} title="Zoom out">
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="font-mono text-[10px] text-muted-foreground w-9 text-center">
                  {Math.round(transform.scale * 100)}%
                </span>
                <Button variant="outline" size="sm" onClick={zoomIn} title="Zoom in">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={fitView} title="Fit diagram (double-click the canvas)">
                  <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> Fit
                </Button>
                <Button variant="outline" size="sm" onClick={resetZoom} title="Back to 100%">
                  100%
                </Button>
              </div>

              {/* Legend and filter in one control: what this work did to the
                  system, and a click to look at only that. */}
              <div className="flex items-center gap-1">
                {['added', 'modified', 'untouched'].map((cls) => {
                  const { color, glyph, label } = CHANGE_STYLE[cls];
                  const active = !changeFocus || changeFocus.has(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleChange(cls)}
                      title={
                        changeFocus && changeFocus.has(cls)
                          ? `Stop focusing ${label}`
                          : `Show only ${label}`
                      }
                      className={`flex items-center gap-1.5 font-mono text-[10px] px-1.5 py-0.5 border rounded-none ${
                        active ? 'border-border' : 'border-border/40 opacity-40'
                      }`}
                      style={{ color: color || undefined }}
                    >
                      <span
                        className="inline-block w-2 h-2 border"
                        style={{
                          backgroundColor: color ? `${color}33` : 'transparent',
                          borderColor: color || 'rgba(255,255,255,0.25)',
                        }}
                      />
                      {glyph && <span>{glyph}</span>}
                      {changeCounts[cls]} {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {layers.map((layer) => {
                  const hidden = hiddenLayers.has(layer.id);
                  const LayerIcon = layerIcons.get(layer.id);
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => toggleLayer(layer.id)}
                      title={hidden ? 'Show layer' : 'Hide layer'}
                      className={`flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border rounded-none ${
                        hidden
                          ? 'border-border/40 text-muted-foreground/50 line-through'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {LayerIcon && <LayerIcon className="w-3 h-3 flex-shrink-0" />}
                      {layer.label}
                    </button>
                  );
                })}
              </div>

              <div className="font-mono text-[10px] text-muted-foreground ml-auto flex items-center gap-3">
                <span className="hidden lg:inline opacity-70">drag to pan · wheel to zoom</span>
                {proposedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <svg width="16" height="8">
                      <line x1="0" y1="4" x2="16" y2="4" stroke="#fbbf24" strokeWidth="1.2" strokeDasharray="4 3" />
                    </svg>
                    {proposedCount} proposed
                  </span>
                )}
                <span>{statusCounts}</span>
                {warnings.length > 0 && !showWarnings && (
                  <button
                    type="button"
                    onClick={() => setShowWarnings(true)}
                    className="flex items-center gap-1 text-amber-500/90 hover:underline"
                  >
                    <AlertTriangle className="w-3 h-3" /> {warnings.length}
                  </button>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={isRunning}
                title={`Re-run from ${
                  lastSource.sourceKind === 'branch' ? 'this branch’s changes' : 'this conversation'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={extraction.reset}
                disabled={isRunning}
                title="Back to the source picker"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> New source
              </Button>
            </>
          )}
          <Button size="sm" className={spec ? '' : 'ml-auto'} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
