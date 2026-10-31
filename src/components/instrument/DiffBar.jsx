import '@/components/instrument/calibrated';
import { useFigureCompact } from './figure/Figure';
import { useCalSvg } from './useCalSvg';

// P5. A diff's size as a dimension pair, drawn by Lirah's calibrated diffRow
// recipe (components/instrument/calibrated/recipes/diffRow.js): two spans
// out from a centre tick, added lines to the right in ok ink, removed to the
// left in fault ink. Linear up to 200 lines (at 60% of the side),
// logarithmic past it up to 200k, and the 200 point is marked by a dotted
// line on both sides, so a +12 and a +147k can share a list and both still
// read. Full prints both values at the span ends; compact keeps the spans
// and the 200 marks, the values go to the tooltip. The spans grow out on
// entry and glide when the counts change, the values counting with them.

const KNEE = 200;
const LINEAR = 0.6; // share of the side the first 200 lines take
const DECADES = 3; // 200 → 200k fills the rest

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

// New counts glide from the old ones.
const glide = (a, b) => (a.added !== b.added || a.removed !== b.removed ? { ...b, prev: [a.added, a.removed] } : null);

/**
 * `side` is the length of one span at 200k lines; keep it the same down a
 * list so the rows compare. `fmt` formats the printed values (compactCount
 * in tight rows). `values={false}` draws the spans only, as compact does.
 * Zero on a side draws nothing there.
 */
export function DiffBar({ added = 0, removed = 0, side = 40, fmt = String, values = true, className }) {
  const compact = useFigureCompact();
  const data = { added, removed, side, fmt, values: values && !compact, label: `${added} added, ${removed} removed` };
  const ref = useCalSvg('diffRow', data, glide);
  if (added + removed === 0) return null;
  return (
    <span className={`cal ${className ?? ''}`} style={{ display: 'inline-flex', flexShrink: 0, verticalAlign: 'middle' }} title={`+${added} −${removed}`}>
      <svg ref={ref} style={{ display: 'block', overflow: 'visible' }} />
    </span>
  );
}
