// lanesToned: the kit's lanes recipe, plus what Lirah's race needs.
// Registered on Calibrated.recipes by recipes/index.js.
//
// Same data as recipes.lanes, and per lane:
//   start    where the lane begins on the shared ruler (ruler units, default
//            0): a candidate that started later begins later, and its
//            dimension spans start → end.
//   fault    true for a failed run: the lane is drawn in fault ink and ends
//            in a red × instead of a node.
//   stopped  true for a cancelled or interrupted run: muted ink, open node.
// Motion as the kit's lanes: a time cursor sweeps the ruler, each lane grows
// from its start and latches when the cursor passes its end.
const C = window.Calibrated;
const { K, fmt } = C;
const R = C.recipes;

function lanesToned(o) {
  const w = o.w || 520, x0 = o.labelW || 70, boxW = 112, x1 = w - boxW - 30, max = o.max;
  const X = K.scale(x0, x1, 0, max), unit = o.unit ?? 'm', per = { s: 1, m: 60, h: 3600 }[unit];
  const T = o.t ?? Infinity, TT = o.tt ?? T;
  let g = o.n != null || o.title ? K.fig(o.n ?? '', o.title || '') : '';
  o.lanes.forEach((l, i) => {
    const y = 58 + i * 46, s = l.start || 0, live = !!l.live, fault = !!l.fault, stopped = !!l.stopped;
    const c = live ? 'lv' : fault ? 'ft' : stopped ? 'mu' : 'fg';
    const land = T >= l.end;
    const xs = X(s), xe = X(Math.max(s, Math.min(T, l.end))), xt = X(Math.max(s, Math.min(TT, l.end)));
    g += K.t(x0 - 10, y + 4, l.name, live ? 'fg' : 'mu', 'end');
    if (xt > xs) g += K.line(xs, y, xt, y, c, { w: 2 });
    if (live && land) g += K.line(xe, y, x1, y, 'fa', { dash: '2 4' }).replace('<line', '<line data-crawl');
    /* the moving node is drawn under the start node, so at the start only that shows */
    if (!land && T > s) g += K.node(xe, y, live ? 'live' : 'todo');
    if (T >= s) g += K.node(xs, y, 'done');
    const lab = land || !per ? l.label : fmt.dur(Math.max(0, Math.min(T, l.end) - s) * per);
    let k = '';
    if (land) {
      if (fault) k += K.path(`M${xe - 4} ${y - 4}L${xe + 4} ${y + 4}M${xe + 4} ${y - 4}L${xe - 4} ${y + 4}`, 'ft', { w: 1.6, cap: 'round' });
      else k += K.node(xe, y, live ? 'live' : stopped ? 'todo' : 'done');
    }
    if (xe - xs > 1) k += K.dim(xs, xe, y - 14, lab, live ? 'fg' : fault ? 'ft' : 'mu');
    if (l.box && land) {
      k += K.box(w - boxW - 10, y - 16, boxW, l.box[0], l.box[1], live ? 'lv' : fault ? 'ft' : 'fg', live ? 'lv' : 'ed');
      if (!live) k += K.line(xe + 6, y, w - boxW - 10, y, 'e1', { dash: '1 3' });
    }
    g += land ? `<g data-land="${i}">${k}</g>` : k;
  });
  const ry = 58 + o.lanes.length * 46 - 16;
  const step = o.step || Math.max(1, Math.round(max / 10));
  g += K.ruler(x0, x1, ry, max, step, o.every || 5, (v) => v + unit);
  const label = o.label || `${o.title || 'Lanes'}: ` + o.lanes.map((l) => `${l.name} ${l.live ? 'running at' : l.fault ? 'failed at' : 'took'} ${l.label}`).join('; ');
  return { w, h: ry + 26, markup: g, label };
}
lanesToned.extent = R.lanes.extent;

R.lanesToned = lanesToned;
