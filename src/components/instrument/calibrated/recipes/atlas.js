// atlas: the orrery redesign's figure hand, laid over the vendored kit.
// While a recipe wrapped with atlas() draws, K.leader and K.box draw:
//   leader  a thin ink line that ends in a dot at the label;
//   box     a free label: an italic name (--font-name) over a mono note,
//           no frame. It sits where the box would, set against the leader's
//           dot (right-aligned when the leader lands on its right edge,
//           centred under a leader that lands on its top edge).
// Anything drawn outside a wrapped recipe (<cal-meter>, FIG.06's
// measuredToned) keeps the vendored look. The FIG caption under the drawing
// is CalRecipe's. Imported first by recipes/index.js.
const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

const vendored = { leader: K.leader, box: K.box };
let depth = 0;
let lastEnd = null; // where the last atlas leader ended, for the label after it

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const n2 = (v) => Math.round(v * 100) / 100;

function leader(pts, dot = true) {
  const [ex, ey] = pts[pts.length - 1];
  lastEnd = [ex, ey];
  return K.path('M' + pts.map((p) => p.map(n2).join(' ')).join(' L'), 'fg', { w: 0.6, opacity: 0.6 })
    + (dot ? K.circle(pts[0][0], pts[0][1], 1.6, 'fg', 'none') : '')
    + K.circle(ex, ey, 1.6, 'fg', 'none');
}

function box(x, y, w, l1, l2, c2 = 'fg') {
  const W = Math.max(w || 0, K.boxWidth(l1, l2 || '')), H = l2 ? 32 : 19;
  const e = lastEnd && lastEnd[1] >= y - 1 && lastEnd[1] <= y + H + 1 ? lastEnd : null;
  lastEnd = null;
  let tx = x + 7, a = 'start';
  if (e && Math.abs(e[0] - (x + W)) < 1.5) { tx = x + W - 7; a = 'end'; }
  else if (e && Math.abs(e[1] - y) < 1.5 && e[0] > x && e[0] < x + W) { tx = e[0]; a = 'middle'; }
  const name = `<text x="${n2(tx)}" y="${n2(y + 13)}" text-anchor="${a}" style="fill:var(--fg);font-family:var(--font-name);font-style:italic;font-weight:300;font-size:12.5px">${esc(l1)}</text>`;
  return name + (l2 ? K.t(tx, y + 27, l2, c2, a) : '');
}

K.leader = (...a) => (depth ? leader(...a) : vendored.leader(...a));
K.box = (...a) => (depth ? box(...a) : vendored.box(...a));

// The recipe drawn in the atlas hand, with its motion hooks carried over.
export function atlas(fn) {
  const f = (o) => {
    depth++;
    try { return fn(o); } finally { depth--; lastEnd = null; }
  };
  return Object.assign(f, fn);
}

// Every figure Lirah draws from a vendored recipe; Lirah's own recipes wrap
// themselves. measured stays as it is for FIG.06 (measuredAtlas is the
// atlas copy, registered by measuredToned.js).
['merge', 'loop', 'section', 'matrix'].forEach((name) => { R[name] = atlas(R[name]); });
