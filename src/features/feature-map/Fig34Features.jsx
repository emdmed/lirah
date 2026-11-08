import { useId, useMemo, useState } from 'react';
import { DASH, Figure, INK, STROKE, T, textWidth } from '@/components/instrument/figure';
import { featureLayout } from './featureLayout';

// FIG.34: the feature map in layers. Foundations (features that use nothing)
// sit left; an arrow runs from a feature to each feature it uses. Each layer
// hangs on a fragment of an orbit round a sun off the left edge: the column
// bows outward in the middle and its orbit runs on past the last node. Each node is
// its name over a file-count ruler. Hover lights a node's edges and dims the
// rest; the selected node is framed in lamp; pinned nodes (in the prompt) are
// inverse video, like selected file rows. Features with no uses either way sit
// in a grid under the graph.

const COL = 210; // narrowest column pitch; few layers spread wider so edges get room
const PLATE = 1100; // the width a spread map aims for
const ROW = 40;
const BOX = 160; // node width; COL - BOX is the gutter the edges cross
const PAD = 14;
const NAME_Y = 12;
const RULE_Y = 22;
const MID_Y = 16; // where edges meet a node
const SUN = 560; // radius of the innermost orbit; the sun sits this far left of layer I
const TOP = 20; // room above the graph for the orbit numerals
const TAIL = 12; // how far an orbit runs past its first and last node
// Hover warms fast and cools slowly, like the lamps.
const ease = (warming) => {
  const d = `${warming ? 'var(--ins-warm)' : 'var(--ins-cool)'} var(--ins-ease)`;
  return { transition: `opacity ${d}, stroke ${d}, stroke-width ${d}, fill ${d}` };
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const fit = (s, w) => (textWidth(s) <= w ? s : `${String(s).slice(0, Math.max(1, Math.floor(w / textWidth('m')) - 1))}…`);

/** `map` is { features }, `selected` a feature id, `pinned` [{ id }] (the tab store's shape). */
export function Fig34Features({ map, selected = null, pinned = [], onSelect, fallback = null }) {
  const [hover, setHover] = useState(null);
  const arrow = `fig34-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { layout, col } = useMemo(() => {
    const base = featureLayout(map, { colW: COL, rowH: ROW });
    const col = base.layers > 1 ? Math.round(Math.min(320, Math.max(COL, (PLATE - BOX - 60) / (base.layers - 1)))) : COL;
    return { layout: col === COL ? base : featureLayout(map, { colW: col, rowH: ROW }), col };
  }, [map]);
  const files = useMemo(() => new Map((map?.features ?? []).map((f) => [f.id, Array.isArray(f.files) ? f.files.length : 0])), [map]);
  const maxFiles = Math.max(1, ...files.values());
  const pinnedIds = new Set(pinned.map((p) => p.id));

  // Centre each layer's column on the graph's mid line, then bow it onto its orbit.
  const graph = layout.nodes.filter((n) => !n.loose);
  const perLayer = new Map();
  graph.forEach((n) => perLayer.set(n.layer, (perLayer.get(n.layer) || 0) + 1));
  const ranks = [...perLayer.keys()].sort((a, b) => a - b);
  const graphRows = Math.max(0, ...perLayer.values());
  const sy = TOP + PAD + ((graphRows - 1) * ROW) / 2 + MID_Y;
  const reach = ((graphRows - 1) * ROW) / 2 + TAIL;
  const orbits = ranks.map((layer, k) => {
    const r = SUN + k * col;
    const sag = r - Math.sqrt(r * r - reach * reach);
    const n = perLayer.get(layer);
    return { layer, k, r, sag, cx: PAD + k * col - r + sag - 10, half: ((n - 1) * ROW) / 2 + TAIL };
  });
  const orbitOf = new Map(orbits.map((o) => [o.layer, o]));
  const arcX = (o, dy) => o.cx + Math.sqrt(o.r * o.r - dy * dy);
  const at = new Map(layout.nodes.map((n) => {
    if (n.loose) return [n.id, { x: n.x + PAD, y: n.y + PAD + TOP }];
    const o = orbitOf.get(n.layer);
    const y = sy - MID_Y + (n.row - (perLayer.get(n.layer) - 1) / 2) * ROW;
    return [n.id, { x: arcX(o, y + MID_Y - sy) + 10, y, body: [arcX(o, y + MID_Y - sy), y + MID_Y] }];
  }));
  const bow = orbits[0]?.sag ?? 0;
  const layerOf = new Map(layout.nodes.map((n) => [n.id, n.layer]));
  const near = hover && new Set([hover, ...layout.edges.flatMap((e) => (e.from === hover ? [e.to] : e.to === hover ? [e.from] : []))]);

  const W = Math.max(BOX, layout.width - (col - BOX)) + PAD * 2 + 30 + bow; // room for a same-column loop
  const H = Math.max(ROW, layout.height) + PAD + TOP;
  const looseCount = layout.nodes.filter((n) => n.loose).length;
  const label = `Feature map: ${layout.nodes.length} features in ${layout.layers} layers, ${layout.edges.length} uses, ${looseCount} standalone`;

  return (
    <Figure fig={34} viewBox={`0 0 ${W} ${H}`} minWidth={Math.min(W, 320)} fallback={fallback} label={label} paper="var(--ins-panel)">
      <defs>
        {[['', INK.edgeStrong], ['-lit', INK.lamp], ['-sel', INK.fg]].map(([k, c]) => (
          <marker key={k} id={arrow + k} viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L6 3L0 6z" style={{ fill: c }} />
          </marker>
        ))}
      </defs>
      {/* Orbit fragments: dotted along the column, a sparse dash past its ends, a numeral at the top. */}
      <g aria-hidden="true">
        {orbits.map((o) => {
          const arc = (y0, y1) => `M${arcX(o, y0)} ${sy + y0}A${o.r} ${o.r} 0 0 1 ${arcX(o, y1)} ${sy + y1}`;
          const lit = graph.some((n) => n.layer === o.layer && n.id === selected);
          const ink = lit ? INK.muted : INK.faint;
          return (
            <g key={o.layer}>
              <path d={arc(-o.half, o.half)} style={{ fill: 'none', stroke: ink, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }} />
              <path d={arc(-o.half - 22, -o.half - 3)} style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.sparse, opacity: 0.6 }} />
              <path d={arc(o.half + 3, o.half + 22)} style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.sparse, opacity: 0.6 }} />
              <T x={arcX(o, -o.half - 22) + 6} y={sy - o.half - 18} color={ink}>{`${ROMAN[o.k] ?? o.k + 1}${o.k === 0 ? ' · uses nothing' : o.k === orbits.length - 1 ? ' · used by nothing' : ''}`}</T>
            </g>
          );
        })}
      </g>
      {layout.edges.map((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        const lit = hover && (e.from === hover || e.to === hover);
        // With nothing hovered, the selected feature's uses and used-by stay drawn in ink.
        const sel = !hover && selected && (e.from === selected || e.to === selected);
        // from normally sits right of to (a layer up); a cycle's back edge runs the other way,
        // and one inside a single column loops out on the right
        const la = layerOf.get(e.from);
        const lb = layerOf.get(e.to);
        const same = la === lb;
        const x1 = la > lb ? a.body[0] - 3 : a.x + BOX + 4; // leave from the body on the orbit; the box overhangs BOX by 4
        const x2 = la < lb ? b.x - 4 : b.x + BOX + 10; // land clear of the count
        const y1 = a.y + MID_Y;
        const y2 = b.y + MID_Y;
        const mx = same ? Math.max(x1, x2) + 30 : (x1 + x2) / 2;
        return (
          <path
            key={`${e.from}>${e.to}`}
            d={`M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
            markerEnd={`url(#${arrow}${lit ? '-lit' : sel ? '-sel' : ''})`}
            style={{
              fill: 'none',
              stroke: lit ? INK.lamp : sel ? INK.fg : INK.edgeStrong,
              strokeWidth: lit ? STROKE.emphasis : sel ? STROKE.ink : STROKE.hair,
              strokeDasharray: la <= lb ? DASH.fine : undefined,
              opacity: hover && !lit ? 0.25 : 1,
              ...ease(lit || !hover),
            }}
          />
        );
      })}
      {layout.looseY != null && (
        <g aria-hidden="true">
          <T x={PAD - 4} y={PAD + TOP + layout.looseY - 14} color={INK.faint}>{`STANDALONE · ${looseCount}`}</T>
          <line x1={PAD - 4 + textWidth(`STANDALONE · ${looseCount}`) + 8} x2={W - PAD} y1={PAD + TOP + layout.looseY - 18} y2={PAD + TOP + layout.looseY - 18} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
        </g>
      )}
      {layout.nodes.map((n) => {
        const { x, y, body } = at.get(n.id);
        const on = n.id === selected;
        const inv = pinnedIds.has(n.id);
        const ink = inv ? INK.paper : on ? INK.lamp : INK.muted;
        const count = files.get(n.id);
        const len = (count / maxFiles) * (BOX - 30);
        const pick = () => onSelect?.(n.id);
        return (
          <g
            key={n.id}
            role="button"
            tabIndex={0}
            aria-label={`${n.name}, ${count} file${count === 1 ? '' : 's'}${on ? ', selected' : ''}${pinnedIds.has(n.id) ? ', pinned' : ''}`}
            aria-pressed={on}
            onClick={pick}
            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } }}
            onMouseEnter={() => setHover(n.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(n.id)}
            onBlur={() => setHover(null)}
            style={{ cursor: 'pointer', outline: 'none', opacity: near && !near.has(n.id) ? 0.3 : 1, ...ease(!near || near.has(n.id)) }}
          >
            {body && <circle cx={body[0]} cy={body[1]} r={on ? 3 : 2} style={{ fill: on ? INK.lamp : inv ? INK.fg : INK.muted }} />}
            <rect x={x - 4} y={y} width={BOX + 8} height={ROW - 8} style={{ fill: inv ? INK.fg : INK.paper, stroke: on ? INK.lamp : 'none', strokeWidth: STROKE.emphasis, ...ease(on) }} />
            <T x={x} y={y + NAME_Y} color={inv ? INK.paper : on ? INK.lamp : INK.fg}>{fit(n.name, BOX - 12)}</T>
            <line x1={x} x2={x + BOX - 30} y1={y + RULE_Y} y2={y + RULE_Y} style={{ stroke: inv ? INK.paper : INK.edge, strokeWidth: STROKE.hair, opacity: inv ? 0.4 : 1 }} />
            <line x1={x} x2={x + len} y1={y + RULE_Y} y2={y + RULE_Y} style={{ stroke: ink, strokeWidth: STROKE.heavy }} />
            <line x1={x + len} x2={x + len} y1={y + RULE_Y - 3} y2={y + RULE_Y + 3} style={{ stroke: ink, strokeWidth: STROKE.hair }} />
            <T x={x + BOX} y={y + RULE_Y + 4} anchor="end" color={inv ? INK.paper : INK.faint}>{count}</T>
          </g>
        );
      })}
    </Figure>
  );
}
