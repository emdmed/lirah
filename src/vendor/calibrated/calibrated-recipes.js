/* Calibrated — figure recipes
   Whole figures built from the kit, driven by plain data.
   Each recipe returns { w, h, markup, label }; mount it with
     Calibrated.mount(svgEl, Calibrated.recipes.lanes({...}))
   or get a string with Calibrated.render(recipeResult).

   Needs calibrated-figures.js first. */
(function (root) {
  'use strict';
  const C = root.Calibrated;
  if (!C) throw new Error('calibrated-recipes.js needs calibrated-figures.js first');
  const { K, textWidth: tw, fmt } = C;

  const head = (o) => (o.n != null || o.title ? K.fig(o.n ?? '', o.title || '') : '');

  /* the merge replay, in ms: the branch draws in, then after a beat the details appear */
  const MERGE = { draw: 700, flash: 780 };
  /* the fan-out replay, in ms: branches grow out, then after a beat the children appear */
  const FANOUT = { draw: 450, flash: 530 };
  /* the loop replay, in ms: each done edge traces in turn, then after a beat the text appears */
  const LOOP = { edge: 260, beat: 80, step: 420 };
  /* the measured replay, in ms: used bar, projection, inset fill, then after a beat the boxes */
  const MEASURED = { top: 220, proj: 440, fill: 900, flash: 980 };
  /* the timeline replay, in ms: the line runs out through its steps, then after a beat the dimension and callout */
  const TIMELINE = { draw: 900, flash: 980 };
  /* timeline ruler ticks, in seconds, finest first */
  const TIMELINE_TICKS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  /* a tick in seconds as 45s, 25m, 1h30, 10h */
  const tickLabel = (s) => {
    if (!s) return '0';
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return m ? `${h}h${String(m).padStart(2, '0')}` : h + 'h';
  };

  /* polyLen · length of a polyline; polyPart · its first d px as points (null when d ≤ 0) */
  const polyLen = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  function polyPart(pts, d) {
    if (d <= 0) return null;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d >= l) { out.push(b); d -= l; continue; }
      out.push([a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]);
      break;
    }
    return out;
  }

  /* cubicPart · the first share q (by length) of a cubic Bézier, as its new
     control points and end point. Splits at the parameter that covers q of
     the length (de Casteljau). */
  const N = 48;
  function cubicLens(p0, p1, p2, p3) {
    const at = (u) => [0, 1].map((k) => {
      const a = 1 - u;
      return a * a * a * p0[k] + 3 * a * a * u * p1[k] + 3 * a * u * u * p2[k] + u * u * u * p3[k];
    });
    const len = [0];
    let prev = p0;
    for (let i = 1; i <= N; i++) { const pt = at(i / N); len.push(len[i - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1])); prev = pt; }
    return len;
  }
  const cubicLen = (...p) => cubicLens(...p)[N];
  function cubicPart(p0, p1, p2, p3, q) {
    if (q >= 1) return [p1, p2, p3];
    const len = cubicLens(p0, p1, p2, p3);
    const goal = q * len[N];
    let i = 1;
    while (i < N && len[i] < goal) i++;
    const u = (i - 1 + (goal - len[i - 1]) / ((len[i] - len[i - 1]) || 1)) / N;
    const mix = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const a1 = mix(p0, p1), b1 = mix(p1, p2), c1 = mix(p2, p3), a2 = mix(a1, b1), b2 = mix(b1, c1), a3 = mix(a2, b2);
    return [a1, a2, a3].map((pt) => pt.map((v) => +v.toFixed(2)));
  }

  const recipes = {
    /* ── lanes · several runs on one time ruler
       { n, title, max, unit:'m', lanes:[{ name, end, label, live, box:[l1, l2] }] }
       Motion (see play): t is the time cursor and tt the trail, in ruler units.
       A lane's end node rides the cursor and its line follows the trail; the
       time counts up. When the cursor passes the end, the node, label, leader
       and box latch (marked data-land) and a live lane's dashed tail appears
       (marked data-crawl). Without t, the lanes are drawn finished. */
    lanes(o) {
      const w = o.w || 520, x0 = o.labelW || 70, boxW = 112, x1 = w - boxW - 30, max = o.max;
      const X = K.scale(x0, x1, 0, max), unit = o.unit ?? 'm', per = { s: 1, m: 60, h: 3600 }[unit];
      const T = o.t ?? Infinity, TT = o.tt ?? T;
      let g = head(o);
      o.lanes.forEach((l, i) => {
        const y = 58 + i * 46, live = !!l.live, c = live ? 'lv' : 'fg', land = T >= l.end;
        const xe = X(Math.min(T, l.end)), xt = X(Math.max(0, Math.min(TT, l.end)));
        g += K.t(x0 - 10, y + 4, l.name, 'fg', 'end');
        if (xt > x0) g += K.line(x0, y, xt, y, c, { w: 2 });
        if (live && land) g += K.line(xe, y, x1, y, 'fa', { dash: '2 4' }).replace('<line', '<line data-crawl');
        /* the moving node is drawn under the start node, so at 0 only the start shows */
        if (!land) g += K.node(xe, y, live ? 'live' : 'todo');
        g += K.node(x0, y, 'done');
        const lab = land || !per ? l.label : fmt.dur(Math.min(T, l.end) * per);
        let k = '';
        if (land) k += K.node(xe, y, live ? 'live' : 'done');
        if (xe - x0 > 1) k += K.dim(x0, xe, y - 14, lab, live ? 'fg' : 'mu');
        if (l.box && land) {
          k += K.box(w - boxW - 10, y - 16, boxW, l.box[0], l.box[1], live ? 'lv' : 'fg', live ? 'lv' : 'ed');
          if (!live) k += K.line(xe + 6, y, w - boxW - 10, y, 'e1', { dash: '1 3' });
        }
        g += land ? `<g data-land="${i}">${k}</g>` : k;
      });
      const ry = 58 + o.lanes.length * 46 - 16;
      const step = o.step || Math.max(1, Math.round(max / 10));
      g += K.ruler(x0, x1, ry, max, step, o.every || 5, (v) => v + unit);
      const label = o.label || `${o.title || 'Lanes'}: ` + o.lanes.map((l) => `${l.name} ${l.live ? 'running at' : 'took'} ${l.label}`).join('; ');
      return { w, h: ry + 26, markup: g, label };
    },

    /* ── budget · a limit ruler with alerts, today's use and the pace to the end
       { n, title, max, used, at:'16:20', pace, alerts:[{ v, label }], unit:'k',
         usedLabel, paceLabel:[l1, l2], fmt } */
    budget(o) {
      const w = o.w || 520, x0 = 16, x1 = w - 20, y = 92, max = o.max;
      const X = K.scale(x0, x1, 0, max), f = o.fmt || ((v) => v + (o.unit ?? ''));
      /* motion (see play): the cursor t fills the used amount, then runs on
         along the pace line. Used and pace latch as it reaches them, and an
         alert latches as it is crossed (all marked data-land). */
      const T = o.t ?? Infinity, TT = o.tt ?? T, used = o.used, pace = o.pace;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      let g = head(o);
      const first = o.alerts && o.alerts.length ? o.alerts[0].v : null;
      if (first != null) {
        const H = K.hatch('ft', 4, 0.45);
        g += H.def + `<rect x="${X(first)}" y="${y - 4}" width="${X(max) - X(first)}" height="8" fill="${H.url}"/>`;
      }
      const xt = X(clamp(TT, 0, used));
      if (xt > x0) g += K.rect(x0, y - 2, xt - x0, 4, 'fg', 'none');
      if (pace != null && TT > used) g += K.line(X(used), y, X(clamp(TT, used, pace)), y, 'lv', { dash: '4 3' });
      g += K.ruler(x0, x1, y + 6, max, o.step || max / 15, o.every || 5, (v) => (v ? f(v) : '0'));
      (o.alerts || []).forEach((a, i) => {
        const end = i === 0 && o.alerts.length > 1;
        const m = K.line(X(a.v), y - 36, X(a.v), y + 4, 'ft', { opacity: 0.7 }) + K.t(X(a.v) + (end ? -4 : 4), y - 28, a.label, 'ft', end ? 'end' : 'start');
        g += T >= a.v ? `<g data-land="alert${i}">${m}</g>` : m;
      });
      if (T < used) g += K.node(X(clamp(T, 0, used)), y, 'todo');
      else {
        const ul = [o.usedLabel || 'used' + (o.at ? ' · ' + o.at : ''), f(used)];
        const uw = K.boxWidth(...ul);
        g += `<g data-land="used">` + K.node(X(used), y, 'done')
          + K.leader([[X(used), y - 6], [X(used), y - 42], [X(used) - 10, y - 42]], false) + K.box(X(used) - 10 - uw, y - 60, uw, ul[0], ul[1], 'fg') + '</g>';
      }
      if (pace != null && T > used && T < pace) g += K.circle(X(T), y, 3, 'pn', 'fg');
      else if (pace != null && T >= pace) {
        const pl = o.paceLabel || ['at this pace', '≈ ' + f(pace)];
        const pw = K.boxWidth(...pl);
        g += `<g data-land="pace">` + K.circle(X(pace), y, 3, 'pn', 'fg')
          + K.leader([[X(pace), y + 4], [X(pace), y + 44], [X(pace) - 40, y + 44]], false) + K.box(X(pace) - 40 - pw, y + 30, pw, pl[0], pl[1], 'lv', 'lv') + '</g>';
      }
      const label = o.label || `${o.title || 'Budget'} ${f(max)}. Used ${f(o.used)}${o.at ? ' by ' + o.at : ''}.` + (o.pace != null ? ` At this pace about ${f(o.pace)}.` : '');
      return { w, h: 170, markup: g, label };
    },

    /* ── merge · a branch, its commits and the commands at each node (FIG.11)
       { n, title, base:'main', branch, commits:5, baseAhead:1, files:[l1,l2],
         verdict:[l1,l2], noun:'commits', steps:['git switch main', 'git merge --no-ff …', 'git worktree remove …'] } */
    merge(o) {
      const w = 520, h = 250, by = 170, fy = 70, steps = o.steps || [];
      const n = Math.max(1, o.commits), cx0 = 130, cx1 = 330, cs = n > 1 ? (cx1 - cx0) / (n - 1) : 0;
      const ff = !o.baseAhead, xe = w - 50;
      /* motion (see play): t is ms on the MERGE timeline. The straight main
         line and its nodes and text hold still. The branch draws as one stroke
         along its length: up out of main, along its commits (each appearing as
         the stroke reaches it), then the dashed merge back into main. Then the
         branch name, boxes, dimension and commands appear at once (data-land). */
      const T = o.t ?? Infinity, M = MERGE;
      const fork = [[60, by], [60, fy], [80, fy], [110, fy]], join = [[cx1, fy], [380, fy], [390, by], [400, by]];
      const L1 = cubicLen(...fork), L2 = cx1 - 110, L3 = cubicLen(...join);
      const d = T >= M.draw ? Infinity : (L1 + L2 + L3) * Math.max(0, T) / M.draw;
      const curve = (p, q, c, o2) => { const [a, b2, e] = cubicPart(...p, q); return K.path(`M${p[0].join(' ')} C ${a.join(' ')}, ${b2.join(' ')}, ${e.join(' ')}`, c, o2); };
      let g = head(o);
      g += K.line(20, by, xe, by, 'fg', { w: 1.3 }) + K.line(406, by, xe, by, 'fa', { dash: '2 3' });
      if (d >= L1 + L2) g += K.path(`M60 ${by} C 60 ${fy}, 80 ${fy}, 110 ${fy} L ${cx1} ${fy}`, 'fg', { w: 1.3 });
      else if (d > L1) g += K.path(`M60 ${by} C 60 ${fy}, 80 ${fy}, 110 ${fy} L ${(110 + d - L1).toFixed(2)} ${fy}`, 'fg', { w: 1.3 });
      else if (d > 0) g += curve(fork, d / L1, 'fg', { w: 1.3 });
      if (d > L1 + L2) g += curve(join, Math.min(1, (d - L1 - L2) / L3), 'lv', { dash: '4 3' });
      /* main's own marks hold still; the commits appear as the branch reaches them */
      g += K.t(20, by - 8, o.base || 'main', 'fg') + K.node(60, by, 'done');
      if (!ff) g += K.node(250, by, 'done') + K.t(250, by - 10, `+${o.baseAhead} since branch`, 'fa', 'middle');
      /* the lamp lights the merge to come: its curve, its node, the verdict and step 2 */
      g += ff ? K.rect(396, by - 4, 8, 8, 'pn', 'lv', { w: 1.3 }) : K.path(`M400 ${by - 6}L406 ${by}L400 ${by + 6}L394 ${by}Z`, 'lv', { w: 1.3, fill: 'pn' });
      for (let i = 0; i < n; i++) { const x = n > 1 ? cx0 + i * cs : cx1; if (d >= L1 + x - 110) g += K.node(x, fy, 'done'); }
      const label = o.label || `Merge plan. ${o.branch} has ${n} ${o.noun || 'commits'}. ${o.base || 'main'} ${ff ? 'has not moved, so this is a fast-forward' : `moved on by ${o.baseAhead}, so this is a merge commit`}. Steps: ${steps.filter(Boolean).map((s, i) => `${i + 1} ${s}`).join(', ')}.`;
      if (T < M.flash) return { w, h, markup: g, label };
      /* steps keep their slot (1 under the base, 2 at the merge, 3 at the tip)
         but are numbered in run order, so an empty slot doesn't leave a gap */
      const num = (i) => String(steps.slice(0, i + 1).filter(Boolean).length);
      let k = '';
      if (n > 1) k += K.dim(cx0, cx1, fy + 22, `${n} ${o.noun || 'commits'}`);
      if (o.files) k += K.leader([[230, fy + 26], [230, 104]], false) + K.box(180, 104, 100, o.files[0], o.files[1], 'fg');
      const v = o.verdict || (ff ? ['fast-forward', 'no merge commit'] : ['merge commit', `${o.base || 'main'} moved on`]);
      k += K.leader([[400, by - 7], [400, 140], [410, 140]], false) + K.box(410, 124, 102, v[0], v[1], 'lv', 'lv');
      if (steps[0]) k += K.leader([[250, by + 6], [250, 200]], false) + K.cmd(243, 212, num(0), steps[0]);
      if (steps[1]) k += K.leader([[400, by + 7], [400, 226]], false) + K.cmd(412, 238, num(1), steps[1], 'lv', 'end');
      if (steps[2]) k += K.leader([[cx1, fy - 6], [cx1, 46]], false) + K.cmd(Math.min(250, w - tw('$ ' + steps[2]) - 30), 40, num(2), steps[2]);
      /* the branch name goes over step 3's leader, on a panel-coloured ground, so a long name breaks the leader instead of being cut by it */
      k += K.rect(108, fy - 22, tw(o.branch) + 4, 14, 'pn', 'none') + K.t(110, fy - 12, o.branch, 'fg');
      g += `<g data-land="details">${k}</g>`;
      return { w, h, markup: g, label };
    },

    /* ── fanout · one parent with live and finished children (FIG.13)
       { n, title, root:[l1, l2], children:[{ task, meta, time, live }], folded:'+1 done earlier' } */
    fanout(o) {
      const w = o.w || 520, kids = o.children, gap = 52, top = 44;
      const h = Math.max(220, top + kids.length * gap + (o.folded ? 36 : 10));
      const oy = top + ((kids.length - 1) * gap) / 2 + 10, ox = 112;
      /* motion (see play): t is ms on the FANOUT timeline. The parent holds
         still. Its branches grow out together at one speed, each child's node
         appearing as its branch reaches it. Then the child boxes, their text and
         the folded note appear at once (data-land). */
      const T = o.t ?? Infinity, M = FANOUT;
      const fy = top + kids.length * gap + 6;
      const routes = kids.map((s, i) => ({ pts: [[ox + 8, oy], [160, oy], [176, top + i * gap + 10], [200, top + i * gap + 10]], from: 0 }));
      if (o.folded) routes.push({ pts: [[160, oy], [176, fy], [200, fy]], from: 160 - (ox + 8) });
      const far = Math.max(...routes.map((r) => r.from + polyLen(r.pts)));
      const d = T >= M.draw ? Infinity : far * Math.max(0, T) / M.draw;
      const grow = (r) => polyPart(r.pts, d - r.from);
      let g = head(o);
      g += K.rect(8, oy - 22, 96, 44, 'pn', 'fg') + K.t(16, oy - 6, o.root[0], 'fg') + K.t(16, oy + 8, o.root[1] || '', 'fa');
      g += K.node(ox, oy, kids.some((k) => k.live) ? 'live' : 'done');
      let k = '';
      kids.forEach((s, i) => {
        const y = top + i * gap, nx = 200, live = !!s.live, r = routes[i], pts = grow(r);
        if (pts) g += K.path('M' + pts.map((p) => p.map((v) => +v.toFixed(2)).join(' ')).join(' L'), live ? 'fg' : 'fa');
        if (d >= polyLen(r.pts)) g += K.node(nx, y + 10, live ? 'started' : 'done');
        k += K.rect(212, y - 6, w - 222, 32, 'pn', live ? 'ed' : 'e1');
        k += K.t(220, y + 7, s.task, live ? 'fg' : 'mu') + K.t(220, y + 20, s.meta || '', 'fa') + K.t(w - 18, y + 20, s.time || '', live ? 'lv' : 'fa', 'end');
      });
      if (o.folded) {
        const pts = grow(routes[kids.length]);
        if (pts) g += K.path('M' + pts.map((p) => p.map((v) => +v.toFixed(2)).join(' ')).join(' L'), 'e1', { dash: '2 3' });
        k += K.t(212, fy + 4, o.folded, 'fa');
      }
      if (T >= M.flash) g += `<g data-land="children">${k}</g>`;
      const label = o.label || `${o.root[0]} with ${kids.length} children: ` + kids.map((k) => `${k.task}, ${k.live ? 'running' : 'done'}`).join('; ');
      return { w, h, markup: g, label };
    },

    /* ── loop · stations on a cycle, the live one lit by the lamp
       { n, title, center:'train 4 of 9', stations:[{ name, cmd, state:'done'|'live'|'todo'|'fault' }] }
       Or step through it: give at (the live station's index) instead of states,
       lap and laps, and center as a function of the lap: (lap) => `train ${lap} of 9`.
       recipes.loop.step(data, ±1) returns the next data, to play() as a step. */
    loop(o) {
      const w = o.w || 420, h = o.h || 250, cx = w / 2, cy = 138, R = 70;
      const st = o.stations, N = st.length;
      const P = st.map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + R * Math.cos(a), cy + R * Math.sin(a), a]; });
      const statesAt = (at) => st.map((s, i) => (at == null ? s.state : i < at && !s.skip ? 'done' : i === at ? 'live' : 'todo'));
      const centre = (lap) => (typeof o.center === 'function' ? o.center(lap) : o.center);
      const edge = (i, f, c = 'fg') => {
        const q = P[(i + 1) % N];
        return K.line(P[i][0], P[i][1], P[i][0] + (q[0] - P[i][0]) * f, P[i][1] + (q[1] - P[i][1]) * f, c, { w: 1.4 });
      };
      /* motion (see play): t is ms. The frame holds still.
         Entry: the station nodes hold still; the done edges trace clockwise one
         after another (LOOP.edge ms each), then the names, commands and centre
         label appear at once (data-land).
         Step (from is set): one edge traces forward, or retracts going back, with
         the star riding its tip (LOOP.step ms). Then the labels that changed,
         and the centre label on a new lap, blink (data-land). Going forward past
         the last station closes the lap; the loop then clears for the next one. */
      const T = o.t ?? Infinity, stepping = o.from != null, moving = stepping && T < LOOP.step;
      let states = statesAt(o.at), tip = null, textStates = states, lap = o.lap;
      let g = head(o);
      g += K.circle(cx, cy, R * 1.2, 'none', 'e1');
      g += K.path(`M${P.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L')} Z`, 'ed');
      if (moving) {
        const fwd = o.dir > 0, wrap = fwd ? o.from === N - 1 : o.from === 0, e = fwd ? o.from : o.at;
        const q = Math.max(0, T) / LOOP.step, f = fwd ? 1 - Math.pow(1 - q, 3) : Math.pow(1 - q, 3);
        states = statesAt(fwd && wrap ? o.from : o.at);
        states[o.from] = fwd ? 'done' : statesAt(o.at)[o.from];
        if (!(fwd && wrap)) states[o.at] = fwd ? 'todo' : 'done';   /* closing a lap: the first station keeps its edge until the lap clears */
        states.forEach((s, i) => { if (s === 'done' && i !== e) g += edge(i, 1); });
        g += edge(e, f);
        const nx = P[(e + 1) % N];
        tip = [P[e][0] + (nx[0] - P[e][0]) * f, P[e][1] + (nx[1] - P[e][1]) * f];
        textStates = statesAt(o.from); lap = o.lapFrom;
      } else if (stepping) {
        states.forEach((s, i) => { if (s === 'done') g += edge(i, 1); });
      } else {
        const done = states.map((s, i) => i).filter((i) => states[i] === 'done');
        done.forEach((i, j) => {
          const f = T >= Infinity ? 1 : Math.min(1, Math.max(0, (T - j * LOOP.edge) / LOOP.edge));
          if (f > 0) g += edge(i, f);
        });
      }
      g += K.centre(cx - R * 1.3, cy, cx + R * 1.3, cy) + K.centre(cx, cy - R * 1.3, cx, cy + R * 1.3) + K.cross(cx, cy, 4);
      const changed = (i) => stepping && !moving && (i === o.from || i === o.at);
      const c0 = centre(lap);
      const ck = c0 ? K.t(cx, cy + 24, c0, 'mu', 'middle') : '';
      let k = stepping && !moving && o.lap !== o.lapFrom ? `<g data-land="centre">${ck}</g>` : ck;
      st.forEach((s, i) => {
        const [x, y, a] = P[i], cos = Math.cos(a), sin = Math.sin(a), sn = states[i];
        /* done: a solid square and a green ✓ name; todo: a hollow square and a muted name */
        g += sn === 'live' && !tip ? K.node(x, y, 'live', 9) : K.node(x, y, sn === 'done' || sn === 'fault' ? sn : 'todo', 9);
        const side = Math.abs(cos) < 0.3 ? 0 : cos > 0 ? 1 : -1;
        const tx = side === 1 ? x + 16 : side === -1 ? x - 16 : x;
        const ty = side === 0 ? (sin < 0 ? y - 26 : y + 22) : y - 4;
        const an = side === 1 ? 'start' : side === -1 ? 'end' : 'middle';
        const ts = textStates[i], live = ts === 'live', done = ts === 'done', fault = ts === 'fault';
        let m = K.t(tx, ty, (done ? '\u2713 ' : '') + String(s.name).toUpperCase(), live ? 'lv' : done ? 'ok' : fault ? 'ft' : 'mu', an, 0.5);
        if (s.cmd) m += K.t(tx, ty + 13, (live ? '$ ' : '') + s.cmd, live ? 'fg' : 'fa', an);
        k += changed(i) ? `<g data-land="st${i}">${m}</g>` : m;
      });
      if (tip) g += K.node(tip[0], tip[1], 'live', 9);
      if (stepping || T >= recipes.loop.duration(o)) g += stepping ? k : `<g data-land="text">${k}</g>`;
      const fin = statesAt(o.at), c1 = centre(o.lap);
      const label = o.label || `${o.title || 'Loop'}: ` + st.map((s, i) => s.name + (fin[i] === 'live' ? ' (live)' : '')).join(', ') + (c1 ? `. ${c1}` : '');
      return { w, h, markup: g, label };
    },

    /* ── measured · a long ruler, a magnified inset of the used part, boxed parts (FIG.06)
       { title, max, zoomMax, factor, parts:[{ label, value, ink }], plate:[l1, l2], fmt } */
    measured(o) {
      const w = o.w || 460, h = 176, f = o.fmt || C.fmt.k;
      const x0 = 18, x1 = w - 20, y = 46, X = K.scale(x0, x1, 0, o.max);
      const used = o.parts.reduce((a, p) => a + p.value, 0);
      /* motion (see play): t is ms on the MEASURED timeline. The rulers, the
         inset frame and its scale hold still. The used bar fills on the long
         ruler, the dashed projection drops to the inset, and the inset fills
         left to right through the parts; as the fill passes a part, its dot
         appears and its leader and box flash in (data-land). Then the detail
         label and plate appear (data-land). */
      /* Change (prev is set, the old parts' values): the figure is whole; the
         used bar, the inset fills, the dots and leaders glide from the old
         values to the new ones (ease-out cubic, 220ms + 480ms × the largest
         change as a share of the inset), the box values count, and the boxes
         that changed blink on landing. */
      const T = o.t ?? Infinity, M = MEASURED, changing = !!o.prev;
      const ramp = (a, b) => (T >= b ? 1 : T <= a ? 0 : (T - a) / (b - a));
      const cms = changing ? recipes.measured.duration(o) : 0, cq = changing ? 1 - Math.pow(1 - Math.min(1, Math.max(0, T) / cms), 3) : 1;
      const vals = o.parts.map((p, i) => (changing ? (o.prev[i] ?? 0) + (p.value - (o.prev[i] ?? 0)) * cq : p.value));
      const now = vals.reduce((a, v) => a + v, 0);
      const qTop = changing ? 1 : 1 - Math.pow(1 - ramp(0, M.top), 3), qProj = changing ? 1 : ramp(M.top, M.proj);
      const fill = changing ? now : used * ramp(M.proj, M.fill);
      let g = '';
      if (o.title) g += K.t(12, 18, String(o.title).toUpperCase(), 'mu', 'start', 0.5);
      g += K.ruler(x0, x1, y, o.max, o.max / 20, 4, (v) => (v ? f(v) : '0'), true);
      if (qTop > 0) g += K.rect(x0, y - 1.5, (X(now) - x0) * qTop, 3, 'fg', 'none');
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
        if (b > a) g += K.rect(IX(a), iy - 11, IX(b) - IX(a), 10, p.ink === 'lv' ? 'var(--live)' : p.ink || 'fg', 'none');
        mids.push(IX(acc + vals[i] / 2)); acc += vals[i];
      });
      for (let i = 0; i <= 10; i++) { const xx = IX(i * o.zoomMax / 10); g += K.line(xx, iy, xx, iy + (i % 5 ? 3 : 6), 'fa'); }
      [0, 0.5, 1].forEach((r, i) => { g += K.t(IX(r * o.zoomMax), iy + 16, r ? f(r * o.zoomMax) : '0', 'fa', i ? 'middle' : 'start'); });
      acc = 0;
      o.parts.forEach((p, i) => { if (fill >= acc + vals[i] / 2) g += K.circle(mids[i], iy - 6, 1.8, 'pn', 'fa'); acc += vals[i]; });
      let k = K.t(ix1 + 8, iy - 3, `${(o.detail ?? 'A') ? 'DETAIL ' + (o.detail ?? 'A') + '  ' : ''}${factor}:1`, 'mu');
      /* the row of boxes starts at 92, or further left (to the inset's edge)
         when the boxes and the plate wouldn't fit the width */
      const widest = o.parts.map((p, i) => Math.max(K.boxWidth(p.label, '≈ ' + f(p.value)), changing ? K.boxWidth(p.label, '≈ ' + f(o.prev[i] ?? 0)) : 0));
      const row = widest.reduce((a, b) => a + b, 0) + 10 * Math.max(0, o.parts.length - 1);
      const pw = o.plate ? Math.max(94, tw(o.plate[0]) + 18, tw(o.plate[1]) + 18) : 0;
      let bx = Math.max(ix0, Math.min(92, (o.plate ? w - pw - 18 : w - 4) - row));
      const landed = changing && T >= cms;
      acc = 0;
      o.parts.forEach((p, i) => {
        const reached = fill >= acc + vals[i] / 2; acc += vals[i];
        /* while gliding, a box is as wide as the wider of its old and new value, so the row holds still */
        const val = '≈ ' + f(vals[i]), bw = changing && !landed ? Math.max(K.boxWidth(p.label, '≈ ' + f(o.prev[i] ?? 0)), K.boxWidth(p.label, '≈ ' + f(p.value))) : K.boxWidth(p.label, val);
        const m = K.line(mids[i], iy, mids[i], 122, 'fa') + K.box(bx, 122, bw, p.label, val, p.ink === 'lv' ? 'lv' : 'fg');
        if (changing) k += landed && (o.prev[i] ?? 0) !== p.value ? `<g data-land="part${i}">${m}</g>` : m;
        else if (reached) g += `<g data-land="part${i}">${m}</g>`;   /* entry: each box flashes in as the fill passes its part */
        bx += bw + 10;
      });
      if (o.plate) k += K.plate(Math.max(bx + 4, w - pw - 14), 118, 94, o.plate[0], o.plate[1]);
      if (changing) g += k;
      else if (T >= M.flash) g += `<g data-land="parts">${k}</g>`;
      const label = o.label || `${o.title || 'Measure'}: ${f(used)} of ${f(o.max)}. ` + o.parts.map((p) => `${p.label} ${f(p.value)}`).join(', ') + '.';
      return { w, h, markup: g, label };
    },

    /* ── timeline · consecutive steps with durations; the slowest called out (FIG.20)
       { n, title, steps:[seconds], total label auto, slowest:true,
         names:[per-step label, default 1…n], noun:'step' }
       The ruler picks its tick (1s … 1 day) so it holds at most 40 ticks,
       numbered every 5th, and ends at the tick after the total: a 20-minute run
       reads in minutes, a 28-hour one in hours.
       Step numbers that would touch their neighbour are skipped; the last always shows. */
    timeline(o) {
      const w = o.w || 470, x0 = 14, x1 = w - 14, y = 70, noun = o.noun || 'step';
      const total = o.steps.reduce((a, b) => a + b, 0);
      const tick = o.tick || TIMELINE_TICKS.find((s) => total / s <= 40) || TIMELINE_TICKS[TIMELINE_TICKS.length - 1];
      const max = Math.max(Math.ceil(total / tick), 5) * tick;
      const X = K.scale(x0, x1, 0, max), slow = o.steps.indexOf(Math.max(...o.steps));
      const name = (i) => String(o.names ? o.names[i] : i + 1);
      /* which step numbers fit: walk right to left so the last one always shows */
      const shown = new Set();
      let t = 0, room = Infinity;
      const mids = o.steps.map((d) => { const m = (X(t) + X(t + d)) / 2; t += d; return m; });
      for (let i = o.steps.length - 1; i >= 0; i--) {
        const half = tw(name(i)) / 2;
        if (mids[i] + half + 4 <= room) { shown.add(i); room = mids[i] - half; }
      }
      /* motion (see play): t is ms on the TIMELINE clock. The ruler holds
         still. A cursor runs along the line at an even pace through the
         total; the line trails it, each step's node latches and its number
         appears as the cursor passes its end, and a live step's star rides
         the tip. Then the dimension and the slowest callout appear (data-land). */
      const T = o.t ?? Infinity, TT = o.tt ?? T, M = TIMELINE;
      const cur = (q) => (q >= M.draw ? Infinity : total * Math.max(0, q) / M.draw);
      const c = cur(T), ct = cur(TT);
      let g = head(o), k = '';
      t = 0;
      g += K.node(x0, y, 'done');
      o.steps.forEach((d, i) => {
        const a = X(t), b = X(t + d), s = i === slow && o.slowest !== false, live = i === o.live;
        const lineTo = X(Math.min(t + d, ct));
        if (ct > t && lineTo - a > 8) g += K.line(a + 4, y, Math.min(b - 4, lineTo), y, s ? 'fg' : 'mu', { w: s ? 2 : 1.3 });
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
      k += K.dim(x0, X(total), 36, `${o.totalLabel || 'complete'} · ${fmt.dur(total)}`, 'fg');
      if (T >= M.flash) g += T >= Infinity ? k : `<g data-land="details">${k}</g>`;
      g += K.ruler(x0, x1, 128, max, tick, 5, tickLabel);
      const label = o.label || `${o.title || 'Timeline'}: ${o.steps.length} ${noun}s, ${fmt.dur(total)} in total; slowest is ${noun} ${name(slow)} at ${fmt.dur(o.steps[slow])}.`;
      return { w, h: 150, markup: g, label };
    },

    /* ── matrix · which rows touch which columns; one column called out (FIG.22)
       { n, title, cols:[...], rows:[...], hits:[[colIdx…] per row], callout:{ col, l1, l2 } } */
    matrix(o) {
      const cw = 42, rh = 14, cx0 = 52, ry0 = 112, R = o.rows.length, Cn = o.cols.length;
      const w = Math.max(470, cx0 + Cn * cw + 20), h = ry0 + R * rh + (o.callout ? 50 : 16);
      let g = head(o);
      o.cols.forEach((c, j) => { const x = cx0 + j * cw + cw / 2; g += `<text transform="translate(${x + 3} ${ry0 - 10}) rotate(-50)" style="fill:var(--muted)">${C.esc(c)}</text>`; });
      o.rows.forEach((r, i) => {
        const y = ry0 + i * rh;
        g += K.t(cx0 - 12, y + 4, r, 'fa', 'end') + K.line(cx0, y, cx0 + Cn * cw, y, 'e1');
        (o.hits[i] || []).forEach((j) => { g += K.rect(cx0 + j * cw + cw / 2 - 4, y - 4, 8, 8, 'fg', 'none'); });
      });
      for (let j = 0; j <= Cn; j++) g += K.line(cx0 + j * cw, ry0 - 7, cx0 + j * cw, ry0 + (R - 1) * rh + 7, 'e1');
      if (o.callout) {
        const j = o.callout.col, x = cx0 + j * cw + cw / 2, yb = ry0 + (R - 1) * rh + 7;
        const bw = K.boxWidth(o.callout.l1, o.callout.l2);
        const bx = Math.min(x + 2 * cw - cw / 2, w - bw - 4);
        g = K.rect(cx0 + j * cw + 1, ry0 - 7, cw - 2, (R - 1) * rh + 14, 'well', 'fg', { w: 1.6 }) + g;   /* under the hits */
        g += K.leader([[x, yb], [x, yb + 11], [bx, yb + 11]], false) + K.box(bx, yb - 1, bw, o.callout.l1, o.callout.l2, 'fg', 'fg');
      }
      const label = o.label || `${o.title || 'Matrix'}: ${R} rows by ${Cn} columns.` + (o.callout ? ` ${o.callout.l1}.` : '');
      return { w, h, markup: g, label };
    },

    /* ── section · nested regions drawn like a building section (FIG.10)
       Coordinates are yours; callouts stack in a right-hand column.
       { n, title, w, h, boundary:{ label }, regions:[{ x,y,w,h, kind:'hatch'|'clear'|'strong'|'dotted'|'island', label, sub }],
         callouts:[{ at:[x,y]|null, l1, l2, live }] } */
    section(o) {
      const w = o.w || 520, h = o.h || 266;
      const boxW = Math.max(112, ...(o.callouts || []).map((c) => K.boxWidth(c.l1, c.l2))), colX = w - boxW - 2;
      const H1 = K.hatch('e1', 6), H2 = K.hatch('fa', 4);
      let g = H1.def + H2.def + head(o);
      if (o.boundary) {
        g += K.rect(8, 26, colX - 20, h - 52, 'none', 'fa', { dash: '5 4' });
        if (o.boundary.label) g += K.path(`M16 ${h - 17}l6 6M22 ${h - 17}l-6 6`, 'fg', { w: 1.4 }) + K.t(30, h - 10, o.boundary.label, 'mu');
      }
      (o.regions || []).forEach((r) => {
        const L = r.label ? K.t(r.x + 8, r.y + 16, r.label, 'fg') : '', S = r.sub ? K.t(r.x + 8, r.y + 32, r.sub, 'fa') : '';
        if (r.kind === 'hatch') {
          g += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${H1.url}" style="stroke:var(--edge-strong)"/>`;
          if (r.label) g += K.rect(r.x + 4, r.y + 4, tw(r.label) + 8, 16, 'pn', 'none') + K.t(r.x + 8, r.y + 16, r.label, 'fg');
        } else if (r.kind === 'island') {
          const iw = r.w || tw(r.label) + 10;
          g += `<rect x="${r.x}" y="${r.y}" width="${iw}" height="17" fill="${H2.url}" style="stroke:var(--edge-strong)"/>` + K.rect(r.x + 2, r.y + 3, iw - 4, 11, 'pn', 'none') + K.t(r.x + 5, r.y + 12.5, r.label, 'mu');
        } else {
          const opt = r.kind === 'strong' ? { w: 1.6 } : r.kind === 'dotted' ? { dash: '1 2' } : {};
          g += K.rect(r.x, r.y, r.w, r.h, r.kind === 'strong' ? 'none' : 'pn', 'fg', opt) + L + S;
        }
      });
      (o.callouts || []).forEach((c, i) => {
        const y = 40 + i * 54;
        if (c.at) g += K.leader([c.at, [c.at[0], y + 16], [colX, y + 16]].filter((p, k) => k !== 1 || p[0] !== c.at[0] || p[1] !== c.at[1]));
        g += K.box(colX, y, boxW, c.l1, c.l2, c.live ? 'lv' : 'fg', c.live ? 'lv' : 'ed');
      });
      const label = o.label || `${o.title || 'Section'}: ` + (o.callouts || []).map((c) => `${c.l1}: ${c.l2}`).join('; ');
      return { w, h, markup: g, label };
    },
  };

  /* mount a recipe result into an <svg> */
  function mount(svg, r) {
    if (typeof svg === 'string') svg = document.querySelector(svg);
    if (!svg) return null;
    C.attr(svg, 'width', r.w); C.attr(svg, 'height', r.h);
    C.attr(svg, 'viewBox', `0 0 ${r.w} ${r.h}`);
    return C.draw(svg, r.markup, r.label);
  }
  const render = (r) => C.svg(r.w, r.h, r.markup, r.label);

  /* extent · how far a recipe's time cursor runs, for recipes that move */
  recipes.lanes.extent = (o) => Math.max(0, ...o.lanes.map((l) => l.end));
  recipes.budget.extent = (o) => Math.max(o.used || 0, o.pace ?? 0);
  /* merge runs on its own timeline: t is ms, so extent and duration match */
  recipes.merge.extent = recipes.merge.duration = () => MERGE.flash;
  recipes.fanout.extent = recipes.fanout.duration = () => FANOUT.flash;
  recipes.timeline.extent = recipes.timeline.duration = () => TIMELINE.flash;
  recipes.loop.extent = recipes.loop.duration = (o) => {
    if (o.from != null) return LOOP.step;
    const done = o.at != null ? o.at : o.stations.filter((s) => s.state === 'done').length;
    return done * LOOP.edge + LOOP.beat;
  };
  recipes.measured.extent = recipes.measured.duration = (o) => {
    if (!o.prev) return MEASURED.flash;
    const d = Math.max(0, ...o.parts.map((p, i) => Math.abs(p.value - (o.prev[i] ?? 0))));
    return Math.round(220 + 480 * Math.min(1, d / o.zoomMax));
  };
  /* step(data, ±1) · the data one station on (or back), wrapping into the next
     (or previous) lap; null at the ends. Play the result to animate the step. */
  recipes.loop.step = (o, dir) => {
    const N = o.stations.length, at = o.at ?? Math.max(0, o.stations.findIndex((s) => s.state === 'live'));
    const lap = o.lap ?? 1, laps = o.laps ?? Infinity;
    let to = at + dir, l = lap;
    if (to >= N) { if (lap >= laps) return null; to = 0; l++; }
    if (to < 0) { if (lap <= 1) return null; to = N - 1; l--; }
    return { ...o, at: to, lap: l, from: at, lapFrom: lap, dir };
  };

  /* the landing blink: two hard offs of 30ms each (two frames at 60Hz;
     shorter and a blink can fall between frames), run as a Web Animation so
     dropped frames can't stretch or skip it */
  const OFF = 30, BLINK = 4 * OFF;
  const BLINK_FRAMES = [0, 0.5].flatMap((o) => [
    { opacity: 0.15, offset: o }, { opacity: 0.15, offset: o + 0.25 },
    { opacity: 1, offset: o + 0.2501 }, { opacity: 1, offset: o + 0.5 },
  ]);
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* crawl(svg) · dashed live tails (data-crawl) move one dash period every
     1.2s: alive, never busy. Tails already crawling keep going. */
  function crawl(svg) {
    if (!svg.animate || reduced()) return;
    svg._calCrawl = (svg._calCrawl || []).filter((a) => a.effect && a.effect.target && a.effect.target.isConnected);
    svg.querySelectorAll('[data-crawl]').forEach((el) => {
      if (svg._calCrawl.some((a) => a.effect.target === el)) return;
      const p = (el.getAttribute('stroke-dasharray') || '2 4').split(/[\s,]+/).reduce((a, b) => a + +b, 0);
      svg._calCrawl.push(el.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -p }], { duration: p * 200, iterations: Infinity }));
    });
  }

  /* play(svg, recipe, data) · mount a recipe and replay it: when the figure is
     half in view, a time cursor sweeps the ruler at an even pace (700ms for
     the whole scale) and the recipe redraws each frame. Lines trail the
     cursor by 110ms. A recipe with a duration (ms) sets its own length.
     Each frame redraws only the parts that changed (see draw). Whatever
     latches (data-land) blinks twice on landing, and dashed live tails
     (data-crawl) then crawl slowly, for as long as the figure is shown. The
     clock is a Web Animation on the svg, so playbackRate and DevTools slow
     it like CSS motion. New data for a replay in flight goes through
     update(), which retargets it instead of cutting it short. Reduced
     motion, { still: true }, a recipe without an extent or no WAAPI: mount
     the finished figure. */
  function play(svg, recipe, data, opts = {}) {
    if (typeof svg === 'string') svg = document.querySelector(svg);
    if (!svg) return null;
    if (svg._calStop) svg._calStop();
    const ext0 = recipe.extent ? recipe.extent(data) : 0;
    if (opts.still || !ext0 || !svg.animate || !root.IntersectionObserver || reduced()) {
      mount(svg, recipe(data));
      crawl(svg);
      return svg;
    }
    const TRAIL = 110, ms = recipe.duration ? recipe.duration(data) : Math.round(700 * Math.min(1, ext0 / (data.max || ext0)));
    /* the replay draws `cur`, which update() may swap for newer data */
    let cur = data, draw = recipe;
    const at = (e) => {
      const ext = draw.extent(cur) || ext0;
      return ext * Math.min(1, Math.max(0, e / ms));
    };
    const landed = new Map();
    let clock = null, io = null;
    const stop = () => {
      if (io) io.disconnect();
      if (clock) clock.cancel();
      (svg._calCrawl || []).forEach((a) => a.cancel());
      io = clock = null; svg._calCrawl = []; svg._calStop = svg._calRetarget = null;
    };
    svg._calStop = stop;
    svg._calRetarget = (r, d) => {
      draw = r; cur = d;
      if (!clock) mount(svg, draw({ ...cur, t: 0, tt: 0 }));   /* still waiting to be seen */
    };
    const frame = () => {
      if (!clock) return;
      if (!svg.isConnected) return stop();
      const e = clock.currentTime || 0;
      mount(svg, draw({ ...cur, t: at(e), tt: at(e - TRAIL) }));
      let busy = e < ms + TRAIL;
      svg.querySelectorAll('[data-land]').forEach((g) => {
        const k = g.getAttribute('data-land');
        if (!landed.has(k)) landed.set(k, e);
        const q = e - landed.get(k);
        if (q >= BLINK) return;
        busy = true;
        /* a group redrawn mid-blink picks the blink up where it was */
        if (g._calLanded !== landed) { g._calLanded = landed; g.animate(BLINK_FRAMES, { duration: BLINK }).currentTime = q; }
      });
      if (busy) return requestAnimationFrame(frame);
      clock.cancel(); clock = null; svg._calRetarget = null;
      mount(svg, draw(cur));
      crawl(svg);
    };
    mount(svg, draw({ ...cur, t: 0, tt: 0 }));
    io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect(); io = null;
      clock = svg.animate([], { duration: ms + TRAIL + BLINK + 100 });
      requestAnimationFrame(frame);
    }, { threshold: 0.5 });
    io.observe(svg);
    return svg;
  }

  /* update(svg, recipe, data) · show new data without replaying. A replay in
     flight, or one still waiting to be seen, carries on and lands on the new
     data; otherwise the figure is redrawn still, keeping its crawl. Use it
     for live values (a running clock) between replays, so a tick never cuts
     a replay short. */
  function update(svg, recipe, data) {
    if (typeof svg === 'string') svg = document.querySelector(svg);
    if (!svg) return null;
    if (svg._calRetarget) { svg._calRetarget(recipe, data); return svg; }
    mount(svg, recipe(data));
    crawl(svg);
    return svg;
  }

  root.Calibrated = Object.assign(C, { recipes, mount, render, play, update });
})(typeof window !== 'undefined' ? window : globalThis);
