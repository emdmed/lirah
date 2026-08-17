/**
 * Layered ("swimlane") layout for a design spec.
 *
 * The compact feature's `graphLayout` groups nodes by directory, which is the
 * wrong shape here: a design diagram reads top-to-bottom through architectural
 * layers, with data flowing downward. So layers become horizontal bands ordered
 * by `layer.order`, and nodes are ordered within their band to keep edges from
 * crossing more than they have to.
 *
 * Edges are never drawn as naive centre-to-centre lines: every node sits on a
 * shared column grid, so the vertical gaps between columns and the horizontal
 * gutters between bands form a routing mesh. Each edge travels only through
 * that mesh, in its own lane, which is what keeps arrows off the boxes and off
 * each other.
 */

// Node box geometry. Width is fixed so bands line up into readable columns;
// height grows with the wrapped responsibility text.
export const NODE_W = 232;
export const NODE_HEADER_H = 26;
export const NODE_LINE_H = 13;
export const NODE_PAD_X = 11;
export const NODE_PAD_Y = 7;
export const NODE_FOOTER_H = 16;

const NODE_GAP_X = 36;
const COL_PITCH = NODE_W + NODE_GAP_X;
const BAND_LABEL_H = 24;
const BAND_PAD_Y = 16;
const BAND_PAD_X = 24;

// Vertical gutter between two bands: the horizontal routing channel. It grows
// with the number of lanes the routing actually needs.
const GUTTER_MIN_H = 44;
const GUTTER_INSET = 12;
const LANE_SPACING = 16;
/** Horizontal clearance between two runs before they are allowed to share a lane. */
const LANE_PAD = 26;
/** How far a horizontal run has to be from a node's edge to leave a port there. */
const PORT_INSET = 18;
/** Distance outside the diagram used by upward ("feedback") edges. */
const SIDE_MARGIN = 34;
const SIDE_SPACING = 18;
const CORNER_R = 7;

export const LABEL_CHAR_W = 6.7; // 11px monospace
export const BODY_CHAR_W = 5.8; // 9.5px monospace

/** Max wrapped lines of responsibility text drawn inside a node box. */
const MAX_RESP_LINES = 3;

/**
 * Greedy word wrap to a character budget, capped at `maxLines`. The final line
 * is ellipsized when text remains — the full text is always available in the
 * detail panel, so truncating here costs nothing.
 */
export function wrapText(text, maxChars, maxLines = MAX_RESP_LINES) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === maxLines) {
    // Did anything not fit? Compare against what we consumed.
    const consumed = lines.join(' ').replace(/…$/, '');
    if (consumed.length < text.trim().length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] =
        last.length > maxChars - 1 ? `${last.slice(0, Math.max(0, maxChars - 1))}…` : `${last}…`;
    }
  }
  return lines;
}

const respCharBudget = () => Math.floor((NODE_W - NODE_PAD_X * 2) / BODY_CHAR_W);

/** Wrapped responsibility lines plus the resulting box height for one node. */
export function measureNode(node) {
  const lines = wrapText(node.responsibility, respCharBudget());
  const hasFooter = (node.owns?.length || 0) > 0 || (node.files?.length || 0) > 0;
  const h =
    NODE_HEADER_H +
    (lines.length ? NODE_PAD_Y + lines.length * NODE_LINE_H : 0) +
    (hasFooter ? NODE_FOOTER_H : 0) +
    NODE_PAD_Y;
  return { lines, h, hasFooter };
}

/**
 * Order nodes within each band so edges run as vertically as possible.
 *
 * Standard barycenter heuristic: repeatedly reposition each band's nodes at the
 * average position of their neighbours in the adjacent band, alternating sweep
 * direction. A few passes is plenty at this diagram size, and it is stable —
 * nodes with no neighbours keep their spec order.
 */
