import { DASH, INK, STROKE, T, textWidth } from './figure/kit';
import { useFigureCompact } from './figure/Figure';

// P5. A diff's size as a dimension pair: two spans out from a centre tick,
// added lines to the right, removed to the left. Linear up to 200 lines
// (at LINEAR of the side), logarithmic past it up to 200k, and the 200 point
// is marked by a dotted line on both sides, so a +12 and a +147k can share a
// list and both still read. Full prints both values at the span ends;
// compact keeps the spans and the 200 marks, the values go to the tooltip.

const KNEE = 200;
const LINEAR = 0.6; // share of the side the first 200 lines take
const DECADES = 3; // 200 → 200k fills the rest
const H = 14;
const MID = 7;
const GAP = 5; // between a span's end tick and its value

// Pixels from the centre for n lines on a side of `side` px.
export function diffReach(n, side) {
  if (!(n > 0)) return 0;
  const t = n <= KNEE
    ? (n / KNEE) * LINEAR
    : LINEAR + (1 - LINEAR) * Math.min(1, Math.log10(n / KNEE) / DECADES);
  return Math.max(2, Math.round(t * side));
}

// Line counts past four digits read as a size, not a number: 146812 → 147k.
export function compactCount(n) {
  if (n < 10000) return String(n);
  if (n < 1e6) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * `side` is the length of one span at 200k lines; keep it the same down a
 * list so the rows compare. `fmt` formats the printed
 * values (compactCount in tight rows). `values={false}` draws the spans only,
 * as compact does. Zero on a side draws nothing there.
 */
export function DiffBar({ added = 0, removed = 0, side = 40, fmt = String, values = true, className }) {
  const compact = useFigureCompact();
  if (added + removed === 0) return null;
  const showValues = values && !compact;

  const addText = added > 0 ? `+${fmt(added)}` : '';
  const remText = removed > 0 ? `−${fmt(removed)}` : '';
  const knee = diffReach(KNEE, side);
  const a = diffReach(added, side);
  const r = diffReach(removed, side);
  // Tight: each side reaches the 200 mark or the value's far end.
  const left = Math.max(knee, r + (showValues && remText ? GAP + textWidth(remText) : 0));
  const right = Math.max(knee, a + (showValues && addText ? GAP + textWidth(addText) : 0));
  const cx = left + 1;
  const width = cx + right + 1;
  const label = `${added} added, ${removed} removed`;

  const span = (x1, x2, color) => (
    <path
      d={`M${x1} ${MID}H${x2}M${x2} ${MID - 3.5}V${MID + 3.5}`}
      style={{ fill: 'none', stroke: color, strokeWidth: STROKE.ink }}
    />
  );

  return (
    <svg
      role="img"
      aria-label={label}
      className={className}
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      style={{ display: 'inline-block', flexShrink: 0, overflow: 'visible', verticalAlign: 'middle' }}
    >
      <title>{`+${added} −${removed}`}</title>
      {/* The 200-line marks (each skipped where its value is printed
          across it), then the spans and the centre tick. */}
      <path
        d={[
          !(remText && showValues && r < knee && r + GAP + textWidth(remText) > knee - 2) && `M${cx - knee} 1V${H - 1}`,
          !(addText && showValues && a < knee && a + GAP + textWidth(addText) > knee - 2) && `M${cx + knee} 1V${H - 1}`,
        ].filter(Boolean).join('') || 'M0 0'}
        style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair, strokeDasharray: DASH.fine }}
      />
      {r > 0 && span(cx, cx - r, INK.fault)}
      {a > 0 && span(cx, cx + a, INK.ok)}
      <path d={`M${cx} ${MID - 5}V${MID + 5}`} style={{ stroke: INK.muted, strokeWidth: STROKE.hair }} />
      {showValues && remText && <T x={cx - r - GAP} y={MID + 4} anchor="end" color={INK.fault}>{remText}</T>}
      {showValues && addText && <T x={cx + a + GAP} y={MID + 4} color={INK.ok}>{addText}</T>}
    </svg>
  );
}
