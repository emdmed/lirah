import { Dim, Figure, Hatch, INK, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { FILE_STATE_LABELS, FILE_STATE_ORDER } from './FileStateSelector';

// FIG.32: the attached files by intent, once there are too many to list by
// name. One node per file, grouped by intent, with a dimension over each
// group giving its count and intent. EDIT is filled ink, READ an outline,
// COPY hatched: how much the agent may do with each file.

const NODE_Y = 28; // node centre
const DIM_Y = NODE_Y + 18;
const H = DIM_Y + 6;
const GROUP_GAP = 22;

function FileNode({ x, y, size, state }) {
  const h = size / 2;
  if (state === 'use-as-example') {
    return <Hatch x={x - h} y={y - h} width={size} height={size} gap={3} color={INK.fg} stroke={INK.fg} />;
  }
  return (
    <rect
      x={x - h}
      y={y - h}
      width={size}
      height={size}
      style={state === 'modify'
        ? { fill: INK.fg }
        : { fill: INK.paper, stroke: INK.fg, strokeWidth: STROKE.hair }}
    />
  );
}

/** `selectedFiles` is a Set of paths, `fileStates` a Map path → intent. */
export function Fig32FilesByIntent({ selectedFiles, fileStates, fallback, className }) {
  const compact = useFigureCompact();
  const total = selectedFiles?.size || 0;
  if (!total) return fallback;

  const counts = {};
  selectedFiles.forEach((path) => {
    const state = fileStates?.get(path) || 'modify';
    counts[state] = (counts[state] || 0) + 1;
  });
  const states = FILE_STATE_ORDER.filter((s) => counts[s]);

  // Denser nodes for long lists, so a few dozen files still fit a row.
  const pitch = total > 24 ? 10 : 15;
  const size = total > 24 ? 7 : 9;

  // Each group is as wide as its nodes, or its dimension's label if wider.
  let x = 1;
  const groups = states.map((state) => {
    const n = counts[state];
    const text = `${n} ${FILE_STATE_LABELS[state].toLowerCase()}`;
    const nodesW = (n - 1) * pitch + size;
    const span = n > 1 ? Math.max(nodesW, textWidth(text) + 26) : Math.max(nodesW, textWidth(text));
    const g = { state, n, text, x0: x, span, first: x + (span - nodesW) / 2 + size / 2 };
    x += span + GROUP_GAP;
    return g;
  });
  const title = `CONTEXT · ${total} FILES`;
  // At least as wide as the FIG label, which is tracked 0.5px.
  const W = Math.ceil(Math.max(x - GROUP_GAP + 1, textWidth('FIG.32', 0.5) + 8 + textWidth(title, 0.5)));

  const label = `${total} attached files, listed in the files pane: ${groups
    .map((g) => `${g.n} ${FILE_STATE_LABELS[g.state]}`)
    .join(', ')}`;

  if (compact) {
    // Marks only: the nodes, a wider gap between intents.
    const CG = 10;
    let cx = 1 + size / 2;
    const placed = groups.map((g) => {
      const xs = Array.from({ length: g.n }, (_, i) => cx + i * pitch);
      cx = xs[xs.length - 1] + size + CG;
      return { ...g, xs };
    });
    const cW = Math.ceil(cx - CG - size / 2 + 1);
    return (
      <Figure fig="files-by-intent" viewBox={`0 0 ${W} ${H}`} compactViewBox={`0 0 ${cW} ${size + 2}`} fallback={fallback} label={label} className={className}>
        {placed.map((g) => g.xs.map((nx) => (
          <FileNode key={`${g.state}${nx}`} x={nx} y={1 + size / 2} size={size} state={g.state} />
        )))}
      </Figure>
    );
  }

  return (
    <Figure
      fig="files-by-intent"
      title={title}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 0 ${total * pitch + states.length * 10} ${size + 2}`}
      fallback={fallback}
      label={label}
      className={className}
    >
      {groups.map((g) => (
        <g key={g.state}>
          {Array.from({ length: g.n }, (_, i) => (
            <FileNode key={i} x={g.first + i * pitch} y={NODE_Y} size={size} state={g.state} />
          ))}
          {g.n > 1
            ? <Dim x1={g.x0} x2={g.x0 + g.span} y={DIM_Y} label={g.text} color={INK.fg} />
            : <T x={g.x0 + g.span / 2} y={DIM_Y + 3.5} anchor="middle" color={INK.fg}>{g.text}</T>}
        </g>
      ))}
    </Figure>
  );
}
