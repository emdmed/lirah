import { describe, expect, it } from 'vitest';
import { lifecycleCalendar, lifecycleRow } from './Fig37Lifecycle';

const H = 3_600_000;
const plan = (over) => ({ id: 'x', title: 'a plan', createdAt: 0, chunks: [], ...over });
const done = (s, d) => ({ status: 'implemented', startedAt: s, doneAt: d, commits: ['a'] });

describe('lifecycleRow', () => {
  it('draws a merged plan planned → building → waiting, ending at the merge', () => {
    const row = lifecycleRow(plan({ chunks: [done(H, 2 * H)], pr: { number: 7, createdAt: new Date(2.5 * H).toISOString() }, merged: { at: 3 * H } }), 10 * H);
    expect(row.segments).toEqual([
      { kind: 'planned', from: 0, to: H },
      { kind: 'building', from: H, to: 2 * H },
      { kind: 'waiting', from: 2 * H, to: 3 * H },
    ]);
    expect(row).toMatchObject({ end: 3 * H, endMark: 'done', pr: 2.5 * H, outcome: { name: 'merged' }, note: '1/1 chunks · 1 commit · 3h' });
  });
  it('a plan shelved after merging is merged; one shelved before stops at its last stage', () => {
    expect(lifecycleRow(plan({ chunks: [done(H, 2 * H)], merged: { at: 3 * H }, shelved: true })).outcome.name).toBe('merged');
    const row = lifecycleRow(plan({ chunks: [done(H, 2 * H), { status: 'pending' }], shelved: true }), 10 * H);
    expect(row).toMatchObject({ end: H, endMark: 'stopped', shelved: true, outcome: { name: 'shelved', note: expect.stringMatching(/^building /) } });
  });
  it('is live only while a chunk runs, and open plans run to now', () => {
    const running = lifecycleRow(plan({ chunks: [{ n: 2, status: 'in-progress', startedAt: H }] }), 5 * H);
    expect(running).toMatchObject({ end: 5 * H, endMark: 'live', outcome: { name: 'building', note: 'chunk 2' } });
    expect(lifecycleRow(plan({}), 5 * H)).toMatchObject({ endMark: 'open', outcome: { name: 'planned' } });
  });
});

describe('lifecycleCalendar', () => {
  it('spans whole days from the first plan to the day after now', () => {
    const start = new Date(2026, 10, 3, 15).getTime();
    const now = new Date(2026, 10, 5, 9).getTime();
    const { t0, t1, days } = lifecycleCalendar([{ start, end: now }], now);
    expect(t0).toBe(new Date(2026, 10, 3).getTime());
    expect(t1).toBe(new Date(2026, 10, 6).getTime());
    expect(days).toHaveLength(4);
  });
});
