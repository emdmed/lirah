import { Figure, INK, Node, STROKE, T, textWidth, useFigureCompact } from '@/components/instrument/figure';
import { compactCount } from '@/components/instrument/DiffBar';
import { dayKey, weekGrid } from './weekGrid';

// FIG.40: the week's changes as a feature × day grid. Features run down, the
// range's days across; each cell is a dot sized by the turns that feature took
// that day, its count beside it. A releases row on top sets a diamond per tag
// at its time of day; on the right each feature's ± lines bar (added in ink,
// removed muted). The bottom row totals every turn of the day, talk included.
// Compact or narrow, it lists the features with their ± lines.

const NAME_W = 200;
const COL = 56;
const ROW = 20;
const HEAD_Y = 12;
const REL_Y = 30;
const TOP = 44;
const BAR_W = 50;
const MIN_W = 480;
const R0 = 1.5;
const R1 = 6;

const day = (k) => new Date(`${k}T00:00`);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function LinesList({ rows }) {
  return (
    <ul className="flex flex-col gap-0.5 font-[family-name:var(--font-legend)] text-[11px] text-muted-foreground">
      {rows.map((r) => (
        <li key={r.id ?? 'none'} className="flex min-w-0 gap-2">
          <span className="min-w-0 flex-1 truncate text-foreground">{r.name}</span>
          <span className="shrink-0 tabular-nums">+{compactCount(r.added)} −{compactCount(r.removed)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Turns per feature per day of `range`; `features`, `talk` and `releases` as useChanges gives them. */
export function Fig40ChangesWeek({ features, talk, releases, range }) {
  const compact = useFigureCompact();
  const { days, rows, total, max } = weekGrid(features, talk, range);
  if (!rows.length) return null;
  if (compact) return <LinesList rows={rows} />;

  const X0 = NAME_W;
  const X1 = X0 + days.length * COL;
  const BAR0 = X1 + 10;
  const W = BAR0 + BAR_W + 44;
  const yOf = (i) => TOP + i * ROW + ROW / 2;
  const totalY = TOP + rows.length * ROW + 16;
  const bottom = totalY + 8;
  const maxLines = Math.max(1, ...rows.map((r) => r.added + r.removed));
  const totalMax = Math.max(1, ...total);
  const r = (n, of) => R0 + (R1 - R0) * Math.sqrt(n / of);

  // Releases in range, at their day column plus the time of day; a tag is
  // labelled only when the next one leaves room for it.
  const tags = releases
    .map((rel) => {
      const i = days.indexOf(dayKey(rel.at));
      if (i < 0) return null;
      return { ...rel, x: X0 + (i + (rel.at - day(days[i]).getTime()) / 86400000) * COL };
    })
    .filter(Boolean);

  const label = `Changes by feature and day, ${days[0]} to ${days.at(-1)}: ${rows.map((row) => `${row.name} ${row.cells.reduce((a, b) => a + b, 0)} turns, +${row.added} −${row.removed} lines`).join('; ')}. ${tags.length} releases. All turns per day: ${total.join(', ')}.`;

  const cell = (n, cx, y, of, color) => (n
    ? (
      <g>
        <circle cx={cx - 6} cy={y} r={r(n, of)} style={{ fill: color }} />
        <T x={cx - 6 + R1 + 3} y={y + 3.5} color={INK.muted}>{n}</T>
      </g>
    )
    : <circle cx={cx - 6} cy={y} r={1} style={{ fill: INK.faint }} />);

  return (
    <Figure fig="changes-week" viewBox={`0 0 ${W} ${bottom}`} minWidth={MIN_W} label={label} fallback={<LinesList rows={rows} />}>
      {days.map((k, i) => {
        const x = X0 + i * COL;
        const d = day(k);
        return (
          <g key={k}>
            {i > 0 && <line x1={x} x2={x} y1={HEAD_Y + 6} y2={bottom} style={{ stroke: INK.edge, strokeWidth: STROKE.hair }} />}
            <T x={x + COL / 2} y={HEAD_Y} anchor="middle" color={INK.muted}>
              {`${d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()} ${d.getDate()}`}
            </T>
          </g>
        );
      })}
      <T x={X0 - 10} y={REL_Y + 3.5} anchor="end" color={INK.faint}>releases</T>
      <line x1={X0} x2={X1} y1={REL_Y} y2={REL_Y} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} strokeDasharray="2 3" />
      {tags.map((t, i) => {
        const room = (tags[i + 1]?.x ?? X1 + 40) - t.x > textWidth(t.tag) + 10;
        return (
          <g key={t.tag}>
            <title>{`${t.tag} · ${new Date(t.at).toLocaleString()}`}</title>
            <Node x={t.x} y={REL_Y} state="merge" size={6} />
            {room && <T x={t.x + 7} y={REL_Y - 5} color={INK.fg} halo>{t.tag}</T>}
          </g>
        );
      })}
      <line x1={0} x2={W} y1={TOP - 4} y2={TOP - 4} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      {rows.map((row, ri) => {
        const y = yOf(ri);
        const lines = row.added + row.removed;
        const wa = (row.added / maxLines) * BAR_W;
        const wr = (row.removed / maxLines) * BAR_W;
        return (
          <g key={row.id ?? 'none'}>
            <title>{`${row.name}: ${row.cells.reduce((a, b) => a + b, 0)} turns, +${row.added} −${row.removed} lines`}</title>
            <T x={0} y={y + 3.5} color={row.id == null ? INK.muted : INK.fg}>{cut(row.name, Math.floor((NAME_W - 10) / 7))}</T>
            {row.cells.map((n, i) => <g key={days[i]}>{cell(n, X0 + i * COL + COL / 2, y, max, INK.fg)}</g>)}
            {wa > 0 && <rect x={BAR0} y={y - 3} width={wa} height={6} style={{ fill: INK.fg }} />}
            {wr > 0 && <rect x={BAR0 + wa} y={y - 3} width={wr} height={6} style={{ fill: INK.muted }} />}
            <T x={BAR0 + Math.max(wa + wr, 1) + 4} y={y + 3.5} color={INK.muted}>{lines ? `±${compactCount(lines)}` : '—'}</T>
          </g>
        );
      })}
      <line x1={0} x2={W} y1={totalY - 10} y2={totalY - 10} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
      <T x={0} y={totalY + 3.5} color={INK.muted}>all turns</T>
      {total.map((n, i) => <g key={days[i]}>{cell(n, X0 + i * COL + COL / 2, totalY, totalMax, INK.muted)}</g>)}
    </Figure>
  );
}