function orderBands(bands, edges) {
  const layerOfNode = new Map();
  bands.forEach((band, li) => band.nodeIds.forEach((id) => layerOfNode.set(id, li)));

  const neighbours = new Map(); // node id -> { up: [], down: [] }
  const ensure = (id) => {
    if (!neighbours.has(id)) neighbours.set(id, { up: [], down: [] });
    return neighbours.get(id);
  };
  for (const edge of edges) {
    const a = layerOfNode.get(edge.from);
    const b = layerOfNode.get(edge.to);
    if (a === undefined || b === undefined || a === b) continue;
    if (a < b) {
      ensure(edge.to).up.push(edge.from);
      ensure(edge.from).down.push(edge.to);
    } else {
      ensure(edge.from).up.push(edge.to);
      ensure(edge.to).down.push(edge.from);
    }
  }

  const indexIn = (band) => {
    const map = new Map();
    band.nodeIds.forEach((id, i) => map.set(id, i));
    return map;
  };

  for (let pass = 0; pass < 4; pass++) {
    const downward = pass % 2 === 0;
    const order = downward
      ? bands.map((_, i) => i).slice(1)
      : bands.map((_, i) => i).slice(0, -1).reverse();

    for (const li of order) {
      const refIdx = indexIn(bands[downward ? li - 1 : li + 1]);
      const side = downward ? 'up' : 'down';
      const scored = bands[li].nodeIds.map((id, i) => {
        const refs = (neighbours.get(id)?.[side] || [])
          .map((n) => refIdx.get(n))
          .filter((v) => v !== undefined);
        const bary = refs.length ? refs.reduce((a, b) => a + b, 0) / refs.length : null;
        return { id, i, key: bary === null ? i : bary };
      });
      scored.sort((a, b) => a.key - b.key || a.i - b.i);
      bands[li].nodeIds = scored.map((s) => s.id);
    }
  }
  return bands;
}

// ---- edge routing ----------------------------------------------------------

