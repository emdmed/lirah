import '@/components/instrument/calibrated';
import { useFigureCompact } from './figure/Figure';
import { useCalSvg } from './useCalSvg';

// P3. "3 of 7" on a short ruler, drawn by Lirah's calibrated positionRow
// recipe (components/instrument/calibrated/recipes/positionRow.js): one tick
// per item and the current one a filled square, the ticks already passed
// darker. Past 24 items (or once ticks would sit closer than 4px) they merge
// into a scale in tenths with a marker over the current position. Full adds
// the boxed "3/7"; compact is the ruler alone, the count in the tooltip. The
// marker sweeps in on entry and glides between items. Sized for a status
// corner: `width` long, 14px tall.

// Moving to another item glides the marker from where it was.
const glide = (a, b) => (a.index !== b.index && a.count === b.count ? { ...b, from: a.index } : null);

/** `index` is 0-based; `count` the number of items. `width` is the ruler's length. */
export function Position({ index, count, width = 56, className }) {
  const compact = useFigureCompact();
  const ok = count > 0 && index != null && index >= 0;
  const i = ok ? Math.min(index, count - 1) : 0;
  const label = `${i + 1} of ${count}`;
  const ref = useCalSvg('positionRow', { index: i, count: ok ? count : 1, width, full: !compact, label }, glide);
  if (!ok) return null;
  return (
    <span className={`cal ${className ?? ''}`} style={{ display: 'inline-flex', flexShrink: 0, verticalAlign: 'middle' }} title={label}>
      <svg ref={ref} style={{ display: 'block', overflow: 'visible' }} />
    </span>
  );
}
