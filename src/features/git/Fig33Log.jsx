import { Figure, INK, Node, STROKE, T, CH, useFigureCompact } from '@/components/instrument/figure';
import { formatAgo } from '@/lib/formatDuration';

// FIG.33: the commit about to land, set on top of the branch's last commits
// as `git log --oneline` reads: a rail with one node per commit, the hash,
// how long ago, and the subject. The new commit is the lit node; its subject
// is in ink, the older ones muted, so the new line reads against the repo's
// own style. Characters past the subject limit are in the fault colour.
// Compact drops hash and age.

const ROW = 18;
const TOP = 26;
const RAIL_X = 6;
const HASH_X = 20;
const AGE_END = 104;
const SUBJ_X = 114;
const OVERFLOW = 8; // characters drawn past the limit before the ellipsis

const fit = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * `subject` is the new message's first line; `max` the limit (SUBJECT_MAX).
 * `commits` are `{ hash, time, subject }` newest first, `time` in ms.
 */
export function Fig33Log({ subject, max, commits = [], branch, now = Date.now(), fallback = null }) {
  const compact = useFigureCompact();
  const subjX = compact ? HASH_X : SUBJ_X;
  const limitX = subjX + max * CH;
  const W = limitX + OVERFLOW * CH + 8;
  const rows = [{ hash: null, subject, time: null }, ...commits];
  const y = (i) => TOP + i * ROW;
  const H = y(rows.length - 1) + 8;
  const over = subject.length > max;

  const label = [
    `New commit, subject ${subject.length} of ${max} characters${over ? `, ${subject.length - max} over` : ''}`,
    commits.length ? `on top of ${commits.length} earlier commits${branch ? ` on ${branch}` : ''}` : 'first commit',
  ].join(', ');

  return (
    <Figure
      fig="log"
      title={`LOG${branch ? ` · ${branch}` : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 ${TOP - 10} ${W} ${H - TOP + 10}`}
      minWidth={420}
      compactMinWidth={240}
      fallback={fallback}
      label={label}
      paper="var(--ins-panel)"
    >
      {/* The rail runs from the new commit down past the oldest shown. */}
      {rows.length > 1 && (
        <path
          d={`M${RAIL_X} ${y(0)}V${H}`}
          style={{ fill: 'none', stroke: INK.edgeStrong, strokeWidth: STROKE.hair }}
        />
      )}

      {rows.map((r, i) => {
        const cy = y(i);
        const ty = cy + 4;
        const fresh = i === 0;
        const head = r.subject.slice(0, max);
        const tail = r.subject.slice(max);
        return (
          <g key={r.hash ?? 'new'}>
            <Node x={RAIL_X} y={cy} state={fresh ? 'live' : 'done'} size={fresh ? 6 : 5} />
            {!compact && (
              <>
                <T x={HASH_X} y={ty} color={fresh ? INK.lamp : INK.faint}>{fresh ? 'new' : r.hash}</T>
                {!fresh && <T x={AGE_END} y={ty} anchor="end" color={INK.faint}>{formatAgo(now - r.time)}</T>}
              </>
            )}
            <text x={subjX} y={ty} style={{ fontFamily: 'var(--font-legend)', fontSize: 11, whiteSpace: 'pre' }}>
              {fresh ? (
                <>
                  <tspan style={{ fill: INK.fg }}>{head || ' '}</tspan>
                  {tail && <tspan style={{ fill: INK.fault }}>{fit(tail, OVERFLOW)}</tspan>}
                </>
              ) : (
                <tspan style={{ fill: INK.muted }}>{fit(r.subject, max)}</tspan>
              )}
            </text>
          </g>
        );
      })}
    </Figure>
  );
}
