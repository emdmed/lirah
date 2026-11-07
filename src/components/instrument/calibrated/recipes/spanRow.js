// spanRow: one duration as a dimension line on a shared time scale, in the
// calibrated marks, at Lirah's list-row size (14px tall, values in a column).
// `tone` done | live | fault | muted inks the line; a live span ends in the
// gold sun (atlas) with a dashed lamp tail. Full adds end ticks; compact keeps
// the line, the sun and the value.
//
// Data: { ms, max (ms), tone, text, compact, track, gap, valueW }.
// Motion (see Calibrated.play): t is ms; on entry the line grows from 0 to
// its length. A live span's once-a-second redraw is a plain mount.
import { atlas } from './atlas';

const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

const H = 14;
const TAIL = 12;
const DUR = 400;
const INK = { done: 'fg', live: 'lv', fault: 'ft', muted: 'mu' };

function spanRow(o) {
  const track = o.track ?? 60, gap = o.gap ?? 6, w = track + gap + (o.valueW ?? 49);
  const y = H / 2, live = o.tone === 'live', ink = INK[o.tone] || 'fg';
  const T = o.t ?? Infinity, q = T >= DUR ? 1 : 1 - Math.pow(1 - Math.max(0, T) / DUR, 3);
  const full = Math.max(1.5, Math.min(1, o.ms / (o.max || o.ms || 1)) * track);
  const xe = Math.max(1.5, full * q);
  let g = K.line(0.5, y, xe, y, ink, { w: live ? 1.6 : 1.3 });
  if (!o.compact) g += K.path(`M0.5 ${y - 3}V${y + 3}${live ? '' : `M${xe} ${y - 3}V${y + 3}`}`, ink);
  if (live) {
    if (!o.compact) g += K.line(xe, y, Math.min(track, xe + TAIL), y, 'lv', { dash: '2 3' });
    g += K.node(xe, y, 'live', 6);
  }
  g += K.t(track + gap, y + 4, o.text, live ? 'lv' : o.tone === 'fault' ? 'ft' : 'mu');
  return { w, h: H, markup: g, label: o.label || o.text };
}
spanRow.extent = spanRow.duration = () => DUR;

R.spanRow = atlas(spanRow);

// spanRuler: the list's time scale over the same track, printed once above
// the rows. Data: { maxSecs, step (s), track, w, fmt }. Ticks every step,
// numbered at 0 and the end.
function spanRuler(o) {
  const track = o.track ?? 60, maxSecs = o.maxSecs, ticks = Math.round(maxSecs / o.step);
  const g = K.ruler(0.5, track, 19.5, maxSecs, o.step, ticks, o.fmt, true);
  return { w: o.w ?? track, h: 22, markup: g, label: o.label || '' };
}

R.spanRuler = spanRuler;
