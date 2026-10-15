import { useMemo, useState, useEffect } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Layers, Loader2, Network, ScanSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CHANGE_STYLE, getDesignColors } from './DesignNode';
import { BODY_CHAR_W } from './designLayout';
import { DOMAIN_BOX, layoutDomainLevel } from './domainLayout';
import { hasChildren, levelOf } from './domainModel';

/**
 * The domains diagram: the system broken into its big areas, one level at a
 * time.
 *
 * The top level is the domains — ingestion, solver, API, auth. Opening one shows
 * its features, with every other domain they exchange data with drawn as a stub
 * at the edge. Opening a feature hands over to the system diagram, focused on
 * that feature's parts: the domains view is the map, the system view is the
 * street plan, and the drill-down is the zoom between them.
 *
 * Drill-down rather than nested boxes on one canvas, on purpose: one level at a
 * time keeps every screen to a dozen boxes no matter how large the project, and
 * it is what lets a project diagram carry far more parts than the system view
 * could ever lay out at once.
 */

/** Above this many arrows, labels are only drawn for the selected box. */
const LABEL_ALL_EDGES_BELOW = 10;

/** Domains are told apart by colour; features inherit their domain's. */
const DOMAIN_PALETTE = ['component', 'function', 'hook', 'props', 'constant'];

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function domainColor(model, id, colors) {
  const group = model.groups.get(id);
  const domainId = group?.parent || id;
  const i = Math.max(model.domains.indexOf(domainId), 0);
  return colors[DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]] || colors.highlight;
}

function edgeLabel(edge) {
  const head = edge.contracts[0] ? clip(edge.contracts[0], 26) : '';
  if (edge.count > 1) return head ? `${edge.count}× · ${head}` : `${edge.count} links`;
  return head;
}

function DomainBox({ model, box, rect, colors, selected, dimmed, faded, onSelect, onOpen }) {
  const group = model.groups.get(box.id);
  if (!group) return null;
  const accent = domainColor(model, box.id, colors);
  const { BOX_HEADER_H, BOX_LINE_H, BOX_PAD_Y, BOX_FOOTER_H } = DOMAIN_BOX;
  const opacity = dimmed ? 0.25 : faded ? 0.72 : 1;

  if (box.external) {
    return (
      <g
        onClick={(e) => {
          e.stopPropagation();
          onSelect(box.id);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpen(box.id);
        }}
        style={{ cursor: 'pointer', opacity }}
      >
        <title>{`${group.label} — another domain. Double-click to go there.`}</title>
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.w}
          height={rect.h}
          fill="rgba(255,255,255,0.015)"
          stroke={selected ? accent : `${accent}66`}
          strokeDasharray="5 4"
        />
        <text x={rect.x + 12} y={rect.y + 18} fill={colors.mutedText} fontSize={9} fontFamily="monospace">
          OTHER DOMAIN
        </text>
        <text x={rect.x + 12} y={rect.y + 33} fill={colors.text} fontSize={11} fontFamily="monospace">
          {clip(group.label, 32)}
        </text>
      </g>
    );
  }

  const { added, modified, proposed } = group.counts;
  const children = group.children.length;
  const parts = group.nodeIds.length;
  const badge = children > 0 ? `${children} features` : `${parts} part${parts === 1 ? '' : 's'}`;
  const bodyY = rect.y + BOX_HEADER_H + BOX_PAD_Y;
  const footerY = rect.y + rect.h - BOX_FOOTER_H / 2 + 3;
  const footer = [];
  if (added) footer.push({ text: `+${added}`, color: CHANGE_STYLE.added.color });
  if (modified) footer.push({ text: `~${modified}`, color: CHANGE_STYLE.modified.color });
  if (proposed) footer.push({ text: `${proposed} proposed`, color: '#fbbf24' });
  let footerX = rect.x + 12;

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect(box.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(box.id);
      }}
      style={{ cursor: 'pointer', opacity }}
    >
      <title>{`${group.label}\n${group.purpose}\n\nDouble-click to open.`}</title>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill={selected ? `${accent}1F` : 'rgba(255,255,255,0.035)'}
        stroke={selected ? accent : `${accent}55`}
        strokeWidth={selected ? 1.6 : 1}
      />
      <rect x={rect.x} y={rect.y} width={3} height={rect.h} fill={accent} />
      <text
        x={rect.x + 12}
        y={rect.y + 19}
        fill={colors.text}
        fontSize={12}
        fontWeight={600}
        fontFamily="monospace"
      >
        {clip(group.label, 24)}
      </text>
      <text
        x={rect.x + rect.w - 10}
        y={rect.y + 19}
        textAnchor="end"
        fill={colors.mutedText}
        fontSize={9}
        fontFamily="monospace"
      >
        {badge}
      </text>
      {(rect.lines.length ? rect.lines : ['']).map((line, i) => (
        <text
          key={i}
          x={rect.x + 12}
          y={bodyY + (i + 1) * BOX_LINE_H - 3}
          fill={colors.mutedText}
          fontSize={9.5}
          fontFamily="monospace"
        >
          {line}
        </text>
      ))}
      {footer.map(({ text, color }) => {
        const x = footerX;
        footerX += text.length * BODY_CHAR_W + 10;
        return (
          <text key={text} x={x} y={footerY} fill={color} fontSize={9.5} fontFamily="monospace">
            {text}
          </text>
        );
      })}
      <text
        x={rect.x + rect.w - 10}
        y={footerY}
        textAnchor="end"
        fill={colors.mutedText}
        fontSize={9}
        fontFamily="monospace"
      >
        {children > 0 ? 'open ›' : 'parts ›'}
      </text>
    </g>
  );
}

