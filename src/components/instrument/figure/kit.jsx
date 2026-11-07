import { useId } from 'react';

// The figure kit: the marks every FIG drawing is built from. Each mark is an
// SVG fragment, drawn in user units at 1:1 with CSS pixels, so a figure is a
// plain <svg viewBox> with marks placed by coordinate. Colours come only from
// the instrument tokens in index.css, so every theme draws its own figures.

// Ink. Set through style, not presentation attributes, so var() resolves in
// every webview. Box fill reads --fig-paper so a host surface (tooltip,
// popover) can match its own background; it falls back to the panel.
export const INK = {
  fg: 'var(--color-foreground)',
  muted: 'var(--color-muted-foreground, var(--ins-legend))',
  faint: 'var(--ins-faint)',
  edge: 'var(--ins-edge)',
  edgeStrong: 'var(--ins-edge-strong)',
  lamp: 'var(--ins-lamp)',
  ok: 'var(--ins-ok)',
  warn: 'var(--ins-warn)',
  fault: 'var(--ins-fault)',
  paper: 'var(--fig-paper, var(--ins-panel))',
};

// Stroke weights: hairline for scales and leaders, ink for outlines that
// carry state, emphasis for the one path a figure is about.
export const STROKE = { hair: 1, ink: 1.3, emphasis: 1.6, heavy: 2 };

// Dash patterns, finest first: projection, pending, planned, out of reach.
export const DASH = { fine: '2 3', medium: '4 3', long: '5 4', sparse: '2 4' };

// Geist Mono at 11px advances 6.6px per character, ~7px with the legend
// tracking (6.6 left one-line boxes a character short). Layout uses this
// estimate rather than measuring, so figures lay out in one pass.
export const CH = 7;
export const textWidth = (s, tracking = 0) => String(s).length * (CH + tracking);

const LEGEND = {
  fontFamily: 'var(--font-legend)',
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums',
};

// Text in the legend face. `anchor` is start | middle | end. `halo` rings the
// glyphs in paper, so a line drawn under the text breaks around it (as
// drawings break a leader at a dimension figure).
export function T({ x, y, children, color = INK.muted, anchor = 'start', tracking = 0, halo = false, className }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={className}
      style={{
        ...LEGEND,
        fill: color,
        letterSpacing: tracking || undefined,
        ...(halo && { stroke: INK.paper, strokeWidth: 4, strokeLinejoin: 'round', paintOrder: 'stroke' }),
      }}
    >
      {children}
    </text>
  );
}

// The figure's caption, under the drawing on a hairline (Figure renders it
// as HTML after the SVG). The FIG number stays in registry.js for citing and
// opening, but is not printed.
// `note` sits at the right of the rule in italic gold (FIG.19's saving).
export function FigLabel({ title, note }) {
  if (!title) return null;
  return (
    <div className="ins-fig-caption">
      <span>{title}</span>
      {note && <span className="ins-fig-caption-note ins-name">{note}</span>}
    </div>
  );
}

// A free label (the atlas hand): the name in italic over a mono note, no
// frame. Keeps the old boxed value's footprint: one line 19px, two 32px.
export function Box({ x, y, label, value, valueColor = INK.muted }) {
  const two = value != null && value !== '';
  return (
    <g>
      <text x={x + 7} y={y + 14} style={{ fill: INK.fg, fontFamily: 'var(--font-name)', fontStyle: 'italic', fontWeight: 300, fontSize: 15 }}>
        {label}
      </text>
      {two && <T x={x + 7} y={y + 28} color={valueColor}>{value}</T>}
    </g>
  );
}

// A leader (the atlas hand): a thin ink line from the measured thing to its
// label, ending in a dot at the label. `dot` also marks the first point.
export function Leader({ points, dot = false, color = INK.fg }) {
  const d = `M${points.map((p) => p.join(' ')).join(' L')}`;
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  return (
    <g>
      <path d={d} style={{ fill: 'none', stroke: color, strokeWidth: 0.6, strokeOpacity: 0.6 }} />
      {dot && <circle cx={sx} cy={sy} r={1.6} style={{ fill: color }} />}
      <circle cx={ex} cy={ey} r={1.6} style={{ fill: color }} />
    </g>
  );
}

// A dimension line: end ticks, arrowheads pointing out to the ticks, and the
// length written into a gap in the middle (no label: an unbroken line, for
// callers that place the text themselves). Durations, sizes, spans.
export function Dim({ x1, x2, y, label, color = INK.muted }) {
  const m = (x1 + x2) / 2;
  const half = (textWidth(label ?? '') + 8) / 2;
  const gap = Boolean(label) && x2 - x1 > half * 2 + 12;
  const d = [
    `M${x1} ${y - 4}V${y + 4}`,
    `M${x2} ${y - 4}V${y + 4}`,
    gap ? `M${x1} ${y}H${m - half}M${m + half} ${y}H${x2}` : `M${x1} ${y}H${x2}`,
    `M${x1} ${y}l5 -2.5v5z`,
    `M${x2} ${y}l-5 -2.5v5z`,
  ].join('');
  return (
    <g>
      <path d={d} style={{ fill: INK.faint, stroke: INK.faint, strokeWidth: STROKE.hair }} />
      {label && <T x={m} y={gap ? y + 3.5 : y - 6} anchor="middle" color={color}>{label}</T>}
    </g>
  );
}

