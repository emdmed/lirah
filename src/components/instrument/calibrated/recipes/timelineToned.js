// timelineToned: the kit's timeline recipe, plus what Lirah's plan timeline
// needs. Registered on Calibrated.recipes by recipes/index.js.
//
// Same data as recipes.timeline (steps in seconds, names, noun, live,
// slowest, totalLabel, tick), and:
//   breaks   indexes of steps that start after an idle gap that was folded
//            out of the working-time ruler. The boundary gets a break mark
//            (two slanted strokes) on the line and on the ruler, in place
//            of that step's start node. The scale stays one scale.
//   tail     { label, stuck, ink }: what's still ahead, drawn past the last
//            step as an unmeasured dashed line labelled `label` ("3 left").
//            stuck: true puts a filled `ink` square at its head (a chunk
//            sent but not committed). The measured part shrinks to make room.
//   count    a boxed reading at the right end of the line ("15/15").
// Motion as the kit's timeline: the line runs out through the steps, then
// the dimension, callout, tail and count appear.
import { atlas } from './atlas';

const C = window.Calibrated;
const { K, fmt, textWidth: tw } = C;
const R = C.recipes;

const TICKS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
const DRAW = 900;
const FLASH = 980;
const tickLabel = (s) => {
  if (!s) return '0';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.round(s / 60) + 'm';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : h + 'h';
};

// Two slanted strokes on a paper ground: "the line is cut here".
const breakMark = (x, y) => K.rect(x - 4, y - 6, 8, 12, 'pn', 'none')
  + K.line(x - 4, y + 5, x - 1, y - 5, 'mu') + K.line(x + 1, y + 5, x + 4, y - 5, 'mu');

function timelineToned(o) {
  const w = o.w || 470, x0 = 14, y = 70, noun = o.noun || 'step';
  const countW = o.count ? K.countWidth(o.count) : 0;
  const xEnd = w - 14 - (o.count ? countW + 10 : 0);
  const tailW = o.tail ? Math.min(Math.max(tw(o.tail.label || '') + 24, (xEnd - x0) * 0.18), (xEnd - x0) * 0.35) : 0;
  const x1 = xEnd - tailW;
  const total = o.steps.reduce((a, b) => a + b, 0);
  const tick = o.tick || TICKS.find((s) => total / s <= 40) || TICKS[TICKS.length - 1];
  const max = Math.max(Math.ceil(total / tick), 5) * tick;
  // With a tail the ruler ends at the work, so the tail starts where it does.
  const X = K.scale(x0, x1, 0, o.tail ? total : max);
  const slow = o.steps.indexOf(Math.max(...o.steps));
  const name = (i) => String(o.names ? o.names[i] : i + 1);
  const breaks = new Set(o.breaks || []);
  const shown = new Set();
  let t = 0, room = Infinity;
  const mids = o.steps.map((d) => { const m = (X(t) + X(t + d)) / 2; t += d; return m; });
  for (let i = o.steps.length - 1; i >= 0; i--) {
    const half = tw(name(i)) / 2;
    if (mids[i] + half + 4 <= room) { shown.add(i); room = mids[i] - half; }
  }
  const T = o.t ?? Infinity, TT = o.tt ?? T;
  const cur = (q) => (q >= DRAW ? Infinity : total * Math.max(0, q) / DRAW);
  const c = cur(T), ct = cur(TT);
  let g = o.n != null || o.title ? K.fig(o.n ?? '', o.title || '') : '', k = '', marks = '';
  t = 0;
  g += K.node(x0, y, 'done');
  o.steps.forEach((d, i) => {
    const a = X(t), b = X(t + d), s = i === slow && o.slowest !== false, live = i === o.live;
    const lineTo = X(Math.min(t + d, ct));
    if (ct > t && lineTo - a > 8) g += K.line(a + 4, y, Math.min(b - 4, lineTo), y, s ? 'fg' : 'mu', { w: s ? 2 : 1.3 });
    if (breaks.has(i) && i > 0 && c >= t) marks += breakMark(a, y);
    if (c >= t + d) {
      g += K.node(b, y, live ? 'live' : 'done');
      if (shown.has(i)) g += K.t(mids[i], y - 8, name(i), s ? 'fg' : 'fa', 'middle');
    } else if (c > t && live) g += K.node(X(c), y, 'live');
    if (s) {
      const m = (a + b) / 2, l = [o.slowLabel || 'slowest', `${noun} ${name(i)} · ${fmt.dur(d)}`], bw = K.boxWidth(...l);
      const right = m + 14 + bw < w;
      k += K.leader([[m, y + 6], [m, y + 28], [right ? m + 14 : m - 14, y + 28]], false) + K.box(right ? m + 14 : m - 14 - bw, y + 14, bw, l[0], l[1], 'fg');
    }
    t += d;
  });
  g += marks;
  k += K.dim(x0, X(total), 36, `${o.totalLabel || 'complete'} · ${fmt.dur(total)}`, 'fg');
  if (o.tail) {
    const xs = X(total) + 6;
    k += K.line(xs, y, xEnd, y, 'fa', { dash: '2 4' });
    if (o.tail.stuck) k += K.rect(xs + 6, y - 4, 8, 8, o.tail.ink || 'ft', o.tail.ink || 'ft');
    if (o.tail.label) k += K.t((xs + (o.tail.stuck ? 14 : 0) + xEnd) / 2, y - 8, o.tail.label, 'mu', 'middle');
  }
  if (o.count) k += K.count(w - 14 - countW, y, o.count, 'fg');
  if (T >= FLASH) g += T >= Infinity ? k : `<g data-land="details">${k}</g>`;
  if (o.tail) {
    // The ruler measures the work only: numbered ticks from 0 to the total.
    g += K.ruler(x0, x1, 128, total, tick, 5, tickLabel);
  } else {
    g += K.ruler(x0, x1, 128, max, tick, 5, tickLabel);
  }
  [...breaks].forEach((i) => {
    if (i <= 0 || i >= o.steps.length) return;
    const at = o.steps.slice(0, i).reduce((a2, b2) => a2 + b2, 0);
    g += breakMark(X(at), 128);
  });
  const label = o.label || `${o.title || 'Timeline'}: ${o.steps.length} ${noun}s, ${fmt.dur(total)} in total; slowest is ${noun} ${name(slow)} at ${fmt.dur(o.steps[slow])}.`;
  return { w, h: 150, markup: g, label };
}
timelineToned.extent = timelineToned.duration = () => FLASH;

R.timelineToned = atlas(timelineToned);