function Connection({ edge, direction, model, onSelect }) {
  const otherId = direction === 'in' ? edge.from : edge.to;
  const other = model.groups.get(otherId);
  const Icon = direction === 'in' ? ArrowDownLeft : ArrowUpRight;
  return (
    <li className="text-xs">
      <button
        type="button"
        onClick={() => onSelect(otherId)}
        className="flex items-center gap-1 font-mono text-[11px] hover:underline text-left"
      >
        <Icon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
        {other?.label || otherId}
        <span className="text-muted-foreground">
          · {edge.count} link{edge.count === 1 ? '' : 's'}
        </span>
      </button>
      {edge.contracts.length > 0 && (
        <div className="pl-4 font-mono text-[11px] text-muted-foreground break-words">
          {edge.contracts.slice(0, 4).join(' · ')}
          {edge.contracts.length > 4 ? ` · +${edge.contracts.length - 4} more` : ''}
        </div>
      )}
      {edge.flows.length > 0 && (
        <div className="pl-4 text-[11px] text-muted-foreground/70 italic">
          in: {edge.flows.join(', ')}
        </div>
      )}
    </li>
  );
}

function DomainPanel({ model, id, edges, onSelect, onOpen, onShowParts, onExpand, expanding, canExpand, onClose }) {
  const group = model.groups.get(id);
  if (!group) return null;
  const inbound = edges.filter((e) => e.to === id);
  const outbound = edges.filter((e) => e.from === id);
  const isDomain = !group.parent;
  const { added, modified, untouched, proposed } = group.counts;

  return (
    <aside className="w-80 flex-shrink-0 border-l edge-engraved overflow-y-auto px-4 py-3 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {group.synthetic ? 'Shared parts' : isDomain ? 'Domain' : 'Feature'}
          </div>
          <div className="font-mono text-sm">{group.label}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
          <X className="w-3 h-3" />
        </Button>
      </div>

      {group.purpose && <p className="text-xs leading-relaxed">{group.purpose}</p>}

      <div className="font-mono text-[11px] text-muted-foreground space-y-0.5">
        <div>
          {group.nodeIds.length} part{group.nodeIds.length === 1 ? '' : 's'}
          {group.children.length > 0 && ` in ${group.children.length} features`}
        </div>
        {(added > 0 || modified > 0) && (
          <div>
            <span style={{ color: CHANGE_STYLE.added.color }}>{added} added</span> ·{' '}
            <span style={{ color: CHANGE_STYLE.modified.color }}>{modified} modified</span> · {untouched}{' '}
            untouched
          </div>
        )}
        {proposed > 0 && <div className="text-amber-400/90">{proposed} proposed, not built yet</div>}
        {isDomain && group.expanded && <div className="text-[var(--ins-lamp)]">detailed</div>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {group.children.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => onOpen(id)}>
            <Layers className="w-3.5 h-3.5 mr-1.5" /> Open features
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onShowParts(id)} disabled={!group.nodeIds.length}>
          <Network className="w-3.5 h-3.5 mr-1.5" /> Show parts
        </Button>
        {canExpand && isDomain && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExpand(id)}
            disabled={!!expanding}
            title={
              group.expanded
                ? 'Re-run the detailed breakdown of this domain'
                : 'Read this domain closely and replace its coarse parts with a detailed breakdown'
            }
          >
            {expanding === id ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <ScanSearch className="w-3.5 h-3.5 mr-1.5" />
            )}
            {group.expanded ? 'Re-detail' : 'Detail this domain'}
          </Button>
        )}
      </div>

      {group.children.length > 0 && (
        <section className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Features</div>
          <ul className="space-y-1">
            {group.children.map((cid) => {
              const child = model.groups.get(cid);
              return (
                <li key={cid}>
                  <button
                    type="button"
                    onClick={() => onShowParts(cid)}
                    className="text-left text-xs hover:underline"
                    title="Show this feature's parts in the system view"
                  >
                    <span className="font-mono text-[11px]">{child.label}</span>
                    <span className="text-muted-foreground"> · {child.nodeIds.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {inbound.length > 0 && (
        <section className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Receives from</div>
          <ul className="space-y-1.5">
            {inbound.map((e) => (
              <Connection key={e.key} edge={e} direction="in" model={model} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}
      {outbound.length > 0 && (
        <section className="space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sends to</div>
          <ul className="space-y-1.5">
            {outbound.map((e) => (
              <Connection key={e.key} edge={e} direction="out" model={model} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

/**
 * @param {{
 *   model: ReturnType<import('./domainModel').buildDomainModel>,
 *   edges: Array, scope: string|null, onScopeChange: (id: string|null) => void,
 *   onShowParts: (groupId: string) => void,
 *   onExpand?: (domainId: string) => void, expanding?: string|null,
 *   highlightChanges?: boolean,
 * }} props
 */
export function DomainView({
  model,
  edges,
  scope,
  onScopeChange,
  onShowParts,
  onExpand,
  expanding = null,
  highlightChanges = false,
}) {
  const colors = getDesignColors();
  const [selectedId, setSelectedId] = useState(null);

  const level = useMemo(() => levelOf(model, edges, scope), [model, edges, scope]);
  const layout = useMemo(() => layoutDomainLevel(level, model.groups), [level, model]);

  // A new level starts with nothing selected; a box from the last level would
  // otherwise keep a panel open for something that is no longer on screen.
  useEffect(() => setSelectedId(null), [scope, model]);

  const connected = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set([selectedId]);
    for (const e of level.edges) {
      if (e.from === selectedId) set.add(e.to);
      if (e.to === selectedId) set.add(e.from);
    }
    return set;
  }, [selectedId, level.edges]);

  const open = (id) => {
    const group = model.groups.get(id);
    if (!group) return;
    // Anything with features opens a level down — a neighbour stub included,
    // which jumps across to *its* domain. A leaf hands over to the system view.
    if (hasChildren(model, id)) onScopeChange(id);
    else onShowParts(id);
  };

  const scopeGroup = scope ? model.groups.get(scope) : null;
  const labelAll = level.edges.length < LABEL_ALL_EDGES_BELOW;
  const hot = (e) => selectedId && (e.from === selectedId || e.to === selectedId);
  const ordered = [...layout.routes].sort((a, b) => Number(!!hot(a.edge)) - Number(!!hot(b.edge)));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground px-1 pb-1.5">
        <button
          type="button"
          onClick={() => onScopeChange(null)}
          className={scope ? 'hover:text-foreground hover:underline' : 'text-foreground'}
        >
          All domains
        </button>
        {scopeGroup && (
          <>
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground">{scopeGroup.label}</span>
            <span className="ml-2 opacity-70">{scopeGroup.purpose}</span>
          </>
        )}
        {model.derived && (
          <span className="ml-auto text-amber-500/80">
            derived from layers — regenerate for a real domain breakdown
          </span>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <div
          className="flex-1 flex items-center justify-center overflow-hidden border edge-engraved bg-background/50 select-none"
          onClick={() => setSelectedId(null)}
        >
          {level.boxes.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nothing filed under this domain.</div>
          ) : (
            <svg
              viewBox={`0 0 ${layout.totalW} ${layout.totalH}`}
              preserveAspectRatio="xMidYMid meet"
              width="100%"
              height="100%"
              // Fit to the pane, but never blow a three-box level up to poster size.
              style={{ display: 'block', maxWidth: layout.totalW * 1.35, maxHeight: layout.totalH * 1.35 }}
            >
              <defs>
                <marker id="domain-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill={colors.edge} />
                </marker>
                <marker id="domain-arrow-hot" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={6} markerHeight={6} orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill={colors.highlight} />
                </marker>
              </defs>

              {ordered.map(({ key, edge, path, labelX, labelY, back }) => {
                const isHot = !!hot(edge);
                const dimmed = selectedId && !isHot;
                const text = (isHot || (labelAll && !selectedId)) ? edgeLabel(edge) : '';
                // Heavier arrows for busier connections, within reason.
                const width = Math.min(1 + Math.log2(edge.count) * 0.6, 2.6);
                return (
                  <g key={key} opacity={dimmed ? 0.12 : 1} style={{ pointerEvents: 'none' }}>
                    <path
                      d={path}
                      fill="none"
                      stroke={isHot ? colors.highlight : colors.edge}
                      strokeWidth={isHot ? width + 0.5 : width}
                      strokeDasharray={back ? '5 4' : undefined}
                      markerEnd={isHot ? 'url(#domain-arrow-hot)' : 'url(#domain-arrow)'}
                    />
                    {text && (
                      <>
                        <rect
                          x={labelX - (text.length * BODY_CHAR_W) / 2 - 4}
                          y={labelY - 10}
                          width={text.length * BODY_CHAR_W + 8}
                          height={13}
                          fill="rgba(15,23,42,0.88)"
                        />
                        <text
                          x={labelX}
                          y={labelY}
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

              {level.boxes.map((box) => {
                const rect = layout.positioned.get(box.id);
                if (!rect) return null;
                const counts = model.groups.get(box.id)?.counts;
                const untouched = highlightChanges && counts && !counts.added && !counts.modified;
                return (
                  <DomainBox
                    key={box.id}
                    model={model}
                    box={box}
                    rect={rect}
                    colors={colors}
                    selected={selectedId === box.id}
                    dimmed={!!connected && !connected.has(box.id)}
                    faded={!box.external && untouched}
                    onSelect={setSelectedId}
                    onOpen={open}
                  />
                );
              })}
            </svg>
          )}
        </div>

        {selectedId && (
          <DomainPanel
            model={model}
            id={selectedId}
            edges={level.edges}
            onSelect={setSelectedId}
            onOpen={open}
            onShowParts={onShowParts}
            onExpand={onExpand}
            expanding={expanding}
            canExpand={!!onExpand}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
