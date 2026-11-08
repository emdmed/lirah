import { useId, useMemo, useState } from 'react';
import { DASH, Figure, INK, STROKE, T, textWidth } from '@/components/instrument/figure';
import { featureLayout } from './featureLayout';

// FIG.34: the feature map in layers. Leaves (features nothing else is built on)
// sit left; an arrow runs from a feature to each feature it uses. Each node is
// its name over a file-count ruler. Hover lights a node's edges and dims the
// rest; the selected node is framed in lamp; pinned nodes (in the prompt) are
// inverse video, like selected file rows. Features with no uses either way sit
// in a grid under the graph.

const COL = 200;
const ROW = 40;
const BOX = 160; // node width; COL - BOX is the gutter the edges cross
const PAD = 14;
const NAME_Y = 12;
const RULE_Y = 22;
const MID_Y = 16; // where edges meet a node

const fit = (s, w) => (textWidth(s) <= w ? s : `${String(s).slice(0, Math.max(1, Math.floor(w / textWidth('m')) - 1))}…`);

/** `map` is { features }, `selected` a feature id, `pinned` [{ id }] (the tab store's shape). */
export function Fig34Features({ map, selected = null, pinned = [], onSelect, fallback = null }) {
  const [hover, setHover] = useState(null);
  const arrow = `fig34-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const layout = useMemo(() => featureLayout(map, { colW: COL, rowH: ROW }), [map]);
  const files = useMemo(() => new Map((map?.features ?? []).map((f) => [f.id, Array.isArray(f.files) ? f.files.length : 0])), [map]);
  const maxFiles = Math.max(1, ...files.values());
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const at = new Map(layout.nodes.map((n) => [n.id, { x: n.x + PAD, y: n.y + PAD }]));
  const near = hover && new Set([hover, ...layout.edges.flatMap((e) => (e.from === hover ? [e.to] : e.to === hover ? [e.from] : []))]);

  const W = Math.max(BOX, layout.width - (COL - BOX)) + PAD * 2 + 30; // room for a same-column loop
  const H = Math.max(ROW, layout.height) + PAD;
  const looseCount = layout.nodes.filter((n) => n.loose).length;
  const label = `Feature map: ${layout.nodes.length} features in ${layout.layers} layers, ${layout.edges.length} uses, ${looseCount} standalone`;

  return (
    <Figure fig={34} viewBox={`0 0 ${W} ${H}`} minWidth={Math.min(W, 320)} fallback={fallback} label={label} paper="var(--ins-panel)">
      <defs>
        {[['', INK.edgeStrong], ['-lit', INK.lamp]].map(([k, c]) => (
          <marker key={k} id={arrow + k} viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 0L6 3L0 6z" style={{ fill: c }} />
          </marker>
        ))}
      </defs>
      {layout.edges.map((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        const lit = hover && (e.from === hover || e.to === hover);
        // from normally sits right of to (a layer up); a cycle's back edge runs the other way,
        // and one inside a single column loops out on the right
        const same = a.x === b.x;
        const x1 = a.x > b.x ? a.x - 4 : a.x + BOX + 4; // the node box overhangs BOX by 4
        const x2 = a.x < b.x ? b.x - 4 : b.x + BOX + 4;
        const y1 = a.y + MID_Y;
        const y2 = b.y + MID_Y;
        const mx = same ? x1 + 30 : (x1 + x2) / 2;
        return (
          <path
            key={`${e.from}>${e.to}`}
            d={`M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}
            markerEnd={`url(#${arrow}${lit ? '-lit' : ''})`}
            style={{
              fill: 'none',
              stroke: lit ? INK.lamp : INK.edgeStrong,
              strokeWidth: lit ? STROKE.emphasis : STROKE.hair,
              strokeDasharray: a.x <= b.x ? DASH.fine : undefined,
              opacity: hover && !lit ? 0.25 : 1,
            }}
          />
        );
      })}
      {layout.looseY != null && (
        <g aria-hidden="true">
          <T x={PAD - 4} y={PAD + layout.looseY - 14} color={INK.faint}>{`STANDALONE · ${looseCount}`}</T>
          <line x1={PAD - 4 + textWidth(`STANDALONE · ${looseCount}`) + 8} x2={W - PAD} y1={PAD + layout.looseY - 18} y2={PAD + layout.looseY - 18} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
        </g>
      )}
      {layout.nodes.map((n) => {
        const { x, y } = at.get(n.id);
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
            style={{ cursor: 'pointer', outline: 'none', opacity: near && !near.has(n.id) ? 0.3 : 1 }}
          >
            <rect x={x - 4} y={y} width={BOX + 8} height={ROW - 8} style={{ fill: inv ? INK.fg : INK.paper, stroke: on ? INK.lamp : 'none', strokeWidth: STROKE.emphasis }} />
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
