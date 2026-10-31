// budgetToned: the kit's budget recipe plus Lirah's gauge tones.
// Registered on Calibrated.recipes by recipes/index.js.
const C = window.Calibrated;
const { K } = C;
const R = C.recipes;

/* ── budgetToned · the kit's budget recipe, plus Lirah's gauge tones
   Same data as recipes.budget, and:
     usedInk   ink for the used bar and its value (a token or any CSS colour):
               Lirah passes ink below the first alert, warn amber past it,
               fault red past the last, as its gauges do.
     alerts[i].ink   ink for that alert's line and label (default 'ft').
   When the used box would cover an alert's label (use past the alert), the
   drawing grows 16 units and the box moves up to clear it. */
function budgetToned(o) {
  const w = o.w || 520, x0 = 16, x1 = w - 20, max = o.max;
  const X = K.scale(x0, x1, 0, max), f = o.fmt || ((v) => v + (o.unit ?? ''));
  const T = o.t ?? Infinity, TT = o.tt ?? T, used = o.used, pace = o.pace;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const alerts = o.alerts || [];
  const usedInk = o.usedInk || 'fg';

  // Where the used box and each alert label sit, to see if they collide.
  const ul = [o.usedLabel || 'used' + (o.at ? ' · ' + o.at : ''), f(used)];
  const uw = K.boxWidth(...ul);
  const bx0 = X(used) - 10 - uw, bx1 = X(used) - 10;
  const labelSpan = (a, i) => {
    const end = i === 0 && alerts.length > 1, lw = C.textWidth(a.label);
    const lx = X(a.v) + (end ? -4 : 4);
    return end ? [lx - lw, lx] : [lx, lx + lw];
  };
  const lift = alerts.some((a, i) => { const [l0, l1] = labelSpan(a, i); return l1 > bx0 && l0 < bx1; }) ? 16 : 0;
  const y = 92 + lift;

  let g = o.n != null || o.title ? K.fig(o.n ?? '', o.title || '') : '';
  if (alerts.length) {
    const H = K.hatch('ft', 4, 0.45);
    g += H.def + `<rect x="${X(alerts[0].v)}" y="${y - 4}" width="${X(max) - X(alerts[0].v)}" height="8" fill="${H.url}"/>`;
  }
  const xt = X(clamp(TT, 0, used));
  if (xt > x0) g += K.rect(x0, y - 2, xt - x0, 4, usedInk, 'none');
  if (pace != null && TT > used) g += K.line(X(used), y, X(clamp(TT, used, pace)), y, 'lv', { dash: '4 3' });
  g += K.ruler(x0, x1, y + 6, max, o.step || max / 15, o.every || 5, (v) => (v ? f(v) : '0'));
  alerts.forEach((a, i) => {
    const end = i === 0 && alerts.length > 1, ink = a.ink || 'ft';
    const m = K.line(X(a.v), y - 36, X(a.v), y + 4, ink, { opacity: 0.7 }) + K.t(X(a.v) + (end ? -4 : 4), y - 28, a.label, ink, end ? 'end' : 'start');
    g += T >= a.v ? `<g data-land="alert${i}">${m}</g>` : m;
  });
  if (T < used) g += K.node(X(clamp(T, 0, used)), y, 'todo');
  else {
    const top = y - 60 - lift, mid = top + 18;
    g += '<g data-land="used">' + K.node(X(used), y, 'done')
      + K.leader([[X(used), y - 6], [X(used), mid], [X(used) - 10, mid]], false)
      + K.box(bx0, top, uw, ul[0], ul[1], usedInk) + '</g>';
  }
  if (pace != null && T > used && T < pace) g += K.circle(X(T), y, 3, 'pn', 'fg');
  else if (pace != null && T >= pace) {
    const pl = o.paceLabel || ['at this pace', '≈ ' + f(pace)];
    const pw = K.boxWidth(...pl);
    g += '<g data-land="pace">' + K.circle(X(pace), y, 3, 'pn', 'fg')
      + K.leader([[X(pace), y + 4], [X(pace), y + 44], [X(pace) - 40, y + 44]], false) + K.box(X(pace) - 40 - pw, y + 30, pw, pl[0], pl[1], 'lv', 'lv') + '</g>';
  }
  const label = o.label || `${o.title || 'Budget'} ${f(max)}. Used ${f(used)}${o.at ? ' by ' + o.at : ''}.` + (pace != null ? ` At this pace about ${f(pace)}.` : '');
  return { w, h: 170 + lift, markup: g, label };
}
budgetToned.extent = R.budget.extent;

R.budgetToned = budgetToned;
