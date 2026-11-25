import { describe, expect, it } from 'vitest';
import { dayLayout } from './dayLayout';

const at = (hh, mm = 0) => new Date(`2026-11-25T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`).getTime();
const DAY = '2026-11-25';

describe('dayLayout', () => {
  it('rounds the ruler out to the hour and places bars, dots and releases', () => {
    const features = [
      { id: 'tabs', name: 'Tabs', changes: [
        { id: 'b', start: at(13, 0), end: at(13, 0), days: { [DAY]: 1 } },
        { id: 'a', start: at(9, 20), end: at(11, 0), days: { [DAY]: 3 } },
      ] },
      { id: 'plans', name: 'Plans', changes: [{ id: 'c', start: at(10), end: at(10, 30), days: { '2026-11-24': 2 } }] },
    ];
    const l = dayLayout(features, { [DAY]: 2 }, [{ tag: 'v1', at: at(13, 30) }, { tag: 'v0', at: at(3) - 86400000 }], DAY);
    expect([l.from, l.to]).toEqual([at(9), at(14)]);
    expect(l.ticks.map((t) => t.hour)).toEqual([9, 10, 11, 12, 13, 14]);
    expect(l.lanes).toHaveLength(1); // plans ran on another day
    const [lane] = l.lanes;
    expect(lane.turns).toBe(4);
    expect(lane.bars.map((b) => [b.change.id, b.x0, b.x1, b.dot])).toEqual([['a', 0.0667, 0.4, false], ['b', 0.8, 0.8, true]].map(([id, x0, x1, dot]) => [id, expect.closeTo(x0, 3), x1, dot]));
    expect(l.releases.map((r) => [r.tag, r.x])).toEqual([['v1', 0.9]]);
    expect(l.talk).toBe(2);
  });

  it('clips a change that ran past midnight, and is null on an empty day', () => {
    const features = [{ id: 'x', name: 'X', changes: [{ id: 'a', start: at(23, 10), end: at(23, 10) + 3600000, days: { [DAY]: 2 } }] }];
    const l = dayLayout(features, {}, [], DAY);
    expect([l.from, l.to]).toEqual([at(23), at(23) + 3600000]);
    expect(l.lanes[0].bars[0].x1).toBe(1);
    expect(dayLayout([], { [DAY]: 3 }, [], DAY)).toBeNull();
  });
});
