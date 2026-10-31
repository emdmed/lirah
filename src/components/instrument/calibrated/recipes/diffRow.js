// diffRow: a diff's size as two dimension spans out from a centre tick, in
// the calibrated marks, sized to Lirah's row slots (16–64px a side) where the
// kit's <cal-diff> needs ~130px a side. Added runs right in ok ink, removed
// runs left in fault ink. Linear to 200 lines (60% of the side), log past it
// to 200k; the 200-line knee is a dotted mark on both sides (skipped where a
// value is printed across it). Values sit at the span ends in legend type.
//
// Data: { added, removed, side, fmt, values, prev: [added, removed] }.
// Motion (see Calibrated.play): t is ms. The spans grow out from the centre
// (or glide from `prev`) and the values count with them. The width is laid
// out from the final values, so nothing reflows mid-glide.
const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

const KNEE = 200;
const LINEAR = 0.6;
const DECADES = 3;
const H = 14;
const MID = 7;
const GAP = 5;
const DUR = 420;

export function diffReach(n, side) {
  if (!(n > 0)) return 0;
  const t = n <= KNEE
    ? (n / KNEE) * LINEAR
    : LINEAR + (1 - LINEAR) * Math.min(1, Math.log10(n / KNEE) / DECADES);
  return Math.max(2, Math.round(t * side));
}

function diffRow(o) {
  const side = o.side ?? 40, fmt = o.fmt || String, values = o.values !== false;
  const added = o.added || 0, removed = o.removed || 0;
  const [pa, pr] = o.prev || [0, 0];
  const T = o.t ?? Infinity, q = T >= DUR ? 1 : 1 - Math.pow(1 - Math.max(0, T) / DUR, 3);
  const a0 = pa + (added - pa) * q, r0 = pr + (removed - pr) * q;
  const addText = (n) => (n > 0 ? `+${fmt(Math.round(n))}` : '');
  const remText = (n) => (n > 0 ? `−${fmt(Math.round(n))}` : '');

  // Laid out from the final values (the wider of old and new while gliding).
  const knee = diffReach(KNEE, side);
  const aF = diffReach(added, side), rF = diffReach(removed, side);
  const aW = values && added > 0 ? GAP + Math.max(C.textWidth(addText(added)), C.textWidth(addText(pa))) : 0;
  const rW = values && removed > 0 ? GAP + Math.max(C.textWidth(remText(removed)), C.textWidth(remText(pr))) : 0;
  const left = Math.max(knee, rF + rW, diffReach(pr, side) + rW);
  const right = Math.max(knee, aF + aW, diffReach(pa, side) + aW);
  const cx = left + 1, w = cx + right + 1;

  const a = a0 > 0 ? diffReach(a0, side) : 0, r = r0 > 0 ? diffReach(r0, side) : 0;
  const at = addText(a0), rt = remText(r0);
  let g = '';
  // The knee marks, each skipped where its value is printed across it.
  if (!(values && rt && r < knee && r + GAP + C.textWidth(rt) > knee - 2)) g += K.line(cx - knee, 1, cx - knee, H - 1, 'fa', { dash: '2 3' });
  if (!(values && at && a < knee && a + GAP + C.textWidth(at) > knee - 2)) g += K.line(cx + knee, 1, cx + knee, H - 1, 'fa', { dash: '2 3' });
  const span = (x2, ink) => K.path(`M${cx} ${MID}H${x2}M${x2} ${MID - 3.5}V${MID + 3.5}`, ink, { w: 1.3 });
  if (r > 0) g += span(cx - r, 'ft');
  if (a > 0) g += span(cx + a, 'ok');
  g += K.line(cx, MID - 5, cx, MID + 5, 'mu');
  if (values && rt) g += K.t(cx - r - GAP, MID + 4, rt, 'ft', 'end');
  if (values && at) g += K.t(cx + a + GAP, MID + 4, at, 'ok');
  return { w, h: H, markup: g, label: o.label || `${added} added, ${removed} removed` };
}
diffRow.extent = diffRow.duration = (o) => {
  const [pa, pr] = o.prev || [0, 0];
  return pa === (o.added || 0) && pr === (o.removed || 0) ? 0 : DUR;
};

R.diffRow = diffRow;
