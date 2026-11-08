import { Dim, Figure, Hatch, INK, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.36: the files a pinned set sends. One square per file, grouped by
// feature, with a dimension per feature. Squares the hook drops (past the
// 40-file cap, or a feature past the third) are hatched; a CAP 40 tick in
// warn marks where the file cap cuts.

const FEATURES_MAX = 3; // same caps as buildPrompt's FEATURE lines
const FILES_MAX = 40;
const NODE_Y = 28;
const DIM_Y = NODE_Y + 18;
const H = DIM_Y + 6;
const GROUP_GAP = 22;
const NAME_MAX = 18;

const short = (s) => (s.length > NAME_MAX ? `${s.slice(0, NAME_MAX - 1)}…` : s);

/** `features` is the tab store's pinned list: [{ id, name, files }]. */
export function Fig36FeatureFiles({ features, fallback, className }) {
  const compact = useFigureCompact();
  const groups0 = (features || []).filter((f) => f.files?.length);
  const total = groups0.reduce((n, f) => n + f.files.length, 0);
  if (!total) return fallback ?? null;

  const pitch = total > 24 ? 10 : 15;
  const size = total > 24 ? 7 : 9;

  // Mirror buildFeatureLines: first 3 features, files until the budget runs out.
  let budget = FILES_MAX;
  let x = 1;
  const xs = []; // every square's centre, in send order
  const groups = groups0.map((f, fi) => {
    const n = f.files.length;
    const sent = fi < FEATURES_MAX ? Math.min(n, Math.max(budget, 0)) : 0;
    if (fi < FEATURES_MAX) budget -= n;
    const text = `${short(f.name)} ${n}`;
    const nodesW = (n - 1) * pitch + size;
    const span = n > 1 ? Math.max(nodesW, textWidth(text) + 26) : Math.max(nodesW, textWidth(text));
    const first = x + (span - nodesW) / 2 + size / 2;
    const cx = Array.from({ length: n }, (_, i) => first + i * pitch);
    if (fi < FEATURES_MAX) xs.push(...cx);
    const g = { id: f.id, name: f.name, n, sent, text, x0: x, span, cx };
    x += span + GROUP_GAP;
    return g;
  });
  const sentTotal = groups.reduce((n, g) => n + g.sent, 0);
  // The tick sits between the 40th and 41st candidate file.
  const capX = xs.length > FILES_MAX ? (xs[FILES_MAX - 1] + xs[FILES_MAX]) / 2 : null;

  const title = `PINNED · ${sentTotal} OF ${total} FILES`;
  const W = Math.ceil(Math.max(x - GROUP_GAP + 1, textWidth(title, 0.5), capX != null ? capX + 4 + textWidth('CAP 40') : 0));
  const h = size / 2;
  const label = `Pinned features send ${sentTotal} of ${total} files: ${groups
    .map((g) => `${g.name} ${g.sent} of ${g.n}`)
    .join(', ')}`;

  return (
    <Figure
      fig="feature-files"
      title={title}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 ${NODE_Y - h - 1} ${W} ${size + 2}`}
      fallback={fallback}
      label={label}
      className={className}
    >
      {groups.map((g) => (
        <g key={g.id}>
          {g.cx.map((cx, i) => (i < g.sent
            ? <rect key={i} x={cx - h} y={NODE_Y - h} width={size} height={size} style={{ fill: INK.fg }} />
            : <Hatch key={i} x={cx - h} y={NODE_Y - h} width={size} height={size} gap={3} />))}
          {!compact && (g.n > 1
            ? <Dim x1={g.x0} x2={g.x0 + g.span} y={DIM_Y} label={g.text} color={INK.fg} />
            : <T x={g.x0 + g.span / 2} y={DIM_Y + 3.5} anchor="middle" color={INK.fg}>{g.text}</T>)}
        </g>
      ))}
      {capX != null && !compact && (
        <g>
          <line x1={capX} x2={capX} y1={NODE_Y - 14} y2={NODE_Y + h + 3} style={{ stroke: INK.warn, strokeWidth: STROKE.ink }} />
          <T x={capX + 3} y={NODE_Y - 9} color={INK.warn}>CAP 40</T>
        </g>
      )}
    </Figure>
  );
}
