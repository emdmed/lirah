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
    expect([n.store.layer, n.log.layer, n.ui.layer, n.app.layer]).toEqual([0, 0, 1, 2]);
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
    expect(featureLayout(null)).toEqual({ nodes: [], edges: [], layers: 0, width: 0, height: 0 });
  });
});