// The lamp glow, for the one lit thing in a figure. Colour and strength
// come from index.css (.fig-glow), so light themes take the softer
// --lamp-glow the lamps use. `live` marks the moving star (.fig-live).
export function Glow({ live = false, style, children }) {
  return <g className={live ? 'fig-glow fig-live' : 'fig-glow'} style={style}>{children}</g>;
}

// A state node. done: filled square; todo: outlined square; merge: diamond;
// live: the gold sun with a dotted corona, the only mark that glows.
export function Node({ x, y, state = 'todo', size = 8 }) {
  const h = size / 2;
  if (state === 'live') {
    // Drawn at the origin and moved by a CSS transform, so a redraw that
    // moves it (a clock tick, the next step) glides over --ins-dur-base;
    // reduced motion snaps it (index.css .fig-live).
    return (
      <Glow live style={{ transform: `translate(${x}px, ${y}px)` }}>
        <circle r={size * 0.85} style={{ fill: 'none', stroke: INK.lamp, strokeWidth: 0.8 }} strokeDasharray="1 2" />
        <circle r={size / 2} style={{ fill: INK.lamp }} />
      </Glow>
    );
  }
  if (state === 'done') {
    return <rect x={x - h} y={y - h} width={size} height={size} style={{ fill: INK.fg }} />;
  }
  if (state === 'merge') {
    const r = size * 0.75;
    return (
      <path
        d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`}
        style={{ fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.ink }}
      />
    );
  }
  return (
    <rect
      x={x - h}
      y={y - h}
      width={size}
      height={size}
      style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
    />
  );
}

// A ruler from x0 to x1 for 0..max, a tick every `step`, numbered every
// `labelEvery` ticks. Ticks hang down unless `up`. Numbers carry a halo:
// draw leaders and projection lines before the ruler and they break at them.
// `numbers={false}` keeps the major ticks and drops the numbers (compact).
export function Ruler({ x0, x1, y, max, step, labelEvery = 1, fmt = String, up = false, numbers = true }) {
  const ticks = [];
  const n = max > 0 && step > 0 ? Math.floor(max / step + 1e-9) : 0;
  for (let i = 0; i <= n; i++) {
    const v = i * step;
    const x = x0 + (v / max) * (x1 - x0);
    const major = i % labelEvery === 0;
    const len = (up ? -1 : 1) * (major ? 6 : 3);
    ticks.push(
      <g key={i}>
        <line
          x1={x}
          x2={x}
          y1={y}
          y2={y + len}
          style={{ stroke: major ? INK.faint : INK.edgeStrong, strokeWidth: STROKE.hair }}
        />
        {major && numbers && (
          <T x={x} y={up ? y - 10 : y + 17} color={INK.faint} anchor={i === 0 ? 'start' : 'middle'} halo>
            {fmt(v)}
          </T>
        )}
      </g>,
    );
  }
  return (
    <g>
      <line x1={x0} x2={x1} y1={y} y2={y} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {ticks}
    </g>
  );
}

// A hatched rect: read-only, locked or out of reach. Clear means writable.
// The pattern id comes from useId so several hatches can share a page.
export function Hatch({ x, y, width, height, color = INK.faint, gap = 5, stroke = INK.edgeStrong }) {
  const id = `fig-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <g>
      <defs>
        <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={gap} style={{ stroke: color, strokeWidth: STROKE.hair }} />
        </pattern>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={`url(#${id})`}
        style={{ stroke: stroke || 'none', strokeWidth: STROKE.hair }}
      />
    </g>
  );
}

// A numbered command: a 14px box holding the step number, then `$ command`.
// `anchor="end"` right-aligns the whole thing on x.
export function Cmd({ x, y, n, command, color = INK.fg, anchor = 'start' }) {
  const text = `$ ${command}`;
  const bx = anchor === 'end' ? x - textWidth(text) - 20 : x;
  return (
    <g>
      <rect
        x={bx}
        y={y - 10}
        width={14}
        height={14}
        style={{ fill: 'none', stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
      />
      <T x={bx + 7} y={y + 1} anchor="middle" color={INK.fg}>{n}</T>
      <T x={bx + 20} y={y + 1} color={color}>{text}</T>
    </g>
  );
}

// An inset: dashed projection lines from a span on a scale ([x0, x1] at y)
// down to a magnified box, labelled with its factor. Children draw inside
// the box, in the figure's own coordinates.
export function Inset({ from, box, factor, children }) {
  const [sx0, sx1, sy] = from;
  const { x, y, width, height } = box;
  return (
    <g>
      <path
        d={`M${sx0} ${sy}L${x} ${y}M${sx1} ${sy}L${x + width} ${y}`}
        style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
      />
      <rect x={x} y={y} width={width} height={height} style={{ fill: 'none', stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {children}
      {factor != null && <T x={x + width + 8} y={y + height - 1}>{`× ${factor}`}</T>}
    </g>
  );
}
