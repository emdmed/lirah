// measuredToned: the kit's measured recipe plus Lirah's gauge tones.
// Registered on Calibrated.recipes by recipes/index.js.
const C = window.Calibrated;
const { K, textWidth: tw } = C;
const R = C.recipes;

/* the measured replay, in ms (the kit's MEASURED timings) */
const M = { top: 220, proj: 440, fill: 900, flash: 980 };

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ── measuredToned · the kit's measured recipe, plus Lirah's gauge tones
   Same data as recipes.measured, and:
     usedInk     ink for the used bar on the long ruler (a token or any CSS
                 colour): Lirah passes ink, warn amber past its alert, fault
                 red past the last, as its gauges do.
     readout     [text, ink]: printed right after the title on the same line,
                 in its own ink (the toned "86.4K / 200K · 43%").
     marks       [{ v, ink }]: short ticks on the long ruler (a threshold such
                 as the heavy-context line).
     parts[i].hatch   that part's inset fill is hatched instead of solid
                 (an amount the source can't account for).
     note        [text, ink]: one line under the boxes, right-aligned. */
function measuredToned(o) {
  const w = o.w || 460, f = o.fmt || C.fmt.k;
  const x0 = 18, x1 = w - 20, y = 46, X = K.scale(x0, x1, 0, o.max);
  const used = o.parts.reduce((a, p) => a + p.value, 0);
  const h = o.note ? 184 : 176;
  const T = o.t ?? Infinity, changing = !!o.prev;
  const ramp = (a, b) => (T >= b ? 1 : T <= a ? 0 : (T - a) / (b - a));
  const cms = changing ? measuredToned.duration(o) : 0, cq = changing ? 1 - Math.pow(1 - Math.min(1, Math.max(0, T) / cms), 3) : 1;
  const vals = o.parts.map((p, i) => (changing ? (o.prev[i] ?? 0) + (p.value - (o.prev[i] ?? 0)) * cq : p.value));
  const now = vals.reduce((a, v) => a + v, 0);
  const qTop = changing ? 1 : 1 - Math.pow(1 - ramp(0, M.top), 3), qProj = changing ? 1 : ramp(M.top, M.proj);
  const fill = changing ? now : used * ramp(M.proj, M.fill);
  let g = '';
  if (o.title || o.readout) {
    const title = String(o.title || '').toUpperCase();
    const ro = o.readout ? `<tspan style="fill:${C.ink(o.readout[1] || 'fg')}">${esc(String(o.readout[0]).toUpperCase())}</tspan>` : '';
    g += `<text x="12" y="18" text-anchor="start" letter-spacing="0.5" style="fill:var(--muted)">${esc(title)}${ro}</text>`;
  }
  g += K.ruler(x0, x1, y, o.max, o.max / 20, 4, (v) => (v ? f(v) : '0'), true);
  if (qTop > 0) g += K.rect(x0, y - 1.5, (X(now) - x0) * qTop, 3, o.usedInk || 'fg', 'none');
  (o.marks || []).forEach((m) => { if (m.v > 0 && m.v < o.max) g += K.line(X(m.v), y - 8, X(m.v), y + 1, m.ink || 'ft'); });
  const ix0 = 18, ix1 = Math.round(w * 0.65), iy = 92, IX = K.scale(ix0, ix1, 0, o.zoomMax);
  const factor = o.factor || Math.round(o.max / o.zoomMax);
  if (qProj > 0) {
    const sy = y + 3, dy = iy - 13, lerp = (a, b) => a + (b - a) * qProj;
    g += K.path(`M${X(0).toFixed(2)} ${sy}L${lerp(X(0), ix0).toFixed(2)} ${lerp(sy, dy).toFixed(2)}M${X(o.zoomMax).toFixed(2)} ${sy}L${lerp(X(o.zoomMax), ix1).toFixed(2)} ${lerp(sy, dy).toFixed(2)}`, 'fa', { dash: '2 3' });
  }
  g += K.rect(ix0, iy - 12, ix1 - ix0, 12, 'none', 'ed');
  let acc = 0; const mids = [];
  o.parts.forEach((p, i) => {
    const a = acc, b = Math.min(acc + vals[i], fill);
    if (b > a) {
      if (p.hatch) g += K.hatchRect(IX(a), iy - 11, IX(b) - IX(a), 10, 'fg', 'none', 3);
      else g += K.rect(IX(a), iy - 11, IX(b) - IX(a), 10, p.ink === 'lv' ? 'var(--live)' : p.ink || 'fg', 'none');
    }
    mids.push(IX(acc + vals[i] / 2)); acc += vals[i];
  });
  for (let i = 0; i <= 10; i++) { const xx = IX(i * o.zoomMax / 10); g += K.line(xx, iy, xx, iy + (i % 5 ? 3 : 6), 'fa'); }
  [0, 0.5, 1].forEach((r, i) => { g += K.t(IX(r * o.zoomMax), iy + 16, r ? f(r * o.zoomMax) : '0', 'fa', i ? 'middle' : 'start'); });
  acc = 0;
  o.parts.forEach((p, i) => { if (fill >= acc + vals[i] / 2) g += K.circle(mids[i], iy - 6, 1.8, 'pn', 'fa'); acc += vals[i]; });
  let k = K.t(ix1 + 8, iy - 3, `${(o.detail ?? 'A') ? 'DETAIL ' + (o.detail ?? 'A') + '  ' : ''}${factor}:1`, 'mu');
  const widest = o.parts.map((p, i) => Math.max(K.boxWidth(p.label, '≈ ' + f(p.value)), changing ? K.boxWidth(p.label, '≈ ' + f(o.prev[i] ?? 0)) : 0));
  const row = widest.reduce((a, b) => a + b, 0) + 10 * Math.max(0, o.parts.length - 1);
  const pw = o.plate ? Math.max(94, tw(o.plate[0]) + 18, tw(o.plate[1]) + 18) : 0;
  let bx = Math.max(ix0, Math.min(92, (o.plate ? w - pw - 18 : w - 4) - row));
  const landed = changing && T >= cms;
  acc = 0;
  o.parts.forEach((p, i) => {
    const reached = fill >= acc + vals[i] / 2; acc += vals[i];
    const val = '≈ ' + f(vals[i]), bw = changing && !landed ? Math.max(K.boxWidth(p.label, '≈ ' + f(o.prev[i] ?? 0)), K.boxWidth(p.label, '≈ ' + f(p.value))) : K.boxWidth(p.label, val);
    const m = K.line(mids[i], iy, mids[i], 122, 'fa') + K.box(bx, 122, bw, p.label, val, p.ink === 'lv' ? 'lv' : 'fg');
    if (changing) k += landed && (o.prev[i] ?? 0) !== p.value ? `<g data-land="part${i}">${m}</g>` : m;
    else if (reached) g += `<g data-land="part${i}">${m}</g>`;
    bx += bw + 10;
  });
  if (o.plate) k += K.plate(Math.max(bx + 4, w - pw - 14), 118, 94, o.plate[0], o.plate[1]);
  if (o.note) k += K.t(w - 4, 174, o.note[0], o.note[1] || 'fa', 'end');
  if (changing) g += k;
  else if (T >= M.flash) g += `<g data-land="parts">${k}</g>`;
  const label = o.label || `${o.title || 'Measure'}: ${f(used)} of ${f(o.max)}. ` + o.parts.map((p) => `${p.label} ${f(p.value)}`).join(', ') + '.';
  return { w, h, markup: g, label };
}
measuredToned.extent = measuredToned.duration = (o) => {
  if (!o.prev) return M.flash;
  const d = Math.max(0, ...o.parts.map((p, i) => Math.abs(p.value - (o.prev[i] ?? 0))));
  return Math.round(220 + 480 * Math.min(1, d / o.zoomMax));
};

R.measuredToned = measuredToned;
