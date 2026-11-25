import { Box, DASH, Figure, Glow, Hatch, INK, Leader, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { driftByChunk, overshootChunk } from './driftByChunk';

// FIG.38: how far each implemented chunk drifted from its planned files.
// Chunks hang on a spine; each bar is the planned files it touched in ink,
// the extra files it touched hatched after them, and the planned files it
// never touched as a dotted run at the end. A boxed planned→touched count
// sits beside the bar, the chunk's minutes on the right. The one chunk that
// overshot its plan most (driftByChunk's overshootChunk) glows, with a leader
// calling it a sweep. Compact or narrow, it lists the chunks that touched more
// than twice what they planned.

const W = 520;
const ROW = 22;
const TOP = 6;
const SPINE = 26;
const BAR0 = 40;
const BAR1 = 380;
const BAR_H = 8;
const NOTE_H = 30;
const MIN_W = 360;
const OVER = 2;

const over = (r) => r.touched.length > OVER * r.planned.length;
const count = (r) => `${r.planned.length}→${r.touched.length}`;

function OverList({ rows }) {
  const hits = rows.filter(over);
  if (!hits.length) return <div className="text-[11px] text-muted-foreground">every chunk stayed within {OVER}× its planned files</div>;
  return (
    <ul className="flex flex-col gap-0.5 font-[family-name:var(--font-legend)] text-[11px] text-muted-foreground">
      {hits.map((r) => (
        <li key={r.n} className="flex min-w-0 gap-2" title={r.title}>
          <span className="shrink-0 tabular-nums">{r.n}</span>
          <span className="min-w-0 truncate text-foreground">{r.title}</span>
          <span className="shrink-0 tabular-nums">{count(r)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Planned vs touched files per chunk. `files` is usePlanCommitFiles(plan, true). */
export function Fig38Drift({ plan, files }) {
  const compact = useFigureCompact();
  const note = (text) => <div className="text-[11px] text-muted-foreground">{text}</div>;
  if (files.loading && !Object.keys(files.byRepo).length) return note('reading commits…');
  const rows = driftByChunk(plan, files.byRepo);
  if (!rows.length) return note('no chunk commits yet');
  if (compact) return <OverList rows={rows} />;

  const sweep = overshootChunk(rows);
  const max = Math.max(1, ...rows.map((r) => r.touched.length + r.missed.length));
  const s = (BAR1 - BAR0) / max;
  const yOf = (i) => TOP + i * ROW + ROW / 2;
  const bottom = TOP + rows.length * ROW + (sweep ? NOTE_H : 0);
  const planned = new Set(rows.flatMap((r) => r.planned)).size;
  const touched = new Set(rows.flatMap((r) => r.touched)).size;
  const label = `Drift by chunk: ${rows.map((r) => `chunk ${r.n} planned ${r.planned.length} files, touched ${r.touched.length}, ${r.extra.length} unplanned, ${r.missed.length} planned but untouched`).join('; ')}.${sweep ? ` Chunk ${sweep.n} is a sweep, not a chunk.` : ''} ${planned} files planned, ${touched} touched.`;

  // The leader runs down from the sweep's bar end to its note under the rows;
  // drawn first, so the paper-filled count boxes break it where it crosses.
  const si = sweep ? rows.indexOf(sweep) : -1;
  const sx = sweep ? BAR0 + (sweep.touched.length + sweep.missed.length) * s : 0;
  const noteY = bottom - NOTE_H + 4;
  const lx = Math.min(sx + 10, W - 170);

  return (
    <Figure fig="drift" viewBox={`0 0 ${W} ${bottom + 22}`} minWidth={MIN_W} label={label} fallback={<OverList rows={rows} />}>
      <line x1={SPINE} x2={SPINE} y1={yOf(0)} y2={yOf(rows.length - 1)} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {sweep && <Leader points={[[sx, yOf(si) + BAR_H / 2], [sx, noteY + 10], [lx, noteY + 10]]} />}
      {sweep && <Box x={lx} y={noteY} label="a sweep, not a chunk" />}
      {rows.map((r, i) => {
        const y = yOf(i);
        const hit = (r.touched.length - r.extra.length) * s;
        const extra = r.extra.length * s;
        const missed = r.missed.length * s;
        const end = BAR0 + hit + extra + missed;
        const text = count(r);
        const bar = (
          <g>
            {hit > 0 && <rect x={BAR0} y={y - BAR_H / 2} width={hit} height={BAR_H} style={{ fill: INK.fg }} />}
            {extra > 0 && <Hatch x={BAR0 + hit} y={y - BAR_H / 2} width={extra} height={BAR_H} color={INK.muted} />}
            {missed > 0 && <rect x={BAR0 + hit + extra} y={y - BAR_H / 2} width={missed} height={BAR_H} strokeDasharray="1 2" style={{ fill: 'none', stroke: INK.muted, strokeWidth: STROKE.hair }} />}
          </g>
        );
        return (
          <g key={r.n}>
            <title>{`${r.n}. ${r.title}: ${r.planned.length} planned, ${r.touched.length} touched, ${r.extra.length} unplanned, ${r.missed.length} missed`}</title>
            <T x={SPINE - 10} y={y + 3.5} anchor="end" color={INK.muted}>{r.n}</T>
            <Node x={SPINE} y={y} state="done" size={6} />
            <line x1={SPINE + 4} x2={BAR0 - 2} y1={y} y2={y} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} strokeDasharray={DASH.fine} />
            {r === sweep ? <Glow>{bar}</Glow> : bar}
            <rect x={end + 8} y={y - 7.5} width={textWidth(text) + 10} height={15} style={{ fill: INK.paper, stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
            <T x={end + 13} y={y + 3.5} color={r === sweep ? INK.fg : INK.muted}>{text}</T>
            <T x={W - 4} y={y + 3.5} anchor="end" color={INK.faint}>{r.minutes == null ? '—' : `${r.minutes}m`}</T>
          </g>
        );
      })}
      <line x1={BAR0} x2={W - 4} y1={bottom + 4} y2={bottom + 4} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />
      <T x={BAR0} y={bottom + 18} color={INK.muted}>{`${planned} files planned · ${touched} touched`}</T>
    </Figure>
  );
}
