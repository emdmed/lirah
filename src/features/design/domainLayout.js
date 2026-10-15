import { wrapText, BODY_CHAR_W } from './designLayout.js';

/**
 * Layout for one level of the domains drill-down.
 *
 * A level is small by construction — a handful of domains, or one domain's
 * features plus the neighbours they talk to — so this does not need the system
 * diagram's routing mesh. Boxes are ranked left to right by longest path, so
 * data reads in the direction it flows, and arrows are drawn as curves between
 * box sides. An arrow that skips a column threads through the gaps between the
 * boxes it passes. Edges that run backwards (cycles, feedback) do the same in
 * mirror image — out of the left side, into the right — and are drawn dashed.
 */

export const BOX_W = 248;
const BOX_HEADER_H = 30;
const BOX_LINE_H = 13;
const BOX_PAD_Y = 8;
const BOX_FOOTER_H = 20;
const EXTERNAL_H = 44;
const GAP_X = 176;
const GAP_Y = 28;
const MARGIN = 28;
const PORT_SPREAD = 16;
const SIDE_LOOP = 56;
const MAX_PURPOSE_LINES = 3;
const PURPOSE_CHARS = Math.floor((BOX_W - 24) / BODY_CHAR_W);

/** Height a box needs for its wrapped purpose text. */
function measure(box, group) {
  if (box.external) return { h: EXTERNAL_H, lines: [] };
  const lines = wrapText(group?.purpose || '', PURPOSE_CHARS, MAX_PURPOSE_LINES);
  return {
    h: BOX_HEADER_H + BOX_PAD_Y + Math.max(lines.length, 1) * BOX_LINE_H + BOX_PAD_Y + BOX_FOOTER_H,
    lines,
  };
}

/**
 * Longest-path ranks over the graph with back edges removed. Back edges are
 * found by a DFS in declaration order, so the extractor's upstream-first
 * ordering of domains decides which way a cycle is broken.
 */
