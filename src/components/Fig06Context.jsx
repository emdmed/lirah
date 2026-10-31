import { Box, Figure, INK, Inset, Leader, Ruler, STROKE, T, useFigureCompact, useFigureScale } from '@/components/instrument/figure';
import { getContextFill, HEAVY_CONTEXT_TOKENS } from '@/config/models';
import { formatTokenCount } from '@/features/token-budget/tokenCalculations';

// FIG.06: what fills the context window on the last turn. A ruler from 0 to
// the model's window with the used span lit, an inset magnifying its start,
// leaders from each part of the used span (cached read, new cache, uncached)
// to its box, and the cache hit rate. Compact keeps the window with its used
// span and ticks, and the inset's parts, without numbers, boxes or leaders.

const W = 288;
const X0 = 0;
const X1 = 250; // ruler and inset share a width, so the inset's × k is exact
const RULER_Y = 44;
const FULL_INSET = { x: X0, y: 72, width: X1 - X0, height: 14 };
const BOX_Y = 108;
const H = 176;
const WARN = 'var(--ins-warn)';
const FACTORS = [5, 10, 20, 50];
// Compact: the window and the inset close under it.
const C_RULER_Y = 9;
const C_INSET = { x: X0, y: 20, width: X1 - X0, height: 10 };
const C_H = 32;

/**
 * The inset's magnification: it shows the first 1/k of the window. The
 * smallest k that makes the used span at least 60% of the inset while still
 * fitting; failing that, the largest that fits. Past a fifth of the window no
 * round factor fits, so the inset spans exactly the used tokens.
 */
export function insetFactor(used, max) {
  if (!(used > 0) || !(max > 0)) return 1;
  const fits = FACTORS.filter((k) => used * k <= max);
  if (!fits.length) return max / used;
  return fits.find((k) => (used * k) / max >= 0.6) ?? fits[fits.length - 1];
}

const fmtFactor = (k) => (Number.isInteger(k) ? String(k) : k.toFixed(1));
const share = (v, total) => {
  const p = Math.round((v / total) * 100);
  return p === 0 && v > 0 ? '<1%' : `${p}%`;
};

/** True when the session reports last-turn parts (sessions read before they existed don't). */
export function hasContextParts(tokenUsage) {
  return !!(tokenUsage?.last_input_tokens || tokenUsage?.last_cache_read_tokens || tokenUsage?.last_cache_creation_tokens);
}

