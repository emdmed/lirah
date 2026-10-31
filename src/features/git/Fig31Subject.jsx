import { DASH, Dim, Figure, INK, STROKE, T, CH, useFigureCompact } from '@/components/instrument/figure';

// FIG.31: the commit subject set on a character ruler. One tick per
// character (the legend face advances CH px a character, so each letter sits
// over its own tick), 50 dashed as the usual target, the limit as a solid
// line in the fault colour, and a dimension for the subject's length.
// Characters past the limit sit beyond the line in the fault colour.
// Compact keeps the ruler, the two marks and the length line.

export const SUBJECT_TARGET = 50;

const X0 = 2;
const TEXT_Y = 40;
const RULER_Y = 48;
const DIM_Y = 82;

/** `subject` is the message's first line; `max` the limit (SUBJECT_MAX). */
export function Fig31Subject({ subject, max, fallback = null }) {
  const compact = useFigureCompact();
  const len = subject.length;
  const n = Math.max(max + 8, Math.ceil((len + 3) / 10) * 10);
  const x = (i) => X0 + i * CH;
  const W = x(n) + 40;
  const H = DIM_Y + 8;
  const over = len > max;

  const label = [
    `Subject ${len} of ${max} characters`,
    over ? `${len - max} over the limit` : len > SUBJECT_TARGET ? `past the ${SUBJECT_TARGET}-character target` : 'within the target',
  ].join(', ');

  const head = subject.slice(0, max);
  const tail = subject.slice(max);

  return (
    <Figure
      fig="subject"
      title={`SUBJECT · ${len} / ${max}`}
      viewBox={`0 0 ${W} ${H}`}
      compactViewBox={`0 ${RULER_Y - 12} ${W} 26`}
      minWidth={320}
      compactMinWidth={200}
      fallback={fallback}
      label={label}
      paper="var(--ins-panel)"
    >
      {/* Target and limit, drawn first so the ruler's numbers break at them. */}
      <path
        d={`M${x(SUBJECT_TARGET)} ${compact ? RULER_Y - 8 : len > SUBJECT_TARGET ? TEXT_Y + 3 : TEXT_Y - 14}V${RULER_Y + 8}`}
        style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
      />
      <path
        d={`M${x(max)} ${compact ? RULER_Y - 10 : TEXT_Y - 20}V${RULER_Y + 8}`}
        style={{ fill: 'none', stroke: INK.fault, strokeWidth: STROKE.hair }}
      />
      {compact ? (
        <g>
          <line x1={x(0)} x2={x(n)} y1={RULER_Y} y2={RULER_Y} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
          {Array.from({ length: n / 10 + 1 }, (_, i) => (
            <line key={i} x1={x(i * 10)} x2={x(i * 10)} y1={RULER_Y} y2={RULER_Y + 4} style={{ stroke: INK.faint, strokeWidth: STROKE.hair }} />
          ))}
          {len > 0 && (
            <path
              d={`M${x(0)} ${RULER_Y - 4}H${x(len)}M${x(len)} ${RULER_Y - 7}V${RULER_Y - 1}`}
              style={{ fill: 'none', stroke: over ? INK.fault : INK.fg, strokeWidth: STROKE.ink }}
            />
          )}
        </g>
      ) : (
        <g>
          <T x={x(max) + 5} y={TEXT_Y - 12} color={INK.fault}>limit</T>
          <text x={x(0)} y={TEXT_Y} style={{ fontFamily: 'var(--font-legend)', fontSize: 11, whiteSpace: 'pre' }}>
            <tspan style={{ fill: INK.fg }}>{head}</tspan>
            {tail && <tspan style={{ fill: INK.fault }}>{tail}</tspan>}
          </text>
          {/* One tick per character, numbered every ten; the limit's own
              number replaces a ten it would crowd. */}
          <line x1={x(0)} x2={x(n)} y1={RULER_Y} y2={RULER_Y} style={{ stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
          {Array.from({ length: n + 1 }, (_, i) => {
            const major = i % 10 === 0;
            const crowded = major && i !== max && Math.abs(i - max) < 5;
            return (
              <g key={i}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={RULER_Y}
                  y2={RULER_Y + (major || i === max ? 6 : 3)}
                  style={{ stroke: major ? INK.faint : INK.edgeStrong, strokeWidth: STROKE.hair }}
                />
                {major && !crowded && (
                  <T x={x(i)} y={RULER_Y + 17} anchor={i === 0 ? 'start' : 'middle'} color={i === SUBJECT_TARGET ? INK.muted : INK.faint} halo>
                    {i}
                  </T>
                )}
              </g>
            );
          })}
          <T x={x(max)} y={RULER_Y + 17} anchor="middle" color={INK.fault} halo>{max}</T>
          {len > 0 && <Dim x1={x(0)} x2={x(len)} y={DIM_Y} label={`${len} chars`} color={over ? INK.fault : INK.fg} />}
        </g>
      )}
    </Figure>
  );
}
