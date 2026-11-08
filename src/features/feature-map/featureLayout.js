// Layered layout for the feature dependency drawing.
// Layer = longest `uses` chain below a feature (leaves in layer 0); layers run left to right.
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

  const nodes = features.map((f) => ({
    id: f.id, name: f.name ?? f.id, layer: layer.get(f.id), row: row.get(f.id),
    x: layer.get(f.id) * colW, y: row.get(f.id) * rowH,
  }));
  const edges = features.flatMap((f) => deps(f).map((to) => ({ from: f.id, to })));
  const rows = Math.max(0, ...layers.map((l) => l.length));
  return { nodes, edges, layers: layers.length, width: layers.length * colW, height: rows * rowH };
}
