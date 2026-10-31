import { Box, DASH, Dim, Figure, INK, Leader, Ruler, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.24: what the next prompt costs, part by part. A dimension chain with
// one span per payload part (your prompt, files, template, …, the agent's
// system prompt) and the estimate as the outer dimension, on a token ruler.
// A dashed, unmeasured tail for the files the agent reads later. Under it,
// when a daily budget is set, the day's budget with where this prompt lands.

const W = 380;
const X1 = 240; // the ruler's end; the tail and its note use the rest
const BOX_Y = 22;
const BOX_H = 32;
const CHAIN_Y = 80;
const DIM_Y = CHAIN_Y + 24;
const RULER_Y = DIM_Y + 18;
const BUDGET_Y = RULER_Y + 50;
const GAP = 6;
const C_CHAIN = 6;
const C_BUDGET = 18;

const num = (n) => Math.round(n).toLocaleString('en-US');
const kfmt = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : String(Math.round(v)));
const money = (c) => (c < 0.01 ? '<$0.01' : `$${c.toFixed(2)}`);

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

// One row of boxes, each centred on its span where it can be, in order and
// inside [0, W]. Null when they don't fit.
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
 * `parts` are [{ id, name, detail?, tokens }] in payload order (the system
 * prompt last); `total` is their sum, `cost` its price. `budget` is
 * { limit, used } when a daily limit is set, else null.
 */