export function Fig06Context({ tokenUsage, fallback, className }) {
  const ctx = getContextFill(tokenUsage);
  const scale = useFigureScale(ctx?.max ?? 0, X0, X1);
  const compact = useFigureCompact();
  if (!ctx || !hasContextParts(tokenUsage)) return fallback;

  const { used, max } = ctx;
  const read = tokenUsage.last_cache_read_tokens || 0;
  const creation = tokenUsage.last_cache_creation_tokens || 0;
  const input = tokenUsage.last_input_tokens || 0;
  const parts = [
    { key: 'read', label: 'CACHED READ', tokens: read, color: INK.lamp },
    { key: 'creation', label: 'NEW CACHE', tokens: creation, color: INK.muted },
    { key: 'input', label: 'UNCACHED', tokens: input, color: INK.fg },
  ].filter((p) => p.tokens > 0);
  const partsTotal = read + creation + input;
  const hit = Math.round((read / partsTotal) * 100);

  const pct = Math.round((used / max) * 100);
  const heavy = used > HEAVY_CONTEXT_TOKENS;
  const tone = pct >= 95 ? INK.fault : pct >= 80 || heavy ? WARN : INK.fg;

  const id = tokenUsage.session_id;
  const title = id ? `CONTEXT · SESSION ${id.slice(0, 4)}…${id.slice(-3)}` : 'CONTEXT';

  // The inset: the first 1/k of the window, drawn at the ruler's width.
  const k = insetFactor(used, max);
  const span = max / k;
  const rulerY = compact ? C_RULER_Y : RULER_Y;
  const INSET = compact ? C_INSET : FULL_INSET;
  const inX = (v) => INSET.x + Math.min(1, v / span) * INSET.width;
  let at = 0;
  const segs = parts.map((p) => {
    const x0 = inX(at);
    at += p.tokens;
    const x1 = Math.max(inX(at), x0 + 2); // a sliver stays visible
    return { ...p, x0, x1, mid: (x0 + x1) / 2 };
  });

  const gap = 8;
  const boxW = (W - gap * (parts.length - 1)) / parts.length;

  const label = `Context ${formatTokenCount(used)} of ${formatTokenCount(max)} (${pct}%): ${parts
    .map((p) => `${p.label.toLowerCase()} ${formatTokenCount(p.tokens)}`)
    .join(', ')}; cache hit ${hit}%.`;

  // The window (0 → model max, used span lit) and the inset: shared by both forms.
  const windowMarks = (
    <>
      <rect
        x={X0}
        y={rulerY - 7}
        width={Math.max(scale(used) - X0, 1)}
        height={6}
        style={{ fill: heavy ? WARN : INK.lamp }}
      />
      {HEAVY_CONTEXT_TOKENS < max && (
        <line
          x1={scale(HEAVY_CONTEXT_TOKENS)}
          x2={scale(HEAVY_CONTEXT_TOKENS)}
          y1={rulerY - 9}
          y2={rulerY}
          style={{ stroke: WARN, strokeWidth: STROKE.hair }}
        />
      )}
      <Inset from={[X0, X0 + (X1 - X0) / k, rulerY]} box={INSET}>
        {segs.map((s) => (
          <rect
            key={s.key}
            x={s.x0}
            y={INSET.y + 2}
            width={s.x1 - s.x0}
            height={INSET.height - 4}
            style={{ fill: s.color, stroke: INK.paper, strokeWidth: 0.5 }}
          />
        ))}
      </Inset>
      {/* After the inset, so its projection lines break at the numbers. */}
      <Ruler x0={X0} x1={X1} y={rulerY} max={max} step={max / 10} labelEvery={5} fmt={formatTokenCount} numbers={!compact} />
    </>
  );

  if (compact) {
    return (
      <Figure fig="context" viewBox={`0 0 ${W} ${H}`} compactViewBox={`0 0 ${X1 + 1} ${C_H}`} compactMinWidth={160} fallback={fallback} label={label} paper="var(--ins-raised)" className={className}>
        {windowMarks}
      </Figure>
    );
  }

  return (
    <Figure fig="context" title={title} viewBox={`0 0 ${W} ${H}`} compactViewBox={`0 0 ${X1 + 1} ${C_H}`} minWidth={260} fallback={fallback} label={label} paper="var(--ins-raised)" className={className}>
      {/* Readout: used / window, and the share. */}
      <T x={X0} y={30}>
        <tspan style={{ fill: tone }}>{formatTokenCount(used)}</tspan>
        <tspan style={{ fill: INK.faint }}>{` / ${formatTokenCount(max)}`}</tspan>
      </T>
      <T x={W} y={30} anchor="end" color={tone}>{`${pct}%`}</T>

      {windowMarks}
      <T x={X1 + 8} y={INSET.y + INSET.height - 2}>{`× ${fmtFactor(k)}`}</T>

      {/* Leaders from each part to its box. */}
      {segs.map((s, i) => {
        const bx = i * (boxW + gap);
        const cx = bx + boxW / 2;
        const elbow = INSET.y + INSET.height + 8 + i * 4;
        return (
          <g key={s.key}>
            <Leader points={[[s.mid, INSET.y + INSET.height / 2], [s.mid, elbow], [cx, elbow], [cx, BOX_Y]]} />
            <Box x={bx} y={BOX_Y} width={boxW} label={s.label} value={`${formatTokenCount(s.tokens)} · ${share(s.tokens, partsTotal)}`} />
          </g>
        );
      })}

      {/* Cache hit: read / everything sent this turn. Double-ruled lamp box. */}
      <CacheHit x={W - 116} y={BOX_Y + 44} width={116} pct={hit} />
    </Figure>
  );
}

function CacheHit({ x, y, width, pct }) {
  const h = 22;
  const rule = { fill: 'none', stroke: INK.lamp, strokeWidth: STROKE.hair };
  return (
    <g>
      <rect x={x} y={y} width={width} height={h} style={{ ...rule, fill: INK.paper }} />
      <rect x={x + 2.5} y={y + 2.5} width={width - 5} height={h - 5} style={rule} />
      <T x={x + width / 2} y={y + 15} anchor="middle" color={INK.lamp}>{`CACHE HIT ${pct}%`}</T>
    </g>
  );
}
