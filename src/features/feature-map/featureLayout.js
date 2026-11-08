// Layered layout for the feature dependency drawing.
// Layer = longest `uses` chain below a feature (leaves in layer 0); layers run left to right.
// Features with no uses either way are `loose`: laid in a grid from `looseY`, with layer/row null.
export function featureLayout(map, { colW = 160, rowH = 28 } = {}) {
  const features = map?.features ?? [];
  const byId = new Map(features.map((f) => [f.id, f]));
  const deps = (f) => [...new Set(f.uses ?? [])].filter((d) => d !== f.id && byId.has(d));

  const layer = new Map();
  const onStack = new Set();
  const depth = (id) => {
    if (layer.has(id)) return layer.get(id);
    if (onStack.has(id)) return -1; // back edge of a cycle: ignore it
    onStack.add(id);
    const d = 1 + Math.max(-1, ...deps(byId.get(id)).map(depth));
    onStack.delete(id);
    layer.set(id, d);
    return d;
  };
  features.forEach((f) => depth(f.id));

  // Order each layer by the average row of its dependencies already placed below; ties keep map order.
  const layers = [];
  features.forEach((f) => (layers[layer.get(f.id)] ??= []).push(f));
  const row = new Map();
  for (const ids of layers) {
    const keyed = ids.map((f, i) => {
      const placed = deps(f).filter((d) => row.has(d)).map((d) => row.get(d));
      return { f, i, key: placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : Infinity };
    });
    keyed.sort((a, b) => a.key - b.key || a.i - b.i);
    keyed.forEach(({ f }, r) => row.set(f.id, r));
  }

  const edges = features.flatMap((f) => deps(f).map((to) => ({ from: f.id, to })));
  // Features with no edge at all would only stretch layer 0; they go in a grid under the graph.
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const graph = layers.map((l) => l.filter((f) => linked.has(f.id))).filter((l) => l.length);
  const graphRow = new Map(graph.flatMap((l) => [...l].sort((a, b) => row.get(a.id) - row.get(b.id)).map((f, r) => [f.id, r])));
  const graphRows = Math.max(0, ...graph.map((l) => l.length));
  const loose = features.filter((f) => !linked.has(f.id));
  const cols = Math.max(graph.length, Math.min(loose.length, 4));
  const looseY = graphRows ? (graphRows + 1) * rowH : 0; // one empty row between graph and grid

  const nodes = features.map((f, i) => {
    if (linked.has(f.id)) {
      const L = layer.get(f.id);
      return { id: f.id, name: f.name ?? f.id, layer: L, row: graphRow.get(f.id), x: L * colW, y: graphRow.get(f.id) * rowH };
    }
    const k = loose.indexOf(f);
    return { id: f.id, name: f.name ?? f.id, layer: null, row: null, loose: true, x: (k % cols) * colW, y: looseY + Math.floor(k / cols) * rowH };
  });
  const looseRows = Math.ceil(loose.length / Math.max(1, cols));
  return {
    nodes, edges, layers: graph.length, width: cols * colW,
    height: loose.length ? looseY + looseRows * rowH : graphRows * rowH,
    looseY: loose.length ? looseY : null,
  };
}
