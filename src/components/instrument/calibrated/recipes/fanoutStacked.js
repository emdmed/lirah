// fanoutStacked: the kit's fanout recipe laid out for a narrow pane.
// Registered on Calibrated.recipes by recipes/index.js.
//
// The kit's fanout puts the parent box left and the children from x 212, so
// in a ~300px sidebar each child box is ~78 wide. Here the parent sits on
// top and a rail runs down its left edge, with an elbow to each child box,
// which spans the rest of the width. Same data and inks as fanout: live
// children in ink with a started node and a lamp time, finished ones faint,
// the folded note dashed. Same motion: the parent holds still, the rail and
// elbows grow out together with each child node appearing as its branch
// reaches it, then the boxes and their text appear (data-land).
//
//   { root:[l1, l2], children:[{ task, meta, time, live }], folded, w, top }
// `top` (default 0) moves everything down, to leave room for a title above.
// Geometry is exported on the function (fanoutStacked.layout) so callers
// can place hit areas over the boxes.
import { atlas } from './atlas';

const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

/* the fanout replay, in ms (the kit's FANOUT): branches grow, then after a beat the boxes */
const MOTION = { draw: 450, flash: 530 };

/* polyline length, and its first d units as points (null when d <= 0) */
const polyLen = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
function polyPart(pts, d) {
  if (d <= 0) return null;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], seg = Math.hypot(bx - ax, by - ay);
    if (d >= seg) { out.push(pts[i]); d -= seg; continue; }
    const q = seg ? d / seg : 0;
    out.push([ax + (bx - ax) * q, ay + (by - ay) * q]);
    return out;
  }
  return out;
}
const pathOf = (pts) => 'M' + pts.map((p) => p.map((v) => +v.toFixed(2)).join(' ')).join(' L');

/* where everything sits, for a width and a number of children */
function layout(o) {
  const w = o.w || 300, n = o.children.length;
  const pw = Math.max(96, K.boxWidth(o.root[0], o.root[1] || '') + 8);
  const py = 4 + (o.top || 0), ph = 32, railX = 18, nodeX = 30, boxX = 40, boxW = w - boxX - 4;
  const top = py + ph + 12, gap = 40, boxH = 32;
  const kids = Array.from({ length: n }, (_, i) => ({ y: top + i * gap, mid: top + i * gap + boxH / 2 }));
  const fy = top + n * gap + 4;
  const h = o.folded ? fy + 12 : top + Math.max(0, n - 1) * gap + boxH + 4;
  return { w, h, pw, py, ph, railX, nodeX, boxX, boxW, boxH, top, gap, kids, fy };
}

function fanoutStacked(o) {
  const L = layout(o), kids = o.children, T = o.t ?? Infinity;
  const start = [L.railX, L.py + L.ph];
  const routes = L.kids.map((k) => [start, [L.railX, k.mid], [L.nodeX, k.mid]]);
  const foldRoute = o.folded ? [start, [L.railX, L.fy], [L.boxX - 4, L.fy]] : null;
  const far = Math.max(1, ...routes.map(polyLen), foldRoute ? polyLen(foldRoute) : 0);
  const d = T >= MOTION.draw ? Infinity : far * Math.max(0, T) / MOTION.draw;

  let g = '';
  /* the parent: its box, and its node lit while any child runs */
  g += K.rect(8, L.py, L.pw, L.ph, 'pn', 'fg') + K.t(16, L.py + 13, o.root[0], 'fg') + K.t(16, L.py + 26, o.root[1] || '', 'fa');
  g += K.node(8 + L.pw + 10, L.py + L.ph / 2, kids.some((c) => c.live) ? 'live' : 'done');

  /* branches: finished ones first, so the live ones' ink sits on top of the shared rail */
  if (foldRoute) {
    const pts = polyPart(foldRoute, d);
    if (pts) g += K.path(pathOf(pts), 'e1', { dash: '2 3' });
  }
  const order = kids.map((c, i) => i).sort((a, b) => Number(!!kids[a].live) - Number(!!kids[b].live));
  for (const i of order) {
    const pts = polyPart(routes[i], d);
    if (pts) g += K.path(pathOf(pts), kids[i].live ? 'fg' : 'fa');
  }
  kids.forEach((c, i) => {
    if (d >= polyLen(routes[i])) g += K.node(L.nodeX, L.kids[i].mid, c.live ? 'started' : 'done');
  });

  /* the boxes and their text appear together once the branches are out */
  let k = '';
  kids.forEach((c, i) => {
    const y = L.kids[i].y, live = !!c.live;
    k += K.rect(L.boxX, y, L.boxW, L.boxH, 'pn', live ? 'ed' : 'e1');
    k += K.t(L.boxX + 8, y + 13, c.task, live ? 'fg' : 'mu')
      + K.t(L.boxX + 8, y + 26, c.meta || '', 'fa')
      + K.t(L.boxX + L.boxW - 6, y + 26, c.time || '', live ? 'lv' : 'fa', 'end');
  });
  if (o.folded) k += K.t(L.boxX, L.fy + 4, o.folded, 'fa');
  if (T >= MOTION.flash) g += T >= Infinity ? k : `<g data-land="children">${k}</g>`;

  const label = o.label || `${o.root[0]} with ${kids.length} children: ` + kids.map((c) => `${c.task}, ${c.live ? 'running' : 'done'}`).join('; ');
  return { w: L.w, h: L.h, markup: g, label };
}
fanoutStacked.extent = fanoutStacked.duration = () => MOTION.flash;
fanoutStacked.layout = layout;

R.fanoutStacked = atlas(fanoutStacked);
