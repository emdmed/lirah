import { Box, DASH, Figure, Hatch, INK, Leader, Ruler, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { formatTokenCount } from './tokenCalculations';
import { groupLabel, sharePct } from './contextGroups';

// FIG.23: what the used context is made of, on one token ruler. Each source
// is a span whose width is its share, with a boxed value (name · % · tokens)
// on a leader, alternately above and below the strip. The part the
// transcript can't account for (`unlogged`) is hatched. The largest single
// piece is bracketed on its source and hangs off it on a leader.

const W = 288;
const GAP = 6;
const TOP_Y = 22; // top row of boxes
const BOX_H = 32;
const STRIP_Y = TOP_Y + BOX_H + 14;
const STRIP_H = 10;
const RULER_Y = STRIP_Y + STRIP_H + 2;
const BOT_Y = RULER_Y + 32;
const PIECE_Y = BOT_Y + BOX_H + 16;
const MAX_BOXES = 6;
const CORRIDOR = 12; // room on the left for the largest piece's leader

// Short names, so three boxes fit across 288px.
const SHORT = {
  results: 'tool results',
  calls: 'tool calls',
  thinking: 'thinking',
  reminders: 'reminders',
  tools: 'tool defs',
  system: 'system',
  replies: 'replies',
  prompts: 'prompts',
  images: 'images',
  unlogged: 'sys + tools',
  other: 'other',
};
// Ink, darkest-first after the lead: the strip reads by order, not hue.
const FILLS = [INK.fg, INK.muted, INK.faint, INK.edgeStrong, INK.edge];

const kfmt = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : String(Math.round(v)));
const baseName = (s) => String(s || '').split('/').filter(Boolean).pop() || s;

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

// Pack boxes in one row: each wants to centre on its span, keeps order, and
// stays inside [minX, W]. Returns lefts, or null when they don't fit.
function packRow(boxes, minX) {
  const need = boxes.reduce((n, b) => n + b.w, 0) + GAP * Math.max(0, boxes.length - 1);
  if (need > W - minX) return null;
  const left = [];
  boxes.forEach((b, i) => {
    const prev = i ? left[i - 1] + boxes[i - 1].w + GAP : minX;
    left.push(Math.max(b.c - b.w / 2, prev));
  });
  for (let i = boxes.length - 1; i >= 0; i--) {
    const limit = i === boxes.length - 1 ? W : left[i + 1] - GAP;
    left[i] = Math.min(left[i], limit - boxes[i].w);
  }
  return left;
}

/**
 * `breakdown` is get_context_breakdown's result (groups, items,
 * total_tokens). Falls back when there is nothing measured.
 */