export function Fig24PromptCost({ parts, total, cost, budget, fallback, className }) {
  const compact = useFigureCompact();
  if (!(total > 0) || !parts?.length) return fallback;

  const step = niceStep(total / 3);
  const max = Math.ceil(total / step) * step;
  const x = (v) => (v / max) * X1;
  let at = 0;
  const spans = parts.map((p) => {
    const x0 = x(at);
    at += p.tokens;
    return { ...p, x0, x1: x(at) };
  });
  // The parts are rounded per section; the chain ends where they add up.
  const end = x(at);

  const room = budget ? Math.max(0, budget.limit - budget.used - total) : null;
  const over = budget && budget.used + total > budget.limit;
  const label = [
    `Next prompt ≈ ${num(total)} tokens, ${money(cost)}: ${parts.map((p) => `${p.name}${p.detail ? ` ${p.detail}` : ''} ≈ ${num(p.tokens)}`).join(', ')}`,
    'files the agent reads later are not counted',
    budget && (over
      ? `this prompt goes past the daily ${kfmt(budget.limit)} budget (${kfmt(budget.used)} used)`
      : `daily budget ${kfmt(budget.limit)}: ${kfmt(budget.used)} used, ${kfmt(room)} left after this prompt`),
  ].filter(Boolean).join('; ');

  const chain = (y) => (
    <g>
      <path
        d={`M${end} ${y}H${W}`}
        style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
      />
      <line x1={0} x2={end} y1={y} y2={y} style={{ stroke: INK.fg, strokeWidth: STROKE.ink }} />
      {spans.slice(1).map((s) => (
        <line key={s.id} x1={s.x0} x2={s.x0} y1={y - 4} y2={y + 4} style={{ stroke: INK.fg, strokeWidth: STROKE.hair }} />
      ))}
      <line x1={end} x2={end} y1={y - 5} y2={y + 5} style={{ stroke: INK.fg, strokeWidth: STROKE.hair }} />
      <rect x={-3} y={y - 3} width={6} height={6} style={{ fill: INK.fg }} />
    </g>
  );

  // The budget bar: 0 → limit across the width, used in ink, this prompt
  // as a lamp mark at its end (fault when it would go over).
  const bx = (v) => Math.min(W, (v / budget.limit) * W);
  const budgetBar = (y) => {
    const ux = bx(budget.used);
    const px = Math.max(bx(budget.used + total), ux + 5);
    return (
      <g>
        <line x1={0} x2={W} y1={y} y2={y} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
        <rect x={0} y={y - 2} width={Math.max(ux, 1)} height={3} style={{ fill: INK.muted }} />
        <rect x={Math.min(ux, W - 5)} y={y - 3.5} width={Math.min(px, W) - Math.min(ux, W - 5)} height={6} style={{ fill: over ? INK.fault : INK.lamp }} />
      </g>
    );
  };

  if (compact) {
    return (
      <Figure fig="prompt-cost" viewBox={`0 0 ${W} 40`} compactViewBox={`-4 0 ${W + 4} ${budget ? C_BUDGET + 6 : C_CHAIN + 6}`}
      compactMinWidth={200} fallback={fallback} label={label} paper="var(--ins-raised)" className={className}>
        {chain(C_CHAIN)}
        {budget && budgetBar(C_BUDGET)}
      </Figure>
    );
  }

  // Boxes: full names first, then short details only, then none, then the
  // smallest parts folded into "+N more" (its leader goes to the largest
  // of them), until one row fits.
  const boxFor = (name, value, c, id) => ({ id, name, value, c, w: Math.max(textWidth(name), textWidth(value)) + 14 });
  const sys = spans[spans.length - 1];
  const others = spans.slice(0, -1);
  const bySize = others.slice().sort((p, q) => p.tokens - q.tokens);
  let row = null;
  let boxes = [];
  for (let attempt = 0; attempt < 3 + others.length && !row; attempt++) {
    const fold = attempt >= 3 ? attempt - 1 : 0;
    const folded = fold ? bySize.slice(0, Math.min(fold, others.length)) : [];
    let list = others.filter((s) => !folded.includes(s));
    if (folded.length) {
      const big = folded[folded.length - 1];
      list.push({ id: 'more', name: `+${folded.length} more`, tokens: folded.reduce((n, s) => n + s.tokens, 0), x0: big.x0, x1: big.x1 });
    }
    list = [...list.sort((p, q) => p.x0 - q.x0), sys];
    boxes = list.map((s) => {
      const detail = s.detail && (attempt === 0 || (attempt === 1 && s.detail.length <= 3)) ? ` · ${s.detail}` : '';
      return boxFor(`${s.name}${detail}`, `≈ ${num(s.tokens)}`, (s.x0 + s.x1) / 2, s.id);
    });
    row = packRow(boxes);
  }
  row ||= boxes.map((_, i) => i * (W / boxes.length));

  const H = budget ? BUDGET_Y + 26 : RULER_Y + 24;
  const ux = budget ? bx(budget.used) : 0;
  const px = budget ? Math.max(bx(budget.used + total), ux + 5) : 0;
  const dailyText = budget ? `daily ${kfmt(budget.limit)}` : '';
  const usedText = budget ? `used ${kfmt(budget.used)}` : '';
  const usedApart = budget && ux - 6 - textWidth(usedText) > textWidth(dailyText) + 12;
  const promptRight = budget && Math.min(px, W) + 6 + textWidth('+ this prompt') <= W;
  const remainText = budget ? (over ? `over by ${kfmt(budget.used + total - budget.limit)}` : `remaining ${kfmt(room)}`) : '';

  return (
    <Figure
      fig="prompt-cost"
      title={`NEXT PROMPT · ≈ ${num(total)} TOK · ${money(cost)}`}
      viewBox={`-4 0 ${W + 4} ${H}`}
      compactViewBox={`-4 0 ${W + 4} ${budget ? C_BUDGET + 6 : C_CHAIN + 6}`}
      compactMinWidth={200}
      minWidth={340}
      fallback={fallback}
      label={label}
      paper="var(--ins-raised)"
      className={className}
    >
      {/* Leaders from each box to its span on the chain. */}
      {boxes.map((b, i) => {
        const bxc = Math.min(Math.max(b.c, row[i] + 6), row[i] + b.w - 6);
        const elbow = BOX_Y + BOX_H + 8 + (i % 2) * 5;
        return <Leader key={b.id} points={[[b.c, CHAIN_Y - 3], [b.c, elbow], [bxc, elbow], [bxc, BOX_Y + BOX_H]]} dot={false} />;
      })}
      {boxes.map((b, i) => <Box key={b.id} x={row[i]} y={BOX_Y} width={b.w} label={b.name} value={b.value} />)}

      {chain(CHAIN_Y)}
      <T x={X1 + 8} y={CHAIN_Y + 15} color={INK.faint}>files the agent</T>
      <T x={X1 + 8} y={CHAIN_Y + 28} color={INK.faint}>reads: not counted</T>

      <Dim x1={0} x2={end} y={DIM_Y} label={`≈ ${num(total)}`} color={INK.fg} />
      <Ruler x0={0} x1={X1} y={RULER_Y} max={max} step={step / 2} labelEvery={2} fmt={kfmt} />

      {budget && (
        <g>
          <T x={0} y={BUDGET_Y - 9} color={INK.faint}>{usedApart ? dailyText : `${dailyText} · ${usedText}`}</T>
          {usedApart && <T x={ux - 6} y={BUDGET_Y - 9} anchor="end">{usedText}</T>}
          {promptRight
            ? <T x={Math.min(px, W) + 6} y={BUDGET_Y - 9} color={over ? INK.fault : INK.lamp}>+ this prompt</T>
            : <T x={0} y={BUDGET_Y + 20} color={over ? INK.fault : INK.lamp}>+ this prompt</T>}
          {budgetBar(BUDGET_Y)}
          {!over && px < W - 8 && (
            <path
              d={`M${px} ${BUDGET_Y + 4}v4H${W}v-4`}
              style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair }}
            />
          )}
          <T x={W} y={BUDGET_Y + 20} anchor="end" color={over ? INK.fault : INK.fg}>{remainText}</T>
        </g>
      )}
    </Figure>
  );
}