function rankBoxes(ids, edges) {
  const out = new Map(ids.map((id) => [id, []]));
  for (const e of edges) if (out.has(e.from) && out.has(e.to)) out.get(e.from).push(e.to);

  const back = new Set();
  const state = new Map();
  const visit = (id) => {
    state.set(id, 1);
    for (const next of out.get(id)) {
      if (state.get(next) === 1) back.add(`${id}->${next}`);
      else if (!state.get(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);

  const rank = new Map(ids.map((id) => [id, 0]));
  // Relaxation is bounded by the box count; levels are tiny.
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (back.has(`${e.from}->${e.to}`) || !rank.has(e.from) || !rank.has(e.to)) continue;
      if (rank.get(e.to) < rank.get(e.from) + 1) {
        rank.set(e.to, rank.get(e.from) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // A pure source sits as close to its first consumer as it can. Longest-path
  // ranking parks every source in column 0, so an input that only feeds the
  // last column would otherwise draw an arrow across the whole diagram.
  const hasIn = new Set(
    edges.filter((e) => !back.has(`${e.from}->${e.to}`)).map((e) => e.to)
  );
  for (const id of ids) {
    if (hasIn.has(id)) continue;
    const succ = out.get(id).filter((t) => !back.has(`${id}->${t}`)).map((t) => rank.get(t));
    if (succ.length) rank.set(id, Math.max(rank.get(id), Math.min(...succ) - 1));
  }
  return rank;
}

/** A run of horizontal-tangent curves through `points` — straight where level. */
function threadPath(points) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.y === b.y) {
      d += ` L${b.x},${b.y}`;
      continue;
    }
    const dx = (b.x - a.x) / 2;
    d += ` C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  }
  return d;
}

const bezierMid = (p0, p1, p2, p3) => ({
  x: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8,
  y: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8,
});

/**
 * @param {{ boxes: Array<{id: string, external: boolean}>, edges: Array<{key: string, from: string, to: string}> }} level
 * @param {Map<string, {purpose?: string}>} groups
 */
export function layoutDomainLevel(level, groups) {
  const ids = level.boxes.map((b) => b.id);
  const rank = rankBoxes(ids, level.edges);

  const columns = [];
  for (const box of level.boxes) {
    const r = rank.get(box.id) || 0;
    (columns[r] ||= []).push(box);
  }

  // One barycentre sweep: order each column by the mean row of its upstream
  // neighbours. Enough to untangle a level of this size.
  const rowOf = new Map();
  columns.forEach((col, r) => {
    if (r > 0) {
      const score = (box) => {
        const ups = level.edges.filter((e) => e.to === box.id && rowOf.has(e.from));
        return ups.length ? ups.reduce((a, e) => a + rowOf.get(e.from), 0) / ups.length : Infinity;
      };
      col.sort((a, b) => score(a) - score(b));
    }
    col.forEach((box, i) => rowOf.set(box.id, i));
  });

  const measured = new Map(level.boxes.map((b) => [b.id, measure(b, groups.get(b.id))]));
  const colHeight = (col) =>
    col.reduce((a, b) => a + measured.get(b.id).h, 0) + GAP_Y * Math.max(col.length - 1, 0);
  const tallest = Math.max(0, ...columns.filter(Boolean).map(colHeight));

  const positioned = new Map();
  columns.forEach((col, r) => {
    if (!col) return;
    let y = MARGIN + (tallest - colHeight(col)) / 2;
    const x = MARGIN + r * (BOX_W + GAP_X);
    for (const box of col) {
      const { h, lines } = measured.get(box.id);
      positioned.set(box.id, { x, y, w: BOX_W, h, lines, external: box.external });
      y += h + GAP_Y;
    }
  });

  // Free horizontal lanes through each column: the gaps between its boxes, and
  // the space above and below them. A long arrow crosses a column through one.
  const lanesUsed = new Map();
  const laneThrough = (r, wantY) => {
    const col = (columns[r] || []).map((b) => positioned.get(b.id)).sort((a, b) => a.y - b.y);
    const gaps = [];
    if (col.length === 0) gaps.push(wantY);
    else {
      gaps.push(col[0].y - GAP_Y / 2);
      for (let i = 1; i < col.length; i++) gaps.push((col[i - 1].y + col[i - 1].h + col[i].y) / 2);
      gaps.push(col[col.length - 1].y + col[col.length - 1].h + GAP_Y / 2);
    }
    const y = gaps.reduce((best, g) => (Math.abs(g - wantY) < Math.abs(best - wantY) ? g : best));
    const key = `${r}:${y}`;
    const n = lanesUsed.get(key) || 0;
    lanesUsed.set(key, n + 1);
    // Arrows sharing a gap fan out around its centre line.
    return y + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 6;
  };
  const colLeft = (r) => MARGIN + r * (BOX_W + GAP_X);

  // Spread arrow ends along a side when several share it, so parallel arrows
  // stay distinguishable.
  const slots = new Map();
  const slot = (id, side) => {
    const key = `${id}:${side}`;
    const n = slots.get(key) || 0;
    slots.set(key, n + 1);
    return n;
  };
  const counts = new Map();
  const shapeOf = (e) => {
    const d = (rank.get(e.to) || 0) - (rank.get(e.from) || 0);
    return d > 0 ? 'forward' : d === 0 ? 'sibling' : 'back';
  };
  const SIDES = {
    forward: ['out', 'in'],
    sibling: ['out', 'out'],
    back: ['in', 'out'],
  };
  for (const e of level.edges) {
    const [s1, s2] = SIDES[shapeOf(e)];
    for (const k of [`${e.from}:${s1}`, `${e.to}:${s2}`]) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const offset = (id, side) => {
    const total = counts.get(`${id}:${side}`) || 1;
    return (slot(id, side) - (total - 1) / 2) * PORT_SPREAD;
  };

  let maxY = MARGIN + tallest;
  let maxX = 0;
  const routes = level.edges.map((edge) => {
    const a = positioned.get(edge.from);
    const b = positioned.get(edge.to);
    if (!a || !b) return null;
    const shape = shapeOf(edge);
    let p0;
    let p1;
    let p2;
    let p3;
    if (shape === 'sibling') {
      // Same column: loop out of the right side and back in, clear of the boxes
      // stacked between them.
      p0 = { x: a.x + a.w, y: a.y + a.h / 2 + offset(edge.from, 'out') };
      p3 = { x: b.x + b.w, y: b.y + b.h / 2 + offset(edge.to, 'out') };
      const reach = p0.x + SIDE_LOOP + Math.abs(p3.y - p0.y) * 0.15;
      p1 = { x: reach, y: p0.y };
      p2 = { x: reach, y: p3.y };
      maxX = Math.max(maxX, reach);
    } else if (shape === 'forward') {
      p0 = { x: a.x + a.w, y: a.y + a.h / 2 + offset(edge.from, 'out') };
      p3 = { x: b.x, y: b.y + b.h / 2 + offset(edge.to, 'in') };
      const ra = rank.get(edge.from) || 0;
      const rb = rank.get(edge.to) || 0;
      if (rb - ra > 1) {
        // Thread through every column in between instead of over its boxes.
        const points = [p0];
        for (let r = ra + 1; r < rb; r++) {
          const t = (r - ra) / (rb - ra);
          const y = laneThrough(r, p0.y + (p3.y - p0.y) * t);
          points.push({ x: colLeft(r), y }, { x: colLeft(r) + BOX_W, y });
        }
        points.push(p3);
        // The label sits in the first gutter, where nothing else is drawn.
        return {
          key: edge.key,
          edge,
          back: false,
          path: threadPath(points),
          labelX: (points[0].x + points[1].x) / 2,
          labelY: (points[0].y + points[1].y) / 2,
        };
      }
      const dx = Math.max((p3.x - p0.x) / 2, 40);
      p1 = { x: p0.x + dx, y: p0.y };
      p2 = { x: p3.x - dx, y: p3.y };
    } else {
      // Feedback: right to left, threading the columns in between.
      p0 = { x: a.x, y: a.y + a.h / 2 + offset(edge.from, 'in') };
      p3 = { x: b.x + b.w, y: b.y + b.h / 2 + offset(edge.to, 'out') };
      const ra = rank.get(edge.from) || 0;
      const rb = rank.get(edge.to) || 0;
      const points = [p0];
      for (let r = ra - 1; r > rb; r--) {
        const t = (ra - r) / (ra - rb);
        const y = laneThrough(r, p0.y + (p3.y - p0.y) * t);
        points.push({ x: colLeft(r) + BOX_W, y }, { x: colLeft(r), y });
      }
      points.push(p3);
      return {
        key: edge.key,
        edge,
        back: true,
        path: threadPath(points),
        labelX: (points[0].x + points[1].x) / 2,
        labelY: (points[0].y + points[1].y) / 2,
      };
    }
    const mid = bezierMid(p0, p1, p2, p3);
    return {
      key: edge.key,
      edge,
      back: shape !== 'forward',
      path: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
      labelX: mid.x,
      labelY: mid.y,
    };
  }).filter(Boolean);

  const cols = columns.length || 1;
  return {
    positioned,
    routes,
    totalW: Math.max(MARGIN * 2 + cols * BOX_W + (cols - 1) * GAP_X, maxX + MARGIN),
    totalH: maxY + MARGIN,
  };
}

export const DOMAIN_BOX = { BOX_HEADER_H, BOX_LINE_H, BOX_PAD_Y, BOX_FOOTER_H };
