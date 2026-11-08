import { Dim, Figure, INK, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.36: the files a pinned set sends (all of them). One square per file,
// grouped by feature, with a dimension per feature.

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

  let x = 1;
  const groups = groups0.map((f) => {
    const n = f.files.length;
    const text = `${short(f.name)} ${n}`;
    const nodesW = (n - 1) * pitch + size;
    const span = n > 1 ? Math.max(nodesW, textWidth(text) + 26) : Math.max(nodesW, textWidth(text));
    const first = x + (span - nodesW) / 2 + size / 2;
    const cx = Array.from({ length: n }, (_, i) => first + i * pitch);
    const g = { id: f.id, name: f.name, n, text, x0: x, span, cx };
    x += span + GROUP_GAP;
    return g;
  });
  const h = size / 2;

  const title = `PINNED · ${total} FILES`;
  const W = Math.ceil(Math.max(x - GROUP_GAP + 1, textWidth(title, 0.5)));
  const label = `Pinned features send ${total} files: ${groups.map((g) => `${g.name} ${g.n}`).join(', ')}`;

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
          {g.cx.map((cx, i) => <rect key={i} x={cx - h} y={NODE_Y - h} width={size} height={size} style={{ fill: INK.fg }} />)}
          {!compact && (g.n > 1
            ? <Dim x1={g.x0} x2={g.x0 + g.span} y={DIM_Y} label={g.text} color={INK.fg} />
            : <T x={g.x0 + g.span / 2} y={DIM_Y + 3.5} anchor="middle" color={INK.fg}>{g.text}</T>)}
        </g>
      ))}
    </Figure>
  );
}
