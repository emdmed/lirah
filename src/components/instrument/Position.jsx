import { INK, STROKE, T, textWidth } from './figure/kit';
import { useFigureCompact } from './figure/Figure';

// P3. "3 of 7" on a short ruler: one tick per item and the current one a
// filled square, so you see how far through you are and how many are left.
// Past MERGE items (or once ticks would sit closer than 4px) they merge
// into a scale (a tick every tenth of the way) with a marker over the
// current position. Full adds the boxed "3/7";
// compact is the ruler alone, the count in the tooltip. Sized for a status
// corner: 14px tall.

const MERGE = 24;
const H = 14;
const MID = 7;

/** `index` is 0-based; `count` the number of items. `width` is the ruler's length. */
export function Position({ index, count, width = 56, className }) {
  const compact = useFigureCompact();
  if (!(count > 0) || index == null || index < 0) return null;
  const i = Math.min(index, count - 1);
  const value = `${i + 1}/${count}`;
  const x0 = 1;
  const x1 = x0 + width;
  const at = (k) => (count === 1 ? (x0 + x1) / 2 : x0 + (k / (count - 1)) * width);
  const boxW = textWidth(value) + 10;
  const total = compact ? x1 + 4 : x1 + 8 + boxW;
  const label = `${i + 1} of ${count}`;

  let ruler;
  if (count <= MERGE && (count < 2 || width / (count - 1) >= 4)) {
    // One tick per item, the current one filled.
    const d = [`M${x0} ${MID}H${x1}`];
    for (let k = 0; k < count; k++) d.push(`M${at(k)} ${MID - 3}V${MID + 3}`);
    ruler = (
      <g>
        <path d={d.join('')} style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair }} />
        <rect x={at(i) - 3.5} y={MID - 3.5} width={7} height={7} style={{ fill: INK.fg }} />
      </g>
    );
  } else {
    // A scale in tenths, a marker over the current item.
    const y = MID + 3;
    const d = [`M${x0} ${y}H${x1}`];
    for (let k = 0; k <= 10; k++) {
      const x = x0 + (k / 10) * width;
      d.push(`M${x} ${y}V${y + (k % 5 === 0 ? 4 : 2)}`);
    }
    const mx = at(i);
    ruler = (
      <g>
        <path d={d.join('')} style={{ fill: 'none', stroke: INK.faint, strokeWidth: STROKE.hair }} />
        <path d={`M${mx - 3.5} ${y - 7}H${mx + 3.5}L${mx} ${y - 1}Z`} style={{ fill: INK.fg }} />
      </g>
    );
  }

  return (
    <svg
      role="img"
      aria-label={label}
      className={className}
      width={total}
      height={H}
      viewBox={`0 0 ${total} ${H}`}
      style={{ display: 'inline-block', flexShrink: 0, overflow: 'visible', verticalAlign: 'middle' }}
    >
      <title>{label}</title>
      {ruler}
      {!compact && (
        <g>
          <rect x={x1 + 8} y={0.5} width={boxW} height={H - 1} style={{ fill: 'none', stroke: INK.edgeStrong, strokeWidth: STROKE.hair }} />
          <T x={x1 + 8 + boxW / 2} y={MID + 4} anchor="middle" color={INK.fg}>{value}</T>
        </g>
      )}
    </svg>
  );
}
