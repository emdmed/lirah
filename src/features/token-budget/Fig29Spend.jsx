import { Box, Dim, Figure, INK, Leader, Ruler, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { formatCost } from './tokenCalculations';

// FIG.29: spend by model, drawn once. One proportioned bar on a dollar
// ruler, a span per model with a boxed value (model · tokens, cost) on a
// leader, and the total as the dimension over all of it.

const W = 560;
const RULER_Y = 40; // numbers above, ticks up
const DIM_Y = 58;
const BAR_Y = 70;
const BAR_H = 8;
const BOX_Y = 104;
const BOX_H = 32;
const H = BOX_Y + BOX_H + 2;
const GAP = 8;
const FILLS = [INK.fg, INK.muted, INK.faint, INK.edgeStrong, INK.edge];

const tok = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(Math.round(n)));

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

function packRow(boxes) {
  const need = boxes.reduce((n, b) => n + b.w, 0) + GAP * Math.max(0, boxes.length - 1);
  if (need > W) return null;
  const left = [];
  boxes.forEach((b, i) => left.push(Math.max(b.c - b.w / 2, i ? left[i - 1] + boxes[i - 1].w + GAP : 0)));
  for (let i = boxes.length - 1; i >= 0; i--) {
    left[i] = Math.min(left[i], (i === boxes.length - 1 ? W : left[i + 1] - GAP) - boxes[i].w);
  }
  return left;
}

/**
 * `models` are [{ name, cost, tokens }] (modelBreakdown with display
 * names); `scope` names what was summed, for the title. Falls back when
 * nothing was spent.
 */
export function Fig29Spend({ models, scope, fallback, className }) {
  const compact = useFigureCompact();
  const list = (models || []).filter((m) => m.cost > 0).sort((a, b) => b.cost - a.cost);
  const total = list.reduce((n, m) => n + m.cost, 0);
  if (!(total > 0)) return fallback;

  const step = niceStep(total / 6);
  const max = Math.ceil(total / step - 1e-9) * step;
  const x = (v) => (v / max) * W;
  let at = 0;
  const spans = list.map((m, i) => {
    const x0 = x(at);
    at += m.cost;
    return { ...m, x0, x1: x(at), fill: FILLS[Math.min(i, FILLS.length - 1)] };
  });
  const end = x(total);

  const label = `Spend ${formatCost(total)}${scope ? ` in ${scope}` : ''}: ${list
    .map((m) => `${m.name} ${formatCost(m.cost)} (${tok(m.tokens)} tokens)`)
    .join(', ')}`;

  const bar = (y) => (
    <g>
      {spans.map((s) => (
        <rect
          key={s.name}
          x={s.x0}
          y={y}
          width={Math.max(s.x1 - s.x0, 2)}
          height={BAR_H}
          style={{ fill: s.fill, stroke: INK.paper, strokeWidth: 1 }}
        />
      ))}
    </g>
  );

  if (compact) {
    return (
      <Figure fig="spend-by-model" viewBox={`0 0 ${W} ${H}`} compactViewBox={`0 0 ${W} ${BAR_H + 4}`} compactMinWidth={200} fallback={fallback} label={label} className={className}>
        <line x1={0} x2={W} y1={2 + BAR_H / 2} y2={2 + BAR_H / 2} style={{ stroke: INK.edge, strokeWidth: 1 }} />
        {bar(2)}
      </Figure>
    );
  }

  // As many models as fit one row of boxes; the cheapest fold into "+N more".
  let boxes = [];
  let row = null;
  for (let keep = spans.length; keep >= 1 && !row; keep--) {
    const named = spans.slice(0, keep === spans.length ? keep : keep - 1);
    const rest = spans.slice(named.length);
    const items = named.map((s) => ({ key: s.name, name: `${s.name.toLowerCase()} · ${tok(s.tokens)} tok`, cost: s.cost, c: (s.x0 + s.x1) / 2 }));
    if (rest.length) {
      items.push({
        key: 'more',
        name: `+${rest.length} more · ${tok(rest.reduce((n, s) => n + s.tokens, 0))} tok`,
        cost: rest.reduce((n, s) => n + s.cost, 0),
        c: (rest[0].x0 + rest[rest.length - 1].x1) / 2,
      });
    }
    boxes = items.map((b) => ({ ...b, value: formatCost(b.cost), w: Math.max(textWidth(b.name), textWidth(formatCost(b.cost))) + 14 }));
    row = packRow(boxes);
  }
  row ||= boxes.map((_, i) => (i * W) / boxes.length);

  const fmt = (v) => `$${step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : Math.round(v)}`;

  return (
    <Figure
      fig="spend-by-model"
      title={scope ? `SPEND · ${scope.toUpperCase()}` : undefined}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 0 ${W} ${BAR_H + 4}`}
      compactMinWidth={200}
      minWidth={420}
      fallback={fallback}
      label={label}
      className={className}
    >
      {/* Leaders first: the bar and boxes sit over their ends. */}
      {boxes.map((b, i) => {
        const bx = Math.min(Math.max(b.c, row[i] + 10), row[i] + b.w - 10);
        const elbow = BAR_Y + BAR_H + 10 + (i % 2) * 5;
        return <Leader key={b.key} points={[[b.c, BAR_Y + BAR_H / 2], [b.c, elbow], [bx, elbow], [bx, BOX_Y]]} dot={false} />;
      })}

      <Ruler x0={0} x1={W} y={RULER_Y} max={max} step={step / 2} labelEvery={2} fmt={fmt} up />
      <Dim x1={0} x2={end} y={DIM_Y} label={`total ${formatCost(total)}`} color={INK.fg} />
      <line x1={end} x2={W} y1={BAR_Y + BAR_H / 2} y2={BAR_Y + BAR_H / 2} style={{ stroke: INK.edge, strokeWidth: 1 }} />
      {bar(BAR_Y)}

      {boxes.map((b, i) => <Box key={b.key} x={row[i]} y={BOX_Y} width={b.w} label={b.name} value={b.value} />)}
    </Figure>
  );
}
