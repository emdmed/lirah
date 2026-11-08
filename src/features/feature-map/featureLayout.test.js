import { describe, it, expect } from 'vitest';
import { featureLayout } from './featureLayout';

const byId = (layout) => Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

describe('featureLayout', () => {
  it('puts leaves in layer 0 and uses the longest chain', () => {
    const l = featureLayout({ features: [
      { id: 'app', uses: ['ui', 'store'] },
      { id: 'ui', uses: ['store'] },
      { id: 'store' },
      { id: 'log', uses: ['missing'] },
    ] });
    const n = byId(l);
    expect([n.store.layer, n.ui.layer, n.app.layer]).toEqual([0, 1, 2]);
    expect(n.log.loose).toBe(true);
    expect(l.edges).toEqual([{ from: 'app', to: 'ui' }, { from: 'app', to: 'store' }, { from: 'ui', to: 'store' }]);
    expect(n.app.x).toBe(2 * 160);
  });

  it('survives cycles and self-uses', () => {
    const l = featureLayout({ features: [
      { id: 'a', uses: ['b', 'a'] },
      { id: 'b', uses: ['c'] },
      { id: 'c', uses: ['a'] },
    ] });
    expect(l.nodes).toHaveLength(3);
    expect(l.nodes.every((n) => Number.isInteger(n.layer) && n.layer >= 0)).toBe(true);
  });

  it('orders a layer by where its dependencies sit', () => {
    const n = byId(featureLayout({ features: [
      { id: 'x' }, { id: 'y' },
      { id: 'onY', uses: ['y'] }, { id: 'onX', uses: ['x'] },
    ] }));
    expect([n.onX.row, n.onY.row]).toEqual([0, 1]);
  });

  it('handles an empty or missing map', () => {
    expect(featureLayout(null)).toEqual({ nodes: [], edges: [], layers: 0, width: 0, height: 0, looseY: null });
  });

  it('lays features with no uses either way in a grid under the graph', () => {
    const l = featureLayout({ features: [
      { id: 'a', uses: ['b'] }, { id: 'b' }, { id: 'p' }, { id: 'q' }, { id: 'r' },
    ] }, { colW: 100, rowH: 10 });
    const n = byId(l);
    expect(l.layers).toBe(2);
    expect(l.looseY).toBe(20); // graph row + one gap row
    expect([n.p, n.q, n.r].map((m) => [m.x, m.y])).toEqual([[0, 20], [100, 20], [200, 20]]);
    expect(l.width).toBe(300);
    expect(l.height).toBe(30);
  });
});