/** Orthogonal polyline with rounded corners, from a list of points. */
function roundedPath(points, r = CORNER_R) {
  const pts = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y
  );
  if (pts.length < 2) return '';
  const n = (v) => Math.round(v * 10) / 10;
  let d = `M${n(pts[0].x)},${n(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = { x: cur.x + ((prev.x - cur.x) / d1) * rr, y: cur.y + ((prev.y - cur.y) / d1) * rr };
    const b = { x: cur.x + ((next.x - cur.x) / d2) * rr, y: cur.y + ((next.y - cur.y) / d2) * rr };
    d += ` L${n(a.x)},${n(a.y)} Q${n(cur.x)},${n(cur.y)} ${n(b.x)},${n(b.y)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${n(last.x)},${n(last.y)}`;
  return d;
}

/**
 * Pack horizontal runs into as few lanes as possible: a greedy interval
 * colouring. Two runs share a lane only when their x spans do not come within
 * `LANE_PAD` of each other, so no two arrows are ever drawn on top of one
 * another inside a gutter.
 */
function assignLanes(runs) {
  const lanes = [];
  const sorted = [...runs].sort(
    (a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2)
  );
  for (const run of sorted) {
    const lo = Math.min(run.x1, run.x2) - LANE_PAD;
    const hi = Math.max(run.x1, run.x2) + LANE_PAD;
    let idx = lanes.findIndex((spans) => spans.every(([a, b]) => hi < a || lo > b));
    if (idx === -1) {
      lanes.push([]);
      idx = lanes.length - 1;
    }
    lanes[idx].push([lo, hi]);
    run.lane = idx;
  }
  return lanes.length;
}

/** Evenly spread ports across a node's edge so parallel arrows never merge. */
function spreadPorts(rect, count, index) {
  if (count <= 1) return rect.x + rect.w / 2;
  const usable = Math.max(0, rect.w - PORT_INSET * 2);
  return rect.x + PORT_INSET + (usable * index) / (count - 1);
}

/**
 * Decide, for every edge, which channels it travels through and in which lane.
 *
 * Runs only on x geometry — gutter heights are still unknown at this point,
 * which is exactly why lane *counts* can be fed back into the band layout
 * before the final y positions are computed.
 */
function planRoutes(edges, positioned, corridorXs, totalW) {
  const items = [];
  for (const edge of edges) {
    const from = positioned.get(edge.from);
    const to = positioned.get(edge.to);
    if (!from || !to || edge.from === edge.to) continue;
    const kind = to.band > from.band ? 'down' : to.band < from.band ? 'up' : 'same';
    items.push({ edge, from, to, kind });
  }

  // Ports. Everything that leaves or arrives at a box edge gets its own slot,
  // ordered by where the other end sits so the fan never crosses itself.
  const bottom = new Map(); // node id -> [{ item, end }]
  const top = new Map();
  const push = (map, id, entry) => {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(entry);
  };
  for (const item of items) {
    if (item.kind === 'down') {
      push(bottom, item.edge.from, { item, end: 'from', ref: item.to.x + item.to.w / 2 });
      push(top, item.edge.to, { item, end: 'to', ref: item.from.x + item.from.w / 2 });
    } else if (item.kind === 'same') {
      // Dip below the band rather than cut across the row.
      push(bottom, item.edge.from, { item, end: 'from', ref: item.to.x + item.to.w / 2 });
      push(bottom, item.edge.to, { item, end: 'to', ref: item.from.x + item.from.w / 2 });
    } else {
      // Upward: the mirror image of a downward edge — out of the top, back in
      // through the target's bottom.
      push(top, item.edge.from, { item, end: 'from', ref: item.to.x + item.to.w / 2 });
      push(bottom, item.edge.to, { item, end: 'to', ref: item.from.x + item.from.w / 2 });
    }
  }
  const assignSide = (map, key) => {
    for (const [id, list] of map) {
      const rect = positioned.get(id);
      list.sort((a, b) => a.ref - b.ref);
      list.forEach((entry, i) => {
        entry.item[`${entry.end}${key}X`] = spreadPorts(rect, list.length, i);
      });
    }
  };
  assignSide(bottom, 'Bottom');
  assignSide(top, 'Top');

  // Channel runs. Gutter `i` is the space above band `i`; the gutter below band
  // `b` is therefore `b + 1`.
  const gutterRuns = new Map(); // gutter index -> runs
  const runIn = (g, run) => {
    if (!gutterRuns.has(g)) gutterRuns.set(g, []);
    gutterRuns.get(g).push(run);
    return run;
  };
  const usedCorridors = new Set();

  for (const item of items) {
    if (item.kind === 'down') {
      const fromX = item.fromBottomX;
      const toX = item.toTopX;
      const gExit = item.from.band + 1;
      const gEnter = item.to.band;

      if (gExit === gEnter) {
        item.runs = [runIn(gExit, { gutter: gExit, x1: fromX, x2: toX })];
        continue;
      }
      // Spans intermediate bands: drop into a column corridor and ride it down.
      const span = `${item.from.band}:${item.to.band}`;
      const ranked = [...corridorXs].sort(
        (a, b) => Math.abs(a - toX) - Math.abs(b - toX)
      );
      const corridorX =
        ranked.find((x) => !usedCorridors.has(`${span}:${x}`)) ?? ranked[0] ?? toX;
      usedCorridors.add(`${span}:${corridorX}`);
      item.corridorX = corridorX;
      item.runs = [
        runIn(gExit, { gutter: gExit, x1: fromX, x2: corridorX }),
        runIn(gEnter, { gutter: gEnter, x1: corridorX, x2: toX }),
      ];
      continue;
    }

    if (item.kind === 'same') {
      const g = item.from.band + 1;
      item.runs = [runIn(g, { gutter: g, x1: item.fromBottomX, x2: item.toBottomX })];
      continue;
    }

    // Upward (feedback). Same shape as a downward edge, read the other way: up
    // into the gutter above the source, along it, then up into the target's
    // bottom. When the two bands are not adjacent the vertical leg runs outside
    // the diagram, where it cannot hide behind anything.
    const gExit = item.from.band;
    const gEnter = item.to.band + 1;
    const fromX = item.fromTopX;
    const toX = item.toBottomX;

    if (gExit === gEnter) {
      item.runs = [runIn(gExit, { gutter: gExit, x1: fromX, x2: toX })];
      continue;
    }
    const leftGap = Math.min(fromX, toX);
    const rightGap = totalW - Math.max(fromX, toX);
    item.goRight = rightGap <= leftGap;
    const sideEstimate = item.goRight ? totalW + SIDE_MARGIN : -SIDE_MARGIN;
    item.runs = [
      runIn(gExit, { gutter: gExit, x1: fromX, x2: sideEstimate }),
      runIn(gEnter, { gutter: gEnter, x1: sideEstimate, x2: toX }),
    ];
  }

  const laneCounts = new Map();
  for (const [g, runs] of gutterRuns) laneCounts.set(g, assignLanes(runs));

  return { items, laneCounts };
}

/** Turn planned runs into drawable paths once the gutter geometry is known. */
function buildPaths(items, gutters, totalW) {
  const laneY = (g, lane) => {
    const gutter = gutters[g];
    if (!gutter) return 0;
    const count = Math.max(1, gutter.lanes);
    const usable = gutter.h - GUTTER_INSET * 2;
    return gutter.y + GUTTER_INSET + (count === 1 ? usable / 2 : (usable * lane) / (count - 1));
  };

  // Side lanes for the upward edges that need one, packed by their vertical
  // span — done here because it needs the final y positions.
  for (const side of [true, false]) {
    const runs = items
      .filter((i) => i.kind === 'up' && i.runs.length > 1 && i.goRight === side)
      .map((i) => ({
        item: i,
        x1: Math.min(i.from.y, i.to.y),
        x2: Math.max(i.from.y + i.from.h, i.to.y + i.to.h),
      }));
    assignLanes(runs);
    runs.forEach((r) => {
      r.item.sideLane = r.lane;
    });
  }

  const routes = [];
  for (const item of items) {
    const { from, to } = item;
    let points;
    let label;

    if (item.kind === 'down') {
      const y1 = from.y + from.h;
      const y2 = to.y;
      if (item.runs.length === 1) {
        const run = item.runs[0];
        const ly = laneY(run.gutter, run.lane);
        points = [
          { x: item.fromBottomX, y: y1 },
          { x: item.fromBottomX, y: ly },
          { x: item.toTopX, y: ly },
          { x: item.toTopX, y: y2 },
        ];
        label = { x: (item.fromBottomX + item.toTopX) / 2, y: ly - 5 };
      } else {
        const [a, b] = item.runs;
        const ya = laneY(a.gutter, a.lane);
        const yb = laneY(b.gutter, b.lane);
        points = [
          { x: item.fromBottomX, y: y1 },
          { x: item.fromBottomX, y: ya },
          { x: item.corridorX, y: ya },
          { x: item.corridorX, y: yb },
          { x: item.toTopX, y: yb },
          { x: item.toTopX, y: y2 },
        ];
        label = { x: (item.fromBottomX + item.corridorX) / 2, y: ya - 5 };
      }
    } else if (item.kind === 'same') {
      const run = item.runs[0];
      const ly = laneY(run.gutter, run.lane);
      points = [
        { x: item.fromBottomX, y: from.y + from.h },
        { x: item.fromBottomX, y: ly },
        { x: item.toBottomX, y: ly },
        { x: item.toBottomX, y: to.y + to.h },
      ];
      label = { x: (item.fromBottomX + item.toBottomX) / 2, y: ly - 5 };
    } else {
      const y1 = from.y; // leaves the top edge
      const y2 = to.y + to.h; // arrives at the target's bottom edge
      if (item.runs.length === 1) {
        const run = item.runs[0];
        const ly = laneY(run.gutter, run.lane);
        points = [
          { x: item.fromTopX, y: y1 },
          { x: item.fromTopX, y: ly },
          { x: item.toBottomX, y: ly },
          { x: item.toBottomX, y: y2 },
        ];
        label = { x: (item.fromTopX + item.toBottomX) / 2, y: ly - 5 };
      } else {
        const [a, b] = item.runs;
        const ya = laneY(a.gutter, a.lane);
        const yb = laneY(b.gutter, b.lane);
        const offset = SIDE_MARGIN + (item.sideLane || 0) * SIDE_SPACING;
        const x = item.goRight ? totalW + offset : -offset;
        points = [
          { x: item.fromTopX, y: y1 },
          { x: item.fromTopX, y: ya },
          { x, y: ya },
          { x, y: yb },
          { x: item.toBottomX, y: yb },
          { x: item.toBottomX, y: y2 },
        ];
        label = { x: (item.fromTopX + x) / 2, y: ya - 5 };
      }
    }

    routes.push({
      key: item.edge.key,
      edge: item.edge,
      path: roundedPath(points),
      labelX: label.x,
      labelY: label.y,
    });
  }
  return routes;
}

// ---- layout ----------------------------------------------------------------

/**
 * Lay out a normalized spec.
 *
 * @param {Array} layers ordered layer descriptors
 * @param {Map} nodes id -> node
 * @param {Array} edges deduped union of flow steps
 * @param {Set<string>} hiddenLayers layer ids collapsed by the user
 * @returns {{ positioned: Map, bandRects: Array, routes: Array, totalW: number, totalH: number }}
 */
export function layoutDesign(layers, nodes, edges, hiddenLayers = new Set()) {
  const visibleLayers = layers.filter((l) => !hiddenLayers.has(l.id));

  let bands = visibleLayers.map((layer) => ({
    layer,
    nodeIds: [...nodes.values()].filter((n) => n.layer === layer.id).map((n) => n.id),
  }));

  const visibleIds = new Set(bands.flatMap((b) => b.nodeIds));
  const visibleEdges = edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  bands = orderBands(bands, visibleEdges);

  const measured = new Map();
  for (const id of visibleIds) measured.set(id, measureNode(nodes.get(id)));

  // Every band sits on one shared column grid, so the gaps between columns are
  // free vertical corridors in *all* bands — that is what lets a long edge drop
  // past an intermediate band without crossing a box.
  const maxCols = Math.max(1, ...bands.map((b) => b.nodeIds.length));
  const contentW = maxCols * NODE_W + (maxCols - 1) * NODE_GAP_X;
  const totalW = contentW + BAND_PAD_X * 2;

  const positioned = new Map();
  const bandGeom = bands.map((band) => ({
    band,
    rowH: band.nodeIds.length
      ? Math.max(...band.nodeIds.map((id) => measured.get(id).h))
      : NODE_HEADER_H,
  }));

  bands.forEach((band, bi) => {
    const offset = Math.floor((maxCols - band.nodeIds.length) / 2);
    band.nodeIds.forEach((id, ci) => {
      positioned.set(id, {
        x: BAND_PAD_X + (offset + ci) * COL_PITCH,
        y: 0, // filled in once gutter heights are known
        w: NODE_W,
        h: measured.get(id).h,
        band: bi,
        col: offset + ci,
      });
    });
  });

  // Corridor x values: the centre of every inter-column gap, plus the margins
  // on either side. None of them ever falls inside a node box.
  const corridorXs = [];
  for (let k = 0; k <= maxCols; k++) {
    corridorXs.push(BAND_PAD_X + k * COL_PITCH - NODE_GAP_X / 2);
  }

  const { items, laneCounts } = planRoutes(visibleEdges, positioned, corridorXs, totalW);

  // Gutter heights follow the lane demand, so a busy channel spreads out
  // instead of stacking arrows on top of each other.
  const gutterH = (g) => {
    const lanes = laneCounts.get(g) || 0;
    return Math.max(GUTTER_MIN_H, lanes * LANE_SPACING + GUTTER_INSET * 2);
  };

  const gutters = [];
  const bandRects = [];
  let cursorY = 0;

  bandGeom.forEach(({ band, rowH }, bi) => {
    const h = gutterH(bi);
    gutters[bi] = { y: cursorY, h, lanes: laneCounts.get(bi) || 0 };
    cursorY += h;

    const bandH = BAND_LABEL_H + BAND_PAD_Y + rowH + BAND_PAD_Y;
    const nodeY = cursorY + BAND_LABEL_H + BAND_PAD_Y;
    for (const id of band.nodeIds) positioned.get(id).y = nodeY;

    bandRects.push({
      id: band.layer.id,
      label: band.layer.label,
      x: 0,
      y: cursorY,
      w: totalW,
      h: bandH,
      nodeCount: band.nodeIds.length,
      // Carried out of the layout so the band header can pick an icon from what
      // the band actually holds.
      nodeIds: band.nodeIds,
    });
    cursorY += bandH;
  });

  const lastG = bands.length;
  gutters[lastG] = { y: cursorY, h: gutterH(lastG), lanes: laneCounts.get(lastG) || 0 };
  cursorY += gutters[lastG].h;

  const routes = buildPaths(items, gutters, totalW);

  return {
    positioned,
    bandRects,
    measured,
    routes,
    totalW,
    totalH: Math.max(cursorY, 200),
  };
}