export function Fig23Sources({ breakdown, fallback, className }) {
  const compact = useFigureCompact();
  const total = breakdown?.total_tokens || 0;
  const groups = (breakdown?.groups || []).filter((g) => g.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  if (!total || !groups.length) return fallback;

  const sum = groups.reduce((n, g) => n + g.tokens, 0);
  const x = (v) => (v / sum) * W;
  let at = 0;
  const spans = groups.map((g, i) => {
    const x0 = x(at);
    at += g.tokens;
    return { ...g, x0, x1: x(at), fill: FILLS[Math.min(i, FILLS.length - 1)] };
  });

  const piece = breakdown.items?.[0];
  const pieceSpan = piece && spans.find((s) => s.group === piece.group);
  const pieceX1 = pieceSpan ? Math.min(pieceSpan.x1, pieceSpan.x0 + Math.max(x(piece.tokens), 3)) : 0;
  const hatched = spans.some((s) => s.group === 'unlogged');
  const pieceName = piece && (piece.label ? `${piece.kind.toLowerCase()} ${baseName(piece.label)}` : piece.kind.toLowerCase());

  const label = [
    `Context ${kfmt(total)} by source: ${groups.map((g) => `${groupLabel(g.group).toLowerCase()} ${sharePct(g.tokens, total)} (${kfmt(g.tokens)})`).join(', ')}`,
    hatched && 'system prompt and tools are not in the transcript',
    piece && `largest piece ${pieceName}, ${kfmt(piece.tokens)}`,
  ].filter(Boolean).join('; ');

  const strip = (y) => (
    <g>
      {spans.map((s) => (s.group === 'unlogged' ? (
        <Hatch key={s.group} x={s.x0} y={y} width={Math.max(s.x1 - s.x0, 1)} height={STRIP_H} stroke={INK.edgeStrong} />
      ) : (
        <rect
          key={s.group}
          x={s.x0}
          y={y}
          width={Math.max(s.x1 - s.x0, 1)}
          height={STRIP_H}
          style={{ fill: s.fill, stroke: INK.paper, strokeWidth: 1 }}
        />
      )))}
    </g>
  );

  if (compact) {
    return (
      <Figure fig="context-sources" viewBox={`0 0 ${W} ${PIECE_Y}`} compactViewBox={`0 0 ${W} ${STRIP_H + 4}`} fallback={fallback} label={label} paper="var(--ins-raised)" className={className}>
        {strip(2)}
      </Figure>
    );
  }

  // Boxes: as many named sources as fit, the rest folded into "+N more".
  const boxFor = (name, tokens, c, group) => {
    const value = `${sharePct(tokens, total)} · ${kfmt(tokens)}`;
    return { name, value, c, group, w: Math.max(textWidth(name), textWidth(value)) + 14 };
  };
  let rows = null;
  for (let n = Math.min(MAX_BOXES, spans.length); n >= 1 && !rows; n--) {
    const named = spans.slice(0, spans.length <= n ? n : n - 1);
    const rest = spans.slice(named.length);
    const boxes = named.map((s) => boxFor(SHORT[s.group] || s.group, s.tokens, (s.x0 + s.x1) / 2, s.group));
    if (rest.length) {
      const t = rest.reduce((m, s) => m + s.tokens, 0);
      boxes.push(boxFor(`+${rest.length} more`, t, (rest[0].x0 + W) / 2, null));
    }
    const ordered = boxes.map((b, i) => ({ ...b, i })).sort((a, b) => a.c - b.c);
    const top = ordered.filter((_, k) => k % 2 === 0);
    const bot = ordered.filter((_, k) => k % 2 === 1);
    const topL = packRow(top, 0);
    const botL = packRow(bot, piece && pieceSpan?.x0 < CORRIDOR ? CORRIDOR : 0);
    if (topL && botL) {
      rows = [
        ...top.map((b, k) => ({ ...b, x: topL[k], y: TOP_Y, up: true })),
        ...bot.map((b, k) => ({ ...b, x: botL[k], y: BOT_Y, up: false })),
      ];
    }
  }
  rows ||= [];

  const step = niceStep(sum / 4);
  const pieceText = piece ? `largest piece · ${pieceName} · ${kfmt(piece.tokens)}` : '';
  // The piece's line hangs right of its leader, or left of it when the
  // source sits too far right for the line to fit.
  const legX = pieceSpan ? pieceSpan.x0 + 1 : 0;
  const pieceLeft = piece && legX + 9 + textWidth(pieceText) > W && legX - 9 >= textWidth(pieceText);
  const pieceX = pieceLeft ? legX - 9 : legX + 9;
  const maxPiece = Math.floor((pieceLeft ? pieceX : W - pieceX) / 7);
  const H = PIECE_Y + (hatched ? 18 : 4);

  return (
    <Figure
      fig="context-sources"
      title={`CONTEXT · ${kfmt(total).toUpperCase()} BY SOURCE`}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 0 ${W} ${STRIP_H + 4}`}
      minWidth={260}
      fallback={fallback}
      label={label}
      paper="var(--ins-raised)"
      className={className}
    >
      {/* Leaders first, so the ruler's numbers break them. */}
      {rows.map((b) => {
        const cx = Math.min(Math.max(b.c, b.x + 6), b.x + b.w - 6);
        const elbow = b.up ? STRIP_Y - 7 : BOT_Y - 8;
        const pts = b.up
          ? [[b.c, STRIP_Y], [b.c, elbow], [cx, elbow], [cx, b.y + BOX_H]]
          : [[b.c, STRIP_Y + STRIP_H], [b.c, elbow], [cx, elbow], [cx, b.y]];
        return <Leader key={b.name} points={pts} dot={false} />;
      })}
      {piece && pieceSpan && (
        <Leader points={[[legX, STRIP_Y + STRIP_H + 3], [legX, PIECE_Y - 4], [pieceLeft ? legX - 5 : legX + 5, PIECE_Y - 4]]} dot={false} />
      )}

      {strip(STRIP_Y)}
      {piece && pieceSpan && (
        <rect
          x={pieceSpan.x0 + 0.5}
          y={STRIP_Y - 3}
          width={Math.max(pieceX1 - pieceSpan.x0 - 1, 2)}
          height={STRIP_H + 6}
          style={{ fill: 'none', stroke: INK.fg, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
        />
      )}
      <Ruler x0={0} x1={W} y={RULER_Y} max={sum} step={step / 5} labelEvery={5} fmt={kfmt} />

      {rows.map((b) => <Box key={b.name} x={b.x} y={b.y} width={b.w} label={b.name} value={b.value} />)}

      {piece && (
        <T x={pieceX} y={PIECE_Y} anchor={pieceLeft ? 'end' : 'start'}>
          {pieceText.length > maxPiece ? `${pieceText.slice(0, maxPiece - 1)}…` : pieceText}
        </T>
      )}
      {hatched && <T x={W} y={PIECE_Y + 15} anchor="end" color={INK.faint}>hatched: not in transcript</T>}
    </Figure>
  );
}
