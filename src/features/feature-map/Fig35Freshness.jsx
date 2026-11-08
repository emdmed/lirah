import { Dim, Figure, INK, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';

// FIG.35: how far the feature map is behind. A commit rail from the commit
// the map was built at to HEAD (the lit node), one tick per commit, the count
// boxed on a dimension line under it, and the files no feature holds yet.
// Compact keeps only the rail.

const W = 260;
const X0 = 6;
const X1 = W - 6;
const RAIL = 28;
const DIM = 48;
const MAX_TICKS = 40; // past this the ticks blur into a bar; the boxed count still reads true

const short = (sha) => (sha ? String(sha).slice(0, 7) : '?');

/** `gitSha` is the map's build commit, `head` the repo's HEAD; counts are numbers or null. */
export function Fig35Freshness({ gitSha, head, commitsBehind, newFiles, fallback = null }) {
  const compact = useFigureCompact();
  const commits = commitsBehind || 0;
  const files = newFiles || 0;
  const ticks = Math.min(commits, MAX_TICKS);
  const count = `${commits} commit${commits === 1 ? '' : 's'}`;
  const boxW = textWidth(count) + 10;
  const label = `Feature map built at ${short(gitSha)}, ${count} behind HEAD ${short(head)}, ${files} new file${files === 1 ? '' : 's'} unplaced`;

  return (
    <Figure
      fig={35}
      viewBox={`0 0 ${W} 80`}
      compactViewBox={`0 ${RAIL - 8} ${W} 16`}
      minWidth={220}
      compactMinWidth={120}
      fallback={fallback}
      label={label}
      paper="var(--ins-panel)"
    >
      {!compact && (
        <>
          <T x={X0} y={14} color={INK.faint}>{short(gitSha)}</T>
          <T x={X1} y={14} anchor="end" color={INK.lamp}>{`HEAD ${short(head)}`}</T>
        </>
      )}
      <line x1={X0} x2={X1} y1={RAIL} y2={RAIL} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {Array.from({ length: Math.max(0, ticks - 1) }, (_, i) => {
        const x = X0 + ((i + 1) / ticks) * (X1 - X0);
        return <line key={i} x1={x} x2={x} y1={RAIL - 4} y2={RAIL + 4} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} />;
      })}
      <Node x={X0} y={RAIL} state="done" size={6} />
      <Node x={X1} y={RAIL} state="live" size={6} />
      {!compact && (
        <>
          <Dim x1={X0} x2={X1} y={DIM} />
          <rect x={(X0 + X1 - boxW) / 2} y={DIM - 8} width={boxW} height={16} style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
          <T x={(X0 + X1) / 2} y={DIM + 4} anchor="middle" color={INK.warn}>{count}</T>
          <T x={X0} y={74} color={files ? INK.warn : INK.faint}>{`${files} new file${files === 1 ? '' : 's'} unplaced`}</T>
        </>
      )}
    </Figure>
  );
}
