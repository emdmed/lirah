import { describe, expect, it } from 'vitest';
import { rangeDays, weekGrid } from './weekGrid';

describe('weekGrid', () => {
  it('lists the days of a range across a month end', () => {
    expect(rangeDays({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('sums turns per feature per day, and totals talk in', () => {
    const features = [
      { id: 'tabs', name: 'Tabs', added: 10, removed: 2, changes: [{ days: { '2026-11-24': 2, '2026-11-25': 1 } }, { days: { '2026-11-25': 3 } }] },
      { id: null, name: 'No feature', added: 0, removed: 0, changes: [{ days: { '2026-11-23': 1 } }] },
    ];
    const g = weekGrid(features, { '2026-11-25': 2 }, { from: '2026-11-23', to: '2026-11-25' });
    expect(g.rows.map((r) => r.cells)).toEqual([[0, 2, 4], [1, 0, 0]]);
    expect(g.total).toEqual([1, 2, 6]);
    expect(g.max).toBe(4);
  });
});
