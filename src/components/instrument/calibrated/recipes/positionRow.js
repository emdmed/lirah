// positionRow: "3 of 7" on a ruler of the caller's width, in the calibrated
// marks (the kit's <cal-position> sizes itself at 10–16px an item, about
// twice Lirah's 56px slots). One tick per item and the current one a filled
// square, the ticks already passed darker; past 24 items (or ticks closer
// than 4px) a scale in tenths with a marker over the current item. Full
// adds the boxed "3/7". 14px tall.
//
// Data: { index (0-based), count, width, full, from (0-based) }.
// Motion (see Calibrated.play): t is ms. The marker sweeps in from the first
// item on entry, or glides from `from`; the reading counts with it.
const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

const H = 14;
const MID = 7;
const MERGE = 24;
const DUR = 260;

function positionRow(o) {
  const n = Math.max(1, o.count), i = Math.min(Math.max(0, o.index), n - 1), width = o.width ?? 56;
  const from = o.from ?? 0;
  const T = o.t ?? Infinity, q = T >= DUR ? 1 : 1 - Math.pow(1 - Math.max(0, T) / DUR, 3);
  const p = from + (i - from) * q;
  const x0 = 1, x1 = x0 + width;
  const at = (k) => (n === 1 ? (x0 + x1) / 2 : x0 + (k / (n - 1)) * width);
  const final = `${n}/${n}`, read = `${Math.round(p) + 1}/${n}`;
  const boxW = C.textWidth(final) + 10;
  let g = '';
  if (n <= MERGE && (n < 2 || width / (n - 1) >= 4)) {
    g += K.line(x0, MID, x1, MID, 'fa');
    for (let k = 0; k < n; k++) g += K.line(at(k), MID - 3, at(k), MID + 3, k < p - 0.5 ? 'mu' : 'fa');
    g += K.rect(at(p) - 3.5, MID - 3.5, 7, 7, 'fg', 'none');
  } else {
    const y = MID + 3;
    g += K.line(x0, y, x1, y, 'fa');
    for (let k = 0; k <= 10; k++) { const x = x0 + (k / 10) * width; g += K.line(x, y, x, y + (k % 5 === 0 ? 4 : 2), 'fa'); }
    const mx = at(p);
    g += K.path(`M${(mx - 3.5).toFixed(2)} ${y - 7}H${(mx + 3.5).toFixed(2)}L${mx.toFixed(2)} ${y - 1}Z`, 'none', { fill: 'fg' });
  }
  let w = x1 + 4;
  if (o.full) {
    g += K.rect(x1 + 8, 0.5, boxW, H - 1, 'none', 'ed') + `<g data-cal-reading>${K.t(x1 + 8 + boxW / 2, MID + 4, read, 'fg', 'middle')}</g>`;
    w = x1 + 8 + boxW;
  }
  return { w, h: H, markup: g, label: o.label || `${i + 1} of ${n}` };
}
positionRow.extent = positionRow.duration = (o) => ((o.from ?? 0) === o.index ? 0 : DUR);

R.positionRow = positionRow;
